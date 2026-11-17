import { describe, expect, it } from "vitest";

import type { ExtractedDocument } from "@shared/parser/schema.ts";
import type { StoredDocument } from "@/lib/data/types";

import { allTags, cleanTag, hasTag, matchesSearch, resolveTag, tagsOn, tooManyTags } from "./tags";

const reading = (changes: Partial<ExtractedDocument>): ExtractedDocument => ({
  kind: "expense_receipt",
  date: "2026-11-02",
  documentNumber: null,
  issuerName: null,
  issuerTin: null,
  recipientName: null,
  recipientTin: null,
  totalAmount: 100,
  vatAmount: null,
  currency: "PHP",
  expenseCategory: null,
  periodFrom: null,
  periodTo: null,
  incomePayment: null,
  taxWithheld: null,
  atc: null,
  confidence: { amount: 1, tin: 1, date: 1, kind: 1 },
  notes: null,
  ...changes,
});

const doc = (changes: Partial<StoredDocument> = {}): StoredDocument => ({
  id: "22222222-2222-4222-8222-222222222222",
  accountId: "11111111-1111-4111-8111-111111111111",
  kind: "expense_receipt",
  fileName: "receipt-2026-11.pdf",
  mimeType: "application/pdf",
  bytes: 31_554,
  uploadedAt: "2026-11-16T08:00:00Z",
  status: "accepted",
  pageCount: 1,
  pagesRead: 1,
  readerPath: ["fast"],
  flags: [],
  previewUrl: null,
  fileDeleted: false,
  inRun: true,
  tags: [],
  readings: [],
  ...changes,
});

describe("cleanTag and resolveTag", () => {
  it("tidies what was typed", () => {
    expect(cleanTag("  Exp   Q1 2026 ")).toBe("Exp Q1 2026");
    expect(cleanTag("rent, office")).toBe("rent office");
    expect(cleanTag("")).toBe("");
    expect(cleanTag("x".repeat(40))).toHaveLength(30);
  });

  it("uses the spelling already in use for the same tag", () => {
    expect(resolveTag("exp q1 2026", ["Exp Q1 2026", "Rent"])).toBe("Exp Q1 2026");
    expect(resolveTag(" New  Tag ", ["Rent"])).toBe("New Tag");
    expect(resolveTag("   ", ["Rent"])).toBe("");
  });
});

describe("the tags on files", () => {
  const files = [
    doc({ tags: ["Exp Q1 2026", "Rent"] }),
    doc({ tags: ["exp q1 2026"] }),
    doc({ tags: [] }),
  ];

  it("lists each tag once, whatever its case, in order", () => {
    expect(allTags(files)).toEqual(["Exp Q1 2026", "Rent"]);
    expect(allTags([])).toEqual([]);
  });

  it("says whether every chosen file has a tag or only some", () => {
    expect(tagsOn(files.slice(0, 2))).toEqual([
      { tag: "Exp Q1 2026", onAll: true },
      { tag: "Rent", onAll: false },
    ]);
  });

  it("knows a tag whatever its case", () => {
    expect(hasTag(files[1] as StoredDocument, "EXP Q1 2026")).toBe(true);
    expect(hasTag(files[2] as StoredDocument, "Rent")).toBe(false);
  });

  it("stops at 10 tags a file", () => {
    const full = doc({ tags: Array.from({ length: 10 }, (_, i) => `t${i}`) });
    expect(tooManyTags([full], "one more")).toBe(true);
    expect(tooManyTags([full], "T3")).toBe(false);
    expect(tooManyTags([doc({ tags: ["a"] })], "b")).toBe(false);
  });
});

describe("matchesSearch", () => {
  const twilio = doc({
    tags: ["Exp Q4 2026"],
    readings: [reading({ issuerName: "Twilio Inc.", documentNumber: "INV-88213" })],
  });

  it("matches everything when nothing is typed", () => {
    expect(matchesSearch(twilio, "")).toBe(true);
    expect(matchesSearch(twilio, "   ")).toBe(true);
  });

  it("finds a file by its name, whatever the case", () => {
    expect(matchesSearch(twilio, "RECEIPT")).toBe(true);
    expect(matchesSearch(twilio, "invoice.jpg")).toBe(false);
  });

  it("finds a file by who it is from, its number and its date, read by the AI", () => {
    expect(matchesSearch(twilio, "twilio")).toBe(true);
    expect(matchesSearch(twilio, "inv-88213")).toBe(true);
    expect(matchesSearch(twilio, "2026-11-02")).toBe(true);
  });

  it("finds a file by its tag, its type and its status", () => {
    expect(matchesSearch(twilio, "exp q4")).toBe(true);
    expect(matchesSearch(twilio, "purchase invoice")).toBe(true);
    expect(matchesSearch(doc({ status: "needs_review" }), "please check")).toBe(true);
  });

  it("needs every word to be found", () => {
    expect(matchesSearch(twilio, "twilio receipt")).toBe(true);
    expect(matchesSearch(twilio, "twilio rent")).toBe(false);
  });
});
