/**
 * Reads and writes the app's data in Supabase (tables from `supabase/migrations/`). When a table
 * is missing or the network is down, reads fall back to the built-in sample data and say so
 * through `source: "sample"`, and writes throw `NotConnectedError` so the screen can explain.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { upcomingFilings } from "@shared/domain/deadlines.ts";
import type { LedgerRecord } from "@shared/domain/records.ts";
import { estimateFiling } from "@shared/domain/tax-estimates.ts";
import { type TaxProfile, taxTypesFor } from "@shared/domain/tax-profile.ts";
import { redactPersonalInfo } from "@shared/community/redact.ts";
import { PRICING } from "@shared/uploads/rules.ts";
import { premiumWindowStart, tierOf } from "@shared/uploads/usage.ts";
import type { RunProgress } from "@/lib/services/uploads";
import type { CheckFlag } from "@shared/parser/checks.ts";
import {
  flagsFromTaxTypes,
  parseRegistration,
  parseTaxTypes,
} from "@shared/parser/registration.ts";
import type { LedgerRow } from "@shared/parser/ledger.ts";
import { savedReadings } from "@shared/parser/review.ts";
import type { DocumentKind, ExtractedDocument } from "@shared/parser/schema.ts";

import {
  SAMPLE_PARTNERS,
  SAMPLE_POSTS,
  sampleAccess,
  sampleAccessEvents,
  sampleConversationWith,
  sampleConversations,
  sampleInvitations,
  samplePartnerClients,
  sampleThread,
  sampleUsage,
  sampleWorkspace,
} from "./sample";
import type {
  AccessEvent,
  AccessEventAction,
  AccessGrant,
  AccessStatus,
  AccountRole,
  AccountUsage,
  ChatMessageRecord,
  CommunityAnswer,
  ConversationSummary,
  ConversationThread,
  CorDetails,
  MyPartnerProfile,
  PartnerForReview,
  PlanStatus,
  CommunityPost,
  DocumentStatus,
  Loaded,
  PartnerClientSummary,
  PartnerInvitation,
  PartnerKind,
  PartnerProfile,
  PostVisibility,
  StoredDocument,
  Workspace,
} from "./types";

// The generated types in src/integrations/supabase/types.ts are Lovable's and do not list these
// tables, so the client is used untyped here and rows are mapped by hand below.
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
 * The role a user signed up with, for choosing which screens to show. The database keeps its
 * own copy in `profiles.role`, which users cannot change, and every partner permission also
 * needs a verified partner profile, so editing this value unlocks nothing.
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
    corTaxTypes: parseTaxTypes(row["cor_tax_types"]),
  };
}

/** Statuses of a document whose reading has finished: it is never read again. */
export const READ_FINISHED: DocumentStatus[] = ["accepted", "needs_review", "rejected"];

/**
 * Pages read so far. While reading, both readers save it in extracted.reading.pagesDone; a
 * finished document has read every page.
 */
function pagesReadOf(row: Row, status: DocumentStatus, pageCount: number): number {
  if (READ_FINISHED.includes(status)) return pageCount;
  if (status !== "reading") return 0;
  const reading = (row["extracted"] as { reading?: { pagesDone?: unknown } } | null)?.reading;
  const done = Number(reading?.pagesDone ?? 0);
  return Number.isFinite(done) ? Math.min(Math.max(done, 0), pageCount) : 0;
}

function toDocument(row: Row): StoredDocument {
  const status = (text(row["status"]) || "waiting_for_reader") as DocumentStatus;
  const pageCount = typeof row["page_count"] === "number" ? Math.max(row["page_count"], 1) : 1;
  return {
    id: text(row["id"]),
    accountId: text(row["account_id"]),
    kind: (text(row["kind"]) || "unknown") as DocumentKind,
    fileName: text(row["file_name"]),
    mimeType: text(row["mime_type"]),
    bytes: typeof row["bytes"] === "number" ? row["bytes"] : 0,
    uploadedAt: text(row["created_at"]),
    status,
    pageCount,
    pagesRead: pagesReadOf(row, status, pageCount),
    readerPath: Array.isArray(row["reader_path"]) ? (row["reader_path"] as string[]) : [],
    flags: Array.isArray(row["flags"]) ? (row["flags"] as CheckFlag[]) : [],
    previewUrl: null,
    fileDeleted: Boolean(row["file_deleted_at"]),
    inRun: Boolean(row["run_id"]),
    tags: Array.isArray(row["tags"])
      ? (row["tags"] as unknown[]).filter((tag): tag is string => typeof tag === "string")
      : [],
    // While a document is being read, `extracted` holds its progress, not a reading.
    readings:
      READ_FINISHED.includes(status) && text(row["kind"]) !== "cor"
        ? savedReadings(row["extracted"])
        : [],
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

/**
 * The account columns a browser may read: the COR details. The free trial and Premium dates are
 * billing, which only the owner sees, through my_plan().
 */
const ACCOUNT_COLUMNS =
  "id, owner_user_id, tin, registered_name, trade_name, rdo_code, registered_address, line_of_business, registration_date, vat_registered, withholding_agent, income_tax_option, business_type, mixed_income, cor_document_id, cor_tax_types, created_at, updated_at";

async function loadWorkspaceRows(accountRow: Row): Promise<Workspace> {
  const accountId = text(accountRow["id"]);
  const ownerUserId = text(accountRow["owner_user_id"]);
  const [documents, records, owner] = await Promise.all([
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
    db.from("profiles").select("full_name").eq("user_id", ownerUserId).maybeSingle(),
  ]);
  const profile = toProfile(accountRow);
  return {
    account: {
      id: accountId,
      ownerUserId,
      ownerName: text((owner.data as Row | null)?.["full_name"]),
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
        await db.from("accounts").select(ACCOUNT_COLUMNS).eq("owner_user_id", userId).maybeSingle(),
      );
      if (!account) {
        return {
          account: {
            id: "",
            ownerUserId: userId,
            ownerName: "",
            displayName: "My business",
            profile: null,
            corDocumentId: null,
          },
          documents: [],
          records: [],
        };
      }
      return loadWorkspaceRows(account);
    },
    () => sampleWorkspace(todayInManila()),
  );
}

/**
 * One client's workspace, for a partner whose invitation the client sent and they accepted.
 * Row-level security enforces the access: receipts, sales, Forms 2307 and the COR, never the
 * client's plan or payments.
 */
export function loadClientWorkspace(accountId: string): Promise<Loaded<Workspace>> {
  return liveOrSample(
    async () => {
      const account = rows<Row | null>(
        await db.from("accounts").select(ACCOUNT_COLUMNS).eq("id", accountId).maybeSingle(),
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
          .select(`granted_at, accounts(${ACCOUNT_COLUMNS})`)
          .eq("partner_user_id", partnerUserId)
          .eq("status", "active"),
      );
      return Promise.all(
        grants.map(async (grant) => {
          const workspace = await loadWorkspaceRows((grant["accounts"] ?? {}) as Row);
          const profile = workspace.account.profile;
          const next = profile ? (upcomingFilings(profile, today, 1)[0] ?? null) : null;
          return {
            accountId: workspace.account.id,
            ownerUserId: workspace.account.ownerUserId,
            displayName: workspace.account.displayName,
            ownerName: workspace.account.ownerName || profile?.registeredName || "",
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

/** Runs a database function, turning "not set up" into NotConnectedError. */
async function rpc<T = unknown>(name: string, args: Record<string, unknown>, what: string) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    if (isNotConnected(error)) throw new NotConnectedError(what);
    throw error;
  }
  return data as T;
}

/**
 * Invites a verified professional into the signed-in taxpayer's account. They see nothing until
 * they accept. Creates the taxpayer's account first if they have none.
 */
export async function invitePartner(partnerUserId: string): Promise<void> {
  await rpc("invite_partner", { partner: partnerUserId }, "Invitations");
}

/** Withdraws an invitation the professional has not answered yet. */
export async function cancelPartnerInvite(partnerUserId: string): Promise<void> {
  await rpc("cancel_partner_invite", { partner: partnerUserId }, "Invitations");
}

/** Removes a professional's access to the signed-in taxpayer's account, at once. */
export async function revokePartnerAccess(partnerUserId: string): Promise<void> {
  await rpc("revoke_partner_access", { partner: partnerUserId }, "Bookkeeper access");
}

/** The signed-in professional accepts or declines a taxpayer's invitation. */
export async function respondToInvite(accountId: string, accept: boolean): Promise<void> {
  await rpc("respond_to_invite", { account: accountId, accept }, "Invitations");
}

/** A partner stops working on a client's account. */
export async function leaveClient(accountId: string): Promise<void> {
  await rpc("leave_client", { account: accountId }, "Client access");
}

/** A short, friendly reason when an invitation step is refused by the database. */
export function invitationProblem(error: unknown): string {
  if (error instanceof NotConnectedError) return `${error.message} Nothing was changed.`;
  const code = (error as { code?: string } | null)?.code;
  if (code === "P0002") return "That invitation was already answered or withdrawn.";
  if (code === "23505") return "They already have access to your account.";
  return "That did not work. Please try again.";
}

const ACCESS_STATUSES: AccessStatus[] = [
  "pending",
  "active",
  "declined",
  "cancelled",
  "revoked",
  "left",
];

/** Everyone the signed-in taxpayer invited, now or before, newest first. */
export function listMyAccess(userId: string): Promise<Loaded<AccessGrant[]>> {
  return liveOrSample(
    async () => {
      const account = rows<Row | null>(
        await db.from("accounts").select("id").eq("owner_user_id", userId).maybeSingle(),
      );
      if (!account) return [];
      const grants = rows<Row[]>(
        await db
          .from("partner_access")
          .select(
            "status, invited_at, granted_at, ended_at, partner_user_id, partner_profiles(display_name, kind, city, rating_avg, rating_count)",
          )
          .eq("account_id", text(account["id"]))
          .order("invited_at", { ascending: false }),
      );
      return grants.map((grant): AccessGrant => {
        const partner = (grant["partner_profiles"] ?? {}) as Row;
        const status = text(grant["status"]) as AccessStatus;
        return {
          partnerId: text(grant["partner_user_id"]),
          partnerName: text(partner["display_name"]) || "A professional",
          partnerKind: (text(partner["kind"]) || "bookkeeper") as PartnerKind,
          city: text(partner["city"]),
          rating: typeof partner["rating_avg"] === "number" ? partner["rating_avg"] : 0,
          reviewCount: typeof partner["rating_count"] === "number" ? partner["rating_count"] : 0,
          status: ACCESS_STATUSES.includes(status) ? status : "revoked",
          invitedAt: text(grant["invited_at"]),
          grantedAt: text(grant["granted_at"]) || null,
          endedAt: text(grant["ended_at"]) || null,
        };
      });
    },
    () => sampleAccess(todayInManila()),
  );
}

/** Invitations waiting for the signed-in professional's answer, newest first. */
export function listMyInvitations(): Promise<Loaded<PartnerInvitation[]>> {
  return liveOrSample(
    async () =>
      rows<Row[]>(await db.rpc("my_invitations")).map((row) => ({
        accountId: text(row["account_id"]),
        taxpayerUserId: text(row["taxpayer_user_id"]),
        taxpayerName: text(row["taxpayer_name"]),
        businessName: text(row["business_name"]),
        invitedAt: text(row["invited_at"]),
      })),
    () => sampleInvitations(todayInManila()),
  );
}

/**
 * The signed-in taxpayer's activity log: invitations, and what professionals opened and changed
 * in their account, newest first. Only the owner can read it.
 */
export function listAccessEvents(userId: string): Promise<Loaded<AccessEvent[]>> {
  return liveOrSample(
    async () =>
      rows<Row[]>(
        await db
          .from("access_events")
          .select("id, action, partner_user_id, actor_user_id, target_id, details, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
      ).map((row): AccessEvent => {
        const details =
          row["details"] && typeof row["details"] === "object"
            ? (row["details"] as Record<string, unknown>)
            : {};
        return {
          id: text(row["id"]),
          action: text(row["action"]) as AccessEventAction,
          partnerId: text(row["partner_user_id"]) || null,
          partnerName: text(details["partnerName"]),
          byOwner: text(row["actor_user_id"]) === userId,
          targetId: text(row["target_id"]) || null,
          details,
          createdAt: text(row["created_at"]),
        };
      }),
    () => sampleAccessEvents(todayInManila()),
  );
}

const recentLogs = new Map<string, number>();

/**
 * Adds "a professional opened this" to the client's activity log. The database ignores the
 * owner's own visits and repeats within ten minutes. Never throws: the log must not stop anyone
 * from working.
 */
export async function logAccessEvent(
  accountId: string,
  activity: "opened_account" | "opened_document",
  targetId?: string,
): Promise<void> {
  if (!accountId || accountId.startsWith("sample-")) return;
  // One call per visit, even when a screen mounts twice (the database also merges repeats).
  const key = `${accountId}:${activity}:${targetId ?? ""}`;
  const last = recentLogs.get(key) ?? 0;
  if (Date.now() - last < 60_000) return;
  recentLogs.set(key, Date.now());
  try {
    await db.rpc("log_access_event", {
      account: accountId,
      activity,
      target: targetId ?? null,
    });
  } catch {
    // Best effort.
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

/** Marks or unmarks a partner's answer as "This helped" (only the person who asked can). */
export async function markAnswerHelpful(answerId: string, helped: boolean): Promise<void> {
  await rpc("mark_answer_helpful", { answer: answerId, helped }, "Community answers");
}

/** True when the signed-in user asked this question. The author is never shown to anyone. */
export async function isMyPost(postId: string): Promise<boolean> {
  try {
    return (await rpc<boolean>("is_my_post", { post: postId }, "Community")) === true;
  } catch {
    return false;
  }
}

/** Removes the signed-in user's own question from the community. */
export async function deleteMyPost(postId: string): Promise<void> {
  await rpc("delete_my_post", { post: postId }, "Community");
}

// ---------------------------------------------------------------------------------------------
// Chat between taxpayers and partners. Messages cannot be edited or deleted: the database has
// no update or delete rights on them and a trigger refuses any change.
// ---------------------------------------------------------------------------------------------

function toConversation(row: Row, myUserId: string): ConversationSummary {
  const iAmTaxpayer = row["taxpayer_user_id"] === myUserId;
  const lastAt = text(row["last_message_at"]) || null;
  const myReadAt = text(iAmTaxpayer ? row["taxpayer_read_at"] : row["partner_read_at"]);
  const lastFromMe = row["last_sender_user_id"] === myUserId;
  return {
    id: text(row["id"]),
    otherUserId: text(iAmTaxpayer ? row["partner_user_id"] : row["taxpayer_user_id"]),
    otherName: iAmTaxpayer
      ? text(row["partner_name"]) || "A professional"
      : text(row["taxpayer_name"]) || "A client",
    otherKind: iAmTaxpayer ? ((text(row["partner_kind"]) || "bookkeeper") as PartnerKind) : null,
    lastMessage: text(row["last_body"]) || null,
    lastMessageFromMe: lastFromMe,
    lastMessageAt: lastAt,
    unread: Boolean(lastAt && !lastFromMe && lastAt > myReadAt),
  };
}

const toMessage = (row: Row): ChatMessageRecord => ({
  id: text(row["id"]),
  senderUserId: text(row["sender_user_id"]),
  body: text(row["body"]),
  createdAt: text(row["created_at"]),
});

/** The signed-in user's conversations, most recent first. */
export function listConversations(
  myUserId: string,
  role: AccountRole,
): Promise<Loaded<ConversationSummary[]>> {
  return liveOrSample(
    async () =>
      rows<Row[]>(
        await db
          .from("conversation_list")
          .select("*")
          .order("last_message_at", { ascending: false, nullsFirst: false }),
      ).map((row) => toConversation(row, myUserId)),
    () => sampleConversations(isPartner(role) ? "partner" : "taxpayer", myUserId, todayInManila()),
  );
}

/** One conversation and all its messages, oldest first. */
export function loadConversation(
  conversationId: string,
  myUserId: string,
  role: AccountRole,
): Promise<Loaded<ConversationThread | null>> {
  return liveOrSample(
    async () => {
      const row = rows<Row | null>(
        await db.from("conversation_list").select("*").eq("id", conversationId).maybeSingle(),
      );
      if (!row) return null;
      const messages = rows<Row[]>(
        await db
          .from("messages")
          .select("id, sender_user_id, body, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
      );
      return { conversation: toConversation(row, myUserId), messages: messages.map(toMessage) };
    },
    () =>
      sampleThread(
        conversationId,
        isPartner(role) ? "partner" : "taxpayer",
        myUserId,
        todayInManila(),
      ),
  );
}

/**
 * Opens the conversation with a partner (for a taxpayer) or a client (for a partner), creating
 * it if needed, and returns its id. With sample data, returns the sample conversation if any.
 */
export async function startConversation(otherUserId: string): Promise<string> {
  try {
    const id = await rpc<string>("start_conversation", { other: otherUserId }, "Chat");
    return text(id);
  } catch (error) {
    const sample = sampleConversationWith(otherUserId);
    if (error instanceof NotConnectedError && sample) return sample;
    throw error;
  }
}

/** Sends a message. It can never be edited or deleted afterwards. */
export async function sendMessage(conversationId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;
  if (conversationId.startsWith("sample-")) throw new NotConnectedError("Chat");
  const { error } = await db
    .from("messages")
    .insert({ conversation_id: conversationId, body: trimmed.slice(0, 4000) });
  if (error) {
    if (isNotConnected(error)) throw new NotConnectedError("Chat");
    throw error;
  }
}

/** Marks a conversation as read for the signed-in user. Quietly does nothing if offline. */
export async function markConversationRead(conversationId: string): Promise<void> {
  if (conversationId.startsWith("sample-")) return;
  await db.rpc("mark_conversation_read", { target: conversationId });
}

/**
 * Calls `onMessage` for each new message in a conversation (Supabase Realtime), and returns a
 * function that stops listening. Row-level security decides who receives each message.
 */
export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: ChatMessageRecord) => void,
): () => void {
  if (conversationId.startsWith("sample-")) return () => {};
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onMessage(toMessage(payload.new as Row)),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------------------------
// Partner profile (their own) and verification by Takatax staff
// ---------------------------------------------------------------------------------------------

function toMyPartnerProfile(row: Row): MyPartnerProfile {
  return {
    displayName: text(row["display_name"]),
    kind: (text(row["kind"]) || "bookkeeper") as PartnerKind,
    city: text(row["city"]),
    bio: text(row["bio"]),
    specialties: Array.isArray(row["specialties"]) ? (row["specialties"] as string[]) : [],
    yearsInPractice: typeof row["years_in_practice"] === "number" ? row["years_in_practice"] : 0,
    birAccreditationNo: text(row["bir_accreditation_no"]),
    prcLicenseNo: text(row["prc_license_no"]),
    verifiedAt: text(row["verified_at"]) || null,
  };
}

/** The signed-in partner's own profile, verified or not. */
export function loadMyPartnerProfile(
  userId: string,
  fallback: { name: string; kind: PartnerKind },
): Promise<Loaded<MyPartnerProfile | null>> {
  return liveOrSample(
    async () => {
      const row = rows<Row | null>(
        await db.from("partner_profiles").select("*").eq("user_id", userId).maybeSingle(),
      );
      return row ? toMyPartnerProfile(row) : null;
    },
    () => ({
      displayName: fallback.name,
      kind: fallback.kind,
      city: "",
      bio: "",
      specialties: [],
      yearsInPractice: 0,
      birAccreditationNo: "",
      prcLicenseNo: "",
      verifiedAt: null,
    }),
  );
}

export type PartnerProfileEdit = Omit<MyPartnerProfile, "kind" | "verifiedAt">;

/** Saves the signed-in partner's profile. Changing a licence number needs a new check. */
export async function saveMyPartnerProfile(
  userId: string,
  edit: PartnerProfileEdit,
): Promise<void> {
  const { error } = await db
    .from("partner_profiles")
    .update({
      display_name: edit.displayName.trim(),
      city: edit.city.trim(),
      bio: edit.bio.trim().slice(0, 1000),
      specialties: edit.specialties
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8),
      years_in_practice: Math.min(Math.max(Math.round(edit.yearsInPractice), 0), 80),
      bir_accreditation_no: edit.birAccreditationNo.trim() || null,
      prc_license_no: edit.prcLicenseNo.trim() || null,
    })
    .eq("user_id", userId);
  if (error) {
    if (isNotConnected(error)) throw new NotConnectedError("Partner profiles");
    throw error;
  }
}

/** True when the signed-in user is Takatax staff. */
export async function isAdmin(): Promise<boolean> {
  const { data, error } = await db.rpc("is_admin");
  return !error && data === true;
}

/** Every partner profile, unverified first, for Takatax staff. */
export async function listPartnersForReview(): Promise<PartnerForReview[]> {
  const result = rows<Row[]>(
    await db
      .from("partner_profiles")
      .select("*")
      .order("verified_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true }),
  );
  return result.map((row) => ({
    ...toMyPartnerProfile(row),
    userId: text(row["user_id"]),
    createdAt: text(row["created_at"]),
  }));
}

/** Staff approve a partner (or withdraw the approval). */
export async function verifyPartner(partnerUserId: string, approve: boolean): Promise<void> {
  await rpc("verify_partner", { partner: partnerUserId, approve }, "Partner verification");
}

// ---------------------------------------------------------------------------------------------
// COR confirmation and the plan
// ---------------------------------------------------------------------------------------------

/** The COR the reader has read but nobody has confirmed yet, with what it read. */
export async function loadCorToConfirm(
  accountId: string,
): Promise<{ documentId: string; read: Partial<CorDetails> } | null> {
  if (!accountId || accountId.startsWith("sample-")) return null;
  const { data, error } = await db
    .from("documents")
    .select("id, extracted")
    .eq("account_id", accountId)
    .eq("kind", "cor")
    .eq("status", "needs_review")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  const read = parseRegistration(row["extracted"]);
  const flags = flagsFromTaxTypes(read.taxTypes);
  return {
    documentId: text(row["id"]),
    read: {
      tin: read.tin ?? "",
      registeredName: read.registeredName ?? "",
      tradeName: read.tradeName ?? "",
      rdoCode: read.rdoCode ?? "",
      registeredAddress: read.registeredAddress ?? "",
      lineOfBusiness: read.lineOfBusiness ?? "",
      registrationDate: read.registrationDate ?? "",
      vatRegistered: read.vatRegistered || flags.vatRegistered,
      withholdingAgent: flags.withholdingAgent,
      incomeTaxOption: read.eightPercentIndicated ? "eight_percent" : "graduated_osd",
      taxTypes: read.taxTypes,
    },
  };
}

/**
 * The tier of an account the signed-in user can work on: their own, or a client's. A
 * professional gets the client's tier and nothing else about their billing. Standard when the
 * account has no Premium month running, or when it cannot be asked.
 */
export async function loadAccountTier(accountId: string): Promise<"standard" | "premium"> {
  if (!accountId || accountId.startsWith("sample-")) return "standard";
  const { data, error } = await db.rpc("account_tier", { account: accountId });
  return !error && data === "premium" ? "premium" : "standard";
}

/**
 * Saves a document as checked by the signed-in person: the corrected readings replace the AI's
 * and their ledger rows replace the old ones (database function `review_document`). Answers
 * "accepted", or "rejected" when nothing in the file is a tax document.
 */
export async function reviewDocument(
  documentId: string,
  readings: ExtractedDocument[],
  rows: LedgerRow[],
): Promise<"accepted" | "rejected"> {
  const status = await rpc<string>(
    "review_document",
    { document: documentId, reading: readings, records: rows },
    "Checking documents",
  );
  return status === "rejected" ? "rejected" : "accepted";
}

/**
 * Adds and removes tags on documents of an account (database function `tag_documents`), for the
 * owner or a professional with access. Returns how many files were changed.
 */
export async function tagDocuments(
  accountId: string,
  documentIds: string[],
  add: string[],
  remove: string[],
): Promise<number> {
  const touched = await rpc<number>(
    "tag_documents",
    { account: accountId, document_ids: documentIds, add_tags: add, remove_tags: remove },
    "Tags",
  );
  return Number(touched) || 0;
}

/** Saves the confirmed COR: this sets the account's tax types and deadlines. */
export async function confirmCor(documentId: string, details: CorDetails): Promise<void> {
  await rpc("confirm_cor", { document: documentId, details }, "COR confirmation");
}

/** The free trial, the Premium window and past payments for the signed-in user's account. */
export function loadPlan(userId: string): Promise<Loaded<PlanStatus>> {
  return liveOrSample(
    async () => {
      // Billing columns are not readable from the table; my_plan() returns the owner's only.
      const plan = rows<Row[]>(await db.rpc("my_plan"))[0];
      const account: Row | null = plan ? { ...plan, id: plan["account_id"] } : null;
      // Pages Premium still covers this month (the same window create-checkout uses).
      let premiumPagesLeft: number | null = null;
      const until = text(account?.["premium_until"]);
      if (account && until && Date.parse(until) > Date.now()) {
        const windowStart = new Date(
          premiumWindowStart(text(account["premium_started_at"]), until),
        ).toISOString();
        const used = rows<Row[]>(
          await db
            .from("runs")
            .select("page_count")
            .eq("account_id", text(account["id"]))
            .eq("kind", "premium_month")
            .gte("created_at", windowStart),
        ).reduce((sum, r) => sum + (typeof r["page_count"] === "number" ? r["page_count"] : 0), 0);
        premiumPagesLeft = Math.max(PRICING.premiumPages - used, 0);
      }
      const payments = rows<Row[]>(
        await db
          .from("payments")
          .select("id, run_id, purpose, amount_centavos, status, created_at")
          .eq("payer_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
      );
      return {
        accountId: text(account?.["id"]),
        trialUsed: account?.["trial_used"] === true,
        premiumPagesLeft,
        premiumUntil: text(account?.["premium_until"]) || null,
        payments: payments.map((p) => ({
          id: text(p["id"]),
          runId: text(p["run_id"]) || null,
          purpose: p["purpose"] === "premium_month" ? "premium_month" : "run",
          amount: money(p["amount_centavos"]),
          status: (text(p["status"]) || "pending") as PlanStatus["payments"][number]["status"],
          createdAt: text(p["created_at"]),
        })),
      };
    },
    () => ({
      accountId: "",
      trialUsed: false,
      premiumUntil: null,
      premiumPagesLeft: null,
      payments: [],
    }),
  );
}

/**
 * What an account has used of its tier: pages read and file storage, counted in the database
 * (`account_usage()`). Without an account id it is the signed-in user's own account; with one,
 * a client's account for a professional with access (who learns the tier, the pages and the
 * storage, never the plan's dates).
 */
export function loadUsage(clientAccountId?: string): Promise<Loaded<AccountUsage>> {
  return liveOrSample(
    async () => {
      // Billing columns are not readable from the table; my_plan() returns the owner's only.
      const plan = clientAccountId ? undefined : rows<Row[]>(await db.rpc("my_plan"))[0];
      const accountId = clientAccountId ?? text(plan?.["account_id"]);
      const premiumUntil = text(plan?.["premium_until"]) || null;
      const usage: AccountUsage = {
        accountId,
        tier: tierOf(premiumUntil),
        premiumUntil,
        standard: { added: 0, used: 0 },
        trialAvailable: Boolean(plan) && plan?.["trial_used"] !== true,
        premiumPagesUsed: 0,
        storageBytes: 0,
        files: 0,
      };
      // No account yet: nothing was uploaded, so nothing is used.
      if (!accountId) return { ...usage, trialAvailable: !clientAccountId };

      const counted = rows<Row[]>(await db.rpc("account_usage", { account: accountId }))[0];
      const count = (value: unknown) => Math.max(Number(value) || 0, 0);
      usage.tier = counted?.["tier"] === "premium" ? "premium" : "standard";
      usage.standard = {
        added: count(counted?.["pages_added"]),
        used: count(counted?.["pages_used"]),
      };
      usage.storageBytes = count(counted?.["storage_bytes"]);
      usage.files = count(counted?.["files"]);

      // The owner's Premium month: the window create-checkout prices by.
      if (!clientAccountId && usage.tier === "premium" && premiumUntil) {
        const windowStart = new Date(
          premiumWindowStart(text(plan?.["premium_started_at"]), premiumUntil),
        ).toISOString();
        usage.premiumPagesUsed = rows<Row[]>(
          await db
            .from("runs")
            .select("page_count")
            .eq("account_id", accountId)
            .eq("kind", "premium_month")
            .neq("status", "awaiting_payment")
            .gte("created_at", windowStart),
        ).reduce((sum, run) => sum + count(run["page_count"]), 0);
      }
      return usage;
    },
    () => sampleUsage(todayInManila()),
  );
}

/** How far the reader has got with a run, and what it produced so far. */
export async function loadRunProgress(runId: string): Promise<RunProgress | null> {
  const { data: run, error } = await db
    .from("runs")
    .select("status, page_count, pages_read")
    .eq("id", runId)
    .maybeSingle();
  if (error || !run) return null;
  // Only the progress number from `extracted`, not the whole reading.
  const { data: documents } = await db
    .from("documents")
    .select("id, file_name, status, page_count, pages_done:extracted->reading->pagesDone")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  const rowsOf = (documents ?? []) as Row[];
  const statuses = rowsOf.map((d) => text(d["status"]));
  const row = run as Row;
  return {
    status: (text(row["status"]) || "paid") as RunProgress["status"],
    pages: typeof row["page_count"] === "number" ? row["page_count"] : 0,
    pagesRead: typeof row["pages_read"] === "number" ? row["pages_read"] : 0,
    read: statuses.filter((s) => s === "accepted").length,
    needsReview: statuses.filter((s) => s === "needs_review").length,
    documents: rowsOf.map((d) => {
      const status = (text(d["status"]) || "waiting_for_reader") as DocumentStatus;
      const pages = typeof d["page_count"] === "number" ? Math.max(d["page_count"], 1) : 1;
      return {
        id: text(d["id"]),
        fileName: text(d["file_name"]),
        status,
        pages,
        pagesRead: pagesReadOf(
          { extracted: { reading: { pagesDone: d["pages_done"] } } },
          status,
          pages,
        ),
      };
    }),
  };
}
