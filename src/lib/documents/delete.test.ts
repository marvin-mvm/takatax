import { describe, expect, it } from "vitest";

import {
  DELETE_RECORDS_HINT,
  RECORDS_LOCKED_HINT,
  canDeleteFile,
  canDeleteRecords,
  deleteFileQuestion,
  deletePlan,
  deleteRecordsQuestion,
} from "./delete";

const NOW = Date.parse("2026-11-17T00:00:00Z");
const doc = (status: "accepted" | "reading" | "needs_review", fileDeleted = false) => ({
  status,
  fileDeleted,
});

describe("deletePlan", () => {
  it("is Premium only for the owner, while the Premium month is running", () => {
    expect(deletePlan("2026-12-01T00:00:00Z", "owner", NOW)).toBe("premium");
    expect(deletePlan("2026-11-01T00:00:00Z", "owner", NOW)).toBe("standard");
    expect(deletePlan(null, "owner", NOW)).toBe("standard");
    expect(deletePlan(undefined, "owner", NOW)).toBe("standard");
  });

  it("is always Standard for a professional on a client's account", () => {
    expect(deletePlan("2026-12-01T00:00:00Z", "partner", NOW)).toBe("standard");
  });
});

describe("what can be deleted", () => {
  it("lets a file be deleted once, and not while it is being read", () => {
    expect(canDeleteFile(doc("accepted"))).toBe(true);
    expect(canDeleteFile(doc("needs_review"))).toBe(true);
    expect(canDeleteFile(doc("reading"))).toBe(false);
    expect(canDeleteFile(doc("accepted", true))).toBe(false);
  });

  it("lets only the owner delete kept records, and only after the file is gone", () => {
    expect(canDeleteRecords(doc("accepted"), "owner")).toBe(false);
    expect(canDeleteRecords(doc("accepted", true), "owner")).toBe(true);
    expect(canDeleteRecords(doc("accepted", true), "partner")).toBe(false);
  });
});

describe("the questions asked before deleting", () => {
  it("tells a Standard owner that the records and their amounts go too", () => {
    const question = deleteFileQuestion("standard", "owner", "rent.jpg");
    expect(question).toContain('Delete "rent.jpg"?');
    expect(question).toContain("removes the file and the records parsed from it");
    expect(question).toContain("leave the Tracker");
    expect(question).toContain("run or monthly limit");
    expect(question).toContain("Upgrade to Premium to keep the records of deleted files.");
  });

  it("tells a Premium owner that the records stay", () => {
    const question = deleteFileQuestion("premium", "owner", "rent.jpg");
    expect(question).toContain("Only the file is removed");
    expect(question).toContain("your Tracker does not change");
    expect(question).toContain("monthly limit");
    expect(question).not.toContain("Upgrade");
  });

  it("does not sell Premium to a professional", () => {
    const question = deleteFileQuestion("standard", "partner", "rent.jpg");
    expect(question).toContain("removes the file and the records parsed from it");
    expect(question).not.toContain("Upgrade");
  });

  it("asks before kept records are deleted, and explains the two steps", () => {
    expect(deleteRecordsQuestion("rent.jpg")).toContain("removed from your Tracker");
    expect(DELETE_RECORDS_HINT).toContain("Delete the file first");
    expect(RECORDS_LOCKED_HINT).toContain("Premium");
  });
});
