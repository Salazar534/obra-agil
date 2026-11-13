import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/optimize-images.mjs <folder with generated .jpg files>");

const out = path.resolve("public/img");
const equipment = ["betoneira", "andaime", "compactador", "gerador", "serra", "martelete", "escavadeira", "plataforma", "lavadora", "furadeira", "escada", "laser"];
const stores = ["patio", "loja", "andaimes", "galpao", "obra"];

const jobs = [
  ...equipment.map((name) => ({ from: `eq-${name}.jpg`, to: `eq/${name}.webp`, width: 720, height: 720 })),
  ...stores.map((name) => ({ from: `biz-${name}.jpg`, to: `biz/${name}.webp`, width: 1024, height: 576 })),
  { from: "hero.jpg", to: "hero.webp", width: 768, height: 1024 },
  { from: "role-cliente.jpg", to: "role-cliente.webp", width: 480, height: 480 },
  { from: "role-empresa.jpg", to: "role-empresa.webp", width: 480, height: 480 },
];

for (const job of jobs) {
  const destination = path.join(out, job.to);
  await mkdir(path.dirname(destination), { recursive: true });
  const info = await sharp(path.join(source, job.from))
    .resize(job.width, job.height, { fit: "cover" })
    .webp({ quality: 78 })
    .toFile(destination);
  console.log(`${job.to} ${Math.round(info.size / 1024)} KB`);
}
