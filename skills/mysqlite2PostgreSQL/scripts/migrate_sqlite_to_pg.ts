/**
 * 离线数据同步脚本：从本地 SQLite 数据库迁移已有历史数据至 PostgreSQL (Neon.tech)
 *
 * 使用方法：
 * 1. 确保安装好相关驱动：npm install pg (如本地读取sqlite可用 better-sqlite3 或 sqlite3)
 * 2. 设置目标数据库连接串环境变量：
 *    export DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.neon.tech/neondb?sslmode=require"
 * 3. 运行脚本：
 *    npx ts-node skills/mysqlite2PostgreSQL/scripts/migrate_sqlite_to_pg.ts [sqlite文件路径]
 */

import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

async function runMigration() {
  const sqliteFile = process.argv[2] || path.join(process.cwd(), 'database.sqlite');
  const targetPgUrl = process.env.DATABASE_URL;

  if (!targetPgUrl) {
    console.error('❌ 请先配置环境变量 DATABASE_URL (指向目标 PostgreSQL/Neon 数据库)');
    process.exit(1);
  }

  if (!fs.existsSync(sqliteFile)) {
    console.warn(`⚠️ 未找到指定的 SQLite 数据文件: ${sqliteFile}`);
    console.log('如仅用于新建数据库初始化，可直接使用 db_pg_template.ts 中的 ensureDatabase()。');
    return;
  }

  console.log(`🚀 开始从 SQLite [${sqliteFile}] 迁移数据至 PostgreSQL...`);

  // 1. 初始化 PostgreSQL 连接
  const pgPool = new Pool({
    connectionString: targetPgUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // 2. 动态加载 SQLite 驱动（避免在未安装驱动时直接阻断编译）
    let DatabaseConstructor: any;
    try {
      DatabaseConstructor = require('better-sqlite3');
    } catch {
      console.error('❌ 需要安装 better-sqlite3 才能读取本地 sqlite 文件: npm install better-sqlite3');
      process.exit(1);
    }

    const sqliteDb = new DatabaseConstructor(sqliteFile, { readonly: true });

    // 3. 读取 SQLite 中所有用户表
    const tables: Array<{ name: string }> = sqliteDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all();

    console.log(`📋 发现待迁移的数据表 (${tables.length} 张):`, tables.map((t) => t.name).join(', '));

    for (const { name: tableName } of tables) {
      console.log(`\n⏳ 正在同步表 [${tableName}]...`);
      const rows: any[] = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all();
      if (rows.length === 0) {
        console.log(`   表 [${tableName}] 暂无数据，跳过。`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const colNames = columns.map((c) => `"${c}"`).join(', ');

      let migratedCount = 0;
      for (const row of rows) {
        const values = columns.map((col) => row[col]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        // 采用 ON CONFLICT DO NOTHING 避免主键重复插入崩溃
        const insertSql = `
          INSERT INTO "${tableName}" (${colNames})
          VALUES (${placeholders})
          ON CONFLICT DO NOTHING
        `;

        await pgPool.query(insertSql, values);
        migratedCount++;
      }

      // 如果包含自增序列 id，重置 PostgreSQL sequence 至最大值
      if (columns.includes('id')) {
        try {
          await pgPool.query(`
            SELECT setval(
              pg_get_serial_sequence('"${tableName}"', 'id'),
              COALESCE((SELECT MAX(id) FROM "${tableName}"), 1),
              true
            );
          `);
        } catch {
          // 若不是标准序列自增则忽略
        }
      }

      console.log(`✅ 表 [${tableName}] 迁移完毕，成功处理 ${migratedCount} 条记录。`);
    }

    console.log('\n🎉 所有 SQLite 历史数据已成功迁移至 PostgreSQL！');
  } catch (err) {
    console.error('❌ 迁移过程中发生异常:', err);
  } finally {
    await pgPool.end();
  }
}

// 仅在直接执行时运行
if (require.main === module) {
  runMigration();
}
