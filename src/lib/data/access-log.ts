/**
 * Turns activity-log entries (public.access_events) into plain sentences for the taxpayer's
 * Access page, and groups runs of the same thing (a professional uploading 20 receipts) into one
 * line.
 */

import { formatIsoDate } from "@shared/domain/dates.ts";
import type { RecordKind } from "@shared/domain/records.ts";
import {
  INCOME_TAX_OPTION_LABEL,
  type IncomeTaxOption,
  formatTin,
} from "@shared/domain/tax-profile.ts";
import { DOCUMENT_KIND_LABEL, type DocumentKind } from "@shared/parser/schema.ts";
import { peso } from "@/lib/money";

import type { AccessEvent, AccessEventAction, AccessStatus } from "./types";

/** How each invitation status reads on the Access page. */
export const ACCESS_STATUS_LABEL: Record<AccessStatus, string> = {
  pending: "Waiting for their answer",
  active: "Can see your account",
  declined: "Declined your invitation",
  cancelled: "You cancelled the invitation",
  revoked: "You removed their access",
  left: "Stopped working on your account",
};

/** Which entries are views, which are changes and which are about the invitation itself. */
export const ACTION_GROUP: Record<AccessEventAction, "access" | "viewed" | "changed"> = {
  invited: "access",
  invite_cancelled: "access",
  accepted: "access",
  declined: "access",
  access_removed: "access",
  left: "access",
  opened_account: "viewed",
  opened_document: "viewed",
  asked_assistant: "viewed",
  uploaded_document: "changed",
  started_reading: "changed",
  edited_record: "changed",
  confirmed_cor: "changed",
  deleted_document: "changed",
};

const FIELD_LABEL: Record<string, string> = {
  record_date: "Date",
  counterparty: "Customer or supplier",
  counterparty_tin: "Their TIN",
  description: "Description",
  category: "Category",
  amount_centavos: "Amount",
  vat_centavos: "VAT",
  tax_withheld_centavos: "Tax withheld",
  tin: "TIN",
  registered_name: "Registered name",
  trade_name: "Trade name",
  rdo_code: "RDO",
  registered_address: "Registered address",
  line_of_business: "Line of business",
  registration_date: "Registration date",
  vat_registered: "VAT registered",
  withholding_agent: "Withholding agent",
  income_tax_option: "Income tax option",
  business_type: "Business type",
  mixed_income: "Mixed income",
};

const RECORD_WORD: Record<RecordKind, string> = {
  sale: "a sale",
  expense: "an expense",
  withholding: "a Form 2307 record",
};

const text = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One field's value as a person reads it. */
function showValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (field.endsWith("_centavos")) return peso(count(value) / 100, true);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field === "tin" || field === "counterparty_tin") return formatTin(String(value));
  if (field === "income_tax_option")
    return INCOME_TAX_OPTION_LABEL[value as IncomeTaxOption] ?? String(value);
  if (field === "business_type") return value === "goods" ? "Sells goods" : "Services";
  if (/_date$/.test(field) && /^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    return formatIsoDate(String(value));
  return String(value);
}

/** "Amount: ₱1,500.00 → ₱1,650.00", one line per changed field the person would recognise. */
export function describeChanges(details: Record<string, unknown>): string[] {
  const changes = details["changes"];
  if (!changes || typeof changes !== "object") return [];
  return Object.entries(changes as Record<string, { from?: unknown; to?: unknown }>)
    .filter(([field]) => field in FIELD_LABEL)
    .map(
      ([field, change]) =>
        `${FIELD_LABEL[field]}: ${showValue(field, change?.from)} → ${showValue(field, change?.to)}`,
    );
}

/** The professional's name, kept with the entry so it still reads after they leave Takatax. */
const nameOf = (event: AccessEvent) => event.partnerName || "A professional";

function fileLabel(details: Record<string, unknown>): string {
  return text(details["fileName"]) || "a document";
}

function kindLabel(details: Record<string, unknown>): string {
  const kind = text(details["documentKind"]) as DocumentKind;
  return DOCUMENT_KIND_LABEL[kind] ?? "";
}

/** The sentence for one entry, plus detail lines (what changed) when there are any. */
export function describeAccessEvent(event: AccessEvent): { title: string; lines: string[] } {
  const who = nameOf(event);
  const d = event.details;
  switch (event.action) {
    case "invited":
      return { title: `You invited ${who} to your account`, lines: [] };
    case "invite_cancelled":
      return { title: `You cancelled your invitation to ${who}`, lines: [] };
    case "accepted":
      return { title: `${who} accepted your invitation and can now see your account`, lines: [] };
    case "declined":
      return { title: `${who} declined your invitation`, lines: [] };
    case "access_removed":
      return { title: `You removed ${who}'s access`, lines: [] };
    case "left":
      return { title: `${who} stopped working on your account`, lines: [] };
    case "opened_account":
      return { title: `${who} opened your account`, lines: [] };
    case "opened_document": {
      const kind = kindLabel(d);
      return { title: `${who} opened ${fileLabel(d)}`, lines: kind ? [kind] : [] };
    }
    case "asked_assistant":
      return { title: `${who} asked the records assistant about your figures`, lines: [] };
    case "uploaded_document": {
      const kind = kindLabel(d);
      const pages = count(d["pages"]);
      return {
        title: `${who} uploaded ${fileLabel(d)}`,
        lines: [[kind, pages ? plural(pages, "page") : ""].filter(Boolean).join(", ")].filter(
          Boolean,
        ),
      };
    }
    case "started_reading":
      return {
        title: `${who} sent ${plural(count(d["documents"]), "document")} (${plural(count(d["pages"]), "page")}) to be read`,
        lines: [],
      };
    case "edited_record": {
      const what = RECORD_WORD[text(d["kind"]) as RecordKind] ?? "a record";
      const on = text(d["recordDate"]);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(on) ? formatIsoDate(on) : on;
      const context = [text(d["counterparty"]), date].filter(Boolean).join(", ");
      return {
        title: `${who} corrected ${what}${context ? ` (${context})` : ""}`,
        lines: describeChanges(d),
      };
    }
    case "confirmed_cor":
      return { title: `${who} confirmed your COR details`, lines: describeChanges(d) };
    case "deleted_document": {
      const kind = kindLabel(d);
      const records = count(d["records"]);
      const removed = records ? `${plural(records, "record")} removed from your tracker` : "";
      return {
        title: `${who} deleted ${fileLabel(d)}`,
        lines: [[kind, removed].filter(Boolean).join(", ")].filter(Boolean),
      };
    }
  }
}

/** Entries that can be folded together when one professional does several in a row. */
const FOLDABLE = new Set<AccessEventAction>(["uploaded_document", "opened_document"]);
const FOLD_WINDOW_MS = 30 * 60_000;

export interface AccessEventGroup {
  key: string;
  first: AccessEvent;
  events: AccessEvent[];
}

/**
 * Groups entries (newest first) so that, say, 20 uploads by the same professional within half an
 * hour show as one line with the file names underneath.
 */
export function groupAccessEvents(events: AccessEvent[]): AccessEventGroup[] {
  const groups: AccessEventGroup[] = [];
  for (const event of events) {
    const last = groups.at(-1);
    const previous = last?.events.at(-1);
    if (
      last &&
      previous &&
      FOLDABLE.has(event.action) &&
      event.action === last.first.action &&
      event.partnerId === last.first.partnerId &&
      Math.abs(Date.parse(previous.createdAt) - Date.parse(event.createdAt)) <= FOLD_WINDOW_MS
    ) {
      last.events.push(event);
    } else {
      groups.push({ key: event.id, first: event, events: [event] });
    }
  }
  return groups;
}

/** The sentence for a group: the entry itself, or "uploaded 20 documents" with the names. */
export function describeGroup(group: AccessEventGroup): { title: string; lines: string[] } {
  if (group.events.length === 1) return describeAccessEvent(group.first);
  const who = nameOf(group.first);
  const names = group.events.map((e) => fileLabel(e.details));
  const n = group.events.length;
  const verb = group.first.action === "uploaded_document" ? "uploaded" : "opened";
  const shown = names.slice(0, 5).join(", ");
  return {
    title: `${who} ${verb} ${plural(n, "document")}`,
    lines: [n > 5 ? `${shown} and ${n - 5} more` : shown],
  };
}
