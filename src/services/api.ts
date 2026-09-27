export interface VideoItem {
  url: string;
  title?: string;
  poster?: string;
}

export interface FieldVisibilityConfig {
  title: boolean;
  images: boolean;
  videos: boolean;
  layout: boolean;
  area_sqm: boolean;
  orientation: boolean;
  floor: boolean;
  location: boolean;
  metro_info: boolean;
  amenities: boolean;
  description: boolean;
  guarantee: boolean;
  landlord_phone: boolean;
  landlord_wechat: boolean;
}

export interface PublicHouseInfo {
  id: number;
  title: string;
  location: string;
  area_sqm: number | null;
  layout: string;
  orientation: string;
  floor: string;
  metro_info: string;
  amenities: string[];
  description: string;
  images: string[];
  videos: VideoItem[];
  landlord_phone?: string;
  landlord_wechat?: string;
  field_visibility?: FieldVisibilityConfig;
}

export interface ChatMessage {
  id: number;
  sender: 'user' | 'landlord' | 'ai';
  content: string;
  created_at: string;
  is_read?: number;
}

export interface VisitorRecord {
  device_id: string;
  ip_address: string;
  user_agent: string;
  first_visit_at: string;
  last_visit_at: string;
  total_visits: number;
  total_duration_sec: number;
  inquired_rent: boolean;
  phone_number: string | null;
  contact_status: 'pending' | 'contacted' | 'wechat_added' | 'viewing_scheduled' | 'signed' | 'no_intent';
  notes: string;
  recent_visits_7d: number;
  chat_count: number;
  unread_chats: number;
  intent_score: number;
  intent_level: 'high' | 'medium_high' | 'normal' | 'low';
  intent_label: string;
  intent_color: string;
  score_breakdown: {
    category: string;
    points: number;
    maxPoints: number;
    desc: string;
  }[];
}

export interface AdminStats {
  totalVisitors: number;
  todayVisitors: number;
  inquiriesCount: number;
  highIntentCount: number;
  unreadChatCount: number;
  isOnline: boolean;
  modelName: string;
}

export interface AdminConfigData {
  apiBaseUrl: string;
  modelName: string;
  imageModel: string;
  isOnline: boolean;
  maskedApiKey: string;
  hasApiKey: boolean;
  mustChangePassword: boolean;
}

// Token storage helper
export function getAdminToken(): string | null {
  return localStorage.getItem('admin_token');
}

export function setAdminToken(token: string): void {
  localStorage.setItem('admin_token', token);
  document.cookie = `admin_token=${token}; path=/; max-age=604800; SameSite=Lax`;
}

export function clearAdminToken(): void {
  localStorage.removeItem('admin_token');
  document.cookie = 'admin_token=; path=/; max-age=0';
}

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

// ---------------- Visitor APIs ----------------
export async function getHouseInfo(): Promise<PublicHouseInfo> {
  const res = await fetch('/api/house');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '获取房源信息失败');
  return json.data;
}

export async function submitRentInquiry(params: {
  deviceId: string;
  phoneNumber: string;
  sourceNote?: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/inquire-rent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '提交询租失败');
  return json;
}

export async function getChatMessages(deviceId: string): Promise<{
  messages: ChatMessage[];
  isLandlordOnline: boolean;
}> {
  const res = await fetch(`/api/chat/messages?deviceId=${encodeURIComponent(deviceId)}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '获取咨询记录失败');
  return json;
}

export async function sendChatMessage(params: {
  deviceId: string;
  content: string;
}): Promise<{
  success: boolean;
  mode: 'manual' | 'ai';
  aiReply?: ChatMessage;
  message?: string;
}> {
  const res = await fetch('/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '发送消息失败');
  return json;
}

// ---------------- Admin APIs ----------------
export async function adminLogin(credentials: {
  username: string;
  password: string;
}): Promise<{
  token: string;
  user: {
    username: string;
    mustChangePassword: boolean;
    isOnline: boolean;
  };
}> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '登录失败');
  setAdminToken(json.token);
  return json;
}

export async function adminChangePassword(params: {
  oldPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/admin/change-password', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '修改密码失败');
  return json;
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await fetch('/api/admin/stats', {
    headers: authHeaders()
  });
  if (res.status === 401) throw new Error('AUTH_EXPIRED');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '获取统计数据失败');
  return json.stats;
}

export async function getAdminVisitors(params?: {
  status?: string;
  filterIntent?: string;
  sortBy?: string;
  order?: string;
}): Promise<VisitorRecord[]> {
  const query = new URLSearchParams(params as any).toString();
  const res = await fetch(`/api/admin/visitors?${query}`, {
    headers: authHeaders()
  });
  if (res.status === 401) throw new Error('AUTH_EXPIRED');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '获取访客记录失败');
  return json.visitors;
}

export async function updateVisitorStatus(
  deviceId: string,
  data: { contactStatus: string; notes: string }
): Promise<void> {
  const res = await fetch(`/api/admin/visitors/${encodeURIComponent(deviceId)}/status`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '保存状态失败');
}

export async function getAdminChat(deviceId: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/admin/chat/${encodeURIComponent(deviceId)}`, {
    headers: authHeaders()
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '获取对话失败');
  return json.messages;
}

export async function sendAdminReply(
  deviceId: string,
  content: string
): Promise<ChatMessage> {
  const res = await fetch(`/api/admin/chat/${encodeURIComponent(deviceId)}/reply`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ content })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '发送回复失败');
  return json.message;
}

export async function getAdminHouseInfo(): Promise<any> {
  const res = await fetch('/api/admin/house', {
    headers: authHeaders()
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '获取房源信息失败');
  return json.house;
}

export async function updateAdminHouseInfo(data: any): Promise<void> {
  const res = await fetch('/api/admin/house', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '保存房源信息失败');
}

export async function getAdminConfig(): Promise<AdminConfigData> {
  const res = await fetch('/api/admin/config', {
    headers: authHeaders()
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '获取系统配置失败');
  return json.config;
}

export async function updateAdminConfig(data: {
  apiBaseUrl: string;
  apiKey?: string;
  modelName: string;
  imageModel?: string;
  isOnline: boolean;
}): Promise<void> {
  const res = await fetch('/api/admin/config', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '保存配置失败');
}

export async function testLlmConnection(data: {
  apiBaseUrl: string;
  apiKey?: string;
  modelName: string;
}): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
  modelOutput?: string;
}> {
  const res = await fetch('/api/admin/config/test-llm', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  const json = await res.json();
  return json;
}

export async function getAdminQrCode(): Promise<{
  targetUrl: string;
  qrDataUrl: string;
}> {
  const res = await fetch('/api/admin/qrcode', {
    headers: authHeaders()
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '生成二维码失败');
  return json;
}

export async function uploadMediaFile(
  file: File,
  type: 'image' | 'video'
): Promise<{ url: string; filename: string; size: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const fileData = reader.result as string;
        const res = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            filename: file.name,
            fileData,
            type
          })
        });
        const json = await res.json();
        if (!json.success) {
          reject(new Error(json.error || '上传失败'));
        } else {
          resolve(json);
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('读取本地文件失败'));
    reader.readAsDataURL(file);
  });
}

export async function optimizeHouseDescriptionApi(data: {
  title?: string;
  location?: string;
  area_sqm?: number | string;
  layout?: string;
  orientation?: string;
  floor?: string;
  metro_info?: string;
  amenities?: string[];
  currentDescription?: string;
}): Promise<{ optimizedText: string }> {
  const res = await fetch('/api/admin/optimize-description', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'AI优化生成失败');
  return json;
}

