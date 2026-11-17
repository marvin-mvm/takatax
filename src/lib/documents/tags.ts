/**
 * Tags and search for the Documents tab. A tag is a short label a person puts on files to find
 * them again ("Exp Q1 2026"); the database function `tag_documents` saves them with the same
 * rules (1 to 30 characters, no commas, upper and lower case are the same tag, 10 a file).
 */

import { DOCUMENT_KIND_LABEL } from "@shared/parser/schema.ts";
import { DOCUMENT_STATUS_LABEL, type StoredDocument } from "@/lib/data/types";

export const MAX_TAG_LENGTH = 30;
export const MAX_TAGS_PER_FILE = 10;

/** A tag as it is saved: no spaces around, single spaces inside, no commas, 30 characters. */
export function cleanTag(text: string): string {
  return text.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
}

/** Every tag used on these documents, each one once whatever its case, in A to Z order. */
export function allTags(documents: Pick<StoredDocument, "tags">[]): string[] {
  const seen = new Map<string, string>();
  for (const doc of documents) {
    for (const tag of doc.tags) {
      if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/**
 * What typing a tag means: the spelling already in use when there is one ("exp q1 2026" finds
 * "Exp Q1 2026"), else the tidied new name. Empty when nothing usable was typed.
 */
export function resolveTag(typed: string, known: string[]): string {
  const tag = cleanTag(typed);
  return known.find((have) => have.toLowerCase() === tag.toLowerCase()) ?? tag;
}

const has = (doc: Pick<StoredDocument, "tags">, tag: string) =>
  doc.tags.some((have) => have.toLowerCase() === tag.toLowerCase());

/** The tags on the chosen files, and whether every one of them has each tag or only some. */
export function tagsOn(
  documents: Pick<StoredDocument, "tags">[],
): { tag: string; onAll: boolean }[] {
  return allTags(documents).map((tag) => ({
    tag,
    onAll: documents.every((doc) => has(doc, tag)),
  }));
}

/** True when a file would go over 10 tags by getting this one. */
export function tooManyTags(documents: Pick<StoredDocument, "tags">[], tag: string): boolean {
  return documents.some((doc) => !has(doc, tag) && doc.tags.length >= MAX_TAGS_PER_FILE);
}

export const hasTag = has;

/**
 * Whether a document matches what was typed in the search box. Every word must be found
 * somewhere in its file name, its type, its status, its tags, or the names and numbers read
 * from it (the supplier, the customer, the invoice number), so "twilio nov" finds a Twilio
 * receipt uploaded as "receipt-2026-11.pdf". An empty search matches everything.
 */
export function matchesSearch(doc: StoredDocument, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    doc.fileName,
    DOCUMENT_KIND_LABEL[doc.kind],
    DOCUMENT_STATUS_LABEL[doc.status],
    ...doc.tags,
    ...doc.readings.flatMap((reading) => [
      reading.issuerName,
      reading.recipientName,
      reading.documentNumber,
      reading.date,
    ]),
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}
