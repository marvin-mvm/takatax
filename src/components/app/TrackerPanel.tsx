/**
 * The tax tracker: one chart (line, bar or pie) and one table under it, both following the same
 * filters (year, months, tax type). Every table row links to the document it was read from.
 */

import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronDown,
  FileText,
  LineChart as LineIcon,
  PieChart as PieIcon,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { monthShortName, formatIsoDate } from "@shared/domain/dates.ts";
import {
  EXPENSE_CATEGORY_LABEL,
  type LedgerRecord,
  RECORD_KIND_LABEL,
} from "@shared/domain/records.ts";
import { TAX_TYPES, type TaxProfile, taxTypesFor } from "@shared/domain/tax-profile.ts";
import { peso } from "@/lib/money";
import {
  type ChartKind,
  type TaxFilter,
  type TrackerFilters,
  monthlySeries,
  pieSlices,
  tableRows,
  totalsOf,
} from "@/lib/tracker/tracker";
import { cn } from "@/lib/utils";

// Colour-blind-checked set (blue, amber, red); amber is backed by labels, legend and the table.
const COLORS = { earned: "#2a78d6", spent: "#eda100", tax: "#d03b3b", kept: "#2a78d6" } as const;
const SERIES = [
  { key: "earned", label: "Earned", color: COLORS.earned },
  { key: "spent", label: "Spent", color: COLORS.spent },
  { key: "tax", label: "Tax", color: COLORS.tax },
] as const;
const PIE_COLORS = { spent: COLORS.spent, tax: COLORS.tax, kept: COLORS.kept } as const;
const INK = { grid: "#e3e9e6", muted: "#5b6b64" };

const subscribe = () => () => {};
/** Charts measure their container, so they render in the browser only. */
const useIsClient = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

const compact = (value: number) =>
  Math.abs(value) >= 1_000_000
    ? `₱${(value / 1_000_000).toFixed(1)}M`
    : Math.abs(value) >= 1_000
      ? `₱${Math.round(value / 1_000)}K`
      : `₱${Math.round(value)}`;

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 rounded-[12px] bg-tk-surface-2 p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-[9px] px-3 text-sm font-medium transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-brand",
            option.value === value
              ? "bg-tk-surface text-tk-ink shadow-sm"
              : "text-tk-muted hover:text-tk-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <span className="text-tk-muted">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-h-9 appearance-none rounded-[9px] border border-tk-line bg-tk-surface py-1 pr-8 pl-3 text-tk-ink focus-visible:outline-2 focus-visible:outline-tk-brand"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-tk-muted"
        />
      </span>
    </label>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded-[14px] border border-tk-line bg-tk-surface p-4">
      <p className="flex items-center gap-2 text-sm text-tk-muted">
        {tone ? (
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ backgroundColor: tone }} />
        ) : null}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-tk-mono text-2xl/8 font-medium tabular-nums",
          value < 0 && "text-tk-danger",
        )}
      >
        {peso(value)}
      </p>
      <p className="text-[13px]/[18px] text-tk-muted">{hint}</p>
    </div>
  );
}

interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: { fill?: string };
}

function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] border border-tk-line bg-tk-surface px-3 py-2 text-[13px]/[18px] shadow-[0_4px_16px_rgb(0_0_0/0.08)]">
      {label !== undefined ? <p className="font-semibold">{label}</p> : null}
      <ul className="mt-1 flex flex-col gap-1">
        {payload.map((entry) => (
          <li key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-0.5 w-3 rounded-full"
              style={{ backgroundColor: entry.color ?? entry.payload?.fill }}
            />
            <span className="font-tk-mono font-medium tabular-nums">
              {peso(Number(entry.value ?? 0))}
            </span>
            <span className="text-tk-muted">{entry.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const axisTick = { fill: INK.muted, fontSize: 12 };

export interface DocumentLink {
  to: "/app/documents/$documentId";
  params: { documentId: string };
  search?: { account?: string };
}

interface TrackerPanelProps {
  profile: TaxProfile;
  records: LedgerRecord[];
  /** Year shown first; usually the current year. */
  defaultYear: number;
  /** The latest month with data in `defaultYear` (the current month). */
  defaultToMonth: number;
  /** Where a row's "View" link goes. */
  documentLink: (documentId: string) => DocumentLink;
}

export function TrackerPanel({
  profile,
  records,
  defaultYear,
  defaultToMonth,
  documentLink,
}: TrackerPanelProps) {
  const isClient = useIsClient();
  const [filters, setFilters] = useState<TrackerFilters>({
    year: defaultYear,
    fromMonth: 1,
    toMonth: defaultToMonth,
    taxType: "all",
  });
  const [chart, setChart] = useState<ChartKind>("bar");
  const [visibleRows, setVisibleRows] = useState(20);

  const years = useMemo(() => {
    const found = new Set(records.map((r) => Number(r.date.slice(0, 4))));
    found.add(defaultYear);
    return [...found].sort((a, b) => b - a);
  }, [records, defaultYear]);

  const series = useMemo(
    () => monthlySeries(records, profile, filters),
    [records, profile, filters],
  );
  const totals = useMemo(() => totalsOf(series), [series]);
  const slices = useMemo(() => pieSlices(totals), [totals]);
  const rows = useMemo(() => tableRows(records, profile, filters), [records, profile, filters]);

  const update = (changes: Partial<TrackerFilters>) => {
    setVisibleRows(20);
    setFilters((current) => {
      const next = { ...current, ...changes };
      if (next.fromMonth > next.toMonth) next.toMonth = next.fromMonth;
      return next;
    });
  };

  const lastMonth = filters.year === defaultYear ? defaultToMonth : 12;
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: monthShortName(i + 1),
  }));
  const taxOptions: { value: TaxFilter; label: string }[] = [
    { value: "all", label: "All taxes" },
    ...taxTypesFor(profile).map((id) => ({ value: id as TaxFilter, label: TAX_TYPES[id].label })),
  ];
  const quarters = [1, 2, 3, 4].filter((q) => q * 3 - 2 <= lastMonth);
  const periodLabel =
    filters.fromMonth === filters.toMonth
      ? `${monthShortName(filters.fromMonth)} ${filters.year}`
      : `${monthShortName(filters.fromMonth)} to ${monthShortName(filters.toMonth)} ${filters.year}`;
  const taxLabel =
    filters.taxType === "all" ? "all taxes" : TAX_TYPES[filters.taxType].label.toLowerCase();

  return (
    <section aria-labelledby="tracker-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="tracker-title" className="text-xl font-semibold">
          Your tracker
        </h2>
        <p className="text-tk-muted">
          {periodLabel}, {taxLabel}. Tax is estimated from the documents read so far.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-[16px] border border-tk-line bg-tk-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <SelectField
            label="Year"
            value={filters.year}
            options={years.map((year) => ({ value: year, label: String(year) }))}
            onChange={(year) =>
              update({ year, fromMonth: 1, toMonth: year === defaultYear ? defaultToMonth : 12 })
            }
          />
          <SelectField
            label="From"
            value={filters.fromMonth}
            options={monthOptions.slice(0, lastMonth)}
            onChange={(fromMonth) => update({ fromMonth })}
          />
          <SelectField
            label="To"
            value={filters.toMonth}
            options={monthOptions.slice(0, lastMonth)}
            onChange={(toMonth) => update({ toMonth })}
          />
          <div className="flex flex-wrap gap-1" aria-label="Quick periods">
            <button
              type="button"
              onClick={() => update({ fromMonth: 1, toMonth: lastMonth })}
              className="min-h-9 rounded-[9px] px-2.5 text-sm font-medium text-tk-brand hover:bg-tk-brand-soft"
            >
              Whole year
            </button>
            {quarters.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() =>
                  update({ fromMonth: q * 3 - 2, toMonth: Math.min(q * 3, lastMonth) })
                }
                className="min-h-9 rounded-[9px] px-2.5 text-sm font-medium text-tk-brand hover:bg-tk-brand-soft"
              >
                Q{q}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Tax type"
            value={filters.taxType}
            options={taxOptions}
            onChange={(taxType) => update({ taxType })}
          />
          <Segmented
            label="Chart type"
            value={chart}
            onChange={setChart}
            options={[
              {
                value: "line",
                label: (
                  <>
                    <LineIcon aria-hidden className="size-4" /> Line
                  </>
                ),
              },
              {
                value: "bar",
                label: (
                  <>
                    <BarChart3 aria-hidden className="size-4" /> Bar
                  </>
                ),
              },
              {
                value: "pie",
                label: (
                  <>
                    <PieIcon aria-hidden className="size-4" /> Pie
                  </>
                ),
              },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Earned" value={totals.earned} hint="Sales collected" tone={COLORS.earned} />
        <Kpi label="Spent" value={totals.spent} hint="Expenses paid" tone={COLORS.spent} />
        <Kpi
          label="Tax"
          value={totals.tax}
          hint="Estimated, before 2307 credits"
          tone={COLORS.tax}
        />
        <Kpi label="Kept" value={totals.kept} hint="Earned less spent and tax" />
      </div>

      <figure className="rounded-[16px] border border-tk-line bg-tk-surface p-4 sm:p-5">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-semibold">
            {chart === "pie" ? "Where your sales went" : "Earned, spent and tax by month"}
          </span>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-tk-muted">
            {(chart === "pie"
              ? slices.map((slice) => ({
                  key: slice.key,
                  label: `${slice.label} ${totals.earned > 0 ? Math.round((slice.value / totals.earned) * 100) : 0}%`,
                  color: PIE_COLORS[slice.key],
                }))
              : SERIES.map((s) => ({ key: s.key, label: s.label, color: s.color }))
            ).map((item) => (
              <li key={item.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5",
                    chart === "line" ? "h-0.5 w-3 rounded-full" : "rounded-[3px]",
                  )}
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </li>
            ))}
          </ul>
        </figcaption>
        <div
          role="img"
          aria-label={`${periodLabel}: earned ${peso(totals.earned)}, spent ${peso(totals.spent)}, tax ${peso(totals.tax)}. Every figure is also in the table below.`}
          className="mt-4 h-[280px]"
        >
          {!isClient ? null : chart === "pie" ? (
            slices.length === 0 ? (
              <p className="flex h-full items-center justify-center text-tk-muted">
                No sales in this period yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<ChartTooltip />} />
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={1}
                    stroke="#ffffff"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {slices.map((slice) => (
                      <Cell key={slice.key} fill={PIE_COLORS[slice.key]} />
                    ))}
                  </Pie>
                  <text
                    x="50%"
                    y="47%"
                    textAnchor="middle"
                    className="fill-tk-ink font-tk-mono text-[18px] font-medium"
                  >
                    {peso(totals.earned)}
                  </text>
                  <text x="50%" y="56%" textAnchor="middle" className="fill-tk-muted text-[12px]">
                    earned
                  </text>
                </PieChart>
              </ResponsiveContainer>
            )
          ) : chart === "line" ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
                <YAxis
                  tickFormatter={compact}
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  width={56}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: INK.grid }} />
                {SERIES.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, stroke: "#ffffff", fill: s.color }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={series}
                barGap={2}
                barCategoryGap="22%"
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
                <YAxis
                  tickFormatter={compact}
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  width={56}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(20 32 27 / 0.05)" }} />
                {SERIES.map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={s.color}
                    maxBarSize={22}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </figure>

      <div className="rounded-[16px] border border-tk-line bg-tk-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 sm:px-5">
          <h3 className="font-semibold">Records</h3>
          <p className="text-sm text-tk-muted">
            {rows.length} row{rows.length === 1 ? "" : "s"} · each links to its document
          </p>
        </div>
        <div className="mt-3 relative overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm/5">
            <thead>
              <tr className="border-y border-tk-line bg-tk-bg text-[13px] text-tk-muted">
                <th className="px-4 py-2 font-medium sm:pl-5">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Details</th>
                <th className="px-3 py-2 font-medium">Tax type</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-right font-medium">Withheld</th>
                <th className="px-4 py-2 font-medium sm:pr-5">
                  <span className="sr-only">Document</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visibleRows).map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-tk-line last:border-b-0 hover:bg-tk-bg/60"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap sm:pl-5">
                    {formatIsoDate(row.date)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium",
                        row.kind === "sale" && "bg-[#2a78d6]/10 text-[#1c5cab]",
                        row.kind === "expense" && "bg-tk-warn-soft text-tk-warn",
                        row.kind === "withholding" && "bg-tk-brand-soft text-tk-brand",
                      )}
                    >
                      {RECORD_KIND_LABEL[row.kind]}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5" title={row.counterparty}>
                    {row.counterparty}
                  </td>
                  <td
                    className="max-w-[220px] truncate px-3 py-2.5 text-tk-muted"
                    title={row.description}
                  >
                    {row.category ? EXPENSE_CATEGORY_LABEL[row.category] : row.description}
                  </td>
                  <td className="px-3 py-2.5 text-tk-muted">
                    {row.taxTypes.length
                      ? row.taxTypes.map((t) => TAX_TYPES[t].label).join(", ")
                      : "None"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-tk-mono tabular-nums">
                    {peso(row.amount, true)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-tk-mono text-tk-muted tabular-nums">
                    {row.taxWithheld ? peso(row.taxWithheld, true) : "—"}
                  </td>
                  <td className="px-4 py-2.5 sm:pr-5">
                    {row.documentId ? (
                      <Link
                        {...documentLink(row.documentId)}
                        className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-tk-brand hover:underline"
                      >
                        <FileText aria-hidden className="size-4" />
                        View
                      </Link>
                    ) : (
                      <span className="text-tk-muted">Typed in</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-tk-muted">
                    No records for this period and tax type.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {rows.length > visibleRows ? (
          <div className="border-t border-tk-line p-3 text-center">
            <button
              type="button"
              onClick={() => setVisibleRows((n) => n + 40)}
              className="min-h-10 rounded-[10px] px-4 font-semibold text-tk-brand hover:bg-tk-brand-soft"
            >
              Show more ({rows.length - visibleRows} left)
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
