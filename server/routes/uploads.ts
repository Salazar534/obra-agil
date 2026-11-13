import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { exec } from "../db/pool.ts";
import { badRequest } from "../lib/errors.ts";
import { uploadLimiter } from "../lib/limits.ts";
import { route } from "../lib/route.ts";

export const uploadsDir = join(import.meta.dirname, "..", "storage", "uploads");
mkdirSync(uploadsDir, { recursive: true });

const MAX_BYTES = 10 * 1024 * 1024;
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 5 } });

const sizes = {
  avatar: { width: 512, height: 512, fit: "cover" },
  logo: { width: 512, height: 512, fit: "cover" },
  cover: { width: 1600, height: 900, fit: "cover" },
  item: { width: 1200, height: 1200, fit: "inside" },
} as const;

export const uploadRoutes = [
  route({
    method: "post",
    path: "/uploads",
    tag: "Uploads",
    summary: "Enviar foto",
    description:
      "multipart/form-data com o campo file. A foto é girada conforme o EXIF, sem metadados, redimensionada e salva como WebP. " +
      "avatar e logo: 512×512; cover: 1600×900; item: até 1200 px.",
    auth: "user",
    middleware: [uploadLimiter, receive.single("file")],
    query: z.object({ kind: z.enum(["avatar", "logo", "cover", "item"]).describe("Onde a foto vai ser usada.") }),
    upload: { field: "file", description: "Imagem JPG, PNG, WebP ou GIF até 10 MB." },
    responses: { 201: { description: "Foto salva", schema: z.object({ url: z.string().describe("Caminho público, como /uploads/ID.webp") }) } },
    handler: async ({ req, query, user }) => {
      if (!req.file) throw badRequest("file_required", "Escolha uma foto.");
      const size = sizes[query.kind];
      let output: Buffer;
      try {
        output = await sharp(req.file.buffer, { failOn: "error", limitInputPixels: 50_000_000 })
          .rotate()
          .resize({ width: size.width, height: size.height, fit: size.fit, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        throw badRequest("invalid_image", "Não deu para abrir essa foto. Tente JPG ou PNG.");
      }
      const id = randomUUID();
      const file = `${id}.webp`;
      await writeFile(join(uploadsDir, file), output);
      await exec("insert into uploads (id, user_id, kind, file, bytes) values ($1, $2, $3, $4, $5)", [id, user.id, query.kind, file, output.length]);
      return { url: `/uploads/${file}` };
    },
  }),
];
