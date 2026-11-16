import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppUser } from "@/components/app/app-user";
import { Card, LoadingBlock, PageHeader, SampleDataNotice } from "@/components/app/ui";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { displayName } from "@/lib/auth/use-auth";
import { useMyPartnerProfile } from "@/lib/data/queries";
import {
  NotConnectedError,
  type PartnerProfileEdit,
  isPartner,
  saveMyPartnerProfile,
} from "@/lib/data/repository";
import { PARTNER_KIND_LABEL, type PartnerKind } from "@/lib/data/types";
import { longDay } from "@/lib/time";

export const Route = createFileRoute("/app/profile")({
  component: PartnerProfilePage,
});

const field =
  "min-h-11 w-full rounded-[10px] border border-tk-line bg-tk-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-tk-brand";

/**
 * A bookkeeper's, CPA's or tax lawyer's own profile: what taxpayers see in the directory, and
 * the accreditation or licence number Takatax staff check before the profile goes public.
 */
function PartnerProfilePage() {
  const { user, role } = useAppUser();
  const kind: PartnerKind = isPartner(role) ? role : "bookkeeper";
  const query = useMyPartnerProfile(user.id, { name: displayName(user), kind });
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PartnerProfileEdit | null>(null);
  const [specialties, setSpecialties] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const profile = query.data?.data ?? null;
  useEffect(() => {
    if (!profile || form) return;
    setForm({
      displayName: profile.displayName,
      city: profile.city,
      bio: profile.bio,
      specialties: profile.specialties,
      yearsInPractice: profile.yearsInPractice,
      birAccreditationNo: profile.birAccreditationNo,
      prcLicenseNo: profile.prcLicenseNo,
    });
    setSpecialties(profile.specialties.join(", "));
  }, [profile, form]);

  if (!isPartner(role)) {
    return (
      <p className="py-16 text-center text-tk-muted">
        This page is for bookkeepers, CPAs and tax lawyers.
      </p>
    );
  }
  if (query.isPending || !form) return <LoadingBlock label="Loading your profile…" />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load your profile.</p>;

  const set = <K extends keyof PartnerProfileEdit>(key: K, value: PartnerProfileEdit[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await saveMyPartnerProfile(user.id, {
        ...form,
        specialties: specialties.split(","),
      });
      await queryClient.invalidateQueries({ queryKey: ["my-partner-profile", user.id] });
      setNotice({ tone: "ok", text: "Saved." });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof NotConnectedError
            ? "Profiles are not connected yet. Nothing was saved."
            : "We could not save your profile. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const verified = Boolean(profile?.verifiedAt);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My profile"
        subtitle={`Your ${PARTNER_KIND_LABEL[kind].toLowerCase()} profile in the Takatax directory. Clients see this before they message you or give you access.`}
        action={
          verified ? (
            <Link
              to="/bookkeepers/$partnerId"
              params={{ partnerId: user.id }}
              className={buttonOutline}
            >
              View public profile
            </Link>
          ) : undefined
        }
      />
      <SampleDataNotice source={query.data.source} what="an empty example profile" />

      {verified ? (
        <p className="flex items-start gap-2.5 rounded-[12px] bg-tk-brand-soft px-4 py-3 text-tk-brand">
          <BadgeCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>
            <strong className="font-semibold">Verified</strong> on{" "}
            {longDay(profile?.verifiedAt ?? "")}. Your profile is public, you can answer in the
            community, and taxpayers can message you and give you access.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2.5 rounded-[12px] border border-tk-accent/40 bg-tk-warn-soft px-4 py-3">
          <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-tk-warn" />
          <span>
            <strong className="font-semibold">Waiting for verification.</strong> Add your BIR tax
            agent accreditation number or PRC licence number and save. Takatax staff check it,
            usually within two working days; then your profile goes public.
          </span>
        </p>
      )}

      <Card>
        <form
          className="grid gap-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Name shown to clients</span>
            <input
              className={field}
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">City</span>
            <input
              className={field}
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              maxLength={80}
              placeholder="Quezon City"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Years in practice</span>
            <input
              className={field}
              type="number"
              min={0}
              max={80}
              inputMode="numeric"
              value={form.yearsInPractice}
              onChange={(e) => set("yearsInPractice", Number(e.target.value) || 0)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">What you help with</span>
            <input
              className={field}
              value={specialties}
              onChange={(e) => setSpecialties(e.target.value)}
              placeholder="Percentage tax, 8% option, Books of accounts"
            />
            <span className="text-sm text-tk-muted">Separate with commas. Up to 8.</span>
          </label>
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="font-medium">About you</span>
            <textarea
              className={`${field} min-h-32 py-2.5`}
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
              maxLength={1000}
              placeholder="Who you help, how you work, the languages you speak."
            />
            <span className="text-sm text-tk-muted">{form.bio.length} / 1,000</span>
          </label>
          <fieldset className="grid gap-5 rounded-[14px] border border-tk-line p-4 md:col-span-2 md:grid-cols-2">
            <legend className="px-1 font-semibold">For verification</legend>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">BIR tax agent accreditation number</span>
              <input
                className={field}
                value={form.birAccreditationNo}
                onChange={(e) => set("birAccreditationNo", e.target.value)}
                maxLength={60}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">PRC licence number</span>
              <input
                className={field}
                value={form.prcLicenseNo}
                onChange={(e) => set("prcLicenseNo", e.target.value)}
                maxLength={60}
              />
            </label>
            <p className="text-sm text-tk-muted md:col-span-2">
              Changing either number sends your profile for a new check, and it is hidden until
              then.
            </p>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button type="submit" disabled={saving} className={buttonPrimary}>
              {saving ? "Saving…" : "Save profile"}
            </button>
            {notice ? (
              <p
                role={notice.tone === "error" ? "alert" : "status"}
                className={notice.tone === "error" ? "text-tk-danger" : "text-tk-brand"}
              >
                {notice.text}
              </p>
            ) : null}
          </div>
        </form>
      </Card>
    </div>
  );
}
