import { Pool, PoolConfig } from 'pg';
import bcrypt from 'bcryptjs';

export const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_KLQv36ezVyYG@ep-round-credit-b584r680-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// 静态房源图片：历史本地路径 -> Cloudinary CDN 地址（用于种子数据与启动迁移）
export const STATIC_IMAGE_CDN_MAP: Array<[string, string]> = [
  [
    '/src/assets/images/rental_living_room_1790429189718.jpg',
    'https://res.cloudinary.com/jcgfauar/image/upload/v1790500169/zufang2boss/static/rental_living_room_1790429189718.jpg'
  ],
  [
    '/src/assets/images/rental_master_bedroom_1790429204777.jpg',
    'https://res.cloudinary.com/jcgfauar/image/upload/v1790500171/zufang2boss/static/rental_master_bedroom_1790429204777.jpg'
  ],
  [
    '/src/assets/images/rental_kitchen_dining_1790429218744.jpg',
    'https://res.cloudinary.com/jcgfauar/image/upload/v1790500165/zufang2boss/static/rental_kitchen_dining_1790429218744.jpg'
  ],
  [
    '/src/assets/images/rental_modern_bathroom_1790429229920.jpg',
    'https://res.cloudinary.com/jcgfauar/image/upload/v1790500173/zufang2boss/static/rental_modern_bathroom_1790429229920.jpg'
  ]
];

let poolInstance: Pool | null = null;
let isInitDone = false;
let initPromise: Promise<Pool> | null = null;

/**
 * Global singleton connection pool for Neon.tech PostgreSQL
 */
export function getPool(): Pool {
  if (!poolInstance) {
    const config: PoolConfig = {
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, // Compatible with Neon TLS handshake
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    poolInstance = new Pool(config);

    poolInstance.on('error', (err) => {
      console.error('PostgreSQL idle client unexpected error:', err);
    });
  }

  return poolInstance;
}

/**
 * Converts SQLite '?' placeholders to PostgreSQL '$1, $2, $3...' parameters
 */
export function convertPlaceholders(sqliteSql: string): string {
  let index = 1;
  return sqliteSql.replace(/\?/g, () => `$${index++}`);
}

/**
 * Concurrency-safe idempotent database initialization with mutex
 */
export async function initDatabase(): Promise<Pool> {
  const pool = getPool();
  if (isInitDone) return pool;

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // 1. Create tables in PostgreSQL
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_config (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          must_change_password INTEGER DEFAULT 1,
          api_base_url TEXT DEFAULT 'https://apihub.agnes-ai.com/v1',
          api_key TEXT DEFAULT 'sk-GUdpKQNIwwJSZQ5mYyrMnuCJBOjSbB73c2N6NcnNfk5LoKyq',
          model_name TEXT DEFAULT 'Agnes-2.5-flash',
          image_model TEXT DEFAULT 'Agnes-Image-2.1-flash',
          is_online INTEGER DEFAULT 0,
          failed_login_attempts INTEGER DEFAULT 0,
          locked_until BIGINT DEFAULT 0,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS house_info (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          location TEXT NOT NULL,
          area_sqm DOUBLE PRECISION NOT NULL,
          layout TEXT NOT NULL,
          orientation TEXT NOT NULL,
          floor TEXT NOT NULL,
          metro_info TEXT,
          amenities TEXT,
          description TEXT,
          images TEXT,
          videos TEXT,
          field_visibility TEXT,
          secret_rent_price TEXT,
          landlord_phone TEXT,
          landlord_wechat TEXT,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS visitors (
          device_id TEXT PRIMARY KEY,
          ip_address TEXT,
          user_agent TEXT,
          first_visit_at TIMESTAMPTZ,
          last_visit_at TIMESTAMPTZ,
          total_visits INTEGER DEFAULT 1,
          total_duration_sec INTEGER DEFAULT 0,
          inquired_rent INTEGER DEFAULT 0,
          phone_number TEXT,
          contact_status TEXT DEFAULT 'pending',
          notes TEXT DEFAULT '',
          calculated_intent_score INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS visit_sessions (
          session_id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          start_time TIMESTAMPTZ NOT NULL,
          end_time TIMESTAMPTZ NOT NULL,
          duration_sec INTEGER DEFAULT 0,
          page_path TEXT
        );

        CREATE TABLE IF NOT EXISTS rent_inquiries (
          id SERIAL PRIMARY KEY,
          device_id TEXT NOT NULL,
          phone_number TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          source_note TEXT
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          id SERIAL PRIMARY KEY,
          device_id TEXT NOT NULL,
          sender TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          is_read INTEGER DEFAULT 0
        );
      `);

      // 2. Seed admin if not present
      const adminRes = await pool.query("SELECT id FROM admin_config WHERE username = 'admin'");
      if (adminRes.rows.length === 0) {
        const salt = bcrypt.genSaltSync(10);
        const defaultHash = bcrypt.hashSync('admin123', salt);
        await pool.query(
          `INSERT INTO admin_config (
            id, username, password_hash, must_change_password,
            api_base_url, api_key, model_name, image_model, is_online, updated_at
          ) VALUES (
            1, 'admin', $1, 1,
            'https://apihub.agnes-ai.com/v1',
            'sk-GUdpKQNIwwJSZQ5mYyrMnuCJBOjSbB73c2N6NcnNfk5LoKyq',
            'Agnes-2.5-flash',
            'Agnes-Image-2.1-flash',
            0,
            NOW()
          ) ON CONFLICT (username) DO NOTHING`,
          [defaultHash]
        );
      }

      // 3. Seed default house info if not present
      const houseRes = await pool.query('SELECT id FROM house_info WHERE id = 1');
      if (houseRes.rows.length === 0) {
        const defaultVideos = JSON.stringify([
          {
            url: 'https://assets.mixkit.co/videos/preview/mixkit-living-room-with-modern-interior-design-4820-large.mp4',
            title: '滨江壹号院 · 客厅与主卧实景漫游',
            poster: 'https://res.cloudinary.com/jcgfauar/image/upload/v1790500169/zufang2boss/static/rental_living_room_1790429189718.jpg'
          }
        ]);

        const defaultVisibility = JSON.stringify({
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
        });

        const defaultImages = JSON.stringify([
          'https://res.cloudinary.com/jcgfauar/image/upload/v1790500169/zufang2boss/static/rental_living_room_1790429189718.jpg',
          'https://res.cloudinary.com/jcgfauar/image/upload/v1790500171/zufang2boss/static/rental_master_bedroom_1790429204777.jpg',
          'https://res.cloudinary.com/jcgfauar/image/upload/v1790500165/zufang2boss/static/rental_kitchen_dining_1790429218744.jpg',
          'https://res.cloudinary.com/jcgfauar/image/upload/v1790500173/zufang2boss/static/rental_modern_bathroom_1790429229920.jpg'
        ]);

        const defaultAmenities = JSON.stringify([
          '集中供暖',
          '独立景观南阳台',
          '西门子洗烘一体机',
          '博世双开门冰箱',
          '大金中央空调',
          '威能恒温地暖',
          '指纹密码智能门锁',
          '民用水电燃气',
          '24小时管家安防',
          '地库直达车位'
        ]);

        await pool.query(
          `INSERT INTO house_info (
            id, title, location, area_sqm, layout, orientation, floor,
            metro_info, amenities, description, images, videos, field_visibility,
            secret_rent_price, landlord_phone, landlord_wechat, updated_at
          ) VALUES (
            1,
            '滨江壹号院 · 精装两居 · 近地铁口高层采光无遮挡',
            '杭州市滨江区科技馆街88号 滨江壹号院 2号楼1602室',
            89.5,
            '2室1厅1卫1阳台',
            '南',
            '16层 / 共28层',
            '距地铁6号线星民站A出口步行约260米，直达钱江新城金融城与网易阿里园区',
            $1,
            '全明精装户型，南北通透，全屋大金中央空调、德国威能地暖，博世冰箱与西门子洗烘一体机。主卧带全景落地飘窗，采光无遮挡，高层视野绝佳。园区绿化率高达38%，24小时绿城品牌管家安防服务。适合IT/金融白领或精致家庭长期租住。房东直租，无任何中介费。',
            $2,
            $3,
            $4,
            '租金报价：4800元/月 (押一付三，租金已包含物业费及百兆宽带，长租满一年可小幅优惠)',
            '13800138000',
            'landlord_vip',
            NOW()
          ) ON CONFLICT (id) DO NOTHING`,
          [defaultAmenities, defaultImages, defaultVideos, defaultVisibility]
        );
      }

      // 4. 历史本地图片路径迁移到 Cloudinary CDN（REPLACE 子串替换，幂等：已迁移则无变化）
      for (const [legacyPath, cdnUrl] of STATIC_IMAGE_CDN_MAP) {
        await pool.query(
          `UPDATE house_info
             SET images = REPLACE(COALESCE(images, ''), $1, $2),
                 videos = REPLACE(COALESCE(videos, ''), $1, $2)
           WHERE id = 1`,
          [legacyPath, cdnUrl]
        );
      }

      isInitDone = true;
      return pool;
    } catch (error) {
      console.error('PostgreSQL initialization failed:', error);
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Backward compatibility: Postgres auto-persists all queries
 */
export function saveDatabase(): void {
  // No-op for PostgreSQL
}

/**
 * Query multiple rows asynchronously
 */
export async function query<T = any>(sqlStr: string, params: any[] = []): Promise<T[]> {
  const pool = getPool();
  const pgSql = convertPlaceholders(sqlStr);
  const result = await pool.query(pgSql, params);
  return result.rows as T[];
}

/**
 * Query a single row asynchronously
 */
export async function queryOne<T = any>(sqlStr: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sqlStr, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute INSERT/UPDATE/DELETE asynchronously
 */
export async function execute(sqlStr: string, params: any[] = []): Promise<any> {
  const pool = getPool();
  const pgSql = convertPlaceholders(sqlStr);
  return await pool.query(pgSql, params);
}
