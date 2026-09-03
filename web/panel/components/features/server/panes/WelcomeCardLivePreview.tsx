"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import { previewWelcomeCardBlob } from "@/lib/api/endpoints";
import {
  WELCOME_CARD_HEIGHT,
  WELCOME_CARD_WIDTH,
  buildWelcomeCardPreviewBody,
  type WelcomeCardLayout,
  type WelcomeCardPreviewInput,
} from "@/lib/welcome-card";
import { welcomeCardStudioHref } from "@/lib/navigation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn, getErrorMessage } from "@/lib/utils";

export function WelcomeCardLivePreview({
  guildId,
  config,
}: {
  guildId: string;
  config: WelcomeCardPreviewInput;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlRef = useRef("");

  const body = useMemo(
    () =>
      buildWelcomeCardPreviewBody({
        ...config,
        omitText: false,
        omitBackground: false,
      }),
    [config]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await previewWelcomeCardBlob(guildId, body);
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [guildId, body]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 800);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
        <div
          className="relative w-full bg-[color-mix(in_srgb,var(--foreground)_4%,var(--color-bg))]"
          style={{ aspectRatio: `${WELCOME_CARD_WIDTH} / ${WELCOME_CARD_HEIGHT}` }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Vista previa de la tarjeta" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center">
              {loading ? <Spinner className="h-7 w-7" /> : <span className="text-sm text-[var(--theme-text-secondary)]">Generando…</span>}
            </div>
          )}

          {loading && previewUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <Spinner className="h-6 w-6" />
            </div>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link href={welcomeCardStudioHref(guildId)}>
          <Button variant="secondary" size="sm">
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            Editar en Card Studio
          </Button>
        </Link>
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      <p className="text-xs text-[var(--theme-text-secondary)]">
        Vista previa real ({WELCOME_CARD_WIDTH}×{WELCOME_CARD_HEIGHT}px) · igual a lo enviado a Discord.
      </p>
    </div>
  );
}

export type { WelcomeCardLayout };
