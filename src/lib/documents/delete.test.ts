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
  it("is Premium only while the Premium month is running", () => {
    expect(deletePlan("2026-12-01T00:00:00Z", NOW)).toBe("premium");
    expect(deletePlan("2026-11-01T00:00:00Z", NOW)).toBe("standard");
    expect(deletePlan(null, NOW)).toBe("standard");
    expect(deletePlan(undefined, NOW)).toBe("standard");
  });
});

describe("what can be deleted", () => {
  it("lets a file be deleted once, and not while it is being read", () => {
    expect(canDeleteFile(doc("accepted"))).toBe(true);
    expect(canDeleteFile(doc("needs_review"))).toBe(true);
    expect(canDeleteFile(doc("reading"))).toBe(false);
    expect(canDeleteFile(doc("accepted", true))).toBe(false);
  });

  it("unlocks kept records only after the file is gone", () => {
    expect(canDeleteRecords(doc("accepted"), "owner", "premium")).toBe(false);
    expect(canDeleteRecords(doc("accepted"), "partner", "premium")).toBe(false);
    expect(canDeleteRecords(doc("accepted", true), "owner", "premium")).toBe(true);
  });

  it("gives a professional the client's tier: Premium features on a Premium account only", () => {
    expect(canDeleteRecords(doc("accepted", true), "partner", "premium")).toBe(true);
    expect(canDeleteRecords(doc("accepted", true), "partner", "standard")).toBe(false);
  });

  it("lets the owner clear records they kept, even after Premium ends", () => {
    expect(canDeleteRecords(doc("accepted", true), "owner", "standard")).toBe(true);
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
    expect(question).toContain("the Tracker does not change");
    expect(question).toContain("counts toward the monthly limit");
    expect(question).not.toContain("Upgrade");
  });

  it("does not sell Premium to a professional on a Standard client's account", () => {
    const question = deleteFileQuestion("standard", "partner", "rent.jpg");
    expect(question).toContain("removes the file and the records parsed from it");
    expect(question).toContain("counts toward a new run");
    expect(question).not.toContain("Upgrade");
  });

  it("tells a professional on a Premium client's account that the records stay", () => {
    const question = deleteFileQuestion("premium", "partner", "rent.jpg");
    expect(question).toContain("Only the file is removed");
    expect(question).toContain("the Tracker does not change");
    expect(question).toContain("counts toward the monthly limit");
  });

  it("asks before kept records are deleted, and explains the two steps", () => {
    expect(deleteRecordsQuestion("rent.jpg")).toContain("removed from the Tracker");
    expect(DELETE_RECORDS_HINT).toContain("Delete the file first");
    expect(RECORDS_LOCKED_HINT).toContain("Premium");
  });
});
