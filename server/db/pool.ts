import pg from "pg";
import { config } from "../config.ts";

// COUNT(*) and bigserial come back as int8; every value we store fits in a JS number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
// Keep DATE as "YYYY-MM-DD" so no timezone shifts the rental start day.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export type Db = pg.Pool | pg.PoolClient;

export async function many<T>(text: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const result = await db.query(text, params);
  return result.rows as T[];
}

export async function one<T>(text: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  const result = await db.query(text, params);
  return (result.rows[0] as T | undefined) ?? null;
}

export async function exec(text: string, params: unknown[] = [], db: Db = pool): Promise<number> {
  const result = await db.query(text, params);
  return result.rowCount ?? 0;
}

export async function tx<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
