"use client";

import type { ReactNode } from "react";
import type { EmbedFormState } from "@/lib/embed-utils";
import { normalizeHexColor } from "@/lib/embed-utils";

export type DiscordEmbedPreviewProps = {
  title?: string;
  description?: string;
  color?: string;
  footer?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  thumbnailLabel?: string;
  authorName?: string;
  authorIconUrl?: string;
  timestamp?: boolean;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  children?: ReactNode;
};

function resolveMediaUrl(value?: string) {
  const trimmed = String(value || "").trim();
  return trimmed || "";
}

export function DiscordEmbedPreview({
  title,
  description,
  color = "#8b5cf6",
  footer,
  imageUrl,
  thumbnailUrl,
  thumbnailLabel,
  authorName,
  authorIconUrl,
  timestamp,
  fields = [],
  children,
}: DiscordEmbedPreviewProps) {
  const accent = normalizeHexColor(color);
  const imageSrc = resolveMediaUrl(imageUrl);
  const thumbnailSrc = resolveMediaUrl(thumbnailUrl);
  const visibleFields = fields.filter((field) => field.name.trim() || field.value.trim());

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#2f3136]">
      <div className="h-1" style={{ backgroundColor: accent }} />
      <div className="p-4">
        {authorName ? (
          <div className="mb-2 flex items-center gap-2 text-xs text-[#dcddde]">
            {resolveMediaUrl(authorIconUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveMediaUrl(authorIconUrl)} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : null}
            <span className="font-medium">{authorName}</span>
          </div>
        ) : null}

        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            {title ? <p className="font-semibold text-white">{title}</p> : null}
            {description ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#dcddde]">{description}</p>
            ) : null}
            {visibleFields.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {visibleFields.map((field, index) => (
                  <div key={`${field.name}-${index}`} className={field.inline ? "" : "sm:col-span-2"}>
                    <p className="text-xs font-semibold text-white">{field.name || "Campo"}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[#dcddde]">{field.value || "—"}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {thumbnailSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailSrc} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />
          ) : thumbnailLabel ? (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-[#1e1f22] px-2 text-center text-[10px] leading-tight text-[#949ba4]">
              {thumbnailLabel}
            </div>
          ) : null}
        </div>

        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt="" className="mt-3 max-h-52 w-full rounded object-cover" />
        ) : null}

        {children}

        {footer || timestamp ? (
          <p className="mt-4 text-xs text-[#949ba4]">
            {footer}
            {footer && timestamp ? " · " : ""}
            {timestamp ? "marca de tiempo" : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function EmbedPreview({
  form,
  imageOverride,
  thumbnailOverride,
}: {
  form: EmbedFormState;
  imageOverride?: string;
  thumbnailOverride?: string;
}) {
  return (
    <DiscordEmbedPreview
      title={form.title}
      description={form.description}
      color={form.color}
      footer={form.footer}
      imageUrl={imageOverride || form.imageUrl}
      thumbnailUrl={thumbnailOverride || form.thumbnailUrl}
      authorName={form.authorName}
      authorIconUrl={form.authorIconUrl}
      timestamp={form.timestamp}
      fields={form.fields.map((field) => ({
        name: field.name,
        value: field.value,
        inline: field.inline,
      }))}
    />
  );
}
