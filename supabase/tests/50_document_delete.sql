-- Behaviour checks for deleting documents (20261117090000_document_delete.sql). Runs after
-- 10_behaviour.sql (or 20_behaviour_api.sql), which create the t_as(), t_expect_error() and
-- t_grant() helpers. No psql variables, so the same file works in the rolled-back dry run
-- through the Management API.
--
-- People: O taxpayer who owns the account (f0…), B verified bookkeeper (fa…).

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', 'olive@example.com', '{"full_name":"Olive Ramos","account_type":"taxpayer"}'),
  ('fafafafa-fafa-fafa-fafa-fafafafafafa', 'bert@example.com', '{"full_name":"Bert Cruz","account_type":"bookkeeper"}');
update public.partner_profiles set verified_at = now(), display_name = 'Bert Cruz'
  where user_id = 'fafafafa-fafa-fafa-fafa-fafafafafafa';
insert into public.accounts (id, owner_user_id) values
  ('f0f0f0f0-0000-0000-0000-000000000001', 'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0');
insert into public.documents (id, account_id, kind, file_name, mime_type, bytes, status, storage_key) values
  ('f0f0f0f0-0000-0000-0000-0000000000d1', 'f0f0f0f0-0000-0000-0000-000000000001', 'expense_receipt',
   'rent.jpg', 'image/jpeg', 1000, 'accepted', 'test50/rent.jpg'),
  ('f0f0f0f0-0000-0000-0000-0000000000d2', 'f0f0f0f0-0000-0000-0000-000000000001', 'sales_invoice',
   'sale.jpg', 'image/jpeg', 1000, 'accepted', 'test50/sale.jpg'),
  ('f0f0f0f0-0000-0000-0000-0000000000d3', 'f0f0f0f0-0000-0000-0000-000000000001', 'expense_receipt',
   'power.jpg', 'image/jpeg', 1000, 'accepted', 'test50/power.jpg');
insert into public.ledger_records (account_id, document_id, kind, record_date, amount_centavos) values
  ('f0f0f0f0-0000-0000-0000-000000000001', 'f0f0f0f0-0000-0000-0000-0000000000d1', 'expense', '2026-10-05', 1800000),
  ('f0f0f0f0-0000-0000-0000-000000000001', 'f0f0f0f0-0000-0000-0000-0000000000d2', 'sale', '2026-10-12', 4800000),
  ('f0f0f0f0-0000-0000-0000-000000000001', 'f0f0f0f0-0000-0000-0000-0000000000d3', 'expense', '2026-10-20', 250000);

-- 1. A new document has its file, and nobody signed in can run the deletion themselves.
do $$ begin
  assert (select count(*) from public.documents
          where account_id = 'f0f0f0f0-0000-0000-0000-000000000001' and file_deleted_at is null) = 3,
    'files are in storage to start with';
end $$;
set role authenticated;
select public.t_as('f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0');
select public.t_expect_error(
  $$select public.delete_document('f0f0f0f0-0000-0000-0000-0000000000d1', 'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', false)$$,
  'permission denied');
-- Deleting the rows directly does nothing either: no policy lets a signed-in user delete them
-- (row-level security then matches no rows; a refusal would be fine too).
do $$ begin
  begin
    delete from public.documents where id = 'f0f0f0f0-0000-0000-0000-0000000000d1';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ledger_records where document_id = 'f0f0f0f0-0000-0000-0000-0000000000d1';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.documents where id = 'f0f0f0f0-0000-0000-0000-0000000000d1') = 1,
    'a signed-in user cannot delete a document directly';
  assert (select count(*) from public.ledger_records
          where document_id = 'f0f0f0f0-0000-0000-0000-0000000000d1') = 1,
    'nor its records';
end $$;

-- 2. Standard: the document and the records read from it go; the rest of the ledger stays.
do $$ begin
  assert public.delete_document('f0f0f0f0-0000-0000-0000-0000000000d1',
                                'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', false) = 'deleted',
    'standard delete answers deleted';
  assert (select count(*) from public.documents where id = 'f0f0f0f0-0000-0000-0000-0000000000d1') = 0,
    'the document is gone';
  assert (select count(*) from public.ledger_records
          where account_id = 'f0f0f0f0-0000-0000-0000-000000000001') = 2,
    'only its own record went';
  assert (select count(*) from public.access_events
          where account_id = 'f0f0f0f0-0000-0000-0000-000000000001') = 0,
    'the owner''s own deletions are not logged';
end $$;

-- 3. Premium: the file goes, the document row and its record stay.
do $$ begin
  assert public.delete_document('f0f0f0f0-0000-0000-0000-0000000000d2',
                                'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', true) = 'file_deleted',
    'premium delete answers file_deleted';
  assert (select storage_key is null and file_deleted_at is not null from public.documents
          where id = 'f0f0f0f0-0000-0000-0000-0000000000d2'),
    'the row is marked as having no file';
  assert (select count(*) from public.ledger_records
          where document_id = 'f0f0f0f0-0000-0000-0000-0000000000d2') = 1,
    'its record is kept';
end $$;

-- 4. Deleting the kept record afterwards removes the row and the record.
do $$ begin
  assert public.delete_document('f0f0f0f0-0000-0000-0000-0000000000d2',
                                'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', false) = 'deleted',
    'records deleted after the file';
  assert (select count(*) from public.ledger_records
          where account_id = 'f0f0f0f0-0000-0000-0000-000000000001') = 1,
    'one record left';
end $$;

-- 5. A professional with access deletes a client's document: it is in the client's log.
set role authenticated;
select public.t_as('f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0');
select public.t_grant('fafafafa-fafa-fafa-fafa-fafafafafafa');
reset role;
do $$ begin
  assert public.delete_document('f0f0f0f0-0000-0000-0000-0000000000d3',
                                'fafafafa-fafa-fafa-fafa-fafafafafafa', false) = 'deleted',
    'a professional deletes a document';
  assert (select count(*) from public.access_events
          where account_id = 'f0f0f0f0-0000-0000-0000-000000000001' and action = 'deleted_document') = 1,
    'the deletion is logged once';
  assert (select details ->> 'fileName' from public.access_events
          where account_id = 'f0f0f0f0-0000-0000-0000-000000000001' and action = 'deleted_document') = 'power.jpg',
    'the log keeps the file name';
  assert (select (details ->> 'records')::integer from public.access_events
          where account_id = 'f0f0f0f0-0000-0000-0000-000000000001' and action = 'deleted_document') = 1,
    'the log says how many records went';
  assert (select partner_user_id from public.access_events
          where account_id = 'f0f0f0f0-0000-0000-0000-000000000001' and action = 'deleted_document')
         = 'fafafafa-fafa-fafa-fafa-fafafafafafa',
    'the log names the professional';
  assert (select count(*) from public.ledger_records
          where account_id = 'f0f0f0f0-0000-0000-0000-000000000001') = 0,
    'the ledger is empty';
end $$;

-- 6. A document that is not there answers not_found, and the log still refuses other actions.
do $$ begin
  assert public.delete_document('f0f0f0f0-0000-0000-0000-0000000000d9',
                                'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', false) = 'not_found',
    'unknown document';
end $$;
select public.t_expect_error(
  $$insert into public.access_events (account_id, action) values ('f0f0f0f0-0000-0000-0000-000000000001', 'made_up')$$,
  'access_events_action_check');

select 'ALL DOCUMENT DELETE CHECKS PASSED';
