import { Pool, PoolConfig } from 'pg';

/**
 * 标准 PostgreSQL / Neon.tech 数据库连接与管理模版
 * 适用环境：Next.js (App Router / Pages), Node.js, Express
 *
 * 特性：
 * 1. 单例连接池防连接泄露 (适合 Serverless / Next.js 开发热重载环境)
 * 2. 自动开启 SSL (适应 Neon.tech 强制加密要求)
 * 3. 并发安全的多请求幂等初始化互斥锁 (避免 CREATE TABLE 死锁)
 * 4. 辅助工具函数：问号占位符转 $n、安全事务执行器等
 */

let poolInstance: Pool | null = null;
let isInitDone = false;
let initPromise: Promise<void> | null = null;

/**
 * 获取全局唯一的连接池单例
 */
export function getPool(): Pool {
  if (!poolInstance) {
    const connStr = process.env.DATABASE_URL;
    if (!connStr) {
      throw new Error('DATABASE_URL environment variable is not defined.');
    }

    const config: PoolConfig = {
      connectionString: connStr,
      ssl: {
        rejectUnauthorized: false, // 兼容各云厂商托管数据库的 TLS 握手
      },
      max: 10, // 保持适中连接数，防止耗尽 Neon Serverless 连接数
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    poolInstance = new Pool(config);

    poolInstance.on('error', (err) => {
      console.error('PostgreSQL 连接池空闲客户端出现非预期错误:', err);
    });
  }

  return poolInstance;
}

/**
 * 辅助函数：将 SQLite 风格的 '?' 占位符自动转换为 PostgreSQL 风格的 '$1, $2, $3...'
 * 方便在迁移过渡期快速兼容旧的 SQL 拼接语句
 */
export function convertPlaceholders(sqliteSql: string): string {
  let index = 1;
  return sqliteSql.replace(/\?/g, () => `$${index++}`);
}

/**
 * 并发安全幂等初始化数据库表结构
 * 解决多客户端同时触发 cold start 时并发执行 DDL 导致的报错
 */
export async function ensureDatabase(): Promise<Pool> {
  const pool = getPool();
  if (isInitDone) return pool;

  if (initPromise) {
    await initPromise;
    return pool;
  }

  initPromise = (async () => {
    try {
      // 示例：创建基础表
      await pool.query(`
        -- 示例表 1: 配置项表
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        -- 示例表 2: 业务数据表（SERIAL 主键自增）
        CREATE TABLE IF NOT EXISTS items (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
          status INTEGER NOT NULL DEFAULT 1,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      isInitDone = true;
    } catch (error) {
      console.error('PostgreSQL 数据库表初始化失败:', error);
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  await initPromise;
  return pool;
}

/**
 * 事务执行辅助器
 * 自动处理 BEGIN、COMMIT 与 ROLLBACK
 */
export async function withTransaction<T>(
  callback: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
