"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "eyedbot_dashboard_favorites_";

export function useDashboardFavorites(userId?: string) {
  const key = userId ? `${STORAGE_PREFIX}${userId}` : null;
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    if (!key) {
      setFavorites([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(key);
      setFavorites(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setFavorites([]);
    }
  }, [key]);

  const toggleFavorite = useCallback(
    (guildId: string) => {
      if (!key) return;
      setFavorites((current) => {
        const next = current.includes(guildId)
          ? current.filter((id) => id !== guildId)
          : [...current, guildId];
        window.localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key]
  );

  return { favorites, toggleFavorite };
}
