import { describe, expect, it } from "vitest";

import {
  ACTION_GROUP,
  describeAccessEvent,
  describeChanges,
  describeGroup,
  groupAccessEvents,
} from "./access-log";
import { sampleAccessEvents } from "./sample";
import type { AccessEvent, AccessEventAction } from "./types";

let next = 0;
function event(
  action: AccessEventAction,
  createdAt: string,
  details: Record<string, unknown> = {},
  partnerId = "p1",
): AccessEvent {
  return {
    id: `e${++next}`,
    action,
    partnerId,
    partnerName: partnerId === "p1" ? "Liza Mendoza" : "Paolo Garcia, CPA",
    byOwner: false,
    targetId: null,
    details,
    createdAt,
  };
}

describe("describeAccessEvent", () => {
  it("says what a professional deleted, and how many records went with it", () => {
    const deleted = describeAccessEvent(
      event("deleted_document", "2026-11-17T01:00:00Z", {
        fileName: "rent.jpg",
        documentKind: "expense_receipt",
        records: 1,
      }),
    );
    expect(deleted.title).toBe("Liza Mendoza deleted rent.jpg");
    expect(deleted.lines.join(" ")).toContain("1 record removed from your tracker");
    expect(ACTION_GROUP.deleted_document).toBe("changed");
  });

  it("says what a professional checked, and what that put in the tracker", () => {
    const checked = describeAccessEvent(
      event("checked_document", "2026-11-17T03:00:00Z", {
        fileName: "photo.jpg",
        documentKind: "expense_receipt",
        records: 1,
      }),
    );
    expect(checked.title).toBe("Liza Mendoza checked photo.jpg");
    expect(checked.lines).toEqual(["Receipt or purchase invoice, 1 record saved to your tracker"]);
    expect(ACTION_GROUP.checked_document).toBe("changed");

    const notCounted = describeAccessEvent(
      event("checked_document", "2026-11-17T03:05:00Z", {
        fileName: "selfie.jpg",
        documentKind: "unknown",
        records: 0,
      }),
    );
    expect(notCounted.lines).toEqual(["marked as not a tax document, so nothing is counted"]);
  });

  it("says which tags a professional put on or took off files", () => {
    const tagged = describeAccessEvent(
      event("tagged_documents", "2026-11-17T04:00:00Z", {
        documents: 3,
        added: ["Exp Q1 2026"],
        removed: [],
      }),
    );
    expect(tagged.title).toBe("Liza Mendoza changed the tags of 3 files");
    expect(tagged.lines).toEqual(["Added: Exp Q1 2026"]);
    expect(ACTION_GROUP.tagged_documents).toBe("changed");
    expect(
      describeAccessEvent(
        event("tagged_documents", "2026-11-17T04:05:00Z", { documents: 1, removed: ["Rent"] }),
      ).lines,
    ).toEqual(["Removed: Rent"]);
  });

  it("tells a kept-records deletion apart from deleting the file only", () => {
    const fileOnly = describeAccessEvent(
      event("deleted_document", "2026-11-17T01:00:00Z", {
        fileName: "rent.jpg",
        documentKind: "expense_receipt",
        records: 0,
        recordsKept: true,
      }),
    );
    expect(fileOnly.title).toBe("Liza Mendoza deleted rent.jpg");
    expect(fileOnly.lines.join(" ")).toContain("file only, its records were kept");
    const recordsOnly = describeAccessEvent(
      event("deleted_document", "2026-11-17T02:00:00Z", {
        fileName: "rent.jpg",
        documentKind: "expense_receipt",
        records: 2,
        recordsOnly: true,
      }),
    );
    expect(recordsOnly.title).toBe("Liza Mendoza deleted the parsed records of rent.jpg");
    expect(recordsOnly.lines.join(" ")).toContain("2 records removed from your tracker");
  });

  it("names the professional and the file", () => {
    const opened = describeAccessEvent(
      event("opened_document", "2026-11-15T01:00:00Z", {
        fileName: "receipt.jpg",
        documentKind: "expense_receipt",
      }),
    );
    expect(opened.title).toBe("Liza Mendoza opened receipt.jpg");
    expect(opened.lines).toEqual(["Receipt or purchase invoice"]);
  });

  it("shows corrected figures in pesos, old to new", () => {
    const edited = describeAccessEvent(
      event("edited_record", "2026-11-15T01:00:00Z", {
        kind: "expense",
        counterparty: "Shell",
        recordDate: "2026-10-03",
        changes: {
          amount_centavos: { from: 125000, to: 152000 },
          category: { from: null, to: "Fuel" },
          updated_at: { from: "a", to: "b" },
        },
      }),
    );
    expect(edited.title).toBe("Liza Mendoza corrected an expense (Shell, Oct 3, 2026)");
    expect(edited.lines).toEqual(["Amount: ₱1,250.00 → ₱1,520.00", "Category: (empty) → Fuel"]);
  });

  it("explains COR changes in words", () => {
    expect(
      describeChanges({
        changes: {
          income_tax_option: { from: "graduated_osd", to: "eight_percent" },
          vat_registered: { from: false, to: true },
          tin: { from: null, to: "987654321000" },
        },
      }),
    ).toEqual([
      "Income tax option: Graduated rates with the 40% standard deduction (OSD) → 8% of gross sales",
      "VAT registered: No → Yes",
      "TIN: (empty) → 987-654-321-000",
    ]);
  });

  it("speaks to the owner about their own steps", () => {
    const invited = { ...event("invited", "2026-11-15T01:00:00Z"), byOwner: true };
    expect(describeAccessEvent(invited).title).toBe("You invited Liza Mendoza to your account");
    expect(describeAccessEvent(event("declined", "2026-11-15T01:00:00Z")).title).toBe(
      "Liza Mendoza declined your invitation",
    );
  });

  it("still reads when the professional's name is gone", () => {
    const gone = { ...event("left", "2026-11-15T01:00:00Z"), partnerId: null, partnerName: "" };
    expect(describeAccessEvent(gone).title).toBe("A professional stopped working on your account");
  });

  it("has a sentence and a group for every action", () => {
    for (const action of Object.keys(ACTION_GROUP) as AccessEventAction[]) {
      expect(describeAccessEvent(event(action, "2026-11-15T01:00:00Z")).title).not.toBe("");
    }
  });
});

describe("groupAccessEvents", () => {
  it("folds a run of uploads by one professional into one line", () => {
    const uploads = [0, 1, 2, 3, 4, 5, 6].map((minute) =>
      event("uploaded_document", `2026-11-15T01:${String(20 - minute).padStart(2, "0")}:00Z`, {
        fileName: `2307-${minute}.pdf`,
      }),
    );
    const groups = groupAccessEvents(uploads);
    expect(groups).toHaveLength(1);
    const { title, lines } = describeGroup(groups[0]!);
    expect(title).toBe("Liza Mendoza uploaded 7 documents");
    expect(lines[0]).toBe("2307-0.pdf, 2307-1.pdf, 2307-2.pdf, 2307-3.pdf, 2307-4.pdf and 2 more");
  });

  it("keeps different people, actions and far-apart times apart", () => {
    const groups = groupAccessEvents([
      event("uploaded_document", "2026-11-15T03:00:00Z", { fileName: "a.pdf" }),
      event("uploaded_document", "2026-11-15T02:59:00Z", { fileName: "b.pdf" }, "p2"),
      event("opened_document", "2026-11-15T02:58:00Z", { fileName: "c.pdf" }, "p2"),
      event("opened_document", "2026-11-15T01:00:00Z", { fileName: "d.pdf" }, "p2"),
      event("edited_record", "2026-11-15T00:59:00Z"),
      event("edited_record", "2026-11-15T00:58:00Z"),
    ]);
    expect(groups.map((g) => g.events.length)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("groups the sample log's three 2307 uploads", () => {
    const groups = groupAccessEvents(sampleAccessEvents("2026-11-16"));
    const uploads = groups.find((g) => g.first.action === "uploaded_document");
    expect(uploads?.events).toHaveLength(3);
  });

  it("keeps the sample log newest first", () => {
    const times = sampleAccessEvents("2026-11-16").map((e) => Date.parse(e.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});
