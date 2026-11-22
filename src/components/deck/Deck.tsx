import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";

import { BrandMark } from "@/components/site/BrandMark";
import { cn } from "@/lib/utils";

import { SlideMetaContext } from "./slide-meta";
import { PrdSlide, RevenueSlide } from "./slides-prd";
import {
  ArchitectureSlide,
  BuildSlide,
  DesignSlide,
  ModelSlide,
  ReaderSlide,
  ReviewSlide,
  SourcesSlide,
  StackSlide,
  WorkflowSlide,
} from "./slides-spec";
import { DeploySlide, DocumentSlide } from "./slides-ship";
import {
  CompetitorsSlide,
  CoverSlide,
  EdgeSlide,
  MarketSlide,
  ProblemSlide,
  RisksSlide,
  TestSlide,
  UsersSlide,
  ValidationOverviewSlide,
} from "./slides-validation";

interface SlideEntry {
  id: string;
  /** Shown in the top navigation when the slide starts a section. */
  section?: string;
  Component: ComponentType;
}

const SLIDES: SlideEntry[] = [
  { id: "cover", Component: CoverSlide },
  { id: "validation", section: "Validation", Component: ValidationOverviewSlide },
  { id: "problem", Component: ProblemSlide },
  { id: "users", Component: UsersSlide },
  { id: "market", Component: MarketSlide },
  { id: "competitors", Component: CompetitorsSlide },
  { id: "edge", Component: EdgeSlide },
  { id: "test", Component: TestSlide },
  { id: "risks", Component: RisksSlide },
  { id: "prd", section: "PRD", Component: PrdSlide },
  { id: "revenue", section: "Revenue", Component: RevenueSlide },
  { id: "model", section: "What-if", Component: ModelSlide },
  { id: "architecture", section: "Architecture", Component: ArchitectureSlide },
  { id: "reader", Component: ReaderSlide },
  { id: "stack", Component: StackSlide },
  { id: "review", Component: ReviewSlide },
  { id: "workflow", Component: WorkflowSlide },
  { id: "design", Component: DesignSlide },
  { id: "build", section: "Build", Component: BuildSlide },
  { id: "deploy", section: "Ship", Component: DeploySlide },
  { id: "document", Component: DocumentSlide },
  { id: "sources", section: "Sources", Component: SourcesSlide },
];

const SECTIONS = SLIDES.flatMap((slide, index) =>
  slide.section ? [{ id: slide.id, label: slide.section, index }] : [],
);

const twoDigits = (value: number) => String(value).padStart(2, "0");

function scrollToSlide(index: number) {
  const slide = SLIDES[index];
  if (!slide) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(slide.id)
    ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

export function Deck() {
  const [active, setActive] = useState(0);

  // The active slide is the one crossing the middle of the screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = SLIDES.findIndex((slide) => slide.id === entry.target.id);
          if (index >= 0) setActive(index);
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const slide of SLIDES) {
      const element = document.getElementById(slide.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  const go = useCallback(
    (step: number) => scrollToSlide(Math.min(Math.max(active + step, 0), SLIDES.length - 1)),
    [active],
  );

  // Left and right arrows change slides, unless a control (a slider, a button) has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, button, [role='slider'], [role='radio']")
      ) {
        return;
      }
      event.preventDefault();
      go(event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go]);

  const activeSection = SECTIONS.filter((section) => section.index <= active).at(-1)?.id;

  return (
    <div className="tk-theme tk-page-gradient min-h-screen font-tk-sans text-tk-ink antialiased">
      <header className="deck-chrome sticky top-0 z-20 border-b border-tk-line bg-tk-surface">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-4 px-4 sm:px-6">
          <a href="#cover" className="flex items-center gap-2 font-bold tracking-tight">
            <BrandMark className="size-7" />
            Takatax
          </a>
          <nav aria-label="Sections" className="ml-2 hidden min-w-0 flex-1 md:block">
            <ul className="flex items-center gap-1">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={section.id === activeSection ? "true" : undefined}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                      section.id === activeSection
                        ? "bg-tk-brand-soft text-tk-brand"
                        : "text-tk-muted hover:text-tk-ink",
                    )}
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-1 font-tk-mono text-[13px] text-tk-muted tabular-nums">
              {twoDigits(active + 1)} / {twoDigits(SLIDES.length)}
            </span>
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={active === 0}
              aria-label="Previous slide"
              className="flex size-9 items-center justify-center rounded-[10px] border border-tk-line bg-tk-surface text-tk-ink hover:border-tk-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-brand disabled:text-tk-line disabled:hover:border-tk-line"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={active === SLIDES.length - 1}
              aria-label="Next slide"
              className="flex size-9 items-center justify-center rounded-[10px] border border-tk-line bg-tk-surface text-tk-ink hover:border-tk-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-brand disabled:text-tk-line disabled:hover:border-tk-line"
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>
        </div>
        <div aria-hidden className="h-0.5 bg-tk-line">
          <div
            className="h-full bg-tk-brand transition-[width] duration-200 ease-out"
            style={{ width: `${((active + 1) / SLIDES.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="mx-auto flex max-w-[1120px] flex-col gap-5 px-3 py-5 sm:gap-6 sm:px-6 sm:py-8">
        {SLIDES.map(({ id, Component }, index) => (
          <SlideMetaContext.Provider key={id} value={{ number: index + 1, total: SLIDES.length }}>
            <Component />
          </SlideMetaContext.Provider>
        ))}
      </main>
    </div>
  );
}
