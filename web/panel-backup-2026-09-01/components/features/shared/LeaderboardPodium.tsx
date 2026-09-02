"use client";

import { Crown, Medal, Trophy } from "lucide-react";
import { toNumberValue, toStringValue } from "@/lib/utils";

export type LeaderboardEntry = {
  userId?: string;
  username?: string;
  tag?: string;
  avatar?: string | null;
  level?: number;
  xp?: number;
  coins?: number;
  bestRarity?: string;
  progressPercent?: number;
  messageCount?: number;
  voiceMinutes?: number;
  totalClaims?: number;
  collectionCount?: number;
};

function displayName(entry: LeaderboardEntry) {
  return toStringValue(entry.username || entry.tag, "Usuario");
}

function Avatar({ entry, size = "md" }: { entry: LeaderboardEntry; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-10 w-10", md: "h-14 w-14", lg: "h-20 w-20" };
  const avatar = entry.avatar;
  if (avatar) {
    return (
      <img
        src={avatar}
        alt=""
        className={`${sizes[size]} rounded-2xl border-2 border-white/15 object-cover shadow-lg`}
      />
    );
  }
  return (
    <div
      className={`${sizes[size]} flex items-center justify-center rounded-2xl border-2 border-white/15 bg-white/10 text-sm font-semibold text-white`}
    >
      {displayName(entry).slice(0, 1).toUpperCase()}
    </div>
  );
}

function PodiumCard({
  entry,
  rank,
  metric,
  metricLabel,
}: {
  entry: LeaderboardEntry;
  rank: 1 | 2 | 3;
  metric: string;
  metricLabel: string;
}) {
  const heights = { 1: "h-36", 2: "h-28", 3: "h-24" };
  const colors = {
    1: "from-amber-400/30 to-amber-600/10 border-amber-300/30",
    2: "from-zinc-300/20 to-zinc-500/10 border-zinc-300/20",
    3: "from-orange-400/20 to-orange-700/10 border-orange-300/20",
  };
  const icons = {
    1: <Crown className="h-5 w-5 text-amber-200" />,
    2: <Medal className="h-5 w-5 text-zinc-200" />,
    3: <Trophy className="h-5 w-5 text-orange-200" />,
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-3">{icons[rank]}</div>
      <Avatar entry={entry} size={rank === 1 ? "lg" : "md"} />
      <p className="mt-3 max-w-[120px] truncate text-center text-sm font-medium text-white">
        {displayName(entry)}
      </p>
      <p className="text-xs text-zinc-400">{metricLabel}</p>
      <p className="mt-1 text-sm font-semibold text-violet-200">{metric}</p>
      <div
        className={`mt-4 w-full rounded-t-2xl border bg-gradient-to-t ${colors[rank]} ${heights[rank]} flex items-end justify-center pb-3`}
      >
        <span className="text-2xl font-bold text-white/80">#{rank}</span>
      </div>
    </div>
  );
}

export function LeaderboardPodium({
  entries,
  mode = "leveling",
}: {
  entries: LeaderboardEntry[];
  mode?: "leveling" | "gacha";
}) {
  const top = entries.slice(0, 3);
  if (top.length < 1) return null;

  const metricFor = (entry: LeaderboardEntry) => {
    if (mode === "gacha") {
      return {
        value: `${toNumberValue(entry.coins).toLocaleString("es-ES")} 🪙`,
        label: `Rareza ${toStringValue(entry.bestRarity, "N")} · ${toNumberValue(entry.totalClaims)} claims`,
      };
    }
    return {
      value: `Nv. ${toNumberValue(entry.level)}`,
      label: `${toNumberValue(entry.xp).toLocaleString("es-ES")} XP`,
    };
  };

  const order = top.length >= 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : [top[0]];
  const ranks: Array<1 | 2 | 3> = top.length >= 3 ? [2, 1, 3] : top.length === 2 ? [2, 1] : [1];

  return (
    <div className="mb-6 grid grid-cols-3 items-end gap-3">
      {order.map((entry, index) => {
        const metric = metricFor(entry);
        return (
          <PodiumCard
            key={toStringValue(entry.userId, `rank-${ranks[index]}`)}
            entry={entry}
            rank={ranks[index]}
            metric={metric.value}
            metricLabel={metric.label}
          />
        );
      })}
    </div>
  );
}

export function LeaderboardRow({
  entry,
  rank,
  mode = "leveling",
}: {
  entry: LeaderboardEntry;
  rank: number;
  mode?: "leveling" | "gacha";
}) {
  const progress = toNumberValue(entry.progressPercent);

  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
      <div className="flex items-center gap-4">
        <span className="w-8 text-sm font-semibold text-zinc-500">#{rank}</span>
        <Avatar entry={entry} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-white">{displayName(entry)}</p>
          <p className="text-xs text-zinc-500">
            {mode === "gacha"
              ? `${toNumberValue(entry.coins).toLocaleString("es-ES")} monedas · ${toNumberValue(entry.collectionCount)} cartas`
              : `${toNumberValue(entry.xp).toLocaleString("es-ES")} XP · ${toNumberValue(entry.messageCount)} msgs · ${toNumberValue(entry.voiceMinutes)} min voz`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-violet-200">
            {mode === "gacha" ? toStringValue(entry.bestRarity, "N") : `Nv. ${toNumberValue(entry.level)}`}
          </p>
        </div>
      </div>
      {progress > 0 ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
          <div className="h-full rounded-full bg-violet-500/80" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}
