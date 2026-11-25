// Downloads openly licensed photos (CC0, public domain, or CC-BY) and keeps only
// pictures whose corners are already white, then frames them on a pure white square.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const limit = Number(process.env.IMAGE_LIMIT ?? 0);
const root = join(import.meta.dirname, "..");
const outDir = join(root, "public", "img", "catalog");
const manifestPath = join(root, "server", "catalog", "images.json");
mkdirSync(outDir, { recursive: true });

const { catalogTemplates } = await import("../server/catalog/data.ts");
const saved = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

function whiteEnough(data, width, channels) {
  const sample = (x, y) => {
    const i = (y * width + x) * channels;
    return data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225;
  };
  const points = [
    [2, 2],
    [width - 3, 2],
    [2, width - 3],
    [width - 3, width - 3],
  ];
  return points.filter(([x, y]) => sample(x, y)).length >= 3;
}

async function search(query) {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("license", "cc0,pdm,by");
  url.searchParams.set("page_size", "8");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "ObiAgilCatalog/1.0" }, signal: AbortSignal.timeout(20_000) });
      if (response.status === 429) return "wait";
      if (!response.ok) return [];
      const data = await response.json();
      return data.results ?? [];
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  return [];
}

function words(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

function score(result, query) {
  const title = words(`${result.title ?? ""} ${result.tags?.map((tag) => tag.name).join(" ") ?? ""}`).join(" ");
  const hits = words(query).filter((word) => title.includes(word));
  return hits.length;
}

async function download(result) {
  const file = await fetch(result.url, { headers: { "user-agent": "ObiAgilCatalog/1.0" }, signal: AbortSignal.timeout(12_000) });
  if (!file.ok) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length < 8_000) return null;
  let white = false;
  try {
    const probe = await sharp(bytes).resize(48, 48, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    white = whiteEnough(probe.data, probe.info.width, probe.info.channels);
  } catch {
    return null;
  }
  return { bytes, white };
}

async function take(template) {
  const queries = [template.name, words(template.name).slice(0, 2).join(" ")];
  let fallback = null;
  for (const query of queries) {
    if (!query) continue;
    const results = await search(query);
    if (results === "wait") return "wait";
    const ranked = results
      .filter((result) => result.url)
      .map((result) => ({ result, rank: score(result, query) }))
      .filter((item) => item.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 3);
    for (const item of ranked) {
      const file = await download(item.result).catch(() => null);
      if (!file) continue;
      if (file.white) return save(template, item.result, file.bytes);
      if (!fallback) fallback = { result: item.result, bytes: file.bytes };
    }
    if (fallback) break;
  }
  if (!fallback) return "miss";
  return save(template, fallback.result, fallback.bytes);
}

function save(template, result, bytes) {
  const fileName = `${template.id}.webp`;
  return sharp(bytes)
    .resize(800, 800, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 78 })
    .toFile(join(outDir, fileName))
    .then(() => {
      saved[template.id] = {
        path: `/img/catalog/${fileName}`,
        source: result.url,
        license: result.license,
        author: result.creator || result.attribution || "",
      };
      writeFileSync(manifestPath, JSON.stringify(saved, null, 2));
      return "saved";
    })
    .catch(() => "miss");
}

let savedCount = 0;
let missed = 0;
const pending = catalogTemplates.filter((template) => !template.image && !saved[template.id] && !existsSync(join(outDir, `${template.id}.webp`)));
console.log(`pending ${pending.length}`);
for (const template of pending) {
  if (limit > 0 && savedCount >= limit) break;
  let result = await take(template);
  if (result === "wait") {
    console.log("rate limit, waiting");
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    result = await take(template);
    if (result === "wait") {
      console.log("rate limit, stopping");
      break;
    }
  }
  if (result === "saved") {
    savedCount += 1;
    console.log("saved", template.id);
  } else missed += 1;
  await new Promise((resolve) => setTimeout(resolve, 400));
}
console.log(JSON.stringify({ saved: savedCount, missed, total: Object.keys(saved).length }));
