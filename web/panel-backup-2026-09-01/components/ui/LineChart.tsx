"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type LineChartSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

type LineChartProps = {
  labels: string[];
  series: LineChartSeries[];
  height?: number;
  className?: string;
};

export function LineChart({ labels, series, height = 220, className }: LineChartProps) {
  const width = 640;
  const padding = { top: 16, right: 12, bottom: 28, left: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxValue = useMemo(() => {
    const peak = Math.max(1, ...series.flatMap((s) => s.values));
    return peak;
  }, [series]);

  const pointsFor = (values: number[]) =>
    values.map((value, index) => {
      const x = padding.left + (values.length <= 1 ? innerW / 2 : (index / (values.length - 1)) * innerW);
      const y = padding.top + innerH - (value / maxValue) * innerH;
      return { x, y };
    });

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[320px] w-full" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + innerH * (1 - ratio);
          const value = Math.round(maxValue * ratio);
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.06)" />
              <text x={4} y={y + 4} fill="rgba(161,161,170,0.9)" fontSize="10">
                {value}
              </text>
            </g>
          );
        })}

        {series.map((entry) => {
          const points = pointsFor(entry.values);
          const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <g key={entry.key}>
              <polyline
                fill="none"
                stroke={entry.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={polyline}
              />
              {points.map((point, index) => (
                <circle key={`${entry.key}-${index}`} cx={point.x} cy={point.y} r="3.5" fill={entry.color} />
              ))}
            </g>
          );
        })}

        {labels.map((label, index) => {
          const x =
            padding.left + (labels.length <= 1 ? innerW / 2 : (index / (labels.length - 1)) * innerW);
          return (
            <text
              key={`${label}-${index}`}
              x={x}
              y={height - 6}
              textAnchor="middle"
              fill="rgba(161,161,170,0.9)"
              fontSize="10"
            >
              {label}
            </text>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
        {series.map((entry) => (
          <span key={entry.key} className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}
