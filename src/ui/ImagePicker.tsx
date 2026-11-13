import { useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, Images } from "lucide-react";
import { errorMessage } from "../lib/api.ts";
import { actions } from "../lib/store.ts";
import { toast } from "../lib/toast.ts";
import { Spinner } from "./controls.tsx";
import { Sheet } from "./Sheet.tsx";

export type PhotoKind = "avatar" | "logo" | "cover" | "item";

/** Uploads the chosen file and returns its public URL, or null when nothing was uploaded. */
export async function uploadFromInput(event: ChangeEvent<HTMLInputElement>, kind: PhotoKind) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return null;
  if (!file.type.startsWith("image/")) {
    toast("Escolha uma foto (JPG, PNG ou WebP).", "error");
    return null;
  }
  try {
    return await actions.uploadPhoto(file, kind);
  } catch (error) {
    toast(errorMessage(error), "error");
    return null;
  }
}

export function ImagePicker({
  value,
  onChange,
  library,
  kind,
  aspect = "aspect-[4/3]",
  label = "Foto",
}: {
  value: string;
  onChange: (src: string) => void;
  library: { src: string; label: string }[];
  kind: PhotoKind;
  aspect?: string;
  label?: string;
}) {
  const [gallery, setGallery] = useState(false);
  const [uploading, setUploading] = useState(false);

  return (
    <div>
      <div className={`relative overflow-hidden rounded-[24px] bg-card ${aspect}`}>
        {value ? (
          <img src={value} alt={label} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <ImagePlus className="size-9" strokeWidth={1.6} aria-hidden="true" />
              <span className="type-subhead">Adicione uma foto</span>
            </div>
          </div>
        )}
        {uploading ? (
          <div className="absolute inset-0 grid place-items-center bg-black/30 text-white" role="status" aria-label="Enviando foto">
            <Spinner className="size-8" />
          </div>
        ) : null}
        <div className="absolute inset-x-3 bottom-3 flex gap-2">
          <label className="glass flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full type-subhead font-semibold focus-within:outline-2 focus-within:outline-primary">
            <Camera className="size-[18px]" aria-hidden="true" />
            Enviar foto
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={async (event) => {
                setUploading(true);
                const url = await uploadFromInput(event, kind);
                setUploading(false);
                if (url) onChange(url);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setGallery(true)}
            className="glass flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full type-subhead font-semibold focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Images className="size-[18px]" aria-hidden="true" />
            Galeria
          </button>
        </div>
      </div>
      <Sheet open={gallery} onClose={() => setGallery(false)} title="Galeria Obra Ágil" large>
        <div className="grid grid-cols-2 gap-3">
          {library.map((entry) => {
            const selected = entry.src === value;
            return (
              <button
                key={entry.src}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onChange(entry.src);
                  setGallery(false);
                }}
                className={`overflow-hidden rounded-[20px] bg-card text-left ring-2 transition-transform active:scale-[0.97] ${selected ? "ring-primary" : "ring-transparent"}`}
              >
                <img src={entry.src} alt="" className="aspect-square w-full object-cover" />
                <span className="block truncate px-3 py-2 type-footnote font-semibold">{entry.label}</span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
