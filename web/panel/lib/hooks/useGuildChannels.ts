"use client";

import { useEffect, useState } from "react";
import { getGuildChannels } from "@/lib/api/endpoints";
import { asArray, asRecord, getErrorMessage, toStringValue } from "@/lib/utils";

export type GuildChannelOption = {
  id: string;
  name: string;
  type: string;
  parentId?: string | null;
  isPrivate?: boolean;
  botCanAccess?: boolean;
};

export function useGuildChannels(guildId: string) {
  const [channels, setChannels] = useState<GuildChannelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void getGuildChannels(guildId)
      .then((payload) => {
        if (!alive) return;
        const mapped = asArray(payload).map((channel) => {
          const item = asRecord(channel);
          return {
            id: toStringValue(item.id),
            name: toStringValue(item.name, "Canal"),
            type: toStringValue(item.type, "unknown"),
            parentId: toStringValue(item.parentId) || null,
            isPrivate: item.isPrivate === true,
            botCanAccess: item.botCanAccess !== false,
          };
        });
        setChannels(mapped.filter((item) => item.id));
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(getErrorMessage(err));
        setChannels([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [guildId]);

  return { channels, loading, error };
}
