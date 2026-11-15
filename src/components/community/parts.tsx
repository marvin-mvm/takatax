/** Pieces shared by the community and bookkeeper pages. */

import { Link } from "@tanstack/react-router";
import { BadgeCheck, EyeOff, Globe, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";

import { Stars } from "@/components/app/ui";
import { PARTNER_KIND_LABEL, type CommunityPost, type PartnerProfile } from "@/lib/data/types";

/** The page frame for public, content-first pages (community, bookkeepers). */
export function PublicPage({
  title,
  intro,
  action,
  children,
}: {
  title: string;
  intro: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1120px] px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px]/[38px] font-bold tracking-tight text-balance sm:text-[44px]/[50px]">
            {title}
          </h1>
          <p className="mt-3 max-w-[62ch] text-lg/7 text-tk-muted text-pretty">{intro}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function VisibilityBadge({ visibility }: { visibility: CommunityPost["visibility"] }) {
  return visibility === "members" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-tk-warn-soft px-2.5 py-0.5 text-[13px] font-medium text-tk-warn">
      <EyeOff aria-hidden className="size-3.5" /> Members only
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-tk-surface-2 px-2.5 py-0.5 text-[13px] font-medium text-tk-muted">
      <Globe aria-hidden className="size-3.5" /> Public
    </span>
  );
}

export function PostCard({ post }: { post: CommunityPost }) {
  const answered = post.answers.length > 0;
  return (
    <Link
      to="/community/$postId"
      params={{ postId: post.id }}
      className="group flex flex-col gap-2 rounded-[18px] border border-tk-line bg-tk-surface p-5 transition-colors hover:border-tk-brand"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-tk-muted">
        <span className="font-medium text-tk-ink">{post.topic}</span>
        <span aria-hidden>·</span>
        <span>Anonymous taxpayer</span>
        <span aria-hidden>·</span>
        <time dateTime={post.createdAt}>{post.createdAt.slice(0, 10)}</time>
        <VisibilityBadge visibility={post.visibility} />
      </div>
      <h2 className="text-lg font-semibold text-balance group-hover:text-tk-brand">{post.title}</h2>
      <p className="line-clamp-2 text-tk-muted">{post.body}</p>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <MessageSquare aria-hidden className="size-4 text-tk-brand" />
        {answered
          ? `${post.answers.length} answer${post.answers.length === 1 ? "" : "s"} from verified ${post.answers.length === 1 ? PARTNER_KIND_LABEL[post.answers[0]?.partnerKind ?? "bookkeeper"].toLowerCase() : "professionals"}`
          : "Waiting for an answer"}
      </p>
    </Link>
  );
}

export function VerifiedBadge({ partner }: { partner: PartnerProfile }) {
  const checks = [
    partner.verified.birAccreditation ? "BIR accreditation" : null,
    partner.verified.prcLicense ? "PRC licence" : null,
  ].filter(Boolean);
  if (!checks.length) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-sm font-medium text-tk-brand"
      title={`Checked: ${checks.join(", ")}${partner.verified.checkedOn ? ` on ${partner.verified.checkedOn}` : ""}`}
    >
      <BadgeCheck aria-hidden className="size-4" /> Verified
    </span>
  );
}

export function PartnerCard({ partner }: { partner: PartnerProfile }) {
  return (
    <Link
      to="/bookkeepers/$partnerId"
      params={{ partnerId: partner.id }}
      className="group flex h-full flex-col gap-3 rounded-[18px] border border-tk-line bg-tk-surface p-5 transition-colors hover:border-tk-brand"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-tk-brand-soft text-lg font-bold text-tk-brand"
        >
          {partner.name.replace(/^(Atty\.|Dr\.)\s*/, "").charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="font-semibold group-hover:text-tk-brand">{partner.name}</p>
          <p className="text-sm text-tk-muted">
            {PARTNER_KIND_LABEL[partner.kind]} · {partner.city} · {partner.yearsInPractice} years
          </p>
          <VerifiedBadge partner={partner} />
        </div>
      </div>
      <Stars rating={partner.rating} count={partner.reviewCount} />
      <p className="line-clamp-2 text-[15px] text-tk-muted">{partner.bio}</p>
      <p className="mt-auto flex flex-wrap gap-1.5">
        {partner.specialties.map((s) => (
          <span
            key={s}
            className="rounded-full bg-tk-surface-2 px-2.5 py-0.5 text-[13px] text-tk-muted"
          >
            {s}
          </span>
        ))}
      </p>
    </Link>
  );
}

/** The rules every community page repeats: anonymous, blurred, public or members-only. */
export function CommunityRules() {
  return (
    <aside className="rounded-[18px] border border-tk-line bg-tk-surface p-5 text-[15px]">
      <h2 className="font-semibold">How the community works</h2>
      <ul className="mt-3 flex flex-col gap-2.5 text-tk-muted">
        <li>
          <strong className="font-semibold text-tk-ink">You stay anonymous.</strong> Your name is
          never shown.
        </li>
        <li>
          <strong className="font-semibold text-tk-ink">Personal details are blurred.</strong> TINs,
          phone numbers, emails and amounts are hidden before posting.
        </li>
        <li>
          <strong className="font-semibold text-tk-ink">Public or members-only.</strong> Posts are
          public and can show up on Google, unless you tick “private”.
        </li>
        <li>
          <strong className="font-semibold text-tk-ink">Verified pros answer.</strong> Only verified
          bookkeepers, CPAs and tax lawyers reply, with their name and rating.
        </li>
        <li>
          <strong className="font-semibold text-tk-ink">No paid answers, no middleman.</strong>{" "}
          Takatax does not handle any payment between you and a bookkeeper.
        </li>
      </ul>
    </aside>
  );
}
