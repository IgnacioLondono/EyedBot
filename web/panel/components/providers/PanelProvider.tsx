"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiRequestError } from "@/lib/api/client";
import * as api from "@/lib/api/endpoints";
import type { BillingStatus, PanelBootstrap } from "@/lib/types";

type PanelContextValue = {
  bootstrap: PanelBootstrap | null;
  billing: BillingStatus | null;
  loading: boolean;
  error: string | null;
  refresh: (forceGuilds?: boolean) => Promise<void>;
  hasPremium: boolean;
};

const PanelContext = createContext<PanelContextValue | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<PanelBootstrap | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (forceGuilds = false) => {
    setLoading(true);
    setError(null);
    try {
      const [boot, bill] = await Promise.all([
        api.getPanelBootstrap(forceGuilds),
        api.getBillingStatus().catch(() => null),
      ]);
      setBootstrap(boot);
      setBilling(bill);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : "No se pudo cargar el panel";
      setError(message);
      if (err instanceof ApiRequestError && err.status === 401) {
        window.location.href = "/login";
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([api.getPanelBootstrap(false), api.getBillingStatus().catch(() => null)])
      .then(([boot, bill]) => {
        if (!active) return;
        setBootstrap(boot);
        setBilling(bill);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof ApiRequestError ? err.message : "No se pudo cargar el panel";
        setError(message);
        if (err instanceof ApiRequestError && err.status === 401) {
          window.location.href = "/login";
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refresh]);

  const value = useMemo<PanelContextValue>(
    () => ({
      bootstrap,
      billing,
      loading,
      error,
      refresh,
      hasPremium: Boolean(billing?.active || bootstrap?.hasPremium || bootstrap?.isOwner),
    }),
    [bootstrap, billing, loading, error, refresh]
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanel debe usarse dentro de PanelProvider");
  return ctx;
}
