"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/features/shared";
import { resolvePanelMediaUrl } from "@/lib/panel-media";

export function resolveEmbedImageSrc(value?: string, filePreview?: string) {
  return resolvePanelMediaUrl(value, filePreview);
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
  const fieldId = useId();
  const [localPreview, setLocalPreview] = useState("");
  const [inputNonce, setInputNonce] = useState(0);
  const previewSrc = resolveEmbedImageSrc(value, filePreview || localPreview);
  const busy = uploading || deleting;

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  // Si el padre actualizó la URL (subida lista), soltar el blob local.
  useEffect(() => {
    if (!localPreview || !value) return;
    URL.revokeObjectURL(localPreview);
    setLocalPreview("");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileChange(file: File | null) {
    if (!file) return;
    if (localPreview) URL.revokeObjectURL(localPreview);
    const blobUrl = URL.createObjectURL(file);
    setLocalPreview(blobUrl);
    if (onUpload) {
      try {
        await onUpload(file);
      } catch {
        URL.revokeObjectURL(blobUrl);
        setLocalPreview("");
      }
      setInputNonce((n) => n + 1);
      return;
    }
    onFileSelect?.(file);
  }

  async function handleDelete() {
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview("");
    }
    if (onDelete) {
      await onDelete();
      return;
    }
    onChange("");
    onFileSelect?.(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Field label={label} description={description} htmlFor={`${fieldId}-upload`}>
      <div className="space-y-3">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://... o sube un archivo"
        />
        <div className="flex flex-wrap gap-2">
          <input
            key={inputNonce}
            ref={inputRef}
            type="file"
            name={`${fieldId}-upload`}
            id={`${fieldId}-upload`}
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
          <img
            key={previewSrc}
            src={previewSrc}
            alt=""
            className="max-h-40 w-full rounded-xl border border-white/10 object-cover"
          />
        ) : null}
      </div>
    </Field>
  );
}
