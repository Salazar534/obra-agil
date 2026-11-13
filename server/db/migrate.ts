import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "./pool.ts";

const dir = join(import.meta.dirname, "migrations");
const LOCK = 727_274;

export async function migrate(log: (message: string) => void = console.log) {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK]);
    await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await client.query<{ name: string }>("select name from schema_migrations")).rows.map((row) => row.name));
    const files = readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        log(`[db] applied ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`migration ${file} failed: ${error instanceof Error ? error.message : error}`, { cause: error });
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => {});
    client.release();
  }
}

if (process.argv[1] === import.meta.filename) {
  await migrate();
  await pool.end();
}
