// One frontend service, two sites. The apex and www serve the public site.
// app.obiagil.com.br serves the product and proxies /api so the session stays first-party.
import { createReadStream, existsSync, statSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const port = Number(process.env.PORT || 3000);
const upstream = process.env.API_UPSTREAM?.replace(/\/$/, "");
const distRoot = join(import.meta.dirname, "..", "dist");
const publicRoot = join(import.meta.dirname, "..", "public");
const siteRoot = join(import.meta.dirname, "..", "site");
const marketingHosts = new Set(
  (process.env.MARKETING_HOSTS ?? "obiagil.com.br,www.obiagil.com.br")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function requestHost(req) {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.headers.host || "";
  return String(raw).split(",")[0].trim().split(":")[0].toLowerCase();
}

function proxy(req, res) {
  if (!upstream) return send(res, 503, "API_UPSTREAM não está configurado.");
  const target = new URL(upstream);
  const headers = { ...req.headers, host: target.host };
  headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "https";
  headers["x-forwarded-host"] = req.headers["x-forwarded-host"] || req.headers.host;
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstreamReq = transport(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: req.url,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstreamReq.on("error", () => {
    if (!res.headersSent) send(res, 502, "A API não respondeu.");
  });
  req.pipe(upstreamReq);
}

function fileIn(root, urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0]))
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  if (!clean || clean.includes("\0")) return null;
  const candidate = join(root, clean);
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (!candidate.startsWith(prefix)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

function pipeFile(res, target) {
  const cache = target.endsWith(".html") ? "no-store" : "public, max-age=3600";
  res.writeHead(200, { "content-type": types[extname(target)] ?? "application/octet-stream", "cache-control": cache });
  createReadStream(target).pipe(res);
}

function sharedAsset(urlPath) {
  if (urlPath !== "/favicon.svg" && !urlPath.startsWith("/img/") && !urlPath.startsWith("/icons/")) return null;
  return fileIn(distRoot, urlPath) ?? fileIn(publicRoot, urlPath);
}

createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const host = requestHost(req);
  if (host === "www.obiagil.com.br") {
    res.writeHead(308, { location: `https://obiagil.com.br${req.url ?? "/"}`, "cache-control": "public, max-age=300" });
    res.end();
    return;
  }
  const marketing = marketingHosts.has(host);
  if (path.startsWith("/api") || path.startsWith("/uploads")) {
    if (marketing) return send(res, 404, "Não encontrado.");
    return proxy(req, res);
  }
  if (marketing) {
    const page = path === "/" ? fileIn(siteRoot, "/index.html") : fileIn(siteRoot, path) ?? sharedAsset(path);
    if (!page) return send(res, 404, "Não encontrado.");
    return pipeFile(res, page);
  }
  const asset = path === "/" ? null : fileIn(distRoot, path) ?? sharedAsset(path);
  const target = asset ?? join(distRoot, "index.html");
  if (!existsSync(target)) return send(res, 404, "App ainda não foi construído.");
  pipeFile(res, target);
}).listen(port, "0.0.0.0", () => {
  console.log(`[web] listening on 0.0.0.0:${port} → ${upstream || "(sem API)"}`);
});
