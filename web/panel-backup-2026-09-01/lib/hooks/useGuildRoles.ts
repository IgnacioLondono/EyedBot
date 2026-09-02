"use client";

import { useEffect, useState } from "react";
import { getGuildInfo } from "@/lib/api/endpoints";
import { asArray, asRecord, toStringValue } from "@/lib/utils";

export type GuildRoleOption = {
  id: string;
  name: string;
  color?: string;
};

export function useGuildRoles(guildId: string) {
  const [roles, setRoles] = useState<GuildRoleOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getGuildInfo(guildId)
      .then((payload) => {
        if (!active) return;
        const info = asRecord(payload);
        const mapped = asArray(info.roles).map((entry, index) => {
          const role = asRecord(entry);
          return {
            id: toStringValue(role.id, `role-${index}`),
            name: toStringValue(role.name, "Rol"),
            color: toStringValue(role.color, ""),
          };
        });
        setRoles(mapped.filter((role) => role.id && role.name !== "@everyone"));
      })
      .catch(() => {
        if (active) setRoles([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [guildId]);

  return { roles, loading };
}
