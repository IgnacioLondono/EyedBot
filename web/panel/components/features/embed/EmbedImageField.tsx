"use client";

import { useRef } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/features/shared";

export function resolveEmbedImageSrc(value?: string, filePreview?: string) {
  if (filePreview) return filePreview;
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|blob:|data:)/i.test(raw)) return raw;
  if (raw.startsWith("/")) {
    const joiner = raw.includes("?") ? "&" : "?";
    return `${raw}${joiner}t=${Date.now()}`;
  }
  return raw;
}

export function EmbedImageField({
  label,
  description,
  value,
  onChange,
  filePreview,
  onFileSelect,
  onUpload,
  onDelete,
  uploading = false,
  deleting = false,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  filePreview?: string;
  onFileSelect?: (file: File | null) => void;
  onUpload?: (file: File) => Promise<void>;
  onDelete?: () => void | Promise<void>;
  uploading?: boolean;
  deleting?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewSrc = resolveEmbedImageSrc(value, filePreview);
  const busy = uploading || deleting;

  async function handleFileChange(file: File | null) {
    if (!file) return;
    if (onUpload) {
      await onUpload(file);
      return;
    }
    onFileSelect?.(file);
  }

  async function handleDelete() {
    if (onDelete) {
      await onDelete();
      return;
    }
    onChange("");
    onFileSelect?.(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Field label={label} description={description}>
      <div className="space-y-3">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://... o sube un archivo"
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleFileChange(event.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {uploading ? "Subiendo…" : "Subir imagen"}
          </Button>
          {previewSrc || value.trim() || filePreview ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void handleDelete()}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? "Eliminando…" : "Eliminar imagen"}
            </Button>
          ) : null}
        </div>
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="" className="max-h-40 w-full rounded-xl border border-white/10 object-cover" />
        ) : null}
      </div>
    </Field>
  );
}
