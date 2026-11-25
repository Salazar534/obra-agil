import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { fold } from "../lib/text.ts";
import { catalogCategories, catalogTemplates } from "./data.ts";

type SavedImage = { path: string; source?: string; license?: string; author?: string };
const imageFile = join(import.meta.dirname, "images.json");
const savedImages: Record<string, SavedImage> = existsSync(imageFile) ? JSON.parse(readFileSync(imageFile, "utf8")) : {};

function searchOf(name: string, aliases: string[]) {
  return fold([name, ...aliases].join(" "));
}

/** Upserts the master catalog. Does not publish listings and does not overwrite a finished image with an empty one. */
export async function seedCatalog(db: pg.Pool | pg.PoolClient) {
  for (const category of catalogCategories) {
    await db.query(
      `insert into catalog_categories (id, kind, name, aliases, image_url, restricted, search)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         kind = excluded.kind,
         name = excluded.name,
         aliases = excluded.aliases,
         restricted = excluded.restricted,
         search = excluded.search,
         image_url = coalesce(catalog_categories.image_url, excluded.image_url)`,
      [category.id, category.kind, category.name, category.aliases, category.image, category.restricted, searchOf(category.name, category.aliases)],
    );
  }
  const seen = new Set<string>();
  for (const template of catalogTemplates) {
    if (seen.has(template.id)) throw new Error(`template duplicado: ${template.id}`);
    seen.add(template.id);
    const image = savedImages[template.id]?.path ?? template.image;
    await db.query(
      `insert into catalog_templates (id, category_id, name, description, aliases, image_url, search)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         category_id = excluded.category_id,
         name = excluded.name,
         description = excluded.description,
         aliases = excluded.aliases,
         search = excluded.search,
         image_url = coalesce(catalog_templates.image_url, excluded.image_url)`,
      [
        template.id,
        template.categoryId,
        template.name,
        template.description,
        template.aliases,
        image,
        searchOf(template.name, [template.description, ...template.aliases]),
      ],
    );
    await db.query(
      `insert into catalog_image_jobs (template_id, status)
       values ($1, $2)
       on conflict (template_id) do update set
         status = case when catalog_image_jobs.status = 'done' then 'done' else excluded.status end,
         updated_at = now()`,
      [template.id, image ? "done" : "pending"],
    );
  }
}
