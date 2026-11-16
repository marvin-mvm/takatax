/**
 * Built-in sample data, shown (with a "Sample data" label) until the Supabase tables exist and
 * the user has uploaded documents. Generated from a fixed seed so it is the same on every load.
 *
 * Delete this file's use in `repository.ts` once real data flows end to end.
 */

import { addDays, endOfMonth, isoDate, parseIso, quarterBounds } from "@shared/domain/dates.ts";
import { upcomingFilings } from "@shared/domain/deadlines.ts";
import { type ExpenseCategory, type LedgerRecord, round2 } from "@shared/domain/records.ts";
import { estimateFiling } from "@shared/domain/tax-estimates.ts";
import { type TaxProfile, taxTypesFor } from "@shared/domain/tax-profile.ts";
import type { CheckFlag } from "@shared/parser/checks.ts";
import type { DocumentKind } from "@shared/parser/schema.ts";

import type {
  AccessEvent,
  AccessGrant,
  AccessStatus,
  ChatMessageRecord,
  CommunityPost,
  ConversationSummary,
  ConversationThread,
  PartnerClientSummary,
  PartnerInvitation,
  PartnerProfile,
  StoredDocument,
  Workspace,
} from "./types";

/** The sample login that owns a sample business. */
const ownerOf = (accountId: string) => `sample-owner-${accountId.replace(/^sample-/, "")}`;

/** Small deterministic random number generator (mulberry32). */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface SampleBusiness {
  accountId: string;
  displayName: string;
  profile: TaxProfile;
  seed: number;
  clients: string[];
  /** Clients that withhold 2% and give a Form 2307 every quarter. */
  corporateClients: string[];
  salesPerMonth: [number, number];
  saleRange: [number, number];
  rent: number | null;
  expenses: {
    supplier: string;
    tin: string;
    category: ExpenseCategory;
    range: [number, number];
    chance: number;
  }[];
}

const BUSINESSES: SampleBusiness[] = [
  {
    accountId: "sample-dela-cruz",
    displayName: "Dela Cruz Printing Services",
    seed: 2026,
    profile: {
      tin: "123-456-789-000",
      registeredName: "Juan M. Dela Cruz",
      tradeName: "Dela Cruz Printing Services",
      rdoCode: "038",
      registeredAddress: "12 Mabini St., Brgy. Pinyahan, Quezon City",
      lineOfBusiness: "Printing and photocopying services",
      registrationDate: "2023-02-14",
      vatRegistered: false,
      withholdingAgent: true,
      incomeTaxOption: "graduated_osd",
      businessType: "services",
      mixedIncome: false,
    },
    clients: [
      "Walk-in customer",
      "Brgy. Pinyahan Hall",
      "Santos Bakery",
      "St. Joseph School",
      "Lim Trading",
    ],
    corporateClients: ["Ayala Land Events Inc.", "Northpoint Logistics Corp."],
    salesPerMonth: [6, 9],
    saleRange: [2_500, 28_000],
    rent: 18_000,
    expenses: [
      {
        supplier: "Papertech Supply Co.",
        tin: "201-334-556-000",
        category: "supplies",
        range: [4_000, 12_000],
        chance: 1,
      },
      {
        supplier: "Meralco",
        tin: "000-101-528-000",
        category: "utilities",
        range: [2_200, 4_100],
        chance: 1,
      },
      {
        supplier: "PLDT Home",
        tin: "000-488-793-000",
        category: "communication",
        range: [1_699, 1_699],
        chance: 1,
      },
      {
        supplier: "Jollibee Kamuning",
        tin: "000-388-474-000",
        category: "representation",
        range: [800, 1_600],
        chance: 0.4,
      },
      {
        supplier: "SM Hypermarket",
        tin: "000-163-656-000",
        category: "personal",
        range: [900, 2_500],
        chance: 0.3,
      },
    ],
  },
  {
    accountId: "sample-reyes-dental",
    displayName: "Reyes Dental Clinic",
    seed: 7,
    profile: {
      tin: "234-567-890-000",
      registeredName: "Dr. Maria Reyes",
      tradeName: "Reyes Dental Clinic",
      rdoCode: "047",
      registeredAddress: "Unit 3, 88 Kalayaan Ave., Makati City",
      lineOfBusiness: "Dental clinic",
      registrationDate: "2021-06-01",
      vatRegistered: false,
      withholdingAgent: true,
      incomeTaxOption: "graduated_itemized",
      businessType: "services",
      mixedIncome: false,
    },
    clients: ["Patient", "Patient", "Patient", "Maxicare HMO"],
    corporateClients: ["Maxicare Healthcare Corp."],
    salesPerMonth: [10, 14],
    saleRange: [1_500, 12_000],
    rent: 35_000,
    expenses: [
      {
        supplier: "Dentaline Supplies",
        tin: "301-224-118-000",
        category: "supplies",
        range: [8_000, 20_000],
        chance: 1,
      },
      {
        supplier: "Meralco",
        tin: "000-101-528-000",
        category: "utilities",
        range: [5_000, 8_000],
        chance: 1,
      },
      {
        supplier: "Dental Tech Lab",
        tin: "302-998-114-000",
        category: "professional_fees",
        range: [6_000, 15_000],
        chance: 0.8,
      },
    ],
  },
  {
    accountId: "sample-ana-santos",
    displayName: "Ana Santos (freelance designer)",
    seed: 99,
    profile: {
      tin: "345-678-901-000",
      registeredName: "Ana Liza Santos",
      rdoCode: "081",
      registeredAddress: "Cebu City",
      lineOfBusiness: "Graphic design services",
      registrationDate: "2024-09-10",
      vatRegistered: false,
      withholdingAgent: false,
      incomeTaxOption: "eight_percent",
      businessType: "services",
      mixedIncome: false,
    },
    clients: ["Bloom Cafe", "Island Tours Co.", "Kalye Clothing"],
    corporateClients: ["Visayas Media Group Inc."],
    salesPerMonth: [2, 4],
    saleRange: [8_000, 35_000],
    rent: null,
    expenses: [
      {
        supplier: "Adobe Systems",
        tin: "000-000-000-000",
        category: "communication",
        range: [2_800, 2_800],
        chance: 1,
      },
    ],
  },
];

const between = (rand: () => number, [low, high]: [number, number]) =>
  round2(low + rand() * (high - low));

function buildWorkspace(business: SampleBusiness, today: string): Workspace {
  const rand = random(business.seed);
  const { year, month: thisMonth } = parseIso(today);
  const records: LedgerRecord[] = [];
  const documents: StoredDocument[] = [];
  let n = 0;

  const addDocument = (
    kind: DocumentKind,
    date: string,
    name: string,
    status: StoredDocument["status"] = "accepted",
    flags: CheckFlag[] = [],
  ) => {
    const id = `${business.accountId}-doc-${++n}`;
    documents.push({
      id,
      accountId: business.accountId,
      kind,
      fileName: name,
      mimeType: kind === "form_2307" ? "application/pdf" : "image/jpeg",
      bytes: Math.round(180_000 + rand() * 900_000),
      uploadedAt: `${date}T09:00:00.000Z`,
      status,
      readerPath: status === "accepted" ? (flags.length ? ["fast", "recheck"] : ["fast"]) : [],
      flags,
      previewUrl: null,
    });
    return id;
  };

  const corId = addDocument("cor", business.profile.registrationDate, "COR-2303.jpg");

  for (let month = 1; month <= thisMonth; month++) {
    const lastDay = Number(endOfMonth(year, month).slice(8));
    const day = () =>
      Math.min(
        Math.max(1, Math.round(1 + rand() * (lastDay - 1))),
        month === thisMonth ? Number(today.slice(8)) : lastDay,
      );
    const sales = Math.round(between(rand, business.salesPerMonth));
    for (let i = 0; i < sales; i++) {
      const corporate = rand() < 0.3;
      const client = corporate
        ? (business.corporateClients[Math.floor(rand() * business.corporateClients.length)] ??
          "Client")
        : (business.clients[Math.floor(rand() * business.clients.length)] ?? "Client");
      const date = isoDate(year, month, day());
      const pending = month === thisMonth && i >= sales - 2;
      const unsure = !pending && rand() < 0.04;
      const documentId = addDocument(
        "sales_invoice",
        date,
        `SI-${String(n).padStart(4, "0")}.jpg`,
        pending ? "waiting_for_reader" : unsure ? "needs_review" : "accepted",
        unsure ? ["low_confidence"] : [],
      );
      if (pending) continue;
      records.push({
        id: `${documentId}-r`,
        documentId,
        kind: "sale",
        date,
        counterparty: client,
        description: business.profile.lineOfBusiness,
        amount: between(rand, business.saleRange),
        vat: 0,
        taxWithheld: 0,
      });
    }
    if (business.rent) {
      const date = isoDate(year, month, 5);
      const documentId = addDocument("expense_receipt", date, `Rent-${month}.jpg`);
      records.push({
        id: `${documentId}-r`,
        documentId,
        kind: "expense",
        date,
        counterparty: "Mabini Properties Inc.",
        counterpartyTin: "102-993-441-000",
        description: "Shop rent",
        category: "rent",
        amount: business.rent,
        vat: 0,
        taxWithheld: business.profile.withholdingAgent ? round2(business.rent * 0.05) : 0,
      });
    }
    for (const expense of business.expenses) {
      if (rand() > expense.chance) continue;
      const date = isoDate(year, month, day());
      const documentId = addDocument(
        "expense_receipt",
        date,
        `OR-${String(n).padStart(4, "0")}.jpg`,
      );
      records.push({
        id: `${documentId}-r`,
        documentId,
        kind: "expense",
        date,
        counterparty: expense.supplier,
        counterpartyTin: expense.tin,
        description:
          expense.category === "representation" ? "Meal with a client" : expense.supplier,
        category: expense.category,
        amount: between(rand, expense.range),
        vat: 0,
        taxWithheld: 0,
      });
    }
    // Corporate clients give a Form 2307 at the end of each finished quarter: 2% of what they paid.
    if (month % 3 === 0 && month < thisMonth + 1) {
      const quarter = (month / 3) as 1 | 2 | 3 | 4;
      const { start, end } = quarterBounds(year, quarter);
      for (const client of business.corporateClients) {
        const paid = records
          .filter(
            (r) =>
              r.kind === "sale" && r.counterparty === client && r.date >= start && r.date <= end,
          )
          .reduce((sum, r) => sum + r.amount, 0);
        if (paid <= 0 || end > today) continue;
        const documentId = addDocument(
          "form_2307",
          end,
          `2307-Q${quarter}-${client.split(" ")[0]}.pdf`,
        );
        records.push({
          id: `${documentId}-r`,
          documentId,
          kind: "withholding",
          date: end,
          counterparty: client,
          description: `Form 2307, Q${quarter} ${year}`,
          amount: round2(paid),
          vat: 0,
          taxWithheld: round2(paid * 0.02),
        });
      }
    }
  }

  return {
    account: {
      id: business.accountId,
      ownerUserId: ownerOf(business.accountId),
      ownerName: business.profile.registeredName,
      displayName: business.displayName,
      profile: business.profile,
      corDocumentId: corId,
    },
    documents: documents.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    records: records.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function sampleWorkspace(today: string, accountId = "sample-dela-cruz"): Workspace {
  const business = BUSINESSES.find((b) => b.accountId === accountId) ?? BUSINESSES[0];
  if (!business) throw new Error("No sample business");
  return buildWorkspace(business, today);
}

export function samplePartnerClients(today: string): PartnerClientSummary[] {
  return BUSINESSES.map((business, index) => {
    const workspace = buildWorkspace(business, today);
    const profile = business.profile;
    const next = upcomingFilings(profile, today, 1)[0] ?? null;
    return {
      accountId: business.accountId,
      ownerUserId: ownerOf(business.accountId),
      displayName: business.displayName,
      ownerName: profile.registeredName,
      tin: profile.tin,
      taxTypes: taxTypesFor(profile),
      nextFiling: next
        ? { ...next, estimate: estimateFiling(next, workspace.records, profile) }
        : null,
      documentsToCheck: workspace.documents.filter((d) => d.status === "needs_review").length,
      salesThisYear: round2(
        workspace.records.filter((r) => r.kind === "sale").reduce((s, r) => s + r.amount, 0),
      ),
      grantedAt: isoDate(Number(today.slice(0, 4)), 1, 3 + index * 9),
    };
  });
}

export const SAMPLE_PARTNERS: PartnerProfile[] = [
  {
    id: "sample-partner-1",
    name: "Liza Mendoza",
    kind: "bookkeeper",
    city: "Quezon City",
    bio: "Bookkeeper for sari-sari stores, printing shops and food stalls since 2014. I file on time and explain every figure in Filipino or English.",
    specialties: ["Sole proprietors", "Percentage tax", "Books of accounts"],
    yearsInPractice: 12,
    verified: { birAccreditation: true, prcLicense: false, checkedOn: "2026-09-02" },
    rating: 4.8,
    reviewCount: 37,
    reviews: [
      {
        id: "rv1",
        rating: 5,
        body: "Fixed two years of missed 2551Qs and explained the penalties clearly.",
        createdAt: "2026-08-12",
      },
      {
        id: "rv2",
        rating: 5,
        body: "Fast replies, and she checked my 2307s against my sales.",
        createdAt: "2026-06-30",
      },
      {
        id: "rv3",
        rating: 4,
        body: "Helpful. Busy near deadlines, so message early.",
        createdAt: "2026-05-02",
      },
    ],
  },
  {
    id: "sample-partner-2",
    name: "Paolo Garcia, CPA",
    kind: "cpa",
    city: "Makati City",
    bio: "CPA for clinics and professionals. Itemized deductions, audits and annual financial statements.",
    specialties: ["Clinics", "Itemized deductions", "Annual ITR"],
    yearsInPractice: 9,
    verified: { birAccreditation: true, prcLicense: true, checkedOn: "2026-08-20" },
    rating: 4.9,
    reviewCount: 52,
    reviews: [
      {
        id: "rv4",
        rating: 5,
        body: "Saved me from claiming personal expenses. Clear and patient.",
        createdAt: "2026-07-19",
      },
      {
        id: "rv5",
        rating: 5,
        body: "Prepared my audited financial statements on time.",
        createdAt: "2026-04-10",
      },
    ],
  },
  {
    id: "sample-partner-3",
    name: "Atty. Carmela Uy",
    kind: "tax_lawyer",
    city: "Pasig City",
    bio: "Tax lawyer for BIR letters, assessments and registration problems.",
    specialties: ["BIR letters", "Assessments", "Registration"],
    yearsInPractice: 15,
    verified: { birAccreditation: true, prcLicense: false, checkedOn: "2026-07-11" },
    rating: 4.7,
    reviewCount: 18,
    reviews: [
      {
        id: "rv6",
        rating: 5,
        body: "Handled a Letter of Authority calmly and quickly.",
        createdAt: "2026-03-22",
      },
    ],
  },
  {
    id: "sample-partner-4",
    name: "Ramon Villanueva",
    kind: "bookkeeper",
    city: "Cebu City",
    bio: "Freelancer and online seller taxes. 8% option, 2307s and quarterly returns.",
    specialties: ["Freelancers", "8% option", "Online sellers"],
    yearsInPractice: 6,
    verified: { birAccreditation: true, prcLicense: false, checkedOn: "2026-09-15" },
    rating: 4.6,
    reviewCount: 24,
    reviews: [
      {
        id: "rv7",
        rating: 5,
        body: "Explained the ₱250,000 reduction so I finally understood my 1701Q.",
        createdAt: "2026-08-01",
      },
    ],
  },
];

export const SAMPLE_POSTS: CommunityPost[] = [
  {
    id: "sample-post-1",
    title: "Do I still file 2551Q if I chose the 8% option?",
    body: "I registered this year and picked the 8% option on my first 1701Q. My friend says I still need to file percentage tax every quarter. Is that right?",
    topic: "Percentage tax",
    visibility: "public",
    createdAt: "2026-10-28T08:12:00.000Z",
    answers: [
      {
        id: "sample-answer-1",
        partnerId: "sample-partner-4",
        partnerName: "Ramon Villanueva",
        partnerKind: "bookkeeper",
        partnerRating: 4.6,
        body: "No. The 8% income tax is in lieu of the graduated rates and the 3% percentage tax, so you do not file 2551Q while you are on the 8% option. Keep filing 1701Q each quarter and the annual 1701A.",
        createdAt: "2026-10-28T10:40:00.000Z",
        helpful: true,
      },
    ],
  },
  {
    id: "sample-post-2",
    title: "Client gave me a 2307 late. Can I still claim it?",
    body: "A client sent my Q2 2307 only in October. I already filed my Q2 1701Q. What do I do?",
    topic: "Form 2307",
    visibility: "public",
    createdAt: "2026-10-15T03:20:00.000Z",
    answers: [
      {
        id: "sample-answer-2",
        partnerId: "sample-partner-1",
        partnerName: "Liza Mendoza",
        partnerKind: "bookkeeper",
        partnerRating: 4.8,
        body: "You can claim it on a later quarterly return or on the annual return for the same year, as long as the income it covers was declared. Keep the 2307 with your records and list it in the SAWT of the return where you claim it.",
        createdAt: "2026-10-15T07:02:00.000Z",
        helpful: false,
      },
      {
        id: "sample-answer-3",
        partnerId: "sample-partner-2",
        partnerName: "Paolo Garcia, CPA",
        partnerKind: "cpa",
        partnerRating: 4.9,
        body: "Agree with Liza. Also ask the client to send 2307s within 20 days after each quarter next time; it is their duty.",
        createdAt: "2026-10-16T01:15:00.000Z",
        helpful: false,
      },
    ],
  },
  {
    id: "sample-post-3",
    title: "Are meals with clients deductible?",
    body: "I use itemized deductions. I take clients out for lunch every month. Can I deduct all of it?",
    topic: "Deductions",
    visibility: "public",
    createdAt: "2026-09-30T05:45:00.000Z",
    answers: [
      {
        id: "sample-answer-4",
        partnerId: "sample-partner-2",
        partnerName: "Paolo Garcia, CPA",
        partnerKind: "cpa",
        partnerRating: 4.9,
        body: "Only up to a cap: 1% of net revenue for services, 0.5% of net sales for goods (RR 10-2002). Keep the official receipts addressed to your name and TIN.",
        createdAt: "2026-09-30T09:30:00.000Z",
        helpful: true,
      },
    ],
  },
  {
    id: "sample-post-4",
    title: "I received a BIR letter about unfiled returns. Should I panic?",
    body: "I stopped filing last year because I did not understand the forms. Now I got a letter. What should I do first?",
    topic: "BIR letters",
    visibility: "members",
    createdAt: "2026-11-02T11:00:00.000Z",
    answers: [
      {
        id: "sample-answer-5",
        partnerId: "sample-partner-3",
        partnerName: "Atty. Carmela Uy",
        partnerKind: "tax_lawyer",
        partnerRating: 4.7,
        body: "Do not ignore it, and note the deadline on the letter. Gather what you have, then talk to a professional before replying. Micro taxpayers now pay a lower 10% surcharge and 6% interest under the Ease of Paying Taxes Act.",
        createdAt: "2026-11-02T13:30:00.000Z",
        helpful: false,
      },
    ],
  },
  {
    id: "sample-post-5",
    title: "How do I know if I am a withholding agent?",
    body: "I rent a small shop from a corporation. Do I need to withhold tax from my rent?",
    topic: "Withholding",
    visibility: "public",
    createdAt: "2026-08-21T02:10:00.000Z",
    answers: [],
  },
];

// ---------------------------------------------------------------------------------------------
// Access and chat
// ---------------------------------------------------------------------------------------------

/** Professionals with access to the sample taxpayer's account: two now, one in the past. */
export function sampleAccess(today: string): AccessGrant[] {
  const year = Number(today.slice(0, 4));
  const grant = (
    partnerId: string,
    status: AccessStatus,
    invitedAt: string,
    grantedAt: string | null,
    endedAt: string | null,
  ): AccessGrant => {
    const partner = SAMPLE_PARTNERS.find((p) => p.id === partnerId);
    if (!partner) throw new Error(`No sample partner ${partnerId}`);
    return {
      partnerId,
      partnerName: partner.name,
      partnerKind: partner.kind,
      city: partner.city,
      rating: partner.rating,
      reviewCount: partner.reviewCount,
      status,
      invitedAt,
      grantedAt,
      endedAt,
    };
  };
  return [
    grant("sample-partner-3", "pending", addDays(today, -2), null, null),
    grant("sample-partner-2", "active", isoDate(year, 4, 1), isoDate(year, 4, 2), null),
    grant("sample-partner-1", "active", isoDate(year, 1, 7), isoDate(year, 1, 8), null),
    grant(
      "sample-partner-4",
      "revoked",
      isoDate(year - 1, 3, 14),
      isoDate(year - 1, 3, 15),
      isoDate(year - 1, 12, 20),
    ),
  ];
}

/** An invitation for the sample partner view. */
export function sampleInvitations(today: string): PartnerInvitation[] {
  return [
    {
      accountId: "sample-invite-lopez",
      taxpayerUserId: "sample-owner-lopez",
      taxpayerName: "Maria Lopez",
      businessName: "Lopez Sari-Sari Store",
      invitedAt: `${addDays(today, -1)}T08:30:00+08:00`,
    },
  ];
}

/** The sample taxpayer's activity log, newest first. */
export function sampleAccessEvents(today: string): AccessEvent[] {
  const year = Number(today.slice(0, 4));
  const name = (partnerId: string) => SAMPLE_PARTNERS.find((p) => p.id === partnerId)?.name ?? "";
  let next = 0;
  const event = (
    partnerId: string,
    action: AccessEvent["action"],
    day: string,
    time: string,
    details: Record<string, unknown> = {},
    byOwner = false,
  ): AccessEvent => ({
    id: `sample-event-${++next}`,
    action,
    partnerId,
    partnerName: name(partnerId),
    byOwner,
    targetId: null,
    details,
    createdAt: `${day}T${time}:00+08:00`,
  });
  const yesterday = addDays(today, -1);
  const threeDaysAgo = addDays(today, -3);
  const receipt = (fileName: string) => ({
    fileName,
    documentKind: "form_2307",
    pages: 1,
  });
  return [
    event("sample-partner-1", "edited_record", yesterday, "10:05", {
      kind: "expense",
      counterparty: "Shell Gasoline Station",
      recordDate: addDays(today, -20),
      changes: { amount_centavos: { from: 125000, to: 152000 } },
    }),
    event("sample-partner-1", "opened_document", yesterday, "09:51", {
      fileName: "receipt-shell-oct.jpg",
      documentKind: "expense_receipt",
    }),
    event("sample-partner-1", "opened_account", yesterday, "09:48"),
    event("sample-partner-3", "invited", addDays(today, -2), "08:02", {}, true),
    event("sample-partner-2", "started_reading", threeDaysAgo, "15:26", {
      documents: 3,
      pages: 3,
    }),
    event(
      "sample-partner-2",
      "uploaded_document",
      threeDaysAgo,
      "15:24",
      receipt("2307-acme-q3.pdf"),
    ),
    event(
      "sample-partner-2",
      "uploaded_document",
      threeDaysAgo,
      "15:23",
      receipt("2307-bpo-q3.pdf"),
    ),
    event(
      "sample-partner-2",
      "uploaded_document",
      threeDaysAgo,
      "15:22",
      receipt("2307-cafe-q3.pdf"),
    ),
    event("sample-partner-2", "accepted", isoDate(year, 4, 2), "11:40"),
    event("sample-partner-2", "invited", isoDate(year, 4, 1), "19:12", {}, true),
    event("sample-partner-1", "confirmed_cor", isoDate(year, 1, 9), "14:03", {
      changes: {
        income_tax_option: { from: "graduated_osd", to: "eight_percent" },
        rdo_code: { from: null, to: "043" },
      },
    }),
    event("sample-partner-1", "accepted", isoDate(year, 1, 8), "09:15"),
    event("sample-partner-1", "invited", isoDate(year, 1, 7), "21:30", {}, true),
    event("sample-partner-4", "access_removed", isoDate(year - 1, 12, 20), "16:45", {}, true),
  ];
}

interface SampleChat {
  id: string;
  /** For the taxpayer view: the partner. For the partner view: the sample client. */
  partnerId: string;
  clientAccountId: string;
  lines: { from: "taxpayer" | "partner"; body: string; daysAgo: number; minute: number }[];
}

const SAMPLE_CHATS: SampleChat[] = [
  {
    id: "sample-chat-1",
    partnerId: "sample-partner-1",
    clientAccountId: "sample-dela-cruz",
    lines: [
      {
        from: "taxpayer",
        body: "Hi Liza! I uploaded my September receipts. Can you check the 2551Q before I file?",
        daysAgo: 3,
        minute: 2,
      },
      {
        from: "partner",
        body: "Hi! Yes, I can see them. Two receipts have no TIN, so I left them out of the expenses for now.",
        daysAgo: 3,
        minute: 40,
      },
      {
        from: "taxpayer",
        body: "Thanks. I will ask the supplier for official receipts.",
        daysAgo: 2,
        minute: 15,
      },
      {
        from: "partner",
        body: "Great. Your percentage tax for the quarter looks right. File by the 25th.",
        daysAgo: 1,
        minute: 5,
      },
    ],
  },
  {
    id: "sample-chat-2",
    partnerId: "sample-partner-2",
    clientAccountId: "sample-reyes-dental",
    lines: [
      {
        from: "partner",
        body: "Good morning, Doc. I added the clinic's 2307s from HMO payments to your SAWT.",
        daysAgo: 6,
        minute: 10,
      },
      {
        from: "taxpayer",
        body: "Thank you! Do I still need to send the paper copies?",
        daysAgo: 6,
        minute: 55,
      },
    ],
  },
];

function chatMessages(
  chat: SampleChat,
  me: "taxpayer" | "partner",
  myUserId: string,
  today: string,
) {
  const base = new Date(`${today}T09:00:00+08:00`).getTime();
  const other = me === "taxpayer" ? chat.partnerId : ownerOf(chat.clientAccountId);
  return chat.lines.map((line, index): ChatMessageRecord => ({
    id: `${chat.id}-${index}`,
    senderUserId: line.from === me ? myUserId : other,
    body: line.body,
    createdAt: new Date(base - line.daysAgo * 86_400_000 + line.minute * 60_000).toISOString(),
  }));
}

function chatSummary(
  chat: SampleChat,
  me: "taxpayer" | "partner",
  myUserId: string,
  today: string,
): ConversationSummary {
  const messages = chatMessages(chat, me, myUserId, today);
  const last = messages.at(-1) ?? null;
  const partner = SAMPLE_PARTNERS.find((p) => p.id === chat.partnerId);
  const client = BUSINESSES.find((b) => b.accountId === chat.clientAccountId);
  return {
    id: chat.id,
    otherUserId: me === "taxpayer" ? chat.partnerId : ownerOf(chat.clientAccountId),
    otherName: me === "taxpayer" ? (partner?.name ?? "") : (client?.profile.registeredName ?? ""),
    otherKind: me === "taxpayer" ? (partner?.kind ?? null) : null,
    lastMessage: last?.body ?? null,
    lastMessageFromMe: last?.senderUserId === myUserId,
    lastMessageAt: last?.createdAt ?? null,
    unread: last ? last.senderUserId !== myUserId : false,
  };
}

/** Sample conversations for the chat list. */
export function sampleConversations(
  role: "taxpayer" | "partner",
  myUserId: string,
  today: string,
): ConversationSummary[] {
  return SAMPLE_CHATS.map((chat) => chatSummary(chat, role, myUserId, today));
}

/** One sample conversation with its messages. */
export function sampleThread(
  conversationId: string,
  role: "taxpayer" | "partner",
  myUserId: string,
  today: string,
): ConversationThread | null {
  const chat = SAMPLE_CHATS.find((c) => c.id === conversationId);
  if (!chat) return null;
  return {
    conversation: { ...chatSummary(chat, role, myUserId, today), unread: false },
    messages: chatMessages(chat, role, myUserId, today),
  };
}

/** The sample conversation with a partner or client, if there is one. */
export function sampleConversationWith(otherUserId: string): string | null {
  return (
    SAMPLE_CHATS.find(
      (c) => c.partnerId === otherUserId || ownerOf(c.clientAccountId) === otherUserId,
    )?.id ?? null
  );
}
