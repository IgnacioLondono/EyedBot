"use client";

import type { EmbedFormState } from "@/lib/embed-utils";
import { normalizeHexColor } from "@/lib/embed-utils";

export function EmbedPreview({ form }: { form: EmbedFormState }) {
  const color = normalizeHexColor(form.color);
  const fields = form.fields.filter((field) => field.name.trim() || field.value.trim());

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#2f3136]">
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="p-4">
        {form.authorName ? (
          <div className="mb-2 flex items-center gap-2 text-xs text-[#dcddde]">
            {form.authorIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.authorIconUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : null}
            <span className="font-medium">{form.authorName}</span>
          </div>
        ) : null}
        {form.title ? <p className="font-semibold text-white">{form.title}</p> : null}
        {form.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#dcddde]">{form.description}</p>
        ) : null}
        {fields.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {fields.map((field, index) => (
              <div key={`${field.name}-${index}`} className={field.inline ? "" : "sm:col-span-2"}>
                <p className="text-xs font-semibold text-white">{field.name || "Campo"}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#dcddde]">{field.value || "—"}</p>
              </div>
            ))}
          </div>
        ) : null}
        {form.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.thumbnailUrl} alt="" className="mt-3 max-h-20 rounded object-cover" />
        ) : null}
        {form.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.imageUrl} alt="" className="mt-3 max-h-40 w-full rounded object-cover" />
        ) : null}
        {form.footer || form.timestamp ? (
          <p className="mt-4 text-xs text-[#949ba4]">
            {form.footer}
            {form.footer && form.timestamp ? " · " : ""}
            {form.timestamp ? "marca de tiempo" : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
