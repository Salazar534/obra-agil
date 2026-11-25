import type { CookieOptions, Request, Response } from "express";
import { config } from "../config.ts";
import { exec, one, type Db } from "../db/pool.ts";
import { newToken, sha256 } from "./security.ts";

export const SESSION_COOKIE = "oa_session";
const DAY = 86_400_000;

export type Role = "customer" | "business";
export type SessionUser = { id: string; role: Role; sessionId: string };

const cache = new WeakMap<Request, SessionUser | null>();

function cookieOptions(req: Request, expires?: Date): CookieOptions {
  const host = req.hostname.toLowerCase();
  const parent = config.cookieDomain;
  const bare = parent?.slice(1) ?? "";
  const shared = Boolean(parent && (host === bare || host.endsWith(`.${bare}`)));
  return { httpOnly: true, sameSite: "lax", secure: req.secure, path: "/", ...(expires ? { expires } : {}), ...(shared ? { domain: parent ?? undefined } : {}) };
}

export async function startSession(req: Request, res: Response, userId: string, db?: Db) {
  const token = newToken();
  const expires = new Date(Date.now() + config.sessionDays * DAY);
  await exec(
    "insert into sessions (id, user_id, user_agent, ip, expires_at) values ($1, $2, $3, $4, $5)",
    [sha256(token), userId, req.get("user-agent")?.slice(0, 300) ?? null, req.ip ?? null, expires],
    db,
  );
  res.cookie(SESSION_COOKIE, token, cookieOptions(req, expires));
}

export async function readSession(req: Request, res: Response): Promise<SessionUser | null> {
  if (cache.has(req)) return cache.get(req) ?? null;
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  let user: SessionUser | null = null;
  if (typeof token === "string" && token.length >= 20 && token.length <= 100) {
    const row = await one<{ session_id: string; user_id: string; role: Role; last_seen_at: Date }>(
      `select s.id as session_id, u.id as user_id, u.role, s.last_seen_at
         from sessions s join users u on u.id = s.user_id
        where s.id = $1 and s.expires_at > now()`,
      [sha256(token)],
    );
    if (row) {
      user = { id: row.user_id, role: row.role, sessionId: row.session_id };
      if (Date.now() - row.last_seen_at.getTime() > DAY) {
        const expires = new Date(Date.now() + config.sessionDays * DAY);
        await exec("update sessions set last_seen_at = now(), expires_at = $2 where id = $1", [row.session_id, expires]);
        res.cookie(SESSION_COOKIE, token, cookieOptions(req, expires));
      }
    }
  }
  cache.set(req, user);
  return user;
}

export async function endSession(req: Request, res: Response) {
  const user = await readSession(req, res);
  if (user) await exec("delete from sessions where id = $1", [user.sessionId]);
  cache.set(req, null);
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}

export async function endOtherSessions(userId: string, keepSessionId: string | null, db?: Db) {
  await exec("delete from sessions where user_id = $1 and id is distinct from $2", [userId, keepSessionId], db);
}
