import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Calculator, ScanLine, Upload, type LucideIcon } from "lucide-react";

import { SiteShell } from "@/components/site/SiteShell";
import { buttonStart, textLink } from "@/components/site/styles";

const title = "Takatax: your BIR figures, straight from your receipts";
const description =
  "Upload your receipts, invoices and 2307s. Takatax reads them and computes your tax returns line by line. ₱199 per run, no subscription.";

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: LandingPage,
});

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Upload,
    title: "Upload",
    text: "Take photos of your receipts, invoices and 2307s, or upload the PDFs.",
  },
  {
    icon: ScanLine,
    title: "We read and check",
    text: "AI reads every document. You only confirm the few it is unsure about.",
  },
  {
    icon: Calculator,
    title: "Get your figures",
    text: "Your 1701Q, 2551Q and SAWT, line by line, with a reason for every document left out.",
  },
];

function LandingPage() {
  return (
    <SiteShell>
      <section className="mx-auto flex max-w-[820px] flex-col items-center px-4 pt-16 pb-14 text-center sm:px-6 sm:pt-24 sm:pb-20">
        <p className="rounded-full bg-tk-brand-soft px-3 py-1 text-sm font-medium text-tk-brand">
          For Filipino sole proprietors and freelancers
        </p>
        <h1 className="mt-6 text-[40px]/[44px] font-bold tracking-tight text-balance sm:text-[60px]/[64px]">
          Your BIR figures, straight from your receipts.
        </h1>
        <p className="mt-6 max-w-[56ch] text-lg/7 text-tk-muted text-pretty sm:text-xl/8">
          Upload your receipts, invoices and 2307s. Takatax reads them and computes your tax
          returns, line by line. ₱199 per run. A subscription is optional.
        </p>
        <Link to="/signup" className={`${buttonStart} mt-10`}>
          Start
          <ArrowRight aria-hidden className="size-6" />
        </Link>
        <p className="mt-5 text-tk-muted">
          Free to try with your first 10 documents.{" "}
          <Link to="/login" className={textLink}>
            Log in
          </Link>{" "}
          if you already have an account.
        </p>
      </section>

      <section aria-labelledby="what-we-do" className="border-y border-tk-line bg-tk-surface/70">
        <div className="mx-auto max-w-[1080px] px-4 py-14 sm:px-6 sm:py-16">
          <h2 id="what-we-do" className="text-[28px]/[34px] font-bold tracking-tight">
            What Takatax does
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title: stepTitle, text }, index) => (
              <li key={stepTitle}>
                <span className="flex size-11 items-center justify-center rounded-[12px] bg-tk-brand-soft text-tk-brand">
                  <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-xl font-semibold">
                  <span className="font-tk-mono text-base text-tk-muted">{index + 1}.</span>{" "}
                  {stepTitle}
                </h3>
                <p className="mt-2 text-tk-muted text-pretty">{text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-[70ch] text-tk-muted text-pretty">
            You file the return yourself, or with a bookkeeper you trust. Bookkeepers and CPAs use
            Takatax free.
          </p>
        </div>
      </section>

      <section aria-label="App preview" className="mx-auto max-w-[1080px] px-4 py-14 sm:px-6">
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-tk-line bg-tk-surface-2 px-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-tk-muted">
            Placeholder
          </p>
          <p className="mt-2 text-xl font-semibold">A preview of the app goes here.</p>
          <p className="mt-1 text-tk-muted">Screenshots come once the document reader is built.</p>
        </div>
      </section>
    </SiteShell>
  );
}
