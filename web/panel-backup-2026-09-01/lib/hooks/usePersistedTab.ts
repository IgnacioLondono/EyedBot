"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Persiste la subpestaña activa en localStorage (sobrevive al recargar).
 * `key` debería incluir contexto (guildId + módulo) para no mezclar servidores.
 */
export function usePersistedTab(
  key: string | null | undefined,
  defaultValue: string,
  allowed?: readonly string[]
) {
  const [value, setValue] = useState(defaultValue);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;

  useEffect(() => {
    if (!key || typeof window === "undefined") {
      setValue(defaultValue);
      return;
    }
    try {
      const saved = window.localStorage.getItem(key);
      if (!saved) {
        setValue(defaultValue);
        return;
      }
      const list = allowedRef.current;
      if (list && !list.includes(saved)) {
        setValue(defaultValue);
        return;
      }
      setValue(saved);
    } catch {
      setValue(defaultValue);
    }
  }, [key, defaultValue]);

  const setTab = useCallback(
    (next: string) => {
      const list = allowedRef.current;
      if (list && !list.includes(next)) return;
      setValue(next);
      if (!key || typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* noop */
      }
    },
    [key]
  );

  return [value, setTab] as const;
}

export function paneTabKey(guildId: string, pane: string, scope = "main") {
  return `eyedbot:pane-tab:${pane}:${guildId}:${scope}`;
}
