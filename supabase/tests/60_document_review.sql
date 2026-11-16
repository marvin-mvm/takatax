-- Behaviour checks for checking a document by hand (20261117150000_document_review.sql). Runs
-- after 10_behaviour.sql (or 20_behaviour_api.sql), which create the t_as(), t_expect_error()
-- and t_grant() helpers. No psql variables, so the same file works in the rolled-back dry run
-- through the Management API.
--
-- People: O taxpayer who owns the account (e0…), B verified bookkeeper (ea…), S stranger (eb…).
-- Their emails are used by no other test file: the dry run loads every file in one transaction.

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0e0e0e0-e0e0-e0e0-e0e0-e0e0e0e0e0e0', 'opal@example.com', '{"full_name":"Opal Reyes","account_type":"taxpayer"}'),
  ('eaeaeaea-eaea-eaea-eaea-eaeaeaeaeaea', 'bea@example.com', '{"full_name":"Bea Lim","account_type":"bookkeeper"}'),
  ('ebebebeb-ebeb-ebeb-ebeb-ebebebebebeb', 'silas@example.com', '{"full_name":"Silas Tan","account_type":"taxpayer"}');
update public.partner_profiles set verified_at = now(), display_name = 'Bea Lim'
  where user_id = 'eaeaeaea-eaea-eaea-eaea-eaeaeaeaeaea';
insert into public.accounts (id, owner_user_id) values
  ('e0e0e0e0-0000-0000-0000-000000000001', 'e0e0e0e0-e0e0-e0e0-e0e0-e0e0e0e0e0e0');
insert into public.runs (id, account_id, kind, document_count, page_count, status) values
  ('e0e0e0e0-0000-0000-0000-0000000000a1', 'e0e0e0e0-0000-0000-0000-000000000001', 'regular', 2, 2, 'review');
insert into public.documents (id, account_id, run_id, kind, file_name, mime_type, bytes, status, flags, extracted, storage_key) values
  -- d1: the AI found no date, so nothing was counted. d2: read, with one record.
  ('e0e0e0e0-0000-0000-0000-0000000000d1', 'e0e0e0e0-0000-0000-0000-000000000001',
   'e0e0e0e0-0000-0000-0000-0000000000a1', 'unknown', 'photo.jpg', 'image/jpeg', 1000, 'needs_review',
   '{missing_date,low_confidence}', '[{"kind":"expense_receipt","date":null,"totalAmount":1120}]', 'test60/photo.jpg'),
  ('e0e0e0e0-0000-0000-0000-0000000000d2', 'e0e0e0e0-0000-0000-0000-000000000001',
   'e0e0e0e0-0000-0000-0000-0000000000a1', 'expense_receipt', 'rent.jpg', 'image/jpeg', 1000, 'needs_review',
   '{vat_mismatch}', '[{"kind":"expense_receipt","date":"2026-10-05","totalAmount":18000}]', 'test60/rent.jpg'),
  -- d3: a COR. d4: still waiting to be read.
  ('e0e0e0e0-0000-0000-0000-0000000000d3', 'e0e0e0e0-0000-0000-0000-000000000001',
   null, 'cor', 'cor.pdf', 'application/pdf', 1000, 'needs_review', '{}', '{"isCor":true}', 'test60/cor.pdf'),
  ('e0e0e0e0-0000-0000-0000-0000000000d4', 'e0e0e0e0-0000-0000-0000-000000000001',
   null, 'unknown', 'later.jpg', 'image/jpeg', 1000, 'waiting_for_reader', '{}', null, 'test60/later.jpg');
insert into public.ledger_records (account_id, document_id, kind, record_date, amount_centavos) values
  ('e0e0e0e0-0000-0000-0000-000000000001', 'e0e0e0e0-0000-0000-0000-0000000000d2', 'expense', '2026-10-05', 1800000);

-- 1. Only someone signed in, with access to the account, can check a document.
set role anon;
select public.t_expect_error(
  $$select public.review_document('e0e0e0e0-0000-0000-0000-0000000000d1', '[]'::jsonb, '[]'::jsonb)$$,
  'permission denied');
reset role;
set role authenticated;
select public.t_as('ebebebeb-ebeb-ebeb-ebeb-ebebebebebeb');
select public.t_expect_error(
  $$select public.review_document('e0e0e0e0-0000-0000-0000-0000000000d1', '[]'::jsonb, '[]'::jsonb)$$,
  'Document not found');
select public.t_expect_error(
  $$select public.review_document('e0e0e0e0-0000-0000-0000-0000000000d9', '[]'::jsonb, '[]'::jsonb)$$,
  'Document not found');

-- 2. The owner fills in what the AI could not read: the record is saved and the document is
--    no longer waiting to be checked.
select public.t_as('e0e0e0e0-e0e0-e0e0-e0e0-e0e0e0e0e0e0');
do $$ begin
  assert public.review_document(
    'e0e0e0e0-0000-0000-0000-0000000000d1',
    '[{"kind":"expense_receipt","date":"2026-11-02","issuerName":"Mercury Drug","totalAmount":1120,"vatAmount":120}]'::jsonb,
    '[{"kind":"expense","record_date":"2026-11-02","counterparty":"Mercury Drug","counterparty_tin":"000-388-474-000","description":"Mercury Drug","category":"supplies","amount_centavos":112000,"vat_centavos":12000}]'::jsonb
  ) = 'accepted', 'a checked document with a record is accepted';
end $$;
reset role;
do $$ begin
  assert (select status = 'accepted' and flags = '{}' and kind = 'expense_receipt'
          from public.documents where id = 'e0e0e0e0-0000-0000-0000-0000000000d1'),
    'the document is read, with no flags left, and has its kind';
  assert (select extracted -> 0 ->> 'date' from public.documents
          where id = 'e0e0e0e0-0000-0000-0000-0000000000d1') = '2026-11-02',
    'the corrected reading replaces the AI''s';
  assert (select count(*) from public.ledger_records
          where document_id = 'e0e0e0e0-0000-0000-0000-0000000000d1'
            and kind = 'expense' and record_date = '2026-11-02' and amount_centavos = 112000
            and vat_centavos = 12000 and tax_withheld_centavos = 0 and category = 'supplies'
            and counterparty = 'Mercury Drug' and user_corrected) = 1,
    'its record is saved as corrected by a person';
  assert (select status from public.runs where id = 'e0e0e0e0-0000-0000-0000-0000000000a1') = 'review',
    'the run still waits for its other document';
  assert (select count(*) from public.access_events
          where account_id = 'e0e0e0e0-0000-0000-0000-000000000001') = 0,
    'the owner''s own checks are not logged';
end $$;

-- 3. Checking again replaces the records: nothing is counted twice.
set role authenticated;
select public.t_as('e0e0e0e0-e0e0-e0e0-e0e0-e0e0e0e0e0e0');
do $$ begin
  assert public.review_document(
    'e0e0e0e0-0000-0000-0000-0000000000d1',
    '[{"kind":"expense_receipt","date":"2026-11-03","totalAmount":1200}]'::jsonb,
    '[{"kind":"expense","record_date":"2026-11-03","amount_centavos":120000}]'::jsonb
  ) = 'accepted', 'a read document can be corrected again';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.ledger_records
          where document_id = 'e0e0e0e0-0000-0000-0000-0000000000d1') = 1, 'still one record';
  assert (select amount_centavos from public.ledger_records
          where document_id = 'e0e0e0e0-0000-0000-0000-0000000000d1') = 120000, 'with the new amount';
  assert (select counterparty = '' and counterparty_tin is null and category is null
          from public.ledger_records where document_id = 'e0e0e0e0-0000-0000-0000-0000000000d1'),
    'what was left empty stays empty';
end $$;

-- 4. A professional with access says the other document is not a tax document: its record
--    goes, it is "not counted", the run is complete, and the client's log says so.
set role authenticated;
select public.t_grant('eaeaeaea-eaea-eaea-eaea-eaeaeaeaeaea');
select public.t_as('eaeaeaea-eaea-eaea-eaea-eaeaeaeaeaea');
do $$ begin
  assert public.review_document(
    'e0e0e0e0-0000-0000-0000-0000000000d2', '[{"kind":"unknown"}]'::jsonb, '[]'::jsonb
  ) = 'rejected', 'a document with no records is not counted';
end $$;
reset role;
do $$ begin
  assert (select status = 'rejected' and kind = 'unknown' and flags = '{}'
          from public.documents where id = 'e0e0e0e0-0000-0000-0000-0000000000d2'),
    'the document is marked as not counted';
  assert (select count(*) from public.ledger_records
          where document_id = 'e0e0e0e0-0000-0000-0000-0000000000d2') = 0, 'its old record is gone';
  assert (select status from public.runs where id = 'e0e0e0e0-0000-0000-0000-0000000000a1') = 'complete',
    'the run is complete once nothing waits to be checked';
  assert (select count(*) from public.access_events
          where account_id = 'e0e0e0e0-0000-0000-0000-000000000001' and action = 'checked_document') = 1,
    'the professional''s check is logged once';
  assert (select details ->> 'fileName' = 'rent.jpg' and (details ->> 'records')::integer = 0
                 and details ->> 'partnerName' = 'Bea Lim'
          from public.access_events
          where account_id = 'e0e0e0e0-0000-0000-0000-000000000001' and action = 'checked_document'),
    'the log keeps the file name, the records saved and who did it';
  assert (select partner_user_id from public.access_events
          where account_id = 'e0e0e0e0-0000-0000-0000-000000000001' and action = 'checked_document')
         = 'eaeaeaea-eaea-eaea-eaea-eaeaeaeaeaea', 'the log names the professional';
end $$;

-- 5. What cannot be checked this way, and what is refused.
set role authenticated;
select public.t_as('e0e0e0e0-e0e0-e0e0-e0e0-e0e0e0e0e0e0');
select public.t_expect_error(
  $$select public.review_document('e0e0e0e0-0000-0000-0000-0000000000d3', '[]'::jsonb, '[]'::jsonb)$$,
  'COR');
select public.t_expect_error(
  $$select public.review_document('e0e0e0e0-0000-0000-0000-0000000000d4', '[]'::jsonb, '[]'::jsonb)$$,
  'not been read');
select public.t_expect_error(
  $$select public.review_document('e0e0e0e0-0000-0000-0000-0000000000d1', '{}'::jsonb, '[]'::jsonb)$$,
  'as lists');
select public.t_expect_error(
  $$select public.review_document('e0e0e0e0-0000-0000-0000-0000000000d1', '[]'::jsonb,
      '[{"kind":"gift","record_date":"2026-11-03","amount_centavos":100}]'::jsonb)$$,
  'needs a kind');
select public.t_expect_error(
  $$select public.review_document('e0e0e0e0-0000-0000-0000-0000000000d1', '[]'::jsonb,
      '[{"kind":"expense","amount_centavos":100}]'::jsonb)$$,
  'needs a kind');
select public.t_expect_error(
  $$select public.review_document('e0e0e0e0-0000-0000-0000-0000000000d1', '[]'::jsonb,
      '[{"kind":"expense","record_date":"2026-11-03","amount_centavos":-100}]'::jsonb)$$,
  'not negative');
reset role;
do $$ begin
  assert (select amount_centavos from public.ledger_records
          where document_id = 'e0e0e0e0-0000-0000-0000-0000000000d1') = 120000,
    'a refused check changes nothing';
  assert (select status from public.documents where id = 'e0e0e0e0-0000-0000-0000-0000000000d1') = 'accepted',
    'nor the document';
end $$;

-- 6. The log still refuses actions it does not know.
select public.t_expect_error(
  $$insert into public.access_events (account_id, action) values ('e0e0e0e0-0000-0000-0000-000000000001', 'made_up')$$,
  'access_events_action_check');

select 'ALL DOCUMENT REVIEW CHECKS PASSED';
