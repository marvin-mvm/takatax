-- Behaviour checks for invitations, what professionals can see, and the activity log
-- (20261116120000_invitations_activity.sql). Runs after 10_behaviour.sql (or
-- 20_behaviour_api.sql), which create the t_as() and t_expect_error() helpers. No psql
-- variables, so the same file works in the rolled-back dry run through the Management API.
--
-- People: T taxpayer (7…), P verified bookkeeper (8…), Q verified CPA (9…), X stranger (a…).

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('77777777-7777-7777-7777-777777777777', 'tess@example.com', '{"full_name":"Tess Uy","account_type":"taxpayer"}'),
  ('88888888-8888-8888-8888-888888888888', 'paolo@example.com', '{"full_name":"Paolo Dizon","account_type":"bookkeeper"}'),
  ('99999999-9999-9999-9999-999999999999', 'quin@example.com', '{"full_name":"Quin Sy","account_type":"cpa"}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'xavi@example.com', '{"full_name":"Xavi Go","account_type":"taxpayer"}');
update public.partner_profiles set verified_at = now(), display_name = 'Paolo Dizon'
  where user_id = '88888888-8888-8888-8888-888888888888';
update public.partner_profiles set verified_at = now(), display_name = 'Quin Sy, CPA'
  where user_id = '99999999-9999-9999-9999-999999999999';

-- 1. Only taxpayers invite, and only verified professionals.
set role authenticated;
select public.t_as('88888888-8888-8888-8888-888888888888');
select public.t_expect_error($$select public.invite_partner('99999999-9999-9999-9999-999999999999')$$, 'Only taxpayers');
select public.t_as('77777777-7777-7777-7777-777777777777');
select public.t_expect_error($$select public.invite_partner('77777777-7777-7777-7777-777777777777')$$, 'cannot invite yourself');
select public.t_expect_error($$select public.invite_partner('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$, 'Only verified');
select public.t_expect_error($$select public.grant_partner_access('88888888-8888-8888-8888-888888888888')$$, 'does not exist');

-- 2. An invitation is pending: the professional sees it, but not the account.
select public.invite_partner('88888888-8888-8888-8888-888888888888');
select public.invite_partner('88888888-8888-8888-8888-888888888888'); -- again: no change
update public.accounts set trade_name = 'Tess Bakes';
do $$ begin
  assert (select count(*) from public.partner_access) = 1, 'one invitation row';
  assert (select status from public.partner_access) = 'pending', 'invitation pending';
  assert (select granted_at is null and ended_at is null from public.partner_access), 'no access dates yet';
end $$;
select public.t_as('88888888-8888-8888-8888-888888888888');
do $$ begin
  assert (select count(*) from public.my_invitations()) = 1, 'p sees the invitation';
  assert (select taxpayer_name from public.my_invitations()) = 'Tess Uy', 'invitation names the taxpayer';
  assert (select business_name from public.my_invitations()) = 'Tess Bakes', 'invitation names the business';
  assert (select count(*) from public.accounts) = 0, 'pending: no account';
  assert (select count(*) from public.documents) = 0, 'pending: no documents';
  assert not public.has_account_access((select account_id from public.my_invitations())), 'pending: no access';
  assert (select public.start_conversation('77777777-7777-7777-7777-777777777777')) is not null, 'p can message who invited them';
end $$;
select public.t_expect_error($$select public.log_access_event((select account_id from public.my_invitations()), 'opened_account')$$, 'do not have access');

-- 3. The taxpayer cancels; the professional can no longer answer.
select public.t_as('77777777-7777-7777-7777-777777777777');
select public.cancel_partner_invite('88888888-8888-8888-8888-888888888888');
select public.t_expect_error($$select public.cancel_partner_invite('88888888-8888-8888-8888-888888888888')$$, 'no open invitation');
do $$ begin assert (select status from public.partner_access) = 'cancelled', 'cancelled'; end $$;
select public.t_as('88888888-8888-8888-8888-888888888888');
do $$ begin assert (select count(*) from public.my_invitations()) = 0, 'cancelled invitation gone'; end $$;
select public.t_expect_error($$select public.respond_to_invite((select account_id from public.partner_access limit 1), true)$$, 'no longer open');

-- 4. Invited again, the professional declines.
select public.t_as('77777777-7777-7777-7777-777777777777');
select public.invite_partner('88888888-8888-8888-8888-888888888888');
select public.t_as('88888888-8888-8888-8888-888888888888');
select public.respond_to_invite((select account_id from public.my_invitations()), false);
do $$ begin
  assert (select status from public.partner_access) = 'declined', 'declined';
  assert (select count(*) from public.accounts) = 0, 'declined: no account';
end $$;

-- 5. Invited again, the professional accepts and sees the records and COR.
select public.t_as('77777777-7777-7777-7777-777777777777');
select public.invite_partner('88888888-8888-8888-8888-888888888888');
select public.t_as('88888888-8888-8888-8888-888888888888');
select public.respond_to_invite((select account_id from public.my_invitations()), true);
do $$ begin
  assert (select status from public.partner_access) = 'active', 'accepted';
  assert (select count(*) from public.accounts) = 1, 'p sees the account';
  assert (select trade_name from public.accounts) = 'Tess Bakes', 'p reads the COR fields';
end $$;
select public.t_as('77777777-7777-7777-7777-777777777777');
select public.t_expect_error($$select public.invite_partner('88888888-8888-8888-8888-888888888888')$$, 'already has access');

-- 6. Billing stays with the owner: no one reads the trial or Premium columns directly.
select public.t_as('88888888-8888-8888-8888-888888888888');
select public.t_expect_error($$select trial_used from public.accounts$$, 'permission denied');
select public.t_expect_error($$select premium_until from public.accounts$$, 'permission denied');
select public.t_expect_error($$select * from public.accounts$$, 'permission denied');
do $$ begin assert (select count(*) from public.my_plan()) = 0, 'p has no plan of their own'; end $$;
select public.t_as('77777777-7777-7777-7777-777777777777');
select public.t_expect_error($$select trial_used from public.accounts$$, 'permission denied');
do $$ begin
  assert (select count(*) from public.my_plan()) = 1, 'owner reads the plan';
  assert (select not trial_used from public.my_plan()), 'trial not used';
end $$;

-- 7. Runs: the owner sees all; the professional only the ones they started (logged).
reset role;
insert into public.runs (account_id, kind, document_count, page_count, status, created_by)
  select id, 'regular', 3, 5, 'paid', owner_user_id from public.accounts
  where owner_user_id = '77777777-7777-7777-7777-777777777777';
insert into public.runs (account_id, kind, document_count, page_count, status, created_by)
  select id, 'partner', 2, 4, 'paid', '88888888-8888-8888-8888-888888888888' from public.accounts
  where owner_user_id = '77777777-7777-7777-7777-777777777777';
set role authenticated;
select public.t_as('88888888-8888-8888-8888-888888888888');
do $$ begin assert (select count(*) from public.runs) = 1, 'p sees only their run'; end $$;
select public.t_as('77777777-7777-7777-7777-777777777777');
do $$ begin assert (select count(*) from public.runs) = 2, 'owner sees every run'; end $$;

-- 8. What the professional opens is logged once per visit; the owner's own visits are not.
select public.t_as('88888888-8888-8888-8888-888888888888');
select public.log_access_event((select id from public.accounts), 'opened_account');
select public.log_access_event((select id from public.accounts), 'opened_account');
select public.t_expect_error($$select public.log_access_event((select id from public.accounts), 'deleted_everything')$$, 'Unknown activity');
select public.t_as('77777777-7777-7777-7777-777777777777');
select public.log_access_event((select id from public.accounts), 'opened_account');
select public.t_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select public.t_expect_error($$select public.log_access_event((select account_id from public.partner_access limit 1), 'opened_account')$$, 'do not have access');

-- 9. Uploads by the professional are logged when the file reaches storage; opening a file
--    keeps its name.
reset role;
insert into public.documents (id, account_id, kind, file_name, mime_type, bytes, page_count, status, uploaded_by)
  select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', id, 'sales_invoice', 'invoice-0042.pdf',
         'application/pdf', 5000, 2, 'waiting_for_storage', '88888888-8888-8888-8888-888888888888'
  from public.accounts where owner_user_id = '77777777-7777-7777-7777-777777777777';
insert into public.documents (id, account_id, kind, file_name, mime_type, bytes, status, uploaded_by)
  select 'cccccccc-cccc-cccc-cccc-cccccccccccc', id, 'expense_receipt', 'owner-receipt.jpg',
         'image/jpeg', 900, 'waiting_for_storage', owner_user_id
  from public.accounts where owner_user_id = '77777777-7777-7777-7777-777777777777';
update public.documents set status = 'waiting_for_reader'
  where id in ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
update public.documents set status = 'reading'
  where id in ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
set role authenticated;
select public.t_as('88888888-8888-8888-8888-888888888888');
select public.log_access_event((select id from public.accounts), 'opened_document', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select public.t_expect_error($$select public.log_access_event((select id from public.accounts), 'opened_document', gen_random_uuid())$$, 'Document not found');
select public.log_access_event((select id from public.accounts), 'asked_assistant');

-- 10. Corrections by the professional are logged with the old and new figures.
reset role;
insert into public.ledger_records (id, account_id, kind, record_date, counterparty, amount_centavos)
  select 'dddddddd-dddd-dddd-dddd-dddddddddddd', id, 'sale', '2026-10-05', 'Cafe Uno', 150000
  from public.accounts where owner_user_id = '77777777-7777-7777-7777-777777777777';
set role authenticated;
select public.t_as('88888888-8888-8888-8888-888888888888');
update public.ledger_records set amount_centavos = 165000, user_corrected = true, updated_at = now();
update public.ledger_records set updated_at = now(); -- nothing a person sees changed: not logged
select public.t_as('77777777-7777-7777-7777-777777777777');
update public.ledger_records set counterparty = 'Cafe Uno Inc.'; -- the owner: not logged

-- 11. Confirming the COR on the client's behalf is logged with what changed.
reset role;
insert into public.documents (id, account_id, kind, file_name, mime_type, bytes, status)
  select 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', id, 'cor', 'cor.jpg', 'image/jpeg', 1000, 'needs_review'
  from public.accounts where owner_user_id = '77777777-7777-7777-7777-777777777777';
set role authenticated;
select public.t_as('88888888-8888-8888-8888-888888888888');
select public.confirm_cor('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '{"tin":"987654321000","registeredName":"TESS UY","tradeName":"Tess Bakes","rdoCode":"050","vatRegistered":false,"incomeTaxOption":"eight_percent","businessType":"goods"}');

-- 12. Only the owner reads the log, and no one can change it.
do $$ begin assert (select count(*) from public.access_events) = 0, 'p cannot read the log'; end $$;
select public.t_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$ begin assert (select count(*) from public.access_events) = 0, 'x cannot read the log'; end $$;
select public.t_as('77777777-7777-7777-7777-777777777777');
do $$
declare
  seen text[];
begin
  select array_agg(action order by created_at) into seen from public.access_events;
  assert seen = array[
    'invited', 'invite_cancelled', 'invited', 'declined', 'invited', 'accepted',
    'started_reading', 'opened_account', 'uploaded_document', 'opened_document',
    'asked_assistant', 'edited_record', 'confirmed_cor'
  ], format('log in order, got %s', seen);
  assert (select count(*) from public.access_events where actor_user_id = '77777777-7777-7777-7777-777777777777') = 4,
    'the owner did the three invitations and the cancel';
  assert (select details ->> 'partnerName' from public.access_events where action = 'accepted') = 'Paolo Dizon',
    'the name is kept with the entry';
  assert (select details ->> 'fileName' from public.access_events where action = 'uploaded_document') = 'invoice-0042.pdf',
    'upload keeps the file name';
  assert (select (details -> 'pages')::int from public.access_events where action = 'started_reading') = 4,
    'run pages kept';
  assert (select details #>> '{changes,amount_centavos,from}' from public.access_events where action = 'edited_record') = '150000',
    'old figure kept';
  assert (select details #>> '{changes,amount_centavos,to}' from public.access_events where action = 'edited_record') = '165000',
    'new figure kept';
  assert (select details #>> '{changes,tin,to}' from public.access_events where action = 'confirmed_cor') = '987654321000',
    'COR change kept';
end $$;
select public.t_expect_error($$insert into public.access_events (account_id, action) select id, 'opened_account' from public.accounts$$, 'permission denied');
select public.t_expect_error($$update public.access_events set action = 'invited'$$, 'permission denied');
select public.t_expect_error($$delete from public.access_events$$, 'permission denied');
select public.t_expect_error($$select public.write_access_event(gen_random_uuid(), null, null, 'invited', null, '{}')$$, 'permission denied');
reset role;
select public.t_expect_error($$update public.access_events set action = 'invited'$$, 'cannot be changed');
select public.t_expect_error($$delete from public.access_events$$, 'cannot be changed');

-- 13. Removing access works at once and is logged; the chat stays. Leaving is logged too.
set role authenticated;
select public.t_as('77777777-7777-7777-7777-777777777777');
select public.revoke_partner_access('88888888-8888-8888-8888-888888888888');
select public.t_as('88888888-8888-8888-8888-888888888888');
do $$ begin
  assert (select count(*) from public.accounts) = 0, 'revoked: no account';
  assert (select count(*) from public.ledger_records) = 0, 'revoked: no records';
  assert (select count(*) from public.runs) = 0, 'revoked: no runs';
  assert (select count(*) from public.conversations) = 1, 'revoked: chat stays';
end $$;
select public.t_as('77777777-7777-7777-7777-777777777777');
select public.invite_partner('88888888-8888-8888-8888-888888888888');
select public.t_as('88888888-8888-8888-8888-888888888888');
select public.respond_to_invite((select account_id from public.my_invitations()), true);
select public.leave_client((select id from public.accounts));
do $$ begin assert (select count(*) from public.accounts) = 0, 'left: no account'; end $$;
select public.t_as('77777777-7777-7777-7777-777777777777');
do $$ begin
  assert (select status from public.partner_access) = 'left', 'status left';
  assert (select count(*) from public.access_events where action in ('access_removed', 'left')) = 2,
    'removal and leaving logged';
end $$;

-- 14. Reviews: only after real access, not after an invitation alone.
select public.invite_partner('99999999-9999-9999-9999-999999999999');
select public.t_expect_error($$insert into public.partner_reviews (partner_user_id, rating, body) values ('99999999-9999-9999-9999-999999999999', 1, 'Only invited')$$, 'row-level security');
insert into public.partner_reviews (partner_user_id, rating, body) values ('88888888-8888-8888-8888-888888888888', 5, 'Careful and quick');

-- 15. Deleting the taxpayer removes their log with the account (cascades are allowed).
reset role;
delete from auth.users where id = '88888888-8888-8888-8888-888888888888';
do $$ begin
  assert (select count(*) from public.access_events where partner_user_id is null) > 0, 'deleted professional cleared';
  assert (select count(*) from public.access_events where details ->> 'partnerName' = 'Paolo Dizon') > 0, 'name kept';
end $$;
delete from auth.users where id = '77777777-7777-7777-7777-777777777777';
do $$ begin
  assert (select count(*) from public.access_events
          where details ->> 'partnerName' in ('Paolo Dizon', 'Quin Sy, CPA')) = 0,
    'log removed with the account';
end $$;

select 'ALL INVITATION CHECKS PASSED';
