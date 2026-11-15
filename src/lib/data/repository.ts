/**
 * Reads and writes the app's data in Supabase. Until the tables in
 * `supabase/migrations/20261115120000_takatax_core.sql` are applied (or when the network is
 * down), reads fall back to the built-in sample data and say so through `source: "sample"`,
 * and writes throw `NotConnectedError` so the screen can explain what is missing.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { upcomingFilings } from "@shared/domain/deadlines.ts";
import type { LedgerRecord } from "@shared/domain/records.ts";
import { estimateFiling } from "@shared/domain/tax-estimates.ts";
import { type TaxProfile, taxTypesFor } from "@shared/domain/tax-profile.ts";
import { redactPersonalInfo } from "@shared/community/redact.ts";
import type { CheckFlag } from "@shared/parser/checks.ts";
import type { DocumentKind } from "@shared/parser/schema.ts";

import { SAMPLE_PARTNERS, SAMPLE_POSTS, samplePartnerClients, sampleWorkspace } from "./sample";
import type {
  AccountRole,
  CommunityAnswer,
  CommunityPost,
  DocumentStatus,
  Loaded,
  PartnerClientSummary,
  PartnerKind,
  PartnerProfile,
  PostVisibility,
  StoredDocument,
  Workspace,
} from "./types";

// MISSING: after applying the migration, regenerate src/integrations/supabase/types.ts
// (supabase gen types typescript --project-id thiznrxojzrxkjwqhtjt) and switch to the typed
// client. Until then the tables are unknown to the generated types, hence this untyped view.
const db = supabase as unknown as SupabaseClient;

/** Thrown when a write needs a table or function that is not set up yet. */
export class NotConnectedError extends Error {
  constructor(what: string) {
    super(`${what} is not connected yet.`);
    this.name = "NotConnectedError";
  }
}

const NOT_SET_UP_CODES = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);

function isNotConnected(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message, name } = error as { code?: string; message?: string; name?: string };
  if (code && NOT_SET_UP_CODES.has(code)) return true;
  return (
    name === "TypeError" || /failed to fetch|fetch failed|network|load failed/i.test(message ?? "")
  );
}

async function liveOrSample<T>(load: () => Promise<T>, sample: () => T): Promise<Loaded<T>> {
  try {
    return { data: await load(), source: "live" };
  } catch (error) {
    if (isNotConnected(error)) return { data: sample(), source: "sample" };
    throw error;
  }
}

/** Throws the PostgREST error, if any, and returns the rows otherwise. */
function rows<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

/** Today's date in the Philippines, as "YYYY-MM-DD". */
export function todayInManila(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/**
 * The role a user signed up with. MISSING: once `profiles` exists, read the role from there; a
 * partner role only counts after Takatax staff verify the partner's credentials.
 */
export function roleOf(user: Pick<User, "user_metadata">): AccountRole {
  const value: unknown = user.user_metadata["account_type"];
  return value === "bookkeeper" || value === "cpa" || value === "tax_lawyer" ? value : "taxpayer";
}

export const isPartner = (role: AccountRole): role is PartnerKind => role !== "taxpayer";

// ---------------------------------------------------------------------------------------------
// Row mapping (database snake_case -> app camelCase)
// ---------------------------------------------------------------------------------------------

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const money = (centavos: unknown) => (typeof centavos === "number" ? centavos / 100 : 0);

function toProfile(row: Row): TaxProfile | null {
  if (!row["tin"]) return null;
  return {
    tin: text(row["tin"]),
    registeredName: text(row["registered_name"]),
    tradeName: text(row["trade_name"]) || undefined,
    rdoCode: text(row["rdo_code"]),
    registeredAddress: text(row["registered_address"]),
    lineOfBusiness: text(row["line_of_business"]),
    registrationDate: text(row["registration_date"]),
    vatRegistered: row["vat_registered"] === true,
    withholdingAgent: row["withholding_agent"] === true,
    incomeTaxOption: (text(row["income_tax_option"]) ||
      "graduated_osd") as TaxProfile["incomeTaxOption"],
    businessType: row["business_type"] === "goods" ? "goods" : "services",
    mixedIncome: row["mixed_income"] === true,
  };
}

function toDocument(row: Row): StoredDocument {
  return {
    id: text(row["id"]),
    accountId: text(row["account_id"]),
    kind: (text(row["kind"]) || "unknown") as DocumentKind,
    fileName: text(row["file_name"]),
    mimeType: text(row["mime_type"]),
    bytes: typeof row["bytes"] === "number" ? row["bytes"] : 0,
    uploadedAt: text(row["created_at"]),
    status: (text(row["status"]) || "waiting_for_reader") as DocumentStatus,
    readerPath: Array.isArray(row["reader_path"]) ? (row["reader_path"] as string[]) : [],
    flags: Array.isArray(row["flags"]) ? (row["flags"] as CheckFlag[]) : [],
    previewUrl: null,
  };
}

function toRecord(row: Row): LedgerRecord {
  return {
    id: text(row["id"]),
    documentId: text(row["document_id"]) || null,
    kind: text(row["kind"]) as LedgerRecord["kind"],
    date: text(row["record_date"]),
    counterparty: text(row["counterparty"]),
    counterpartyTin: text(row["counterparty_tin"]) || undefined,
    description: text(row["description"]),
    category: (text(row["category"]) || undefined) as LedgerRecord["category"],
    amount: money(row["amount_centavos"]),
    vat: money(row["vat_centavos"]),
    taxWithheld: money(row["tax_withheld_centavos"]),
  };
}

async function loadWorkspaceRows(accountRow: Row): Promise<Workspace> {
  const accountId = text(accountRow["id"]);
  const [documents, records] = await Promise.all([
    db
      .from("documents")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false }),
    db
      .from("ledger_records")
      .select("*")
      .eq("account_id", accountId)
      .order("record_date", { ascending: false }),
  ]);
  const profile = toProfile(accountRow);
  return {
    account: {
      id: accountId,
      displayName:
        text(accountRow["trade_name"]) || text(accountRow["registered_name"]) || "My business",
      profile,
      corDocumentId: text(accountRow["cor_document_id"]) || null,
    },
    documents: rows<Row[]>(documents).map(toDocument),
    records: rows<Row[]>(records).map(toRecord),
  };
}

// ---------------------------------------------------------------------------------------------
// Taxpayer data
// ---------------------------------------------------------------------------------------------

/**
 * The signed-in taxpayer's account, documents and ledger. A live user with no account yet gets
 * an empty workspace, which the dashboard shows as "add your COR".
 */
export function loadMyWorkspace(userId: string): Promise<Loaded<Workspace>> {
  return liveOrSample(
    async () => {
      const account = rows<Row | null>(
        await db.from("accounts").select("*").eq("owner_user_id", userId).maybeSingle(),
      );
      if (!account) {
        return {
          account: { id: "", displayName: "My business", profile: null, corDocumentId: null },
          documents: [],
          records: [],
        };
      }
      return loadWorkspaceRows(account);
    },
    () => sampleWorkspace(todayInManila()),
  );
}

/** One client's workspace, for a partner with access. Row-level security enforces the access. */
export function loadClientWorkspace(accountId: string): Promise<Loaded<Workspace>> {
  return liveOrSample(
    async () => {
      const account = rows<Row | null>(
        await db.from("accounts").select("*").eq("id", accountId).maybeSingle(),
      );
      if (!account) throw Object.assign(new Error("Client not found"), { code: "not_found" });
      return loadWorkspaceRows(account);
    },
    () => sampleWorkspace(todayInManila(), accountId),
  );
}

// ---------------------------------------------------------------------------------------------
// Partner data
// ---------------------------------------------------------------------------------------------

export function loadPartnerClients(partnerUserId: string): Promise<Loaded<PartnerClientSummary[]>> {
  const today = todayInManila();
  return liveOrSample(
    async () => {
      const grants = rows<Row[]>(
        await db
          .from("partner_access")
          .select("granted_at, accounts(*)")
          .eq("partner_user_id", partnerUserId)
          .is("revoked_at", null),
      );
      return Promise.all(
        grants.map(async (grant) => {
          const workspace = await loadWorkspaceRows((grant["accounts"] ?? {}) as Row);
          const profile = workspace.account.profile;
          const next = profile ? (upcomingFilings(profile, today, 1)[0] ?? null) : null;
          return {
            accountId: workspace.account.id,
            displayName: workspace.account.displayName,
            ownerName: profile?.registeredName ?? "",
            tin: profile?.tin ?? "",
            taxTypes: profile ? taxTypesFor(profile) : [],
            nextFiling:
              next && profile
                ? { ...next, estimate: estimateFiling(next, workspace.records, profile) }
                : null,
            documentsToCheck: workspace.documents.filter((d) => d.status === "needs_review").length,
            salesThisYear: workspace.records
              .filter((r) => r.kind === "sale" && r.date.startsWith(today.slice(0, 4)))
              .reduce((sum, r) => sum + r.amount, 0),
            grantedAt: text(grant["granted_at"]),
          };
        }),
      );
    },
    () => samplePartnerClients(today),
  );
}

function toPartner(row: Row, reviews: Row[] = []): PartnerProfile {
  return {
    id: text(row["user_id"]),
    name: text(row["display_name"]),
    kind: (text(row["kind"]) || "bookkeeper") as PartnerKind,
    city: text(row["city"]),
    bio: text(row["bio"]),
    specialties: Array.isArray(row["specialties"]) ? (row["specialties"] as string[]) : [],
    yearsInPractice: typeof row["years_in_practice"] === "number" ? row["years_in_practice"] : 0,
    verified: {
      birAccreditation: Boolean(row["bir_accreditation_no"]),
      prcLicense: Boolean(row["prc_license_no"]),
      checkedOn: text(row["verified_at"]).slice(0, 10) || null,
    },
    rating: typeof row["rating_avg"] === "number" ? row["rating_avg"] : 0,
    reviewCount: typeof row["rating_count"] === "number" ? row["rating_count"] : 0,
    reviews: reviews.map((review) => ({
      id: text(review["id"]),
      rating: typeof review["rating"] === "number" ? review["rating"] : 0,
      body: text(review["body"]),
      createdAt: text(review["created_at"]).slice(0, 10),
    })),
  };
}

export function listPartners(): Promise<Loaded<PartnerProfile[]>> {
  return liveOrSample(
    async () =>
      rows<Row[]>(
        await db
          .from("partner_profiles")
          .select("*")
          .not("verified_at", "is", null)
          .order("rating_avg", { ascending: false }),
      ).map((row) => toPartner(row)),
    () => SAMPLE_PARTNERS,
  );
}

export function getPartner(partnerId: string): Promise<Loaded<PartnerProfile | null>> {
  return liveOrSample(
    async () => {
      const row = rows<Row | null>(
        await db.from("partner_profiles").select("*").eq("user_id", partnerId).maybeSingle(),
      );
      if (!row) return null;
      const reviews = rows<Row[]>(
        await db
          .from("partner_reviews")
          .select("id, rating, body, created_at")
          .eq("partner_user_id", partnerId)
          .order("created_at", { ascending: false }),
      );
      return toPartner(row, reviews);
    },
    () => SAMPLE_PARTNERS.find((partner) => partner.id === partnerId) ?? null,
  );
}

/** Lets a partner work inside the signed-in taxpayer's account. */
export async function grantPartnerAccess(partnerUserId: string): Promise<void> {
  // MISSING: needs the `partner_access` table (migration) and an account for the taxpayer.
  const { error } = await db.from("partner_access").insert({ partner_user_id: partnerUserId });
  if (error) {
    if (isNotConnected(error)) throw new NotConnectedError("Bookkeeper access");
    throw error;
  }
}

/** A review from a client the partner has worked with (checked by row-level security). */
export async function submitReview(
  partnerUserId: string,
  rating: number,
  body: string,
): Promise<void> {
  const { error } = await db
    .from("partner_reviews")
    .insert({ partner_user_id: partnerUserId, rating, body: redactPersonalInfo(body).text });
  if (error) {
    if (isNotConnected(error)) throw new NotConnectedError("Reviews");
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------------------------

/** Posts kept in this browser because the community tables are not set up yet. */
const localPosts: CommunityPost[] = [];

function toAnswer(row: Row): CommunityAnswer {
  return {
    id: text(row["id"]),
    partnerId: text(row["partner_user_id"]),
    partnerName: text(row["partner_name"]),
    partnerKind: (text(row["partner_kind"]) || "bookkeeper") as PartnerKind,
    partnerRating: typeof row["partner_rating"] === "number" ? row["partner_rating"] : 0,
    body: text(row["body"]),
    createdAt: text(row["created_at"]),
    helpful: row["helpful"] === true,
  };
}

function toPost(row: Row, answers: Row[]): CommunityPost {
  return {
    id: text(row["id"]),
    title: text(row["title"]),
    body: text(row["body"]),
    topic: text(row["topic"]),
    visibility: row["visibility"] === "members" ? "members" : "public",
    createdAt: text(row["created_at"]),
    answers: answers.filter((a) => a["post_id"] === row["id"]).map(toAnswer),
  };
}

/**
 * Community questions. Visitors get public posts only; signed-in members also get members-only
 * posts. The database view enforces the same rule and never exposes who asked.
 */
export function listPosts(signedIn: boolean): Promise<Loaded<CommunityPost[]>> {
  return liveOrSample(
    async () => {
      const posts = rows<Row[]>(
        await db
          .from("community_posts_public")
          .select("*")
          .order("created_at", { ascending: false }),
      );
      const answers = rows<Row[]>(
        await db
          .from("community_answers_public")
          .select("*")
          .in(
            "post_id",
            posts.map((p) => p["id"]),
          ),
      );
      return posts.map((post) => toPost(post, answers));
    },
    () =>
      [...localPosts, ...SAMPLE_POSTS].filter((post) => signedIn || post.visibility === "public"),
  );
}

export function getPost(postId: string, signedIn: boolean): Promise<Loaded<CommunityPost | null>> {
  return liveOrSample(
    async () => {
      const post = rows<Row | null>(
        await db.from("community_posts_public").select("*").eq("id", postId).maybeSingle(),
      );
      if (!post) return null;
      const answers = rows<Row[]>(
        await db.from("community_answers_public").select("*").eq("post_id", postId),
      );
      return toPost(post, answers);
    },
    () => {
      const post = [...localPosts, ...SAMPLE_POSTS].find((p) => p.id === postId) ?? null;
      return post && (signedIn || post.visibility === "public") ? post : null;
    },
  );
}

export interface NewPost {
  title: string;
  body: string;
  topic: string;
  visibility: PostVisibility;
}

/**
 * Saves an anonymous question. Personal details are blurred first. When the community tables
 * are not set up, the post is kept in this browser only and marked `localOnly`.
 */
export async function createPost(input: NewPost): Promise<CommunityPost> {
  const title = redactPersonalInfo(input.title).text;
  const body = redactPersonalInfo(input.body).text;
  const { data, error } = await db
    .from("community_posts")
    .insert({ title, body, topic: input.topic, visibility: input.visibility })
    .select("id, created_at")
    .single();
  if (error) {
    if (!isNotConnected(error)) throw error;
    const post: CommunityPost = {
      id: `local-${Date.now()}`,
      title,
      body,
      topic: input.topic,
      visibility: input.visibility,
      createdAt: new Date().toISOString(),
      answers: [],
      localOnly: true,
    };
    localPosts.unshift(post);
    return post;
  }
  const row = data as Row;
  return {
    ...input,
    title,
    body,
    id: text(row["id"]),
    createdAt: text(row["created_at"]),
    answers: [],
  };
}

/** A verified partner's answer, shown with their name and rating. */
export async function createAnswer(postId: string, body: string): Promise<void> {
  const { error } = await db
    .from("community_answers")
    .insert({ post_id: postId, body: redactPersonalInfo(body).text });
  if (error) {
    if (isNotConnected(error)) throw new NotConnectedError("Community answers");
    throw error;
  }
}
