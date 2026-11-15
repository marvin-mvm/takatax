import { useSyncExternalStore, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPesos, formatPesosCompact } from "@/lib/deck/format";
import type { YearResult } from "@/lib/deck/model";

import { CHART_INK, SERIES_COLORS, STREAM_COLORS } from "./chart-palette";

const CHART_HEIGHT = 240;

const subscribe = () => () => {};

/** Charts measure their container, so they render in the browser only. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

interface Series {
  key: string;
  name: string;
  color: string;
}

const MONEY_SERIES: Series[] = [
  { key: "revenue", name: "Revenue", color: SERIES_COLORS.revenue },
  { key: "costs", name: "Costs and taxes", color: SERIES_COLORS.costs },
  { key: "profit", name: "Net profit", color: SERIES_COLORS.profit },
];

const STREAM_SERIES: Series[] = [
  { key: "parser", name: "Parser", color: STREAM_COLORS.parser },
  { key: "storage", name: "Cloud storage", color: STREAM_COLORS.storage },
  { key: "ads", name: "Ads", color: STREAM_COLORS.ads },
  { key: "subscriptions", name: "Newsletter and API", color: STREAM_COLORS.subscriptions },
];

function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]/[18px] text-tk-muted">
      {series.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: item.color }}
          />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  /** Adds a total row under the series, for stacked charts. */
  showTotal?: boolean;
}

function ChartTooltip({ active, label, payload, showTotal = false }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0);

  return (
    <div className="rounded-[10px] border border-tk-line bg-tk-surface px-3 py-2 text-[13px]/[18px] shadow-[0_4px_16px_rgb(0_0_0/0.08)]">
      <p className="font-semibold text-tk-ink">{label}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-0.5 w-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-tk-mono font-medium tabular-nums text-tk-ink">
              {formatPesos(Number(entry.value ?? 0))}
            </span>
            <span className="text-tk-muted">{entry.name}</span>
          </li>
        ))}
        {showTotal ? (
          <li className="mt-0.5 flex items-center gap-2 border-t border-tk-line pt-1">
            <span aria-hidden className="w-3" />
            <span className="font-tk-mono font-medium tabular-nums text-tk-ink">
              {formatPesos(total)}
            </span>
            <span className="text-tk-muted">Total</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ChartFrame({
  title,
  series,
  summary,
  children,
}: {
  title: string;
  series: Series[];
  /** Read by screen readers in place of the drawing; the table below holds every value. */
  summary: string;
  children: ReactNode;
}) {
  const isClient = useIsClient();

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-semibold">{title}</span>
        <Legend series={series} />
      </figcaption>
      <div role="img" aria-label={summary} className="mt-3" style={{ height: CHART_HEIGHT }}>
        {isClient ? children : null}
      </div>
    </figure>
  );
}

const axisTick = { fill: CHART_INK.muted, fontSize: 12 };

/**
 * Recharts copies a cell's props onto its bar rectangle, including a corner radius per
 * corner, but its Cell type only allows a single number. Hence the widened type.
 */
function cellRadius(rounded: boolean): Record<string, unknown> {
  return { radius: rounded ? [4, 4, 0, 0] : 0 };
}

export function MoneyChart({ years }: { years: YearResult[] }) {
  const data = years.map((year) => ({
    label: `Year ${year.year}`,
    revenue: year.revenue.total,
    costs: year.revenue.total - year.netProfit,
    profit: year.netProfit,
  }));
  const summary = years
    .map(
      (year) =>
        `Year ${year.year}: revenue ${formatPesosCompact(year.revenue.total)}, net profit ${formatPesosCompact(year.netProfit)}`,
    )
    .join("; ");

  return (
    <ChartFrame title="Revenue, costs and net profit" series={MONEY_SERIES} summary={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="24%" margin={{ top: 8, right: 4 }}>
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis
            tickFormatter={formatPesosCompact}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            width={56}
          />
          <ReferenceLine y={0} stroke={CHART_INK.baseline} />
          <Tooltip cursor={{ fill: "rgb(20 32 27 / 0.05)" }} content={<ChartTooltip />} />
          {MONEY_SERIES.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.name}
              fill={series.color}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function StreamsChart({ years }: { years: YearResult[] }) {
  const data = years.map((year) => ({
    label: `Year ${year.year}`,
    parser: year.revenue.parser,
    storage: year.revenue.storage,
    ads: year.revenue.ads,
    subscriptions: year.revenue.subscriptions,
  }));
  const summary = years
    .map(
      (year) =>
        `Year ${year.year}: parser ${formatPesosCompact(year.revenue.parser)} of ${formatPesosCompact(year.revenue.total)}`,
    )
    .join("; ");

  // Only the top segment of each stack gets rounded corners.
  const isTopSegment = (row: (typeof data)[number], index: number) =>
    STREAM_SERIES.slice(index + 1).every(
      (series) => row[series.key as keyof typeof STREAM_COLORS] <= 0,
    );

  return (
    <ChartFrame title="Revenue by stream" series={STREAM_SERIES} summary={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="24%" margin={{ top: 8, right: 4 }}>
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis
            tickFormatter={formatPesosCompact}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            width={56}
          />
          <ReferenceLine y={0} stroke={CHART_INK.baseline} />
          <Tooltip cursor={{ fill: "rgb(20 32 27 / 0.05)" }} content={<ChartTooltip showTotal />} />
          {STREAM_SERIES.map((series, index) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.name}
              stackId="revenue"
              fill={series.color}
              stroke={CHART_INK.surface}
              strokeWidth={2}
              maxBarSize={24}
              isAnimationActive={false}
            >
              {data.map((row) => (
                <Cell key={row.label} {...cellRadius(isTopSegment(row, index))} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
