/** The submission's table of contents, and "why now" for the validation report. */

import { useContext } from "react";

import { Block, Cite, Point, Points, Slide } from "./primitives";
import { SlideMetaContext } from "./slide-meta";

const REPO = "https://github.com/marvin-mvm/takatax/blob/main";

interface Deliverable {
  title: string;
  /** The deck slides, by id: the first and the last. */
  slides: [string, string];
  /** Where it is in the repository (or online). */
  links: { label: string; href: string }[];
}

const DELIVERABLES: Deliverable[] = [
  {
    title: "Idea Validation Report",
    slides: ["validation", "whynow"],
    links: [
      {
        label: "docs/01-idea-validation-report.md",
        href: `${REPO}/docs/01-idea-validation-report.md`,
      },
    ],
  },
  {
    title: "Product Requirements Document (PRD)",
    slides: ["prd", "model"],
    links: [{ label: "docs/02-PRD.md", href: `${REPO}/docs/02-PRD.md` }],
  },
  {
    title: "Spec file (spec.md) and architecture notes",
    slides: ["architecture", "design"],
    links: [
      { label: "spec.md", href: `${REPO}/spec.md` },
      { label: "docs/03-architecture-notes.md", href: `${REPO}/docs/03-architecture-notes.md` },
    ],
  },
  {
    title: "GitHub repository: commits, README, CI/CD",
    slides: ["build", "build"],
    links: [
      { label: "github.com/marvin-mvm/takatax", href: "https://github.com/marvin-mvm/takatax" },
    ],
  },
  {
    title: "Live deployed application",
    slides: ["deploy", "deploy"],
    links: [{ label: "takatax.netlify.app", href: "https://takatax.netlify.app" }],
  },
  {
    title: "Demo recording (2 minutes)",
    slides: ["document", "document"],
    links: [{ label: "Linked in docs/SUBMISSION.md", href: `${REPO}/docs/SUBMISSION.md` }],
  },
  {
    title: "Reflection write-up (1 page)",
    slides: ["document", "document"],
    links: [{ label: "docs/07-reflection.md", href: `${REPO}/docs/07-reflection.md` }],
  },
];

export function ContentsSlide() {
  const { ids } = useContext(SlideMetaContext);
  const numberOf = (id: string) => String(ids.indexOf(id) + 1).padStart(2, "0");

  return (
    <Slide
      id="contents"
      eyebrow="Submission · Week 4 graded mini project"
      title="Seven deliverables, one deck."
      lead="Each deliverable is a section of these slides and its own file in the repository. The index of everything is docs/SUBMISSION.md."
    >
      <ol className="flex flex-col">
        {DELIVERABLES.map((item, index) => {
          const [first, last] = item.slides;
          const pages =
            first === last ? numberOf(first) : `${numberOf(first)} to ${numberOf(last)}`;
          return (
            <li
              key={item.title}
              className="grid gap-x-6 gap-y-1 border-t border-tk-line py-3 first:border-t-0 first:pt-0 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_5.5rem] sm:items-baseline"
            >
              <span className="font-tk-mono text-sm text-tk-brand">{index + 1}</span>
              <a href={`#${first}`} className="font-semibold hover:text-tk-brand hover:underline">
                {item.title}
              </a>
              <span className="flex min-w-0 flex-col text-[15px]/[22px] text-tk-muted">
                {item.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="truncate underline decoration-tk-line underline-offset-2 hover:text-tk-brand"
                  >
                    {link.label}
                  </a>
                ))}
              </span>
              <span className="font-tk-mono text-sm text-tk-muted sm:text-right">
                Slide {pages}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 border-t border-tk-line pt-4 text-[15px]/[22px] text-tk-muted">
        Repository: github.com/marvin-mvm/takatax · Live app: takatax.netlify.app · v2 improvement:
        issue #44 · AI coding rules: AGENTS.md, CLAUDE.md, .cursorrules
      </p>
    </Slide>
  );
}

export function WhyNowSlide() {
  return (
    <Slide
      id="whynow"
      eyebrow="Deliverable 1 · Idea validation report"
      tag="Why now"
      title="Why now: the rules changed, and AI reading got cheap."
      lead="Three things that were not true a few years ago make Takatax possible, and needed, today."
    >
      <div className="grid gap-10 lg:grid-cols-3">
        <Block title="1. The rules just changed">
          <Points>
            <Point>
              The Ease of Paying Taxes Act (2024) made the invoice the primary document instead of
              the official receipt <Cite source="RA 11976" refs={[10, 11]} />.
            </Point>
            <Point>
              It created a micro taxpayer class with lower penalties. Every small business is
              relearning what to keep and how to file, which is when people look for help.
            </Point>
          </Points>
        </Block>
        <Block title="2. Reading a receipt got cheap">
          <Points>
            <Point>
              Models now read photos and PDFs directly, without OCR or templates, for about ₱0.23 to
              ₱0.32 a page <Cite source="Takatax" refs={[21, 19, 20, 22]} />.
            </Point>
            <Point>
              That makes a pay-per-run price profitable, which a human encoder or an OCR pipeline
              could not match.
            </Point>
          </Points>
        </Block>
        <Block title="3. More people work for themselves">
          <Points>
            <Point>
              About 1.5 million freelancers and virtual assistants <Cite source="SSS" refs={[12]} />
              , and 28.1% of employed Filipinos self-employed with no paid staff{" "}
              <Cite source="PSA" refs={[13]} />.
            </Point>
            <Point>
              Each must register and file, and many do not know which tax category applies to them{" "}
              <Cite source="PIDS" refs={[9]} />.
            </Point>
          </Points>
        </Block>
      </div>
    </Slide>
  );
}
