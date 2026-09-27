---
name: "mysqlite2PostgreSQL"
description: |
  A comprehensive end-to-end guide and toolkit for migrating applications from SQLite (or sql.js / better-sqlite3) to PostgreSQL (specifically Neon.tech Serverless Postgres).
  Use this skill whenever:
  * An application needs to upgrade from a local SQLite database to a cloud-hosted PostgreSQL database.
  * The user asks to migrate to Neon.tech, Supabase, Cloud SQL, or any standard PostgreSQL instance.
  * Fixing concurrency, container persistence, or multi-instance data loss caused by local SQLite files on serverless / Cloud Run / containerized environments.
  * Converting SQLite DDL, parameter placeholders (? to $n), sync-to-async data layers, and executing data migration.
---

# SQLite 到 PostgreSQL (Neon.tech) 数据库迁移技能指南

本技能总结了将轻量级/本地 SQLite 数据库平滑升级迁移至云原生 Serverless PostgreSQL（以 Neon.tech 为代表）的完整工程实践、避坑指南与标准代码模板。

---

## 目录
1. [为什么从 SQLite 迁移到 PostgreSQL (Neon)](#一为什么迁移)
2. [核心差异对照与踩坑警示（核心关键点）](#二核心差异对照与踩坑警示)
3. [标准 5 步迁移法（SOP）](#三标准-5-步迁移法sop)
4. [SQL 语法与类型映射速查表](#四sql-语法与类型映射速查表)
5. [常见报错与排查字典](#五常见报错与排查字典)
6. [配套脚本与模版资源](#六配套脚本与模版资源)

---

## 一、为什么迁移？

| 维度 | 本地 SQLite (better-sqlite3 / sql.js) | PostgreSQL (Neon.tech Serverless) |
| :--- | :--- | :--- |
| **部署架构** | 依赖单机本地文件系统，无法在无状态容器 (Cloud Run / Vercel) 跨实例共享 | 云端托管，所有微服务/容器实例共享同一中心化数据源 |
| **容器重启** | 容器重新部署或扩容缩容时，本地 `.db` 文件极易被重置丢失 | 数据独立持久化，支持即时快照恢复与分支 (Branching) |
| **并发写入** | 库级写锁，高并发或长时间事务时容易抛出 `database is locked` | 行级并发锁 (MVCC)，支持高并发高吞吐读写 |
| **连接模型** | 进程内直接读写文件 | 具备专用连接池（Neon Connection Pooler），防 Serverless 连接打爆 |

---

## 二、核心差异对照与踩坑警示

### 1. 参数占位符：`?` 必须全面替换为 `$1, $2, $3...`
- **SQLite 习惯**：
  ```sql
  SELECT * FROM users WHERE status = ? AND role = ?;
  ```
- **PostgreSQL 规范**：
  ```sql
  SELECT * FROM users WHERE status = $1 AND role = $2;
  ```
> **警示**：如果遗留了 `?` 占位符，PostgreSQL 会报错 `syntax error at or near "?"`。

---

### 2. 同步 API 到 异步 API 的全面转化
- **SQLite (如 better-sqlite3)** 常使用同步写法：
  ```ts
  const rows = db.prepare('SELECT * FROM dishes').all();
  ```
- **PostgreSQL (`pg` / `Pool`)** 必须为全异步：
  ```ts
  const res = await pool.query('SELECT * FROM dishes');
  const rows = res.rows;
  ```
> **关键重构**：所有调用数据库的上一层 Service、API Routes（如 Next.js `app/api/.../route.ts`）必须全部补上 `async / await`。

---

### 3. 自增主键与插入返回（Last Insert ID）
- **SQLite**：
  - 建表：`id INTEGER PRIMARY KEY AUTOINCREMENT`
  - 取主键：依赖 `info.lastInsertRowid` 或 `SELECT last_insert_rowid()`
- **PostgreSQL**：
  - 建表：`id SERIAL PRIMARY KEY` 或 `id BIGSERIAL PRIMARY KEY`
  - 取主键：**在 INSERT 语句尾部必须加上 `RETURNING id` 或 `RETURNING *`**！
  ```ts
  const res = await pool.query(
    'INSERT INTO dishes (name, price) VALUES ($1, $2) RETURNING id',
    [name, price]
  );
  const newId = res.rows[0].id;
  ```

---

### 4. 冲突更新 (UPSERT) 语法转换
- **SQLite**：
  ```sql
  INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);
  -- 或
  INSERT OR IGNORE INTO tags (name) VALUES (?);
  ```
- **PostgreSQL**：
  ```sql
  INSERT INTO settings (key, value)
  VALUES ($1, $2)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  -- 或
  INSERT INTO tags (name) VALUES ($1)
  ON CONFLICT (name) DO NOTHING;
  ```

---

### 5. Neon 连接池与 SSL 必须配置
Neon 提供了两种连接地址：
- 直连地址：`ep-xxx.c-4.aws.neon.tech`
- 连接池地址（推荐）：`ep-xxx-pooler.c-4.aws.neon.tech`

在 Node.js 中创建 `pg.Pool` 时，**必须启用 SSL**：
```ts
new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // 避免自签名证书握手失败
  max: 10,                            // 限制单容器最大连接数，防止耗尽 Neon 连接
  idleTimeoutMillis: 30000,
});
```

---

### 6. 并发初始化互斥锁（防止死锁）
多请求并发打入 Serverless 时，若每个请求都去执行建表 DDL (`CREATE TABLE IF NOT EXISTS`)，容易出现并发建表死锁。
**最佳实践**：维护一个模块级 `initPromise` 单例进行互斥保护：
```ts
let isInitDone = false;
let initPromise: Promise<void> | null = null;

export async function ensureDatabase(): Promise<Pool> {
  const pool = getPool();
  if (isInitDone) return pool;
  if (initPromise) {
    await initPromise;
    return pool;
  }
  initPromise = (async () => {
    // 执行建表与必要初始化
    await pool.query(`...`);
    isInitDone = true;
  })();
  await initPromise;
  return pool;
}
```

---

## 三、标准 5 步迁移法（SOP）

### 步骤 1：安装依赖
移除已无用的本地 sqlite 依赖，引入成熟的 PostgreSQL 客户端驱动：
```bash
npm install pg
npm install --save-dev @types/pg
```
*(可根据情况卸载 `better-sqlite3`, `sql.js`)*

### 步骤 2：配置环境变量
在 `.env.local` 与 `.env.example` 声明：
```env
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

### 步骤 3：数据表结构改造 (DDL Migration)
参照 [类型映射速查表](#四sql-语法与类型映射速查表)，编写幂等的 Postgres 建表脚本。

### 步骤 4：数据访问层 (DAO/Repository) 全量升级
1. 替换 `db.prepare(sql).run(...)` 为 `await pool.query(sql, [...])`
2. 批量替换参数占位符 `?` -> `$1, $2, ...`（可以使用本文配套的转换函数）
3. 检查所有插入操作，添加 `RETURNING id`

### 步骤 5：历史数据迁移导入
如果原本已有旧的数据在 SQLite 文件中，可通过脚本读取 SQLite 并按顺序批量写入 PostgreSQL，详见 [迁移脚本模版](#配套迁移脚本)。

---

## 四、SQL 语法与类型映射速查表

| 特性 | SQLite | PostgreSQL (Neon) | 说明 |
| :--- | :--- | :--- | :--- |
| **自增主键** | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | PG 会自动创建底层 sequence |
| **浮点数** | `REAL` / `FLOAT` | `DOUBLE PRECISION` 或 `NUMERIC(10,2)` | 涉及金额推荐 `DOUBLE PRECISION` 或 `NUMERIC` |
| **时间字段** | `DATETIME DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP` | 推荐带时区时间戳 |
| **布尔类型** | `INTEGER` (0 或 1) | `BOOLEAN` 或 `INTEGER` | 为保持原有前端兼容可继续用 `INTEGER`，或改为 `BOOLEAN` |
| **限制与分页** | `LIMIT 10 OFFSET 0` | `LIMIT 10 OFFSET 0` | 两者一致 |
| **插入返回** | `lastID` | `INSERT ... RETURNING *` | 必加 `RETURNING` |
| **UPSERT** | `INSERT OR REPLACE INTO t ...` | `INSERT INTO t ... ON CONFLICT (...) DO UPDATE` | 需指定冲突主键/唯一索引 |
| **当前时间函数** | `datetime('now')` | `NOW()` 或 `CURRENT_TIMESTAMP` | |
| **JSON 支持** | `TEXT` + `json_extract()` | 原生 `JSONB` 或 `TEXT` | 简单场景继续存 `TEXT` 兼容性最好 |

---

## 五、常见报错与排查字典

### 1. `error: syntax error at or near "?"`
- **原因**：SQL 语句中残留了 SQLite 风格的 `?` 占位符。
- **解决**：按参数在数组中的索引顺序改为 `$1, $2, $3`。

### 2. `error: no pg_hba.conf entry for host ... no encryption`
- **原因**：Neon 强制要求 SSL 加密，未开启 SSL 导致握手被拒。
- **解决**：连接串结尾添加 `?sslmode=require`，并在 `pg.Pool` 中传入 `ssl: { rejectUnauthorized: false }`。

### 3. `error: relation "xxxx" does not exist`
- **原因**：尚未执行建表 DDL，或表名大小写不匹配。
- **解决**：确保在应用处理查询前调用了 `ensureDatabase()`；且 PG 默认小写表名，尽量避免使用大写表名。

### 4. `error: null value in column "id" violates not-null constraint`
- **原因**：建表主键字段写成了 `INTEGER PRIMARY KEY` 而漏掉了 `SERIAL`。
- **解决**：改用 `SERIAL PRIMARY KEY`，Postgres 才会自动注入序列自增值。

---

## 六、配套脚本与模版资源

本技能随附提供以下现成开箱即用代码（见同目录子文件夹）：
1. **`/skills/mysqlite2PostgreSQL/examples/db_pg_template.ts`**：
   可以直接复制至项目中作为标准 `lib/db.ts` 的完整模版，具备连接池单例、SSL、并发锁初始化、常见 CRUD 封装和自动占位符转换工具。
2. **`/skills/mysqlite2PostgreSQL/scripts/migrate_sqlite_to_pg.ts`**：
   可独立执行的离线数据同步迁移脚本，支持直接读取本地 `.sqlite` 或 `.db` 数据库并将数据批量推送到 Neon.tech。
