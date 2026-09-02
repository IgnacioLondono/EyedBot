"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-modal-title"
        className={`relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[28px] border border-white/12 bg-[#121018] shadow-[0_30px_80px_rgba(0,0,0,.55)] ${
          wide ? "max-w-4xl" : "max-w-2xl"
        }`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="panel-modal-title" className="text-lg font-semibold text-white sm:text-xl">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-zinc-400">{description}</p> : null}
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-white/8 bg-black/25 px-5 py-4 sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
