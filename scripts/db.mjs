// Manages the private development PostgreSQL cluster in .postgres/ (LOCAL_DB=1).
// Usage: node scripts/db.mjs <start|stop|status|psql|create-test>
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const envPath = join(root, ".env");
const dataDir = join(root, ".postgres", "data");
const logFile = join(root, ".postgres", "postgres.log");
const exe = process.platform === "win32" ? ".exe" : "";

function ensureEnv() {
  if (!existsSync(envPath)) {
    copyFileSync(join(root, ".env.example"), envPath);
    const password = randomBytes(18).toString("base64url");
    const text = readFileSync(envPath, "utf8").replace("obra:change-me@", `obra:${password}@`);
    writeFileSync(envPath, text);
    console.log("[db] created .env with a new database password");
  }
  process.loadEnvFile(envPath);
}

function findPgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const which = spawnSync(process.platform === "win32" ? "where" : "which", [`pg_ctl${exe}`], { encoding: "utf8" });
  if (which.status === 0) return resolve(which.stdout.split(/\r?\n/)[0], "..");
  if (process.platform === "win32") {
    const base = "C:\\Program Files\\PostgreSQL";
    if (existsSync(base)) {
      const versions = readdirSync(base)
        .filter((v) => existsSync(join(base, v, "bin", `pg_ctl${exe}`)))
        .sort((a, b) => Number(b) - Number(a));
      if (versions.length) return join(base, versions[0], "bin");
    }
  }
  throw new Error("PostgreSQL binaries not found. Install PostgreSQL 14+ or set PG_BIN to its bin folder.");
}

function connection() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  };
}

function run(bin, args, options = {}) {
  const result = spawnSync(join(findPgBin(), bin + exe), args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

function isRunning() {
  if (!existsSync(dataDir)) return false;
  return run("pg_ctl", ["status", "-D", dataDir]).status === 0;
}

function init() {
  const { user, password, port } = connection();
  mkdirSync(join(root, ".postgres"), { recursive: true });
  const pwfile = join(root, ".postgres", "pw.tmp");
  writeFileSync(pwfile, password);
  try {
    const result = run("initdb", [
      "-D", dataDir,
      "-U", user,
      `--pwfile=${pwfile}`,
      "--auth-local=scram-sha-256",
      "--auth-host=scram-sha-256",
      "--encoding=UTF8",
      "--locale=C",
    ]);
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  } finally {
    rmSync(pwfile, { force: true });
  }
  appendFileSync(join(dataDir, "postgresql.conf"), `\n# Obra Ágil development cluster\nport = ${port}\nlisten_addresses = '127.0.0.1'\n`);
  console.log(`[db] initialized cluster in .postgres/data (port ${port})`);
}

async function ensureDatabase(name) {
  const conn = connection();
  const client = new pg.Client({ ...conn, database: "postgres" });
  await client.connect();
  try {
    const found = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (found.rowCount === 0) {
      await client.query(`create database "${name.replace(/"/g, "")}"`);
      console.log(`[db] created database ${name}`);
    }
  } finally {
    await client.end();
  }
}

async function start() {
  if (process.env.LOCAL_DB === "0") {
    console.log("[db] LOCAL_DB=0: using DATABASE_URL as is");
    return;
  }
  if (!existsSync(join(dataDir, "PG_VERSION"))) init();
  if (!isRunning()) {
    // The server outlives pg_ctl and would hold piped stdio open forever, so pg_ctl gets no pipes.
    const result = run("pg_ctl", ["start", "-D", dataDir, "-l", logFile, "-w", "-t", "60"], { stdio: "ignore" });
    if (result.status !== 0) throw new Error("could not start PostgreSQL (see .postgres/postgres.log)");
    console.log("[db] PostgreSQL started");
  }
  await ensureDatabase(connection().database);
}

function stop() {
  if (!isRunning()) return console.log("[db] not running");
  const result = run("pg_ctl", ["stop", "-D", dataDir, "-m", "fast", "-w"]);
  console.log(result.status === 0 ? "[db] stopped" : result.stderr);
}

ensureEnv();
const command = process.argv[2] ?? "start";
try {
  if (command === "start") await start();
  else if (command === "stop") stop();
  else if (command === "status") console.log(isRunning() ? "[db] running" : "[db] stopped");
  else if (command === "create-test") await ensureDatabase(`${connection().database}_test`);
  else if (command === "psql") {
    const { host, port, user, password, database } = connection();
    spawnSync(join(findPgBin(), `psql${exe}`), ["-h", host, "-p", String(port), "-U", user, database], {
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: password },
    });
  } else {
    console.error(`unknown command: ${command}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[db] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
