-- =============================================================================================
-- Takatax: deleting uploaded documents.
--
-- Standard: deleting a file removes the file, the document and the records read from it, so
-- their amounts leave the tracker and every tax figure.
-- Premium: deleting a file removes only the file. The document row and its records stay, and
-- those records can be deleted afterwards as a separate step.
--
-- The tier is the ACCOUNT's. A professional working on a client's account gets that client's
-- tier: Standard features on a Standard account, Premium features on a Premium one.
-- account_tier() below tells them which, and nothing else about the client's billing.
--
-- The file itself lives in Cloudflare R2, so the delete-document edge function removes it
-- there first and then calls delete_document() below for the database part.
--
-- Applies on top of 20261116150000_cor_tax_types.sql.
-- =============================================================================================

-- When the file was deleted while its records were kept. Null: the file is still in storage.
alter table public.documents add column file_deleted_at timestamptz;

-- The activity log also records the documents a professional deleted.
alter table public.access_events drop constraint access_events_action_check;
alter table public.access_events add constraint access_events_action_check check (action in (
  -- invitations and access
  'invited', 'invite_cancelled', 'accepted', 'declined', 'access_removed', 'left',
  -- what the professional opened
  'opened_account', 'opened_document', 'asked_assistant',
  -- what the professional changed
  'uploaded_document', 'started_reading', 'edited_record', 'confirmed_cor', 'deleted_document'
));

-- The database part of deleting a document, for the delete-document function only (it has
-- already checked who is asking and removed the file from storage).
--   keep_records = true   the row stays, marked as having no file; its records stay too.
--   keep_records = false  the document and the records read from it are deleted.
-- `actor` is the signed-in user who asked. When that is a professional working on a client's
-- account, the deletion goes in the client's activity log, with how many records went.
create function public.delete_document(document uuid, actor uuid, keep_records boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  doc public.documents%rowtype;
  partner uuid;
  removed integer := 0;
begin
  select * into doc from public.documents where id = document for update;
  if not found then
    return 'not_found';
  end if;
  partner := public.acting_partner(doc.account_id, actor);
  if keep_records then
    update public.documents
    set storage_key = null, file_deleted_at = now(), updated_at = now()
    where id = document;
  else
    delete from public.ledger_records where document_id = document;
    get diagnostics removed = row_count;
    delete from public.documents where id = document;
  end if;
  if partner is not null then
    perform public.write_access_event(
      doc.account_id, partner, partner, 'deleted_document', document,
      jsonb_build_object('fileName', doc.file_name, 'documentKind', doc.kind,
                         'records', removed, 'recordsKept', keep_records,
                         'recordsOnly', doc.file_deleted_at is not null));
  end if;
  return case when keep_records then 'file_deleted' else 'deleted' end;
end $$;
revoke execute on function public.delete_document(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.delete_document(uuid, uuid, boolean) to service_role;

-- The tier of an account, for its owner and for a professional with access: 'premium' while a
-- Premium month is running, 'standard' otherwise. Null for anyone else. A professional's
-- features follow the client's tier, so they may know the tier; the payments and the Premium
-- dates stay with the owner (my_plan()).
create function public.account_tier(account uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when a.premium_until is not null and a.premium_until > now()
              then 'premium' else 'standard' end
  from public.accounts a
  where a.id = account and public.has_account_access(a.id)
$$;
revoke execute on function public.account_tier(uuid) from public, anon;
grant execute on function public.account_tier(uuid) to authenticated, service_role;
