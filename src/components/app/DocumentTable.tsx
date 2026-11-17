/**
 * A table of uploaded documents with their reading status, each linking to its detail page, and
 * the two delete columns: "Delete File", and "Parsed Records" (the records Premium keeps after a
 * file is deleted). The rules and the wording are in `@/lib/documents/delete`; every delete asks
 * first, in the themed pop-up from `./confirm`.
 *
 * Files can be ticked (one by one, or all with the box in the header). While any is ticked, a
 * bar above the table puts a tag on them or takes one off: type to find a tag already in use,
 * or type a new one. Tags show under each file's name. Rules: `@/lib/documents/tags`.
 */

import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, Loader2, Tag as TagIcon, Trash2, X } from "lucide-react";
import { useId, useState } from "react";

import { formatIsoDate } from "@shared/domain/dates.ts";
import { DOCUMENT_KIND_LABEL } from "@shared/parser/schema.ts";
import type { StoredDocument } from "@/lib/data/types";
import {
  DELETE_RECORDS_HINT,
  type DeletePlan,
  type DeleteViewer,
  PARSED_RECORDS_HINT,
  RECORDS_LOCKED_HINT,
  canDeleteFile,
  canDeleteRecords,
  deleteFileQuestion,
  deleteRecordsQuestion,
} from "@/lib/documents/delete";
import { NotConnectedError, tagDocuments } from "@/lib/data/repository";
import {
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_FILE,
  allTags,
  resolveTag,
  tagsOn,
  tooManyTags,
} from "@/lib/documents/tags";
import { fileSize } from "@/lib/money";
import { deleteDocument } from "@/lib/services/documents";

import { Hint } from "./Hint";
import { ReadingProgress } from "./ReadingProgress";
import { useConfirm } from "./confirm";
import { StatusPill } from "./ui";

/**
 * "Please check" as a link to where the check is done: the COR is checked on My COR (or on the
 * client's page for a professional); any other document on its own page, at what was read.
 */
export function CheckLink({
  doc,
  clientAccountId,
}: {
  doc: Pick<StoredDocument, "id" | "kind" | "status">;
  clientAccountId?: string | undefined;
}) {
  const pill = (
    <span className="inline-flex items-center gap-1 rounded-full underline-offset-2 hover:underline">
      <StatusPill status={doc.status} />
      <span aria-hidden className="text-tk-warn">
        →
      </span>
    </span>
  );
  const label = doc.kind === "cor" ? "Check your COR" : "Check this document";
  if (doc.kind === "cor") {
    return clientAccountId ? (
      <Link to="/app/clients/$accountId" params={{ accountId: clientAccountId }} aria-label={label}>
        {pill}
      </Link>
    ) : (
      <Link to="/app/cor" aria-label={label}>
        {pill}
      </Link>
    );
  }
  return (
    <Link
      to="/app/documents/$documentId"
      params={{ documentId: doc.id }}
      search={clientAccountId ? { account: clientAccountId } : {}}
      hash="check"
      aria-label={label}
    >
      {pill}
    </Link>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const smallButton =
  "inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-tk-line bg-tk-surface px-3 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The bar shown while files are ticked: how many, a box to add a tag (existing tags are offered
 * as it is typed; anything else makes a new tag), and the tags already on them, each with a
 * button to take it off.
 */
function TagBar({
  chosen,
  knownTags,
  onClear,
}: {
  chosen: StoredDocument[];
  knownTags: string[];
  onClear: () => void;
}) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const listId = useId();
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const tag = resolveTag(typed, knownTags);

  const change = async (add: string[], remove: string[]) => {
    const first = chosen[0];
    if (!first || saving) return;
    setProblem(null);
    if (chosen.some((doc) => !UUID.test(doc.id)) || !first.accountId) {
      setProblem("These are sample documents, so tags are not saved.");
      return;
    }
    if (add.some((name) => tooManyTags(chosen, name))) {
      setProblem(`A file can have up to ${MAX_TAGS_PER_FILE} tags. Take one off first.`);
      return;
    }
    setSaving(true);
    try {
      await tagDocuments(
        first.accountId,
        chosen.map((doc) => doc.id),
        add,
        remove,
      );
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      setTyped("");
    } catch (error) {
      setProblem(
        error instanceof NotConnectedError
          ? "Tags are not connected yet, so nothing was saved."
          : "We could not save the tag. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label="Tag the selected files"
      className="flex flex-col gap-3 rounded-[14px] border border-tk-brand/40 bg-tk-brand-soft p-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex items-center gap-1.5 font-semibold text-tk-brand">
          <TagIcon aria-hidden className="size-4" />
          {chosen.length} selected
        </p>
        <form
          className="flex min-w-0 flex-1 flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (tag) void change([tag], []);
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Tag to put on the selected files
          </label>
          <input
            id={inputId}
            list={listId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            maxLength={MAX_TAG_LENGTH}
            autoComplete="off"
            placeholder="Find a tag or type a new one, e.g. Exp Q1 2026"
            className="min-h-10 min-w-0 flex-1 basis-[220px] rounded-[10px] border border-tk-line bg-tk-surface px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-tk-brand"
          />
          <datalist id={listId}>
            {knownTags.map((known) => (
              <option key={known} value={known} />
            ))}
          </datalist>
          <button
            type="submit"
            disabled={!tag || saving}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-tk-brand px-4 text-[15px] font-semibold text-tk-surface transition-colors hover:bg-tk-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Add tag
          </button>
        </form>
        <button
          type="button"
          onClick={onClear}
          className="min-h-10 rounded-[10px] px-3 text-[15px] font-medium text-tk-muted hover:text-tk-ink"
        >
          Clear selection
        </button>
      </div>
      {tagsOn(chosen).length > 0 ? (
        <ul aria-label="Tags on the selected files" className="flex flex-wrap gap-2">
          {tagsOn(chosen).map(({ tag: name, onAll }) => (
            <li
              key={name}
              className="inline-flex items-center gap-1 rounded-full border border-tk-line bg-tk-surface py-0.5 pr-1 pl-3 text-sm"
            >
              {name}
              {onAll ? null : <span className="text-tk-muted">(some)</span>}
              <button
                type="button"
                onClick={() => void change([], [name])}
                disabled={saving}
                aria-label={`Take the tag ${name} off the selected files`}
                className="flex size-6 items-center justify-center rounded-full text-tk-muted hover:bg-tk-danger-soft hover:text-tk-danger"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm text-tk-danger">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

export function DocumentTable({
  documents,
  clientAccountId,
  limit = 200,
  plan = "standard",
  knownTags,
}: {
  documents: StoredDocument[];
  /** Set when a partner views a client's documents, so the detail page opens that account. */
  clientAccountId?: string;
  limit?: number;
  /** Every tag in use on the account, offered when tagging. The table's own files' if left out. */
  knownTags?: string[];
  /**
   * The account's tier. "premium" keeps the records of a deleted file. A professional on a
   * client's page gets the client's tier.
   */
  plan?: DeletePlan;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const viewer: DeleteViewer = clientAccountId ? "partner" : "owner";
  // The account's tier decides, for its owner and for a professional alike.
  const rules: DeletePlan = plan;
  /** The document being deleted, so its buttons lock until the server answers. */
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The files ticked for tagging. Only files on screen count: a filter can hide some. */
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const shown = documents.slice(0, limit);
  const chosen = shown.filter((doc) => ticked.has(doc.id));
  const allChosen = shown.length > 0 && chosen.length === shown.length;
  const tick = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = async (doc: StoredDocument, what: "file" | "records") => {
    if (busy) return;
    const question =
      what === "file"
        ? deleteFileQuestion(rules, viewer, doc.fileName)
        : deleteRecordsQuestion(doc.fileName);
    if (!(await confirm(question))) return;
    setProblem(null);
    if (!UUID.test(doc.id) || !doc.accountId) {
      setProblem("These are sample documents, so there is nothing to delete yet.");
      return;
    }
    setBusy(doc.id);
    const result = await deleteDocument(doc.accountId, doc.id, what);
    if (result.ok) {
      // The documents, the tracker and the tax figures all come from the workspace.
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      // A deleted file frees its storage.
      void queryClient.invalidateQueries({ queryKey: ["usage"] });
    } else {
      setProblem(
        result.reason === "not_connected"
          ? "Deleting is not connected yet, so nothing was deleted."
          : result.code === "being_read"
            ? "This document is being read. Delete it when reading is done."
            : result.code === "premium_only"
              ? "Deleting kept records is a Premium feature of this account."
              : `Nothing was deleted. ${result.message}`,
      );
    }
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {dialog}
      {problem ? (
        <p role="alert" className="rounded-[12px] bg-tk-warn-soft px-4 py-3 text-sm text-tk-warn">
          {problem}
        </p>
      ) : null}
      {chosen.length > 0 ? (
        <TagBar
          chosen={chosen}
          knownTags={knownTags ?? allTags(documents)}
          onClear={() => setTicked(new Set())}
        />
      ) : null}
      <div className="relative overflow-x-auto rounded-[16px] border border-tk-line bg-tk-surface">
        <table className="w-full min-w-[940px] border-collapse text-left text-sm/5">
          <thead>
            <tr className="border-b border-tk-line bg-tk-bg text-[13px] text-tk-muted">
              <th className="w-10 py-2 pr-0 pl-4">
                <input
                  type="checkbox"
                  aria-label="Select every file"
                  checked={allChosen}
                  ref={(box) => {
                    if (box) box.indeterminate = chosen.length > 0 && !allChosen;
                  }}
                  onChange={() =>
                    setTicked(allChosen ? new Set() : new Set(shown.map((doc) => doc.id)))
                  }
                  className="size-[18px] cursor-pointer accent-tk-brand"
                />
              </th>
              <th className="px-3 py-2 font-medium">Document</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Uploaded</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Delete File</th>
              <th className="px-4 py-2 font-medium">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  Parsed Records
                  <Hint label="About Parsed Records" text={PARSED_RECORDS_HINT} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((doc) => {
              const working = busy === doc.id;
              const recordsOpen = canDeleteRecords(doc, viewer, rules);
              // Premium, file still there: explain the two steps. Everyone else: Premium only
              // (the "(?)" on the column's name says so on screen).
              const recordsHint =
                rules === "premium" || recordsOpen ? DELETE_RECORDS_HINT : RECORDS_LOCKED_HINT;
              return (
                <tr
                  key={doc.id}
                  className={`border-b border-tk-line last:border-b-0 ${ticked.has(doc.id) ? "bg-tk-brand-soft/60" : "hover:bg-tk-bg/60"}`}
                >
                  <td className="py-2.5 pr-0 pl-4 align-top">
                    <input
                      type="checkbox"
                      aria-label={`Select ${doc.fileName}`}
                      checked={ticked.has(doc.id)}
                      onChange={() => tick(doc.id)}
                      className="mt-0.5 size-[18px] cursor-pointer accent-tk-brand"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      to="/app/documents/$documentId"
                      params={{ documentId: doc.id }}
                      search={clientAccountId ? { account: clientAccountId } : {}}
                      className="inline-flex items-center gap-2 font-medium text-tk-brand hover:underline"
                    >
                      <FileText aria-hidden className="size-4" />
                      {doc.fileName}
                    </Link>
                    {doc.tags.length > 0 ? (
                      <ul
                        aria-label={`Tags of ${doc.fileName}`}
                        className="mt-1 flex flex-wrap gap-1"
                      >
                        {doc.tags.map((tag) => (
                          <li
                            key={tag}
                            className="rounded-full bg-tk-surface-2 px-2 py-0.5 text-[12px] font-medium text-tk-muted"
                          >
                            {tag}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-tk-muted">{DOCUMENT_KIND_LABEL[doc.kind]}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-tk-muted">
                    {formatIsoDate(doc.uploadedAt.slice(0, 10))}
                  </td>
                  <td className="px-3 py-2.5 text-tk-muted">{fileSize(doc.bytes)}</td>
                  <td className="px-3 py-2.5">
                    {doc.status === "reading" ? (
                      <ReadingProgress
                        compact
                        status={doc.status}
                        pages={doc.pageCount}
                        pagesRead={doc.pagesRead}
                        fileName={doc.fileName}
                      />
                    ) : doc.status === "needs_review" ? (
                      <CheckLink doc={doc} clientAccountId={clientAccountId} />
                    ) : (
                      <StatusPill status={doc.status} />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {doc.fileDeleted ? (
                      <span className="text-tk-muted">File deleted</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void remove(doc, "file")}
                        disabled={busy !== null || !canDeleteFile(doc)}
                        aria-busy={working}
                        aria-label={`Delete the file ${doc.fileName}`}
                        title={
                          doc.status === "reading"
                            ? "This document is being read. Delete it when reading is done."
                            : undefined
                        }
                        className={`${smallButton} text-tk-danger hover:border-tk-danger`}
                      >
                        {working ? (
                          <Loader2 aria-hidden className="size-4 animate-spin" />
                        ) : (
                          <Trash2 aria-hidden className="size-4" />
                        )}
                        {working ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void remove(doc, "records")}
                        disabled={busy !== null || !recordsOpen}
                        aria-busy={working && recordsOpen}
                        aria-label={`Delete the parsed records of ${doc.fileName}`}
                        aria-describedby={`records-hint-${doc.id}`}
                        className={`${smallButton} ${recordsOpen ? "text-tk-danger hover:border-tk-danger" : "text-tk-muted"}`}
                      >
                        Delete record
                      </button>
                      {rules === "premium" && !recordsOpen ? (
                        <Hint
                          icon="info"
                          label={`Why the records of ${doc.fileName} cannot be deleted yet`}
                          text={recordsHint}
                        />
                      ) : null}
                      <span id={`records-hint-${doc.id}`} className="sr-only">
                        {recordsHint}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
