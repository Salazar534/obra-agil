import type { Request, Response } from "express";
import { config } from "../config.ts";
import { one } from "../db/pool.ts";
import { readSession } from "../lib/session.ts";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function page(body: string) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>API · Obi Ágil</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px 20px;
      background: #f2f2f7;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(440px, 100%);
      background: #fff;
      border-radius: 28px;
      padding: 32px 28px;
      box-shadow: 0 10px 40px rgb(0 0 0 / 0.06);
    }
    p { margin: 0; }
    .mark { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.02em; color: #0a66e0; }
    h1 { margin: 10px 0 0; font-size: 34px; line-height: 1.1; letter-spacing: -0.03em; }
    .lead { margin-top: 12px; font-size: 17px; line-height: 1.4; color: #3a3a3c; }
    .address {
      margin-top: 22px;
      padding: 14px 16px;
      border-radius: 16px;
      background: #f2f2f7;
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      font-size: 14px;
      word-break: break-all;
    }
    a.button {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 22px;
      min-height: 50px;
      border-radius: 14px;
      background: #0a66e0;
      color: #fff;
      font-size: 17px;
      font-weight: 600;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

/** Browser page for the API host. The reference screen stays out of the app; this page requires a session. */
export async function apiHome(req: Request, res: Response) {
  const user = await readSession(req, res);
  const appUrl = config.appUrl;
  res.set("Cache-Control", "private, no-store");
  res.type("html");
  if (!user) {
    res.status(401).send(
      page(`<p class="mark">Obi Ágil</p>
      <h1>API</h1>
      <p class="lead">Esta página é da sua conta. Entre no app para abri-la.</p>
      <a class="button" href="${escapeHtml(appUrl)}">Entrar no app</a>`),
    );
    return;
  }
  const account = await one<{ name: string }>("select name from users where id = $1", [user.id]);
  const name = account?.name ?? "sua conta";
  const kind = user.role === "business" ? "conta de empresa" : "conta pessoal";
  const origin = config.publicUrl ?? `${req.protocol}://${req.get("host")}`;
  res.status(200).send(
    page(`<p class="mark">Obi Ágil</p>
    <h1>API</h1>
    <p class="lead">Olá, ${escapeHtml(name)}. Esta página é a API da sua ${kind}. O app usa a sessão desta conta.</p>
    <p class="address">${escapeHtml(origin)}/api</p>
    <a class="button" href="${escapeHtml(appUrl)}">Abrir o app</a>`),
  );
}
