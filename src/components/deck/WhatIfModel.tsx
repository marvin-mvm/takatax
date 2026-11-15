import * as AccordionPrimitive from "@radix-ui/react-accordion";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";

import { Switch } from "@/components/ui/switch";
import { formatNumber, formatPercent, formatPesos, formatPesosCompact } from "@/lib/deck/format";
import {
  DEFAULT_INPUTS,
  MICRO_ENTERPRISES,
  runModel,
  type ModelInputs,
  type ReaderMode,
} from "@/lib/deck/model";
import { cn } from "@/lib/utils";

import { MoneyChart, StreamsChart } from "./charts";
import { Cite } from "./primitives";

interface SliderRowProps {
  label: string;
  /** The current value as the reader should see it, for example "₱199". */
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function SliderRow({ label, display, value, min, max, step, onChange }: SliderRowProps) {
  const labelId = useId();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-sm/5 text-tk-ink">
          {label}
        </span>
        <output className="font-tk-mono text-sm/5 font-medium whitespace-nowrap tabular-nums">
          {display}
        </output>
      </div>
      <SliderPrimitive.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
        className="relative flex h-8 w-full touch-none items-center select-none"
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-tk-surface-2">
          <SliderPrimitive.Range className="absolute h-full bg-tk-brand" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-labelledby={labelId}
          aria-valuetext={display}
          className="block size-5 rounded-full border-2 border-tk-brand bg-tk-surface shadow-sm transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-brand"
        />
      </SliderPrimitive.Root>
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div>
      <span className="text-sm/5 text-tk-ink">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-2 grid auto-cols-fr grid-flow-col gap-1 rounded-[10px] bg-tk-surface-2 p-1"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "min-h-9 rounded-[7px] px-2 text-[13px]/[18px] font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-brand",
                selected
                  ? "bg-tk-surface text-tk-ink shadow-sm"
                  : "text-tk-muted hover:text-tk-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-sm/5">
        <span className="block text-tk-ink">{label}</span>
        <span className="block text-[13px]/[18px] text-tk-muted">{hint}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ControlGroup({
  value,
  title,
  summary,
  children,
}: {
  value: string;
  title: string;
  /** The group's current settings, shown while it is closed. */
  summary: string;
  children: ReactNode;
}) {
  return (
    <AccordionPrimitive.Item value={value} className="border-t border-tk-line first:border-t-0">
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between gap-3 rounded-[6px] py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-brand">
          <span>
            <span className="block text-[13px] font-semibold uppercase tracking-[0.08em]">
              {title}
            </span>
            <span className="block text-[13px]/[18px] text-tk-muted group-data-[state=open]:hidden">
              {summary}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-tk-muted transition-transform group-data-[state=open]:rotate-180"
          />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="flex flex-col gap-3 pb-4">
        {children}
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}

const READER_OPTIONS: { value: ReaderMode; label: string }[] = [
  { value: "flash", label: "Flash only" },
  { value: "pipeline", label: "Three-step" },
  { value: "pro", label: "Pro only" },
];

const READER_SUMMARY: Record<ReaderMode, string> = {
  flash: "Flash reads everything",
  pipeline: "Flash, then Haiku, then Pro",
  pro: "Pro reads everything",
};

const YEAR_OPTIONS = [3, 4, 5].map((years) => ({ value: years, label: `${years} years` }));

function Kpi({
  label,
  value,
  detail,
  negative = false,
}: {
  label: string;
  value: string;
  detail: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-tk-line bg-tk-surface/80 p-4">
      <p className="text-[13px]/[18px] text-tk-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-tk-mono text-2xl/8 font-medium tracking-tight tabular-nums",
          negative && "text-tk-danger",
        )}
      >
        {value}
      </p>
      <p className="text-[13px]/[18px] text-tk-muted">{detail}</p>
    </div>
  );
}

export function WhatIfModel() {
  const [inputs, setInputs] = useState<ModelInputs>(DEFAULT_INPUTS);
  const result = useMemo(() => runModel(inputs), [inputs]);

  const set = <K extends keyof ModelInputs>(key: K, value: ModelInputs[K]) =>
    setInputs((current) => ({ ...current, [key]: value }));

  const isBasePlan = (Object.keys(DEFAULT_INPUTS) as (keyof ModelInputs)[]).every(
    (key) => inputs[key] === DEFAULT_INPUTS[key],
  );

  const customersAt = (sharePct: number) => formatNumber((MICRO_ENTERPRISES * sharePct) / 100);
  const { totals, years } = result;
  const aiCost = years.reduce((sum, year) => sum + year.costs.ai, 0);
  const firstProfitableYear = years.find((year) => year.netProfit > 0)?.year;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{isBasePlan ? "Base plan" : "Your what-if"}</h3>
            <button
              type="button"
              onClick={() => setInputs(DEFAULT_INPUTS)}
              disabled={isBasePlan}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium text-tk-brand hover:bg-tk-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-brand disabled:text-tk-muted disabled:hover:bg-transparent"
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Reset
            </button>
          </div>
          <AccordionPrimitive.Root
            type="multiple"
            defaultValue={["growth", "pricing"]}
            className="mt-2 rounded-[14px] border border-tk-line px-4"
          >
            <ControlGroup
              value="growth"
              title="Growth"
              summary={`${inputs.year1SharePct.toFixed(2)}% in year 1, ${inputs.finalSharePct.toFixed(1)}% by year ${inputs.years}`}
            >
              <Segmented
                label="Plan length"
                value={inputs.years}
                options={YEAR_OPTIONS}
                onChange={(value) => set("years", value)}
              />
              <SliderRow
                label="Customers by end of year 1"
                display={`${inputs.year1SharePct.toFixed(2)}% · ${customersAt(inputs.year1SharePct)}`}
                value={inputs.year1SharePct}
                min={0.05}
                max={0.5}
                step={0.05}
                onChange={(value) => set("year1SharePct", value)}
              />
              <SliderRow
                label={`Customers by end of year ${inputs.years}`}
                display={`${inputs.finalSharePct.toFixed(1)}% · ${customersAt(inputs.finalSharePct)}`}
                value={inputs.finalSharePct}
                min={0.5}
                max={3}
                step={0.1}
                onChange={(value) => set("finalSharePct", value)}
              />
            </ControlGroup>
            <ControlGroup
              value="pricing"
              title="Prices"
              summary={`₱${inputs.runPrice} run, ₱${inputs.premiumPrice} Premium, ₱${inputs.storagePrice} storage`}
            >
              <SliderRow
                label="Parse run"
                display={formatPesos(inputs.runPrice)}
                value={inputs.runPrice}
                min={99}
                max={399}
                step={10}
                onChange={(value) => set("runPrice", value)}
              />
              <SliderRow
                label="Premium, per month"
                display={formatPesos(inputs.premiumPrice)}
                value={inputs.premiumPrice}
                min={400}
                max={1500}
                step={50}
                onChange={(value) => set("premiumPrice", value)}
              />
              <SliderRow
                label="Storage, 5 GB per month"
                display={formatPesos(inputs.storagePrice)}
                value={inputs.storagePrice}
                min={100}
                max={500}
                step={25}
                onChange={(value) => set("storagePrice", value)}
              />
            </ControlGroup>
            <ControlGroup
              value="usage"
              title="Usage"
              summary={`${inputs.runsPerYear} runs a year, ${inputs.docsPerRun} documents each, ${inputs.premiumSharePct}% Premium`}
            >
              <SliderRow
                label="Runs per customer, per year"
                display={String(inputs.runsPerYear)}
                value={inputs.runsPerYear}
                min={4}
                max={12}
                step={1}
                onChange={(value) => set("runsPerYear", value)}
              />
              <SliderRow
                label="Documents per run"
                display={String(inputs.docsPerRun)}
                value={inputs.docsPerRun}
                min={20}
                max={250}
                step={10}
                onChange={(value) => set("docsPerRun", value)}
              />
              <SliderRow
                label="Customers on Premium"
                display={`${inputs.premiumSharePct}%`}
                value={inputs.premiumSharePct}
                min={0}
                max={30}
                step={1}
                onChange={(value) => set("premiumSharePct", value)}
              />
            </ControlGroup>
            <ControlGroup
              value="reader"
              title="AI model"
              summary={`${READER_SUMMARY[inputs.reader]}, ₱${result.aiCostPerDoc.toFixed(2)} a document`}
            >
              <Segmented
                label="Who reads the documents"
                value={inputs.reader}
                options={READER_OPTIONS}
                onChange={(value) => set("reader", value)}
              />
              {inputs.reader === "pipeline" ? (
                <SliderRow
                  label="Documents needing a second read"
                  display={`${inputs.recheckSharePct}%`}
                  value={inputs.recheckSharePct}
                  min={10}
                  max={50}
                  step={5}
                  onChange={(value) => set("recheckSharePct", value)}
                />
              ) : null}
              <p className="text-[13px]/[18px] text-tk-muted">
                {READER_SUMMARY[inputs.reader]}:{" "}
                <span className="font-tk-mono font-medium text-tk-ink">
                  ₱{result.aiCostPerDoc.toFixed(2)}
                </span>{" "}
                per document.
              </p>
            </ControlGroup>
            <ControlGroup
              value="costs"
              title="Operating costs"
              summary={`${inputs.marketingPct}% marketing, ${inputs.teamPct}% team, ${formatPesosCompact(inputs.fixedMonthly)} fixed a month`}
            >
              <SliderRow
                label="Marketing, share of revenue"
                display={`${inputs.marketingPct}%`}
                value={inputs.marketingPct}
                min={0}
                max={30}
                step={1}
                onChange={(value) => set("marketingPct", value)}
              />
              <SliderRow
                label="Team and tools, share of revenue"
                display={`${inputs.teamPct}%`}
                value={inputs.teamPct}
                min={0}
                max={40}
                step={1}
                onChange={(value) => set("teamPct", value)}
              />
              <SliderRow
                label="Fixed costs, per month"
                display={formatPesos(inputs.fixedMonthly)}
                value={inputs.fixedMonthly}
                min={0}
                max={300_000}
                step={10_000}
                onChange={(value) => set("fixedMonthly", value)}
              />
            </ControlGroup>
            <ControlGroup
              value="streams"
              title="Later streams"
              summary={
                [inputs.includeAds && "Ads", inputs.includeSubscriptions && "Newsletter and API"]
                  .filter(Boolean)
                  .join(", ") || "Parser and storage only"
              }
            >
              <ToggleRow
                label="Ads"
                hint="Bookkeeper boosts, lender and bank ads. From month 7."
                checked={inputs.includeAds}
                onChange={(checked) => set("includeAds", checked)}
              />
              <ToggleRow
                label="Newsletter and API access"
                hint="Premium subscriptions. From month 13."
                checked={inputs.includeSubscriptions}
                onChange={(checked) => set("includeSubscriptions", checked)}
              />
            </ControlGroup>
          </AccordionPrimitive.Root>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <div className="grid grid-cols-2 gap-3">
            <Kpi
              label={`Customers, year ${inputs.years}`}
              value={formatNumber(totals.customers)}
              detail={`${inputs.finalSharePct.toFixed(1)}% of the market`}
            />
            <Kpi
              label={`Revenue, ${inputs.years} years`}
              value={formatPesosCompact(totals.revenue.total)}
              detail={`${formatPesosCompact(years.at(-1)?.revenue.total ?? 0)} in year ${inputs.years}`}
            />
            <Kpi
              label={`Net profit, ${inputs.years} years`}
              value={formatPesosCompact(totals.netProfit)}
              detail={
                firstProfitableYear
                  ? `${formatPercent(totals.margin)} margin, in profit from year ${firstProfitableYear}`
                  : "No profitable year"
              }
              negative={totals.netProfit < 0}
            />
            <Kpi
              label="AI cost"
              value={`₱${result.aiCostPerDoc.toFixed(2)}`}
              detail={`per document, ${formatPercent(totals.revenue.total > 0 ? aiCost / totals.revenue.total : 0)} of revenue`}
            />
          </div>

          <MoneyChart years={years} />
          <StreamsChart years={years} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-right text-sm/5">
          <caption className="sr-only">Projection by year</caption>
          <thead>
            <tr className="text-[13px] text-tk-muted">
              <th className="py-2 pr-3 text-left font-medium">Year</th>
              <th className="px-3 py-2 font-medium">Customers</th>
              <th className="px-3 py-2 font-medium">Revenue</th>
              <th className="px-3 py-2 font-medium">AI</th>
              <th className="px-3 py-2 font-medium">Other costs</th>
              <th className="px-3 py-2 font-medium">Taxes</th>
              <th className="py-2 pl-3 font-medium">Net profit</th>
            </tr>
          </thead>
          <tbody className="font-tk-mono tabular-nums">
            {years.map((year) => (
              <tr key={year.year} className="border-t border-tk-line">
                <th
                  scope="row"
                  className="py-2 pr-3 text-left font-tk-sans font-medium whitespace-nowrap"
                >
                  Year {year.year}
                </th>
                <td className="px-3 py-2">{formatNumber(year.customers)}</td>
                <td className="px-3 py-2">{formatPesos(year.revenue.total)}</td>
                <td className="px-3 py-2">{formatPesos(year.costs.ai)}</td>
                <td className="px-3 py-2">{formatPesos(year.costs.total - year.costs.ai)}</td>
                <td className="px-3 py-2">{formatPesos(year.businessTax + year.incomeTax)}</td>
                <td className={cn("py-2 pl-3 font-medium", year.netProfit < 0 && "text-tk-danger")}>
                  {formatPesos(year.netProfit)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-tk-line font-medium">
              <th scope="row" className="py-2 pr-3 text-left font-tk-sans font-semibold">
                Total
              </th>
              <td className="px-3 py-2">{formatNumber(totals.customers)}</td>
              <td className="px-3 py-2">{formatPesos(totals.revenue.total)}</td>
              <td className="px-3 py-2">{formatPesos(aiCost)}</td>
              <td className="px-3 py-2">{formatPesos(totals.costs - aiCost)}</td>
              <td className="px-3 py-2">{formatPesos(totals.taxes)}</td>
              <td className={cn("py-2 pl-3", totals.netProfit < 0 && "text-tk-danger")}>
                {formatPesos(totals.netProfit)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[13px]/[18px] text-tk-muted text-pretty">
        Fixed assumptions: {formatNumber(MICRO_ENTERPRISES)} micro enterprises{" "}
        <Cite source="DTI" refs={[1, 2]} />; 2% monthly churn; partners grow to 1,608 by month 36
        with one client each; 1 in 18 regular customers buys storage; 2.5% payment fees; 3%
        percentage tax up to ₱3M of yearly revenue, VAT above it; income tax of 20% or 25%. Unit
        costs from <Cite source="Takatax" refs={[21]} />, <Cite source="Google" refs={[19]} /> and{" "}
        <Cite source="Anthropic" refs={[20]} />. A projection, not a forecast.
      </p>
    </div>
  );
}
