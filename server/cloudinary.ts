// Cloudinary 图床上传模块（零依赖：仅用 Node 全局 fetch + node:crypto 签名，不引入 npm 包）
// 环境变量：
//   CLOUDINARY_CLOUD_NAME  Cloud name
//   CLOUDINARY_API_KEY     API Key
//   CLOUDINARY_API_SECRET  API Secret
import { createHash } from 'node:crypto';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const API_KEY = process.env.CLOUDINARY_API_KEY || '';
const API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  bytes: number;
  format: string;
}

/**
 * 上传 base64 / data-URI 到 Cloudinary。
 * @param dataUri  形如 "data:image/jpeg;base64,xxxx" 或纯 base64（此时必须显式带 mime 前缀）
 * @param folder   Cloudinary 目标文件夹，如 "zufang2boss/photos"
 * @param publicId 可选，指定后同名重复上传为幂等覆盖
 * @param resourceType image 走 /image/upload，video 走 /video/upload
 */
export async function uploadToCloudinary(opts: {
  dataUri: string;
  folder: string;
  publicId?: string;
  resourceType?: 'image' | 'video';
}): Promise<CloudinaryUploadResult> {
  const timestamp = Math.floor(Date.now() / 1000);

  // 签名参数按字母序拼接后接 API_SECRET 再取 SHA-1（Cloudinary 规范）
  const params: Record<string, string> = {
    folder: opts.folder,
    timestamp: String(timestamp)
  };
  if (opts.publicId) params.public_id = opts.publicId;
  const toSign =
    Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&') + API_SECRET;
  const signature = createHash('sha1').update(toSign).digest('hex');

  const form = new FormData();
  form.append('file', opts.dataUri);
  form.append('api_key', API_KEY);
  form.append('timestamp', String(timestamp));
  form.append('folder', opts.folder);
  if (opts.publicId) form.append('public_id', opts.publicId);
  form.append('signature', signature);

  const resourceType = opts.resourceType === 'video' ? 'video' : 'image';
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`, {
    method: 'POST',
    body: form
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.secure_url) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Cloudinary upload failed: ${msg}`);
  }

  return {
    secureUrl: json.secure_url as string,
    publicId: json.public_id as string,
    bytes: Number(json.bytes) || 0,
    format: String(json.format || '')
  };
}
