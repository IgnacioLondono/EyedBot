"use client";

import { useId, useMemo } from "react";
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

type Point = { x: number; y: number };

function buildSmoothPath(points: Point[]): string {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return path;
}

function buildAreaPath(points: Point[], baseline: number): string {
  if (!points.length) return "";
  const line = buildSmoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x},${baseline} L ${first.x},${baseline} Z`;
}

export function LineChart({ labels, series, height = 240, className }: LineChartProps) {
  const chartId = useId().replace(/:/g, "");
  const width = 720;
  const padding = { top: 20, right: 16, bottom: 32, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const baseline = padding.top + innerH;

  const maxValue = useMemo(() => {
    const peak = Math.max(1, ...series.flatMap((s) => s.values));
    return peak;
  }, [series]);

  const yTicks = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, index) => {
      const ratio = index / steps;
      return {
        ratio,
        value: Math.round(maxValue * ratio),
        y: padding.top + innerH * (1 - ratio),
      };
    });
  }, [innerH, maxValue, padding.top]);

  const pointsFor = (values: number[]): Point[] =>
    values.map((value, index) => {
      const x =
        padding.left + (values.length <= 1 ? innerW / 2 : (index / (values.length - 1)) * innerW);
      const y = padding.top + innerH - (value / maxValue) * innerH;
      return { x, y };
    });

  return (
    <div className={cn("panel-line-chart w-full overflow-x-auto", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[300px] w-full" role="img" aria-hidden>
        <defs>
          {series.map((entry) => (
            <linearGradient
              key={`${entry.key}-fill`}
              id={`${chartId}-fill-${entry.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={entry.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={entry.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {yTicks.map((tick) => (
          <g key={tick.ratio}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              className="panel-line-chart-grid"
            />
            <text x={8} y={tick.y + 4} className="panel-line-chart-axis">
              {tick.value}
            </text>
          </g>
        ))}

        {series.map((entry) => {
          const points = pointsFor(entry.values);
          const area = buildAreaPath(points, baseline);
          const line = buildSmoothPath(points);
          return (
            <g key={entry.key}>
              {area ? <path d={area} fill={`url(#${chartId}-fill-${entry.key})`} /> : null}
              <path
                d={line}
                fill="none"
                stroke={entry.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="panel-line-chart-line"
              />
              {points.map((point, index) => (
                <circle
                  key={`${entry.key}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r="2.75"
                  fill="var(--color-surface-strong, #12101c)"
                  stroke={entry.color}
                  strokeWidth="2"
                />
              ))}
            </g>
          );
        })}

        {labels.map((label, index) => {
          const x =
            padding.left + (labels.length <= 1 ? innerW / 2 : (index / (labels.length - 1)) * innerW);
          return (
            <text key={`${label}-${index}`} x={x} y={height - 8} textAnchor="middle" className="panel-line-chart-axis">
              {label}
            </text>
          );
        })}
      </svg>

      <div className="panel-line-chart-legend mt-4 flex flex-wrap gap-2">
        {series.map((entry) => (
          <span key={entry.key} className="panel-line-chart-legend-item">
            <span className="panel-line-chart-legend-dot" style={{ backgroundColor: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}
