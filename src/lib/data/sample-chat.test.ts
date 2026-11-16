import { describe, expect, it } from "vitest";

import { sampleAccess, sampleConversationWith, sampleConversations, sampleThread } from "./sample";

const TODAY = "2026-11-15";

describe("sample chat", () => {
  it("shows the taxpayer each partner's name and marks replies from them unread", () => {
    const list = sampleConversations("taxpayer", "me", TODAY);
    const liza = list.find((c) => c.otherUserId === "sample-partner-1");
    expect(liza?.otherName).toBe("Liza Mendoza");
    expect(liza?.otherKind).toBe("bookkeeper");
    expect(liza?.lastMessageFromMe).toBe(false);
    expect(liza?.unread).toBe(true);
  });

  it("shows the partner the client's name, and their own last message as read", () => {
    const list = sampleConversations("partner", "me", TODAY);
    const reyes = list.find((c) => c.id === "sample-chat-2");
    expect(reyes?.otherKind).toBeNull();
    expect(reyes?.lastMessageFromMe).toBe(false);
    const delaCruz = list.find((c) => c.id === "sample-chat-1");
    expect(delaCruz?.lastMessageFromMe).toBe(true);
    expect(delaCruz?.unread).toBe(false);
  });

  it("orders a thread's messages oldest first and marks the viewer's own", () => {
    const thread = sampleThread("sample-chat-1", "taxpayer", "me", TODAY);
    const times = thread?.messages.map((m) => m.createdAt) ?? [];
    expect([...times].sort()).toEqual(times);
    expect(thread?.messages[0]?.senderUserId).toBe("me");
    expect(thread?.messages[1]?.senderUserId).toBe("sample-partner-1");
  });

  it("finds the conversation with a partner or a client", () => {
    expect(sampleConversationWith("sample-partner-2")).toBe("sample-chat-2");
    expect(sampleConversationWith("sample-owner-dela-cruz")).toBe("sample-chat-1");
    expect(sampleConversationWith("someone-else")).toBeNull();
  });
});

describe("sample access", () => {
  it("lists two professionals with access, one invited and one from before", () => {
    const grants = sampleAccess(TODAY);
    expect(grants.filter((g) => g.status === "active")).toHaveLength(2);
    expect(grants.filter((g) => g.status === "pending")).toHaveLength(1);
    expect(grants.filter((g) => g.endedAt)).toHaveLength(1);
    // Every status's dates agree with what the database allows.
    for (const g of grants) {
      expect(Boolean(g.grantedAt)).toBe(g.status !== "pending");
      expect(Boolean(g.endedAt)).toBe(g.status !== "pending" && g.status !== "active");
    }
  });
});
