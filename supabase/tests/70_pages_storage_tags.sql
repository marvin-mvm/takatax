-- Behaviour checks for pages counted across uploads, storage and tags
-- (20261117190000_pages_storage_tags.sql). Runs after 10_behaviour.sql (or 20_behaviour_api.sql),
-- which create the t_as(), t_expect_error() and t_grant() helpers. No psql variables, so the
-- same file works in the rolled-back dry run through the Management API.
--
-- People: O taxpayer who owns the account (c0…), B verified bookkeeper (ca…), S stranger (cb…).
-- Their emails are used by no other test file: the dry run loads every file in one transaction.

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 'pax70@example.com', '{"full_name":"Pax Uy","account_type":"taxpayer"}'),
  ('cacacaca-caca-caca-caca-cacacacacaca', 'bo70@example.com', '{"full_name":"Bo Sy","account_type":"bookkeeper"}'),
  ('cbcbcbcb-cbcb-cbcb-cbcb-cbcbcbcbcbcb', 'stray70@example.com', '{"full_name":"Stray Go","account_type":"taxpayer"}');
update public.partner_profiles set verified_at = now(), display_name = 'Bo Sy'
  where user_id = 'cacacaca-caca-caca-caca-cacacacacaca';
insert into public.accounts (id, owner_user_id) values
  ('c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0'),
  ('c0c0c0c0-0000-0000-0000-000000000002', 'cbcbcbcb-cbcb-cbcb-cbcb-cbcbcbcbcbcb');
insert into public.documents (id, account_id, kind, file_name, mime_type, bytes, page_count, status, storage_key) values
  -- Waiting to be read: a photo (1 page), a 3-page PDF, a 2-page PDF and a 5-page PDF.
  ('c0c0c0c0-0000-0000-0000-0000000000d1', 'c0c0c0c0-0000-0000-0000-000000000001', 'unknown', 'photo.jpg', 'image/jpeg', 1000000, 1, 'waiting_for_reader', 'test70/photo.jpg'),
  ('c0c0c0c0-0000-0000-0000-0000000000d2', 'c0c0c0c0-0000-0000-0000-000000000001', 'unknown', 'three.pdf', 'application/pdf', 3000000, 3, 'waiting_for_reader', 'test70/three.pdf'),
  ('c0c0c0c0-0000-0000-0000-0000000000d3', 'c0c0c0c0-0000-0000-0000-000000000001', 'unknown', 'two.pdf', 'application/pdf', 2000000, 2, 'waiting_for_reader', 'test70/two.pdf'),
  ('c0c0c0c0-0000-0000-0000-0000000000d4', 'c0c0c0c0-0000-0000-0000-000000000001', 'unknown', 'five.pdf', 'application/pdf', 5000000, 5, 'waiting_for_reader', 'test70/five.pdf'),
  -- Not in storage: one never arrived, one was deleted with its records kept.
  ('c0c0c0c0-0000-0000-0000-0000000000d5', 'c0c0c0c0-0000-0000-0000-000000000001', 'unknown', 'never.jpg', 'image/jpeg', 7000000, 1, 'waiting_for_storage', 'test70/never.jpg'),
  ('c0c0c0c0-0000-0000-0000-0000000000d6', 'c0c0c0c0-0000-0000-0000-000000000001', 'expense_receipt', 'gone.jpg', 'image/jpeg', 9000000, 1, 'accepted', null),
  -- The stranger's own document.
  ('c0c0c0c0-0000-0000-0000-0000000000e1', 'c0c0c0c0-0000-0000-0000-000000000002', 'unknown', 'theirs.jpg', 'image/jpeg', 1000, 1, 'waiting_for_reader', 'test70/theirs.jpg');
update public.documents set file_deleted_at = now() where id = 'c0c0c0c0-0000-0000-0000-0000000000d6';

-- 1. Usage: nothing read yet; storage counts only the files that are stored. The owner sees
--    it, a stranger and a visitor do not.
set role authenticated;
select public.t_as('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0');
do $$ declare u record; begin
  select * into u from public.account_usage('c0c0c0c0-0000-0000-0000-000000000001');
  assert u.tier = 'standard' and u.pages_added = 0 and u.pages_used = 0, 'a new account has used no pages';
  assert u.storage_bytes = 11000000 and u.files = 4, 'storage is the four stored files, not the missing or deleted ones';
end $$;
select public.t_as('cbcbcbcb-cbcb-cbcb-cbcb-cbcbcbcbcbcb');
do $$ begin
  assert (select count(*) from public.account_usage('c0c0c0c0-0000-0000-0000-000000000001')) = 0,
    'a stranger learns nothing about another account';
end $$;
select public.t_expect_error(
  $$select public.open_run('c0c0c0c0-0000-0000-0000-000000000001', 'cbcbcbcb-cbcb-cbcb-cbcb-cbcbcbcbcbcb',
      array['c0c0c0c0-0000-0000-0000-0000000000d1']::uuid[], 'regular', 1, 0, 80, 0, 0, false)$$,
  'permission denied');
reset role;
set role anon;
select public.t_expect_error(
  $$select * from public.account_usage('c0c0c0c0-0000-0000-0000-000000000001')$$, 'permission denied');
select public.t_expect_error(
  $$select public.tag_documents('c0c0c0c0-0000-0000-0000-000000000001',
      array['c0c0c0c0-0000-0000-0000-0000000000d1']::uuid[], array['x'], '{}')$$, 'permission denied');
reset role;

-- 2. The first run adds the account's 80 pages and uses what it reads: a photo is 1 page and a
--    3-page PDF is 3.
do $$ declare run uuid; begin
  run := public.open_run('c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    array['c0c0c0c0-0000-0000-0000-0000000000d1', 'c0c0c0c0-0000-0000-0000-0000000000d2']::uuid[],
    'regular', 4, 0, 80, 0, 0, false);
  assert run is not null, 'the first run opens';
  assert (select page_count = 4 and pages_added = 80 and document_count = 2 and status = 'paid'
                 and paid_at is not null and price_centavos = 0
                 and created_by = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0'
          from public.runs where id = run), 'the run counts 4 pages and adds 80';
  assert (select count(*) from public.documents where run_id = run) = 2, 'both documents are in the run';
end $$;
set role authenticated;
select public.t_as('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0');
do $$ declare u record; begin
  select * into u from public.account_usage('c0c0c0c0-0000-0000-0000-000000000001');
  assert u.pages_added = 80 and u.pages_used = 4, '4 of 80 pages are used';
end $$;
reset role;

-- 3. A price worked out from old numbers opens nothing: the pages left cannot be used twice.
do $$ begin
  assert public.open_run('c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    array['c0c0c0c0-0000-0000-0000-0000000000d3']::uuid[], 'regular', 2, 0, 80, 0, 0, false) is null,
    'the account changed since the price was worked out';
  assert public.open_run('c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    array['c0c0c0c0-0000-0000-0000-0000000000d3']::uuid[], 'regular', 1, 0, 0, 80, 4, false) is null,
    'the pages do not match the documents';
  assert public.open_run('c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    array['c0c0c0c0-0000-0000-0000-0000000000d1']::uuid[], 'regular', 1, 0, 0, 80, 4, false) is null,
    'a document already in a run is not run again';
  assert public.open_run('c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    array['c0c0c0c0-0000-0000-0000-0000000000e1']::uuid[], 'regular', 1, 0, 0, 80, 4, false) is null,
    'another account''s document is not run';
  assert (select count(*) from public.runs where account_id = 'c0c0c0c0-0000-0000-0000-000000000001') = 1,
    'nothing was opened';
end $$;

-- 4. The next upload uses the same 80 pages.
do $$ declare u record; begin
  assert public.open_run('c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    array['c0c0c0c0-0000-0000-0000-0000000000d3']::uuid[], 'regular', 2, 0, 0, 80, 4, false) is not null,
    'the second run opens';
  perform public.t_as('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0');
  set local role authenticated;
  select * into u from public.account_usage('c0c0c0c0-0000-0000-0000-000000000001');
  reset role;
  assert u.pages_added = 80 and u.pages_used = 6, '6 of 80 pages are used after two uploads';
end $$;

-- 5. A run that is not paid yet counts for nothing; once paid, it adds its pages and uses them.
--    Taking the free trial marks the account.
do $$ declare run uuid; u record; begin
  run := public.open_run('c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    array['c0c0c0c0-0000-0000-0000-0000000000d4']::uuid[], 'regular', 5, 14900, 90, 80, 6, true);
  assert (select status = 'awaiting_payment' and paid_at is null from public.runs where id = run),
    'a run with a price waits for its payment';
  assert (select trial_used from public.accounts where id = 'c0c0c0c0-0000-0000-0000-000000000001'),
    'the free trial is taken';
  perform public.t_as('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0');
  set local role authenticated;
  select * into u from public.account_usage('c0c0c0c0-0000-0000-0000-000000000001');
  reset role;
  assert u.pages_added = 80 and u.pages_used = 6, 'an unpaid run adds and uses nothing';
  update public.runs set status = 'paid', paid_at = now() where id = run;
  set local role authenticated;
  select * into u from public.account_usage('c0c0c0c0-0000-0000-0000-000000000001');
  reset role;
  assert u.pages_added = 170 and u.pages_used = 11, 'once paid: 11 of 170 pages';
end $$;

-- 5b. Pages come back only when nothing was read: a run whose documents were deleted before
--     reading counts for nothing, a run that read pages stays counted after its file is deleted.
do $$ declare u record; begin
  -- The 2-page run: its document is deleted before it was read.
  delete from public.documents where id = 'c0c0c0c0-0000-0000-0000-0000000000d3';
  perform public.t_as('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0');
  set local role authenticated;
  select * into u from public.account_usage('c0c0c0c0-0000-0000-0000-000000000001');
  reset role;
  assert u.pages_added = 170 and u.pages_used = 9, 'the 2 unread pages are given back';
  -- The 5-page run: read, then its document is deleted.
  update public.runs set pages_read = 5
    where id = (select run_id from public.documents where id = 'c0c0c0c0-0000-0000-0000-0000000000d4');
  delete from public.documents where id = 'c0c0c0c0-0000-0000-0000-0000000000d4';
  set local role authenticated;
  select * into u from public.account_usage('c0c0c0c0-0000-0000-0000-000000000001');
  reset role;
  assert u.pages_used = 9, 'pages that were read stay used after the file is deleted';
  assert u.files = 2, 'and the deleted files no longer take storage';
end $$;

-- 6. Tags: the owner tags two files; the same tag in another case is the same tag.
set role authenticated;
select public.t_as('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0');
do $$ begin
  assert public.tag_documents('c0c0c0c0-0000-0000-0000-000000000001',
    array['c0c0c0c0-0000-0000-0000-0000000000d1', 'c0c0c0c0-0000-0000-0000-0000000000d2',
          'c0c0c0c0-0000-0000-0000-0000000000e1']::uuid[],
    array['  Exp   Q1 2026 ', 'Rent', ''], '{}') = 2, 'two of the account''s files are tagged';
  assert public.tag_documents('c0c0c0c0-0000-0000-0000-000000000001',
    array['c0c0c0c0-0000-0000-0000-0000000000d1']::uuid[], array['EXP Q1 2026', 'Meals'], '{}') = 1,
    'a tag in another case adds nothing new';
end $$;
reset role;
do $$ begin
  assert (select tags from public.documents where id = 'c0c0c0c0-0000-0000-0000-0000000000d1')
         = array['Exp Q1 2026', 'Meals', 'Rent'], 'tags are tidied, kept once and in order';
  assert (select tags from public.documents where id = 'c0c0c0c0-0000-0000-0000-0000000000d2')
         = array['Exp Q1 2026', 'Rent'], 'the second file has the two tags';
  assert (select tags from public.documents where id = 'c0c0c0c0-0000-0000-0000-0000000000e1') = '{}',
    'another account''s file is not touched';
  assert (select count(*) from public.access_events
          where account_id = 'c0c0c0c0-0000-0000-0000-000000000001') = 0,
    'the owner''s own tagging is not logged';
end $$;

-- 7. Removing a tag, whatever its case; and what is refused.
set role authenticated;
do $$ begin
  assert public.tag_documents('c0c0c0c0-0000-0000-0000-000000000001',
    array['c0c0c0c0-0000-0000-0000-0000000000d1']::uuid[], '{}', array['rent', 'never there']) = 1,
    'a tag is removed';
end $$;
select public.t_expect_error(
  $$select public.tag_documents('c0c0c0c0-0000-0000-0000-000000000001',
      array['c0c0c0c0-0000-0000-0000-0000000000d1']::uuid[],
      array['this tag is far too long to be a tag at all'], '{}')$$, '1 to 30 characters');
select public.t_expect_error(
  $$select public.tag_documents('c0c0c0c0-0000-0000-0000-000000000001',
      array['c0c0c0c0-0000-0000-0000-0000000000d1']::uuid[], array['a,b'], '{}')$$, 'without commas');
select public.t_expect_error(
  $$select public.tag_documents('c0c0c0c0-0000-0000-0000-000000000001',
      array['c0c0c0c0-0000-0000-0000-0000000000d1']::uuid[],
      array['t1','t2','t3','t4','t5','t6','t7','t8','t9','t10'], '{}')$$, 'up to 10 tags');
select public.t_expect_error(
  $$select public.tag_documents('c0c0c0c0-0000-0000-0000-000000000001', '{}'::uuid[], array['x'], '{}')$$,
  '1 to 1,000 files');
select public.t_as('cbcbcbcb-cbcb-cbcb-cbcb-cbcbcbcbcbcb');
select public.t_expect_error(
  $$select public.tag_documents('c0c0c0c0-0000-0000-0000-000000000001',
      array['c0c0c0c0-0000-0000-0000-0000000000d1']::uuid[], array['x'], '{}')$$, 'Account not found');
reset role;
do $$ begin
  assert (select tags from public.documents where id = 'c0c0c0c0-0000-0000-0000-0000000000d1')
         = array['Exp Q1 2026', 'Meals'], 'only the removed tag went; refused changes left nothing';
end $$;

-- 8. A professional with access can tag too, and sees the pages and storage of the client's
--    account; the client's log says what they tagged.
set role authenticated;
select public.t_as('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0');
select public.t_grant('cacacaca-caca-caca-caca-cacacacacaca');
select public.t_as('cacacaca-caca-caca-caca-cacacacacaca');
do $$ declare u record; begin
  assert public.tag_documents('c0c0c0c0-0000-0000-0000-000000000001',
    array['c0c0c0c0-0000-0000-0000-0000000000d2']::uuid[], array['For filing'], '{}') = 1,
    'a professional tags a client''s file';
  select * into u from public.account_usage('c0c0c0c0-0000-0000-0000-000000000001');
  assert u.pages_added = 170 and u.pages_used = 9 and u.files = 2, 'and sees the account''s usage';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.access_events
          where account_id = 'c0c0c0c0-0000-0000-0000-000000000001' and action = 'tagged_documents') = 1,
    'the professional''s tagging is logged once';
  assert (select (details ->> 'documents')::integer = 1 and details -> 'added' = '["For filing"]'::jsonb
                 and details ->> 'partnerName' = 'Bo Sy'
          from public.access_events
          where account_id = 'c0c0c0c0-0000-0000-0000-000000000001' and action = 'tagged_documents'),
    'the log says how many files, which tags and who';
end $$;

-- 9. The log still refuses actions it does not know.
select public.t_expect_error(
  $$insert into public.access_events (account_id, action) values ('c0c0c0c0-0000-0000-0000-000000000001', 'made_up')$$,
  'access_events_action_check');

select 'ALL PAGES, STORAGE AND TAGS CHECKS PASSED';
