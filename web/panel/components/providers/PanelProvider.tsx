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
import { usePathname } from "next/navigation";
import { ApiRequestError } from "@/lib/api/client";
import * as api from "@/lib/api/endpoints";
import { isPublicPanelRoute } from "@/lib/public-routes";
import { isPremiumFeatureLocked } from "@/lib/premium";
import type { BillingStatus, PanelBootstrap } from "@/lib/types";

type PanelContextValue = {
  bootstrap: PanelBootstrap | null;
  billing: BillingStatus | null;
  loading: boolean;
  error: string | null;
  refresh: (forceGuilds?: boolean) => Promise<void>;
  hasPremium: boolean;
  premiumRequired: boolean;
  premiumLocked: boolean;
};

const PanelContext = createContext<PanelContextValue | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = isPublicPanelRoute(pathname);
  const [bootstrap, setBootstrap] = useState<PanelBootstrap | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(!isPublicRoute);
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
      if (err instanceof ApiRequestError && err.status === 401 && !isPublicPanelRoute(pathname)) {
        window.location.href = "/login";
      }
    } finally {
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => {
    let active = true;
    const publicRoute = isPublicPanelRoute(pathname);

    void Promise.all([api.getPanelBootstrap(false), api.getBillingStatus().catch(() => null)])
      .then(([boot, bill]) => {
        if (!active) return;
        setBootstrap(boot);
        setBilling(bill);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiRequestError && err.status === 401) {
          if (!publicRoute) {
            window.location.href = "/login";
          }
          return;
        }
        const message = err instanceof ApiRequestError ? err.message : "No se pudo cargar el panel";
        setError(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  const value = useMemo<PanelContextValue>(() => {
    const hasPremium = Boolean(billing?.active || bootstrap?.hasPremium || bootstrap?.isOwner);
    const premiumRequired = Boolean(bootstrap?.premiumRequired);
    return {
      bootstrap,
      billing,
      loading,
      error,
      refresh,
      hasPremium,
      premiumRequired,
      premiumLocked: isPremiumFeatureLocked(premiumRequired, hasPremium),
    };
  }, [bootstrap, billing, loading, error, refresh]);

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanel debe usarse dentro de PanelProvider");
  return ctx;
}
