import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { query, queryOne, execute, saveDatabase } from './db.ts';
import { calculateVisitorIntentScore } from './scoring.ts';
import { testAgnesConnection, generateHouseConsultationReply, maskApiKey, optimizeHouseDescription } from './ai.ts';
import { isCloudinaryConfigured, uploadToCloudinary } from './cloudinary.ts';

export const apiRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'rental_inquiry_admin_secret_key_2026';

// Middleware for admin JWT authentication
function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const cookieToken = req.headers.cookie
    ?.split(';')
    .find((c) => c.trim().startsWith('admin_token='))
    ?.split('=')[1];

  const token = authHeader?.replace(/^Bearer\s+/i, '') || cookieToken;

  if (!token) {
    res.status(401).json({ success: false, error: '请先登录管理员账号' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).adminUser = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, error: '登录会话已过期，请重新登录' });
  }
}

// -------------------------------------------------------------
// PUBLIC / VISITOR ENDPOINTS
// -------------------------------------------------------------

// 1. Get public house info (Excludes internal secret_rent_price, respects field_visibility)
apiRouter.get('/house', async (req: Request, res: Response) => {
  try {
    const house = await queryOne('SELECT * FROM house_info WHERE id = 1');
    if (!house) {
      res.status(404).json({ success: false, error: '房源信息不存在' });
      return;
    }

    const defaultVisibility = {
      title: true,
      images: true,
      videos: true,
      layout: true,
      area_sqm: true,
      orientation: true,
      floor: true,
      location: true,
      metro_info: true,
      amenities: true,
      description: true,
      guarantee: true,
      landlord_phone: true,
      landlord_wechat: true
    };

    let fieldVisibility = { ...defaultVisibility };
    try {
      if (house.field_visibility) {
        fieldVisibility = { ...fieldVisibility, ...JSON.parse(house.field_visibility) };
      }
    } catch {}

    let images: string[] = [];
    let videos: any[] = [];
    let amenities: string[] = [];
    try {
      images = typeof house.images === 'string' ? JSON.parse(house.images) : house.images || [];
    } catch {
      images = [];
    }
    try {
      videos = typeof house.videos === 'string' ? JSON.parse(house.videos) : house.videos || [];
    } catch {
      videos = [];
    }
    try {
      amenities = typeof house.amenities === 'string' ? JSON.parse(house.amenities) : house.amenities || [];
    } catch {
      amenities = [];
    }

    res.json({
      success: true,
      data: {
        id: house.id,
        title: fieldVisibility.title !== false ? house.title : '',
        location: fieldVisibility.location !== false ? house.location : '',
        area_sqm: fieldVisibility.area_sqm !== false ? house.area_sqm : null,
        layout: fieldVisibility.layout !== false ? house.layout : '',
        orientation: fieldVisibility.orientation !== false ? house.orientation : '',
        floor: fieldVisibility.floor !== false ? house.floor : '',
        metro_info: fieldVisibility.metro_info !== false ? house.metro_info : '',
        amenities: fieldVisibility.amenities !== false ? amenities : [],
        description: fieldVisibility.description !== false ? house.description : '',
        images: fieldVisibility.images !== false ? images : [],
        videos: fieldVisibility.videos !== false ? videos : [],
        landlord_phone: fieldVisibility.landlord_phone !== false ? house.landlord_phone : '',
        landlord_wechat: fieldVisibility.landlord_wechat !== false ? house.landlord_wechat : '',
        field_visibility: fieldVisibility
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Track visit / session start
apiRouter.post('/tracking/visit', async (req: Request, res: Response) => {
  try {
    const { deviceId, userAgent, pagePath } = req.body;
    if (!deviceId) {
      res.status(400).json({ success: false, error: '缺少设备ID' });
      return;
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const now = new Date().toISOString();
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const existingVisitor = await queryOne('SELECT * FROM visitors WHERE device_id = ?', [deviceId]);

    if (existingVisitor) {
      const newTotalVisits = (Number(existingVisitor.total_visits) || 1) + 1;
      await execute(
        `UPDATE visitors SET
          last_visit_at = ?,
          total_visits = ?,
          ip_address = ?,
          user_agent = ?
        WHERE device_id = ?`,
        [now, newTotalVisits, String(ip), userAgent || existingVisitor.user_agent, deviceId]
      );
    } else {
      await execute(
        `INSERT INTO visitors (
          device_id, ip_address, user_agent, first_visit_at, last_visit_at,
          total_visits, total_duration_sec, inquired_rent, contact_status, notes, calculated_intent_score
        ) VALUES (?, ?, ?, ?, ?, 1, 0, 0, 'pending', '', 10)`,
        [deviceId, String(ip), userAgent || '', now, now]
      );
    }

    // Create session
    await execute(
      `INSERT INTO visit_sessions (session_id, device_id, start_time, end_time, duration_sec, page_path)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [sessionId, deviceId, now, now, pagePath || '/']
    );

    // Fetch updated score
    await updateStoredScoreForDevice(deviceId);

    res.json({
      success: true,
      sessionId,
      isReturnVisitor: !!existingVisitor
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Heartbeat for tracking duration
apiRouter.post('/tracking/heartbeat', async (req: Request, res: Response) => {
  try {
    const { deviceId, sessionId, durationDelta } = req.body;
    if (!deviceId) {
      res.status(400).json({ success: false, error: '缺少设备ID' });
      return;
    }

    const delta = Math.min(Math.max(Number(durationDelta) || 15, 1), 60);
    const now = new Date().toISOString();

    await execute(
      `UPDATE visitors SET
        total_duration_sec = total_duration_sec + ?,
        last_visit_at = ?
       WHERE device_id = ?`,
      [delta, now, deviceId]
    );

    if (sessionId) {
      await execute(
        `UPDATE visit_sessions SET
          end_time = ?,
          duration_sec = duration_sec + ?
         WHERE session_id = ?`,
        [now, delta, sessionId]
      );
    }

    await updateStoredScoreForDevice(deviceId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Inquire rent (submit phone number)
apiRouter.post('/inquire-rent', async (req: Request, res: Response) => {
  try {
    const { deviceId, phoneNumber, sourceNote } = req.body;

    if (!deviceId) {
      res.status(400).json({ success: false, error: '设备标识缺失' });
      return;
    }

    const cleanPhone = (phoneNumber || '').trim();
    if (!/^1[3-9]\d{9}$/.test(cleanPhone)) {
      res.status(400).json({ success: false, error: '请输入有效的11位手机号码' });
      return;
    }

    const now = new Date().toISOString();

    // Record rent inquiry
    await execute(
      `INSERT INTO rent_inquiries (device_id, phone_number, created_at, source_note)
       VALUES (?, ?, ?, ?)`,
      [deviceId, cleanPhone, now, sourceNote || 'H5房源展示页-询问租金']
    );

    // Update visitor
    await execute(
      `UPDATE visitors SET
        inquired_rent = 1,
        phone_number = ?,
        last_visit_at = ?
       WHERE device_id = ?`,
      [cleanPhone, now, deviceId]
    );

    await updateStoredScoreForDevice(deviceId);

    res.json({
      success: true,
      message: '询问租金意向已送达房东！房东将在第一时间主动致电您告知详细报价及优惠。'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Visitor chat: get history
apiRouter.get('/chat/messages', async (req: Request, res: Response) => {
  try {
    const deviceId = req.query.deviceId as string;
    if (!deviceId) {
      res.status(400).json({ success: false, error: '缺少设备ID' });
      return;
    }

    const messages = await query(
      'SELECT id, sender, content, created_at FROM chat_messages WHERE device_id = ? ORDER BY id ASC',
      [deviceId]
    );

    const adminConfig = await queryOne('SELECT is_online FROM admin_config WHERE id = 1');
    const isLandlordOnline = adminConfig ? Boolean(adminConfig.is_online) : false;

    res.json({
      success: true,
      messages,
      isLandlordOnline
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Visitor chat: send message
apiRouter.post('/chat/send', async (req: Request, res: Response) => {
  try {
    const { deviceId, content } = req.body;
    if (!deviceId || !content || !content.trim()) {
      res.status(400).json({ success: false, error: '消息内容不可为空' });
      return;
    }

    const userText = content.trim();
    const now = new Date().toISOString();

    // Save user message
    await execute(
      `INSERT INTO chat_messages (device_id, sender, content, created_at, is_read)
       VALUES (?, 'user', ?, ?, 0)`,
      [deviceId, userText, now]
    );

    // Update visitor score
    await updateStoredScoreForDevice(deviceId);

    // Check landlord online status
    const adminConfig = await queryOne('SELECT * FROM admin_config WHERE id = 1');
    const isOnline = adminConfig ? Boolean(adminConfig.is_online) : false;

    if (isOnline) {
      // Landlord is online: user message recorded, wait for landlord manual reply
      res.json({
        success: true,
        mode: 'manual',
        message: '消息已送达房东，房东当前在线，正在为您处理...',
        created_at: now
      });
      return;
    }

    // Landlord is offline: automatically trigger Agnes AI reply
    const houseInfo = await queryOne('SELECT * FROM house_info WHERE id = 1');
    const historyRows = await query(
      'SELECT sender, content FROM chat_messages WHERE device_id = ? ORDER BY id DESC LIMIT 6',
      [deviceId]
    );
    const history = historyRows.slice().reverse();

    const aiConfig = {
      apiBaseUrl: adminConfig?.api_base_url || 'https://apihub.agnes-ai.com/v1',
      apiKey: adminConfig?.api_key || 'sk-GUdpKQNIwwJSZQ5mYyrMnuCJBOjSbB73c2N6NcnNfk5LoKyq',
      modelName: adminConfig?.model_name || 'Agnes-2.5-flash'
    };

    const aiReplyText = await generateHouseConsultationReply({
      config: aiConfig,
      houseInfo: houseInfo || {},
      history,
      userMessage: userText
    });

    const aiNow = new Date().toISOString();
    await execute(
      `INSERT INTO chat_messages (device_id, sender, content, created_at, is_read)
       VALUES (?, 'ai', ?, ?, 1)`,
      [deviceId, aiReplyText, aiNow]
    );

    res.json({
      success: true,
      mode: 'ai',
      aiReply: {
        sender: 'ai',
        content: aiReplyText,
        created_at: aiNow
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to recalculate & persist visitor score
async function updateStoredScoreForDevice(deviceId: string): Promise<void> {
  try {
    const visitor = await queryOne('SELECT * FROM visitors WHERE device_id = ?', [deviceId]);
    if (!visitor) return;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentSessions = await query(
      'SELECT session_id FROM visit_sessions WHERE device_id = ? AND start_time >= ?',
      [deviceId, sevenDaysAgo]
    );
    const chatMsgs = await query(
      "SELECT id FROM chat_messages WHERE device_id = ? AND sender = 'user'",
      [deviceId]
    );

    const scoreResult = calculateVisitorIntentScore({
      total_visits: Number(visitor.total_visits) || 1,
      total_duration_sec: Number(visitor.total_duration_sec) || 0,
      inquired_rent: Number(visitor.inquired_rent) || 0,
      phone_number: visitor.phone_number,
      recent_visits_7d: recentSessions.length,
      chat_count: chatMsgs.length
    });

    await execute(
      'UPDATE visitors SET calculated_intent_score = ? WHERE device_id = ?',
      [scoreResult.score, deviceId]
    );
  } catch (err) {
    console.error('Failed to update visitor score:', err);
  }
}

// -------------------------------------------------------------
// ADMIN ENDPOINTS (/api/admin/*)
// -------------------------------------------------------------

// 1. Admin login with brute force limitation and password change detection
apiRouter.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ success: false, error: '请输入账号与密码' });
      return;
    }

    const admin = await queryOne('SELECT * FROM admin_config WHERE username = ?', [username.trim()]);
    if (!admin) {
      res.status(401).json({ success: false, error: '账号或密码错误' });
      return;
    }

    // Check brute force lock
    const nowTimestamp = Date.now();
    const lockedUntil = Number(admin.locked_until) || 0;
    if (lockedUntil > nowTimestamp) {
      const waitMinutes = Math.ceil((lockedUntil - nowTimestamp) / (60 * 1000));
      res.status(429).json({
        success: false,
        error: `登录失败次数过多，账号已临时锁定，请在 ${waitMinutes} 分钟后再试`
      });
      return;
    }

    const isMatch = bcrypt.compareSync(password, admin.password_hash);
    if (!isMatch) {
      const failedAttempts = (Number(admin.failed_login_attempts) || 0) + 1;
      let lockUntil = 0;
      if (failedAttempts >= 5) {
        lockUntil = nowTimestamp + 15 * 60 * 1000; // Lock for 15 minutes
      }

      await execute(
        'UPDATE admin_config SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
        [failedAttempts, lockUntil, admin.id]
      );

      const remaining = Math.max(0, 5 - failedAttempts);
      const msg = remaining > 0 ? `账号或密码错误，剩余尝试机会 ${remaining} 次` : '连续5次密码错误，账号已锁定15分钟';
      res.status(401).json({ success: false, error: msg });
      return;
    }

    // Successful login: reset failed attempts
    await execute(
      'UPDATE admin_config SET failed_login_attempts = 0, locked_until = 0 WHERE id = ?',
      [admin.id]
    );

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        username: admin.username,
        mustChangePassword: Boolean(admin.must_change_password),
        isOnline: Boolean(admin.is_online)
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Change password (forces change on initial login)
apiRouter.post('/admin/change-password', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const adminUser = (req as any).adminUser;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ success: false, error: '新密码长度至少需要6位字符' });
      return;
    }

    const admin = await queryOne('SELECT * FROM admin_config WHERE id = ?', [adminUser.id]);
    if (!admin) {
      res.status(404).json({ success: false, error: '未找到管理员账户' });
      return;
    }

    // Verify old password
    const isOldValid = bcrypt.compareSync(oldPassword, admin.password_hash);
    if (!isOldValid) {
      res.status(400).json({ success: false, error: '原密码输入不正确' });
      return;
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);

    await execute(
      'UPDATE admin_config SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
      [newHash, new Date().toISOString(), admin.id]
    );

    res.json({ success: true, message: '密码修改成功，已解除首次安全强制改密状态！' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Admin dashboard summary statistics
apiRouter.get('/admin/stats', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const totalVisitorsRes = await queryOne('SELECT COUNT(*) as count FROM visitors');
    const totalVisitors = Number(totalVisitorsRes?.count) || 0;

    const todayVisitorsRes = await queryOne(
      'SELECT COUNT(DISTINCT device_id) as count FROM visit_sessions WHERE start_time >= ?',
      [todayIso]
    );
    const todayVisitors = Number(todayVisitorsRes?.count) || 0;

    const inquiriesCountRes = await queryOne('SELECT COUNT(*) as count FROM rent_inquiries');
    const inquiriesCount = Number(inquiriesCountRes?.count) || 0;

    const highIntentCountRes = await queryOne(
      'SELECT COUNT(*) as count FROM visitors WHERE calculated_intent_score >= 60'
    );
    const highIntentCount = Number(highIntentCountRes?.count) || 0;

    const unreadChatCountRes = await queryOne(
      "SELECT COUNT(*) as count FROM chat_messages WHERE sender = 'user' AND is_read = 0"
    );
    const unreadChatCount = Number(unreadChatCountRes?.count) || 0;

    const config = await queryOne('SELECT is_online, model_name FROM admin_config WHERE id = 1');

    res.json({
      success: true,
      stats: {
        totalVisitors,
        todayVisitors,
        inquiriesCount,
        highIntentCount,
        unreadChatCount,
        isOnline: Boolean(config?.is_online),
        modelName: config?.model_name || 'Agnes-2.5-flash'
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Visitors intent list with scores & breakdown
apiRouter.get('/admin/visitors', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { status, filterIntent, sortBy = 'score', order = 'desc' } = req.query;

    const visitors = await query('SELECT * FROM visitors');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const enriched = await Promise.all(
      visitors.map(async (v) => {
        const recentSessions = await query(
          'SELECT session_id FROM visit_sessions WHERE device_id = ? AND start_time >= ?',
          [v.device_id, sevenDaysAgo]
        );
        const userChats = await query(
          "SELECT id FROM chat_messages WHERE device_id = ? AND sender = 'user'",
          [v.device_id]
        );
        const unreadCountRes = await queryOne(
          "SELECT COUNT(*) as count FROM chat_messages WHERE device_id = ? AND sender = 'user' AND is_read = 0",
          [v.device_id]
        );
        const unreadCount = Number(unreadCountRes?.count) || 0;

        const scoreDetail = calculateVisitorIntentScore({
          total_visits: Number(v.total_visits) || 1,
          total_duration_sec: Number(v.total_duration_sec) || 0,
          inquired_rent: Number(v.inquired_rent) || 0,
          phone_number: v.phone_number,
          recent_visits_7d: recentSessions.length,
          chat_count: userChats.length
        });

        return {
          ...v,
          inquired_rent: Boolean(v.inquired_rent),
          recent_visits_7d: recentSessions.length,
          chat_count: userChats.length,
          unread_chats: unreadCount,
          intent_score: scoreDetail.score,
          intent_level: scoreDetail.level,
          intent_label: scoreDetail.levelLabel,
          intent_color: scoreDetail.levelColor,
          score_breakdown: scoreDetail.breakdown
        };
      })
    );

    // Apply filtering
    let filtered = enriched;
    if (status && status !== 'all') {
      filtered = filtered.filter((item) => item.contact_status === status);
    }
    if (filterIntent === 'high') {
      filtered = filtered.filter((item) => item.intent_score >= 60);
    } else if (filterIntent === 'has_phone') {
      filtered = filtered.filter((item) => item.phone_number && item.phone_number.trim().length >= 11);
    } else if (filterIntent === 'has_chat') {
      filtered = filtered.filter((item) => item.chat_count > 0);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let valA: any = a.intent_score;
      let valB: any = b.intent_score;

      if (sortBy === 'visits') {
        valA = Number(a.total_visits) || 0;
        valB = Number(b.total_visits) || 0;
      } else if (sortBy === 'duration') {
        valA = Number(a.total_duration_sec) || 0;
        valB = Number(b.total_duration_sec) || 0;
      } else if (sortBy === 'last_visit') {
        valA = new Date(a.last_visit_at || 0).getTime();
        valB = new Date(b.last_visit_at || 0).getTime();
      }

      return order === 'asc' ? valA - valB : valB - valA;
    });

    res.json({
      success: true,
      visitors: filtered
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Update visitor follow-up status & notes
apiRouter.post('/admin/visitors/:deviceId/status', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { contactStatus, notes } = req.body;

    await execute(
      'UPDATE visitors SET contact_status = ?, notes = ? WHERE device_id = ?',
      [contactStatus || 'pending', notes || '', deviceId]
    );

    res.json({ success: true, message: '访客跟进状态已保存' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Landlord chat: view messages for specific visitor device & mark as read
apiRouter.get('/admin/chat/:deviceId', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const messages = await query(
      'SELECT id, sender, content, created_at, is_read FROM chat_messages WHERE device_id = ? ORDER BY id ASC',
      [deviceId]
    );

    // Mark as read
    await execute(
      "UPDATE chat_messages SET is_read = 1 WHERE device_id = ? AND sender = 'user'",
      [deviceId]
    );

    res.json({ success: true, messages });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Landlord manual reply to visitor
apiRouter.post('/admin/chat/:deviceId/reply', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ success: false, error: '回复内容不能为空' });
      return;
    }

    const now = new Date().toISOString();
    await execute(
      `INSERT INTO chat_messages (device_id, sender, content, created_at, is_read)
       VALUES (?, 'landlord', ?, ?, 1)`,
      [deviceId, content.trim(), now]
    );

    res.json({
      success: true,
      message: {
        sender: 'landlord',
        content: content.trim(),
        created_at: now
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Admin get house info (includes secret rent price, videos and field visibility)
apiRouter.get('/admin/house', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const house = await queryOne('SELECT * FROM house_info WHERE id = 1');
    if (!house) {
      res.status(404).json({ success: false, error: '房源未找到' });
      return;
    }

    let images: string[] = [];
    let videos: any[] = [];
    let amenities: string[] = [];
    let field_visibility = {
      title: true,
      images: true,
      videos: true,
      layout: true,
      area_sqm: true,
      orientation: true,
      floor: true,
      location: true,
      metro_info: true,
      amenities: true,
      description: true,
      guarantee: true,
      landlord_phone: true,
      landlord_wechat: true
    };

    try {
      images = typeof house.images === 'string' ? JSON.parse(house.images) : house.images || [];
    } catch {
      images = [];
    }
    try {
      videos = typeof house.videos === 'string' ? JSON.parse(house.videos) : house.videos || [];
    } catch {
      videos = [];
    }
    try {
      amenities = typeof house.amenities === 'string' ? JSON.parse(house.amenities) : house.amenities || [];
    } catch {
      amenities = [];
    }
    try {
      if (house.field_visibility) {
        field_visibility = { ...field_visibility, ...JSON.parse(house.field_visibility) };
      }
    } catch {}

    res.json({
      success: true,
      house: {
        ...house,
        images,
        videos,
        amenities,
        field_visibility
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Admin update house info
apiRouter.post('/admin/house', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const {
      title,
      location,
      area_sqm,
      layout,
      orientation,
      floor,
      metro_info,
      amenities,
      description,
      secret_rent_price,
      landlord_phone,
      landlord_wechat,
      images,
      videos,
      field_visibility
    } = req.body;

    const amenitiesJson = JSON.stringify(Array.isArray(amenities) ? amenities : []);
    const imagesJson = JSON.stringify(Array.isArray(images) ? images : []);
    const videosJson = JSON.stringify(Array.isArray(videos) ? videos : []);
    const visibilityJson = JSON.stringify(
      typeof field_visibility === 'object' && field_visibility !== null ? field_visibility : {}
    );

    await execute(
      `UPDATE house_info SET
        title = ?,
        location = ?,
        area_sqm = ?,
        layout = ?,
        orientation = ?,
        floor = ?,
        metro_info = ?,
        amenities = ?,
        description = ?,
        secret_rent_price = ?,
        landlord_phone = ?,
        landlord_wechat = ?,
        images = ?,
        videos = ?,
        field_visibility = ?,
        updated_at = ?
       WHERE id = 1`,
      [
        title,
        location,
        Number(area_sqm) || 0,
        layout,
        orientation,
        floor,
        metro_info,
        amenitiesJson,
        description,
        secret_rent_price,
        landlord_phone,
        landlord_wechat,
        imagesJson,
        videosJson,
        visibilityJson,
        new Date().toISOString()
      ]
    );

    res.json({ success: true, message: '房源信息修改成功' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9.1 Upload house media (photos & videos) -> Cloudinary 图床优先，未配置或失败时回退本地存储
apiRouter.post('/admin/upload', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { filename, fileData, type = 'image' } = req.body;
    if (!fileData) {
      res.status(400).json({ success: false, error: '请提供上传文件数据' });
      return;
    }

    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const subFolder = type === 'video' ? 'videos' : 'photos';
    const targetDir = path.join(uploadsDir, subFolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Extract base64 payload
    let base64Content = fileData;
    let extension = type === 'video' ? '.mp4' : '.jpg';

    if (fileData.includes(';base64,')) {
      const parts = fileData.split(';base64,');
      const mime = parts[0];
      base64Content = parts[1];
      if (mime.includes('png')) extension = '.png';
      else if (mime.includes('webp')) extension = '.webp';
      else if (mime.includes('jpeg') || mime.includes('jpg')) extension = '.jpg';
      else if (mime.includes('gif')) extension = '.gif';
      else if (mime.includes('webm')) extension = '.webm';
      else if (mime.includes('mp4')) extension = '.mp4';
      else if (mime.includes('quicktime') || mime.includes('mov')) extension = '.mov';
    } else if (filename && filename.includes('.')) {
      extension = path.extname(filename);
    }

    const cleanName = (filename || 'file').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5.-]/g, '_');
    const safeBase = path.basename(cleanName, extension);
    const newFilename = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeBase}${extension}`;
    const filePath = path.join(targetDir, newFilename);

    // --- 优先上传到 Cloudinary 图床（返回 CDN 绝对地址） ---
    if (isCloudinaryConfigured()) {
      try {
        const mimeByExt: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.mov': 'video/quicktime'
        };
        let dataUri = fileData;
        if (!dataUri.startsWith('data:')) {
          const fallbackMime =
            mimeByExt[extension.toLowerCase()] || (type === 'video' ? 'video/mp4' : 'image/jpeg');
          dataUri = `data:${fallbackMime};base64,${base64Content}`;
        }

        const folder = type === 'video' ? 'zufang2boss/videos' : 'zufang2boss/photos';
        const publicId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeBase}`;
        const result = await uploadToCloudinary({
          dataUri,
          folder,
          publicId,
          resourceType: type === 'video' ? 'video' : 'image'
        });

        res.json({
          success: true,
          url: result.secureUrl,
          filename: `${publicId}.${result.format || extension.replace('.', '')}`,
          size: result.bytes,
          storage: 'cloudinary'
        });
        return;
      } catch (cloudErr: any) {
        // 图床失败自动回退本地存储，不阻断业务
        console.error('Cloudinary upload failed, fallback to local storage:', cloudErr.message || cloudErr);
      }
    }

    // --- 本地存储回退（原逻辑，兼容历史 /uploads/ 相对路径数据） ---
    const buffer = Buffer.from(base64Content, 'base64');
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/${subFolder}/${newFilename}`;

    res.json({
      success: true,
      url: publicUrl,
      filename: newFilename,
      size: buffer.length,
      storage: 'local'
    });
  } catch (err: any) {
    console.error('File upload error:', err);
    res.status(500).json({ success: false, error: '文件上传保存失败: ' + err.message });
  }
});

// 9.2 AI Optimize house description
apiRouter.post('/admin/optimize-description', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const {
      title,
      location,
      area_sqm,
      layout,
      orientation,
      floor,
      metro_info,
      amenities,
      currentDescription
    } = req.body;

    const adminConfig = await queryOne('SELECT * FROM admin_config WHERE id = 1');
    const config = {
      apiBaseUrl: adminConfig?.api_base_url || 'https://apihub.agnes-ai.com/v1',
      apiKey: adminConfig?.api_key || 'sk-GUdpKQNIwwJSZQ5mYyrMnuCJBOjSbB73c2N6NcnNfk5LoKyq',
      modelName: adminConfig?.model_name || 'Agnes-2.5-flash'
    };

    const optimized = await optimizeHouseDescription({
      config,
      houseDetails: {
        title,
        location,
        area_sqm,
        layout,
        orientation,
        floor,
        metro_info,
        amenities,
        currentDescription
      }
    });

    res.json({
      success: true,
      optimizedText: optimized
    });
  } catch (err: any) {
    console.error('optimize-description endpoint error:', err);
    res.status(500).json({ success: false, error: err.message || 'AI文案生成失败' });
  }
});

// 10. Admin get system & LLM configuration
apiRouter.get('/admin/config', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const config = await queryOne('SELECT * FROM admin_config WHERE id = 1');
    if (!config) {
      res.status(404).json({ success: false, error: '配置未找到' });
      return;
    }

    res.json({
      success: true,
      config: {
        apiBaseUrl: config.api_base_url,
        modelName: config.model_name,
        imageModel: config.image_model,
        isOnline: Boolean(config.is_online),
        maskedApiKey: maskApiKey(config.api_key),
        hasApiKey: Boolean(config.api_key),
        mustChangePassword: Boolean(config.must_change_password)
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Admin update configuration (Base URL, API Key, Model, Online status)
apiRouter.post('/admin/config', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { apiBaseUrl, apiKey, modelName, imageModel, isOnline } = req.body;
    const current = await queryOne('SELECT * FROM admin_config WHERE id = 1');

    // Only update apiKey if a new non-empty and non-masked string is provided
    let newApiKey = current?.api_key || '';
    if (apiKey && !apiKey.includes('...')) {
      newApiKey = apiKey.trim();
    }

    const onlineInt = isOnline ? 1 : 0;

    await execute(
      `UPDATE admin_config SET
        api_base_url = ?,
        api_key = ?,
        model_name = ?,
        image_model = ?,
        is_online = ?,
        updated_at = ?
       WHERE id = 1`,
      [
        (apiBaseUrl || '').trim(),
        newApiKey,
        (modelName || 'Agnes-2.5-flash').trim(),
        (imageModel || 'Agnes-Image-2.1-flash').trim(),
        onlineInt,
        new Date().toISOString()
      ]
    );

    res.json({
      success: true,
      message: '系统配置与大模型参数保存成功',
      isOnline: Boolean(onlineInt)
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Test LLM connection
apiRouter.post('/admin/config/test-llm', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { apiBaseUrl, apiKey, modelName } = req.body;
    const current = await queryOne('SELECT * FROM admin_config WHERE id = 1');

    let effectiveApiKey = apiKey && !apiKey.includes('...') ? apiKey.trim() : current?.api_key || '';

    const testConfig = {
      apiBaseUrl: (apiBaseUrl || current?.api_base_url || 'https://apihub.agnes-ai.com/v1').trim(),
      apiKey: effectiveApiKey,
      modelName: (modelName || current?.model_name || 'Agnes-2.5-flash').trim()
    };

    const result = await testAgnesConnection(testConfig);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `连接测试异常: ${err.message}` });
  }
});

// 13. Generate QR code for house showcase entry
apiRouter.get('/admin/qrcode', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const appUrl = process.env.APP_URL || `${protocol}://${host}`;

    // Target is root URL (home rental showcase)
    const targetUrl = `${appUrl.replace(/\/+$/, '')}/`;

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 480,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF'
      }
    });

    res.json({
      success: true,
      targetUrl,
      qrDataUrl
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
