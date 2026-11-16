-- =============================================================================================
-- Takatax: checking a document by hand.
--
-- When the reader is not sure of a document it marks it "needs_review". The person then looks at
-- what the AI read, corrects it and saves it (the "Check what was read" form on the document's
-- page). review_document() below saves that: the corrected reading replaces the AI's, its
-- ledger rows replace the old ones, and the document is no longer waiting to be checked.
--
-- The owner and a professional with access may do it, as with the ledger corrections they could
-- already make. A professional's check goes in the client's activity log.
--
-- Applies on top of 20261117090000_document_delete.sql.
-- =============================================================================================

-- The activity log also records the documents a professional checked.
alter table public.access_events drop constraint access_events_action_check;
alter table public.access_events add constraint access_events_action_check check (action in (
  -- invitations and access
  'invited', 'invite_cancelled', 'accepted', 'declined', 'access_removed', 'left',
  -- what the professional opened
  'opened_account', 'opened_document', 'asked_assistant',
  -- what the professional changed
  'uploaded_document', 'started_reading', 'edited_record', 'confirmed_cor', 'deleted_document',
  'checked_document'
));

-- Saves a document as checked by the signed-in person.
--   reading  what the document says, as corrected: a list, one entry per document in the file
--            (the shape the reader saves in documents.extracted).
--   records  the ledger rows that follow from it: a list of { kind, record_date, counterparty,
--            counterparty_tin, description, category, amount_centavos, vat_centavos,
--            tax_withheld_centavos }. Empty when nothing in the file is a tax document.
-- Answers 'accepted' when records were saved, 'rejected' (shown as "Not counted") when there
-- are none. Everything happens together: the old rows never stay beside the new ones.
create function public.review_document(document uuid, reading jsonb, records jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  doc public.documents%rowtype;
  acting uuid;
  saved integer := 0;
  new_kind text;
  new_status public.document_status;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into doc from public.documents where id = document for update;
  if not found or not public.has_account_access(doc.account_id) then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if doc.kind = 'cor' then
    raise exception 'A COR is confirmed on its own screen' using errcode = '22023';
  end if;
  if doc.status not in ('needs_review', 'accepted', 'rejected') then
    raise exception 'This document has not been read yet' using errcode = '55000';
  end if;
  if jsonb_typeof(reading) is distinct from 'array' or jsonb_typeof(records) is distinct from 'array' then
    raise exception 'Send what was read and its records as lists' using errcode = '22023';
  end if;
  if jsonb_array_length(reading) > 500 or jsonb_array_length(records) > 500 then
    raise exception 'Too many documents or records in one file' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(records) as r(kind text, record_date date, amount_centavos bigint,
                                          vat_centavos bigint, tax_withheld_centavos bigint)
    where r.kind is null or r.kind not in ('sale', 'expense', 'withholding')
       or r.record_date is null
       or coalesce(r.amount_centavos, 0) < 0 or coalesce(r.vat_centavos, 0) < 0
       or coalesce(r.tax_withheld_centavos, 0) < 0
  ) then
    raise exception 'A record needs a kind, a date and amounts that are not negative'
      using errcode = '22023';
  end if;

  delete from public.ledger_records where document_id = document;
  insert into public.ledger_records (
    account_id, document_id, kind, record_date, counterparty, counterparty_tin, description,
    category, amount_centavos, vat_centavos, tax_withheld_centavos, user_corrected)
  select doc.account_id, document, r.kind::public.record_kind, r.record_date,
         left(coalesce(r.counterparty, ''), 300), nullif(left(r.counterparty_tin, 40), ''),
         left(coalesce(r.description, ''), 300), nullif(left(r.category, 60), ''),
         coalesce(r.amount_centavos, 0), coalesce(r.vat_centavos, 0),
         coalesce(r.tax_withheld_centavos, 0), true
  from jsonb_to_recordset(records) as r(
    kind text, record_date date, counterparty text, counterparty_tin text, description text,
    category text, amount_centavos bigint, vat_centavos bigint, tax_withheld_centavos bigint);
  get diagnostics saved = row_count;

  -- The document's kind is that of the first real document found in the file.
  select entry.item ->> 'kind' into new_kind
  from jsonb_array_elements(reading) with ordinality as entry(item, place)
  where entry.item ->> 'kind' in ('sales_invoice', 'expense_receipt', 'form_2307')
  order by entry.place
  limit 1;
  new_status := case when saved > 0 then 'accepted' else 'rejected' end;

  update public.documents
  set status = new_status, flags = '{}', extracted = reading,
      kind = coalesce(new_kind, 'unknown')::public.document_kind, updated_at = now()
  where id = document;

  -- A run that was waiting only for this check is complete.
  if doc.run_id is not null then
    update public.runs set status = 'complete'
    where id = doc.run_id and status = 'review'
      and not exists (
        select 1 from public.documents d
        where d.run_id = doc.run_id
          and d.status in ('needs_review', 'waiting_for_reader', 'reading', 'waiting_for_storage'));
  end if;

  acting := public.acting_partner(doc.account_id, me);
  if acting is not null then
    perform public.write_access_event(
      doc.account_id, acting, acting, 'checked_document', document,
      jsonb_build_object('fileName', doc.file_name, 'documentKind', coalesce(new_kind, 'unknown'),
                         'records', saved));
  end if;
  return new_status::text;
end $$;
revoke execute on function public.review_document(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.review_document(uuid, jsonb, jsonb) to authenticated, service_role;
