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
