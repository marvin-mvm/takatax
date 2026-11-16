/** The app's data shapes. Database rows are mapped to these in `repository.ts`. */

import type { Filing } from "@shared/domain/deadlines.ts";
import type { LedgerRecord } from "@shared/domain/records.ts";
import type { FilingEstimate } from "@shared/domain/tax-estimates.ts";
import type { TaxProfile, TaxTypeId } from "@shared/domain/tax-profile.ts";
import type { CheckFlag } from "@shared/parser/checks.ts";
import type { DocumentKind } from "@shared/parser/schema.ts";

/** Who a signed-in user is. Partners see clients; taxpayers see their own books. */
export type AccountRole = "taxpayer" | "bookkeeper" | "cpa" | "tax_lawyer";
export type PartnerKind = Exclude<AccountRole, "taxpayer">;

export const PARTNER_KIND_LABEL: Record<PartnerKind, string> = {
  bookkeeper: "Bookkeeper",
  cpa: "CPA",
  tax_lawyer: "Tax lawyer",
};

/** "live" when the data came from Supabase; "sample" when it is the built-in example. */
export type DataSource = "live" | "sample";

export interface Loaded<T> {
  data: T;
  source: DataSource;
}

export type DocumentStatus =
  | "waiting_for_storage"
  | "waiting_for_reader"
  | "reading"
  | "accepted"
  | "needs_review"
  | "rejected";

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  waiting_for_storage: "Not uploaded yet",
  waiting_for_reader: "Waiting to be read",
  reading: "Reading",
  accepted: "Read",
  needs_review: "Please check",
  rejected: "Not counted",
};

export interface StoredDocument {
  id: string;
  accountId: string;
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  bytes: number;
  uploadedAt: string;
  status: DocumentStatus;
  /** Which reader steps ran, for example ["fast", "recheck"]. */
  readerPath: string[];
  flags: CheckFlag[];
  /** A short-lived link to the file in storage. Null until storage is connected. */
  previewUrl: string | null;
}

export interface TaxpayerAccount {
  id: string;
  /** The taxpayer who owns the account (for messaging them). Empty for sample data. */
  ownerUserId: string;
  /** The owner's own name, when the viewer may see it. */
  ownerName: string;
  /** Business or trade name to show in lists. */
  displayName: string;
  /** Null until the COR has been uploaded and confirmed. */
  profile: TaxProfile | null;
  corDocumentId: string | null;
}

/** Everything the taxpayer screens need for one account. */
export interface Workspace {
  account: TaxpayerAccount;
  documents: StoredDocument[];
  records: LedgerRecord[];
}

export interface PartnerClientSummary {
  accountId: string;
  /** The client's login, to message them. */
  ownerUserId: string;
  displayName: string;
  ownerName: string;
  tin: string;
  taxTypes: TaxTypeId[];
  nextFiling: (Filing & { estimate: FilingEstimate }) | null;
  documentsToCheck: number;
  salesThisYear: number;
  grantedAt: string;
}

export interface Review {
  id: string;
  rating: number;
  body: string;
  createdAt: string;
}

export interface PartnerProfile {
  id: string;
  name: string;
  kind: PartnerKind;
  city: string;
  bio: string;
  specialties: string[];
  yearsInPractice: number;
  /** What Takatax checked, shown on the verified badge. */
  verified: { birAccreditation: boolean; prcLicense: boolean; checkedOn: string | null };
  rating: number;
  reviewCount: number;
  reviews: Review[];
}

export interface CommunityAnswer {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerKind: PartnerKind;
  partnerRating: number;
  body: string;
  createdAt: string;
  /** Marked "This helped" by the person who asked. */
  helpful: boolean;
}

export type PostVisibility = "public" | "members";

export interface CommunityPost {
  id: string;
  title: string;
  body: string;
  topic: string;
  visibility: PostVisibility;
  createdAt: string;
  answers: CommunityAnswer[];
  /** True when the post was kept in this browser only because the database is not connected. */
  localOnly?: boolean;
}

/** A conversation between a taxpayer and a bookkeeper, CPA or tax lawyer. */
export interface ConversationSummary {
  id: string;
  /** The other person: the partner for a taxpayer, the taxpayer for a partner. */
  otherUserId: string;
  otherName: string;
  /** Set when the other person is a partner. */
  otherKind: PartnerKind | null;
  lastMessage: string | null;
  lastMessageFromMe: boolean;
  lastMessageAt: string | null;
  unread: boolean;
}

/** One chat message. Messages can never be edited or deleted once sent. */
export interface ChatMessageRecord {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

export interface ConversationThread {
  conversation: ConversationSummary;
  messages: ChatMessageRecord[];
}

/**
 * Where an invitation stands. "pending": waiting for the professional; "active": they accepted
 * and can see the account; the rest are ended (declined, cancelled by the taxpayer, access
 * removed by the taxpayer, or the professional left).
 */
export type AccessStatus = "pending" | "active" | "declined" | "cancelled" | "revoked" | "left";

/** A professional the signed-in taxpayer invited (now or before). */
export interface AccessGrant {
  partnerId: string;
  partnerName: string;
  partnerKind: PartnerKind;
  city: string;
  rating: number;
  reviewCount: number;
  status: AccessStatus;
  invitedAt: string;
  /** When they accepted; null until then (and for invitations that were never accepted). */
  grantedAt: string | null;
  /** When the invitation or the access ended; null while pending or active. */
  endedAt: string | null;
}

/** An invitation waiting for the signed-in professional's answer. */
export interface PartnerInvitation {
  accountId: string;
  taxpayerUserId: string;
  taxpayerName: string;
  businessName: string;
  invitedAt: string;
}

/** What can appear in a taxpayer's activity log. */
export type AccessEventAction =
  | "invited"
  | "invite_cancelled"
  | "accepted"
  | "declined"
  | "access_removed"
  | "left"
  | "opened_account"
  | "opened_document"
  | "asked_assistant"
  | "uploaded_document"
  | "started_reading"
  | "edited_record"
  | "confirmed_cor";

/** One entry in the taxpayer's activity log. Entries can never be changed. */
export interface AccessEvent {
  id: string;
  action: AccessEventAction;
  /** The professional the entry is about (null if they deleted their account). */
  partnerId: string | null;
  partnerName: string;
  /** True when the taxpayer did it (invited, cancelled, removed access). */
  byOwner: boolean;
  /** The document or record it concerns, if any. */
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

/** A partner's own profile, as they edit it (including details that are not public). */
export interface MyPartnerProfile {
  displayName: string;
  kind: PartnerKind;
  city: string;
  bio: string;
  specialties: string[];
  yearsInPractice: number;
  birAccreditationNo: string;
  prcLicenseNo: string;
  verifiedAt: string | null;
}

/** A partner waiting for (or holding) verification, as Takatax staff see them. */
export interface PartnerForReview extends MyPartnerProfile {
  userId: string;
  createdAt: string;
}

/** The fields a person confirms from their COR (BIR Form 2303). */
export interface CorDetails {
  tin: string;
  registeredName: string;
  tradeName: string;
  rdoCode: string;
  registeredAddress: string;
  lineOfBusiness: string;
  registrationDate: string;
  vatRegistered: boolean;
  withholdingAgent: boolean;
  incomeTaxOption: "eight_percent" | "graduated_osd" | "graduated_itemized";
  businessType: "services" | "goods";
  mixedIncome: boolean;
}

/** The account's plan: free trial, Premium window and past payments. */
export interface PlanStatus {
  /** Empty until the account exists (first upload or first payment). */
  accountId: string;
  trialUsed: boolean;
  premiumUntil: string | null;
  /** Pages Premium still covers this month; null without an active Premium month. */
  premiumPagesLeft: number | null;
  payments: {
    id: string;
    /** For a run that was never paid, so the payment can be tried again. */
    runId: string | null;
    purpose: "run" | "premium_month";
    amount: number;
    status: "pending" | "paid" | "failed" | "expired";
    createdAt: string;
  }[];
}
