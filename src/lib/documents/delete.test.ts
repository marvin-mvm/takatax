import { describe, expect, it } from "vitest";

import {
  DELETE_RECORDS_HINT,
  PARSED_RECORDS_HINT,
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
    expect(deleteFileQuestion("standard", "owner", "rent.jpg")).toEqual({
      title: "Delete this file?",
      subject: "rent.jpg",
      kind: "delete",
      points: [
        "The file and its parsed records are deleted.",
        "Their amounts leave the Tracker and tax figures.",
        "Reading it again uses your run or monthly limit.",
        "Premium keeps the records of deleted files.",
      ],
      confirm: "Delete file",
    });
  });

  it("tells a Premium owner that the records stay", () => {
    const question = deleteFileQuestion("premium", "owner", "rent.jpg");
    expect(question.points).toEqual([
      "Only the file is deleted.",
      "Its parsed records stay. The Tracker does not change.",
      "Reading it again counts toward the monthly limit.",
    ]);
    expect(question.points.join(" ")).not.toContain("Premium keeps");
  });

  it("does not sell Premium to a professional on a Standard client's account", () => {
    const { points } = deleteFileQuestion("standard", "partner", "rent.jpg");
    expect(points).toContain("The file and its parsed records are deleted.");
    expect(points).toContain("Reading it again counts toward a new run.");
    expect(points.join(" ")).not.toContain("Premium");
    expect(points.join(" ")).not.toContain("your");
  });

  it("tells a professional on a Premium client's account that the records stay", () => {
    expect(deleteFileQuestion("premium", "partner", "rent.jpg")).toEqual(
      deleteFileQuestion("premium", "owner", "rent.jpg"),
    );
  });

  it("asks before kept records are deleted, and explains the two steps", () => {
    expect(deleteRecordsQuestion("rent.jpg")).toMatchObject({
      title: "Delete these parsed records?",
      subject: "rent.jpg",
      points: ["They leave the Tracker and the tax figures.", "This cannot be undone."],
      confirm: "Delete records",
    });
    expect(DELETE_RECORDS_HINT).toContain("Delete the file first");
    expect(RECORDS_LOCKED_HINT).toContain("Premium");
    expect(PARSED_RECORDS_HINT).toContain("Premium feature");
    expect(PARSED_RECORDS_HINT).toContain("optional");
  });

  it("keeps every pop-up short: a few lines, none long enough to need scrolling", () => {
    const questions = [
      deleteFileQuestion("standard", "owner", "rent.jpg"),
      deleteFileQuestion("standard", "partner", "rent.jpg"),
      deleteFileQuestion("premium", "owner", "rent.jpg"),
      deleteFileQuestion("premium", "partner", "rent.jpg"),
      deleteRecordsQuestion("rent.jpg"),
    ];
    for (const question of questions) {
      expect(question.points.length).toBeLessThanOrEqual(4);
      for (const point of question.points) expect(point.length).toBeLessThanOrEqual(56);
    }
  });
});
