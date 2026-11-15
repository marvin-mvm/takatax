import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAppUser } from "@/components/app/app-user";
import { EmptyState, LoadingBlock, PageHeader, Tag } from "@/components/app/ui";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { useIsAdmin, usePartnersForReview } from "@/lib/data/queries";
import { verifyPartner } from "@/lib/data/repository";
import { PARTNER_KIND_LABEL, type PartnerForReview } from "@/lib/data/types";
import { longDay } from "@/lib/time";

export const Route = createFileRoute("/app/admin")({
  head: () => ({ meta: [{ title: "Staff | Takatax" }, { name: "robots", content: "noindex" }] }),
  component: StaffPage,
});

/**
 * For Takatax staff (people listed in `public.admins`): check each partner's BIR accreditation
 * or PRC licence, then verify them. The database refuses this to anyone else.
 */
function StaffPage() {
  const { user } = useAppUser();
  const admin = useIsAdmin(user.id);
  const partners = usePartnersForReview(admin.data === true);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (admin.isPending) return <LoadingBlock />;
  if (admin.data !== true) {
    return <EmptyState title="Staff only.">This page is for Takatax staff.</EmptyState>;
  }
  if (partners.isPending) return <LoadingBlock label="Loading partners…" />;
  if (partners.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load partners.</p>;

  const decide = async (partner: PartnerForReview, approve: boolean) => {
    setBusy(partner.userId);
    setProblem(null);
    try {
      await verifyPartner(partner.userId, approve);
      await queryClient.invalidateQueries({ queryKey: ["partners-for-review"] });
      void queryClient.invalidateQueries({ queryKey: ["partners"] });
    } catch {
      setProblem("That did not save. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const waiting = partners.data.filter((p) => !p.verifiedAt);
  const verified = partners.data.filter((p) => p.verifiedAt);

  const row = (partner: PartnerForReview) => (
    <li
      key={partner.userId}
      className="grid gap-3 border-b border-tk-line px-5 py-4 last:border-b-0 md:grid-cols-[1.3fr_1fr_auto] md:items-center"
    >
      <div>
        <p className="font-semibold">{partner.displayName || "No name yet"}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm text-tk-muted">
          <Tag>{PARTNER_KIND_LABEL[partner.kind]}</Tag>
          {partner.city || "No city"} · signed up {longDay(partner.createdAt)}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
        <dt className="text-tk-muted">BIR accreditation</dt>
        <dd className="font-tk-mono">{partner.birAccreditationNo || "—"}</dd>
        <dt className="text-tk-muted">PRC licence</dt>
        <dd className="font-tk-mono">{partner.prcLicenseNo || "—"}</dd>
      </dl>
      <div className="flex gap-2">
        {partner.verifiedAt ? (
          <button
            type="button"
            onClick={() => void decide(partner, false)}
            disabled={busy === partner.userId}
            className={buttonOutline}
          >
            Withdraw
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void decide(partner, true)}
            disabled={
              busy === partner.userId || (!partner.birAccreditationNo && !partner.prcLicenseNo)
            }
            className={buttonPrimary}
          >
            Verify
          </button>
        )}
      </div>
    </li>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Partner verification"
        subtitle="Check each number against the BIR list of accredited tax agents or the PRC online licence check before you verify. Verified partners appear in the directory, can answer in the community, and can be messaged and given access."
      />
      {problem ? (
        <p role="alert" className="text-tk-danger">
          {problem}
        </p>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Waiting ({waiting.length})</h2>
        {waiting.length ? (
          <ul className="rounded-[18px] border border-tk-line bg-tk-surface">{waiting.map(row)}</ul>
        ) : (
          <p className="text-tk-muted">No one is waiting.</p>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Verified ({verified.length})</h2>
        {verified.length ? (
          <ul className="rounded-[18px] border border-tk-line bg-tk-surface">
            {verified.map(row)}
          </ul>
        ) : (
          <p className="text-tk-muted">No verified partners yet.</p>
        )}
      </section>
    </div>
  );
}
