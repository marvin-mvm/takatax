-- The same checks as 10_behaviour.sql without psql variables, for a dry run through the
-- Supabase Management API: send "begin;", both migrations, this file and "rollback;" as one
-- query. It creates test users and rows, and the rollback removes every trace of them.
-- Fixed ids for the people in the test.

create table public.t_vars (name text primary key, value uuid);
grant all on public.t_vars to anon, authenticated;

create function public.t_expect_error(statement text, pattern text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm !~* pattern then
      raise exception 'Expected an error like "%", got "%" for: %', pattern, sqlerrm, statement;
    end if;
    return;
  end;
  raise exception 'Expected an error like "%" for: %', pattern, statement;
end $$;
grant execute on function public.t_expect_error(text, text) to anon, authenticated;

create function public.t_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, false)
$$;
grant execute on function public.t_as(uuid) to anon, authenticated;

-- 1. Sign-ups create profiles; partners also get a partner profile.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com', '{"full_name":"Ana Santos","account_type":"taxpayer"}'),
  ('22222222-2222-2222-2222-222222222222', 'ben@example.com', '{"full_name":"Ben Reyes"}'),
  ('33333333-3333-3333-3333-333333333333', 'pia@example.com', '{"full_name":"Pia Cruz","account_type":"bookkeeper"}'),
  ('44444444-4444-4444-4444-444444444444', 'carl@example.com', '{"full_name":"Carl Lim","account_type":"cpa"}'),
  ('55555555-5555-5555-5555-555555555555', 'staff@example.com', '{"full_name":"Staff","account_type":"nonsense"}');
insert into public.admins (user_id) values ('55555555-5555-5555-5555-555555555555');
do $$ begin
  assert (select count(*) from public.profiles) = 5, 'five profiles';
  assert (select count(*) from public.partner_profiles) = 2, 'two partner profiles';
  assert (select role from public.profiles where user_id = '55555555-5555-5555-5555-555555555555') = 'taxpayer', 'unknown type becomes taxpayer';
end $$;

-- 2. Partners cannot verify themselves; they can edit their public details.
set role authenticated;
select public.t_as('33333333-3333-3333-3333-333333333333');
select public.t_expect_error($$update public.partner_profiles set verified_at = now() where user_id = auth.uid()$$, 'permission denied');
select public.t_expect_error($$update public.partner_profiles set rating_avg = 5 where user_id = auth.uid()$$, 'permission denied');
update public.partner_profiles set display_name = 'Pia Cruz', city = 'Cebu City', bir_accreditation_no = 'BIR-123' where user_id = auth.uid();
select public.t_expect_error($$select public.verify_partner(auth.uid(), true)$$, 'Only Takatax staff');

-- 3. Taxpayers cannot change their role.
select public.t_as('11111111-1111-1111-1111-111111111111');
select public.t_expect_error($$update public.profiles set role = 'cpa' where user_id = auth.uid()$$, 'permission denied');
update public.profiles set full_name = 'Ana M. Santos' where user_id = auth.uid();

-- 4. Staff verify P1.
select public.t_as('55555555-5555-5555-5555-555555555555');
select public.verify_partner('33333333-3333-3333-3333-333333333333', true);
reset role;
do $$ begin assert (select verified_at is not null from public.partner_profiles where user_id = '33333333-3333-3333-3333-333333333333'), 'p1 verified'; end $$;

-- 5. Access: only verified partners; creates the account.
set role authenticated;
select public.t_as('11111111-1111-1111-1111-111111111111');
select public.t_expect_error($$select public.grant_partner_access('44444444-4444-4444-4444-444444444444')$$, 'Only verified');
select public.grant_partner_access('33333333-3333-3333-3333-333333333333');
do $$ begin
  assert (select count(*) from public.accounts) = 1, 't1 sees own account';
  assert (select count(*) from public.partner_access where revoked_at is null) = 1, 't1 sees the grant';
  assert (select pp.display_name from public.partner_access pa join public.partner_profiles pp on pp.user_id = pa.partner_user_id) = 'Pia Cruz', 'partner name visible';
end $$;

-- 6. The partner sees the client account and name; not other people.
select public.t_as('33333333-3333-3333-3333-333333333333');
do $$ begin
  assert (select count(*) from public.accounts) = 1, 'p1 sees client account';
  assert (select full_name from public.profiles where user_id = '11111111-1111-1111-1111-111111111111') = 'Ana M. Santos', 'p1 sees client name';
  assert (select count(*) from public.profiles where user_id = '22222222-2222-2222-2222-222222222222') = 0, 'p1 does not see strangers';
end $$;

-- 7. Chat: taxpayer starts, both read, the list shows names and the last message.
select public.t_as('11111111-1111-1111-1111-111111111111');
select public.t_expect_error($$select public.start_conversation('44444444-4444-4444-4444-444444444444')$$, 'verified professionals only');
insert into public.t_vars values ('convo', public.start_conversation('33333333-3333-3333-3333-333333333333'));
insert into public.messages (conversation_id, body) values ((select value from public.t_vars where name = 'convo'), 'Hello, can you help with my 2551Q?');
select public.t_expect_error(format($$insert into public.messages (conversation_id, body) values (%L, '   ')$$, (select value from public.t_vars where name = 'convo')), 'check constraint');
select public.t_as('33333333-3333-3333-3333-333333333333');
insert into public.messages (conversation_id, body) values ((select value from public.t_vars where name = 'convo'), 'Yes. Please upload your sales invoices.');
do $$ begin
  assert (select count(*) from public.messages) = 2, 'p1 reads both messages';
  assert (select taxpayer_name from public.conversation_list) = 'Ana M. Santos', 'list shows the taxpayer name';
  assert (select last_body from public.conversation_list) like 'Yes.%', 'list shows the last message';
end $$;
select public.t_as('11111111-1111-1111-1111-111111111111');
do $$ begin
  assert (select partner_name from public.conversation_list) = 'Pia Cruz', 'list shows the partner name';
  assert (select last_message_at > taxpayer_read_at from public.conversation_list), 'unread for t1';
end $$;
select public.mark_conversation_read((select value from public.t_vars where name = 'convo'));
do $$ begin assert (select last_message_at <= taxpayer_read_at from public.conversation_list), 'read after opening'; end $$;

-- 8. Messages cannot be edited or deleted, by anyone.
select public.t_expect_error($$update public.messages set body = 'changed'$$, 'permission denied');
select public.t_expect_error($$delete from public.messages$$, 'permission denied');
select public.t_expect_error($$update public.conversations set last_message_at = now()$$, 'permission denied');
reset role;
select public.t_expect_error($$update public.messages set body = 'changed'$$, 'cannot be edited');
select public.t_expect_error($$delete from public.messages$$, 'cannot be deleted');

-- 9. Outsiders see nothing and cannot write in.
set role authenticated;
select public.t_as('22222222-2222-2222-2222-222222222222');
do $$ begin
  assert (select count(*) from public.messages) = 0, 't2 sees no messages';
  assert (select count(*) from public.conversations) = 0, 't2 sees no conversations';
  assert (select count(*) from public.accounts) = 0, 't2 sees no accounts';
end $$;
select public.t_expect_error(format($$insert into public.messages (conversation_id, body) values (%L, 'hi')$$, (select value from public.t_vars where name = 'convo')), 'row-level security');
select public.t_as('33333333-3333-3333-3333-333333333333');
select public.t_expect_error($$select public.start_conversation('22222222-2222-2222-2222-222222222222')$$, 'clients only');
do $$ begin assert (select public.start_conversation('11111111-1111-1111-1111-111111111111')) is not null, 'partner reopens client chat'; end $$;

-- 10. Removing access hides the account at once; granting again restores it.
select public.t_as('11111111-1111-1111-1111-111111111111');
select public.revoke_partner_access('33333333-3333-3333-3333-333333333333');
select public.t_as('33333333-3333-3333-3333-333333333333');
do $$ begin
  assert (select count(*) from public.accounts) = 0, 'revoked partner loses the account';
  assert (select count(*) from public.messages) = 2, 'chat stays after access is removed';
end $$;
select public.t_as('11111111-1111-1111-1111-111111111111');
select public.grant_partner_access('33333333-3333-3333-3333-333333333333');
select public.t_as('33333333-3333-3333-3333-333333333333');
do $$ begin assert (select count(*) from public.accounts) = 1, 'access restored'; end $$;
select public.leave_client((select id from public.accounts limit 1));
do $$ begin assert (select count(*) from public.accounts) = 0, 'partner left the client'; end $$;
select public.t_as('11111111-1111-1111-1111-111111111111');
select public.grant_partner_access('33333333-3333-3333-3333-333333333333');

-- 11. Ledger and account columns the browser may and may not change.
reset role;
insert into public.ledger_records (account_id, kind, record_date, amount_centavos)
  select id, 'sale', '2026-10-01', 100000 from public.accounts;
set role authenticated;
select public.t_as('33333333-3333-3333-3333-333333333333');
update public.ledger_records set amount_centavos = 120000, user_corrected = true;
do $$ begin assert (select amount_centavos from public.ledger_records) = 120000, 'partner corrects ledger'; end $$;
select public.t_expect_error($$update public.ledger_records set account_id = gen_random_uuid()$$, 'permission denied');
select public.t_as('11111111-1111-1111-1111-111111111111');
select public.t_expect_error($$update public.accounts set trial_used = true$$, 'permission denied');
select public.t_expect_error($$update public.accounts set premium_until = now() + interval '1 year'$$, 'permission denied');
update public.accounts set registered_name = 'ANA SANTOS', tin = '123456789000';

-- 11b. COR confirmation: the owner or their partner; never someone else.
reset role;
insert into public.documents (id, account_id, kind, file_name, mime_type, bytes, status, extracted)
  select '66666666-6666-6666-6666-666666666666', id, 'cor', 'cor.jpg', 'image/jpeg', 1000, 'needs_review', '{"tin":"999"}' from public.accounts;
set role authenticated;
select public.t_as('22222222-2222-2222-2222-222222222222');
select public.t_expect_error($$select public.confirm_cor('66666666-6666-6666-6666-666666666666', '{}')$$, 'COR not found');
select public.t_as('33333333-3333-3333-3333-333333333333');
select public.confirm_cor('66666666-6666-6666-6666-666666666666',
  '{"tin":"123-456-789-000","registeredName":"ANA SANTOS","rdoCode":"081","registrationDate":"2024-02-01","vatRegistered":false,"incomeTaxOption":"eight_percent","businessType":"services"}');
do $$ begin
  assert (select tin from public.accounts) = '123456789000', 'tin digits only';
  assert (select income_tax_option from public.accounts) = 'eight_percent', 'option saved';
  assert (select cor_document_id from public.accounts) = '66666666-6666-6666-6666-666666666666', 'cor linked';
  assert (select status from public.documents where id = '66666666-6666-6666-6666-666666666666') = 'accepted', 'cor accepted';
end $$;

-- 12. Changing an accreditation number needs a new check.
select public.t_as('33333333-3333-3333-3333-333333333333');
update public.partner_profiles set bir_accreditation_no = 'BIR-999' where user_id = auth.uid();
reset role;
do $$ begin assert (select verified_at is null from public.partner_profiles where user_id = '33333333-3333-3333-3333-333333333333'), 'reverification needed'; end $$;
update public.partner_profiles set verified_at = now() where user_id = '33333333-3333-3333-3333-333333333333';

-- 13. Community: anonymous posts, verified answers, "This helped", delete own post.
set role authenticated;
select public.t_as('11111111-1111-1111-1111-111111111111');
insert into public.community_posts (title, body) values ('How do I file 2551Q?', 'My TIN is 123-456-789-000 and I earned ₱50,000.');
select public.t_expect_error($$select author_user_id from public.community_posts$$, 'permission denied');
insert into public.t_vars select 'post', id from public.community_posts_public limit 1;
do $$ begin assert (select body from public.community_posts_public) like '%[TIN •••]%₱•••%', 'post redacted'; end $$;
select public.t_expect_error(format($$update public.community_posts set title = 'Changed title' where id = %L$$, (select value from public.t_vars where name = 'post')), 'permission denied');
select public.t_as('44444444-4444-4444-4444-444444444444');
select public.t_expect_error(format($$insert into public.community_answers (post_id, body) values (%L, 'Unverified answer here')$$, (select value from public.t_vars where name = 'post')), 'row-level security');
select public.t_as('33333333-3333-3333-3333-333333333333');
insert into public.community_answers (post_id, body) values ((select value from public.t_vars where name = 'post'), 'File it by the 25th after the quarter.');
select public.t_as('22222222-2222-2222-2222-222222222222');
do $$ begin assert not public.is_my_post((select id from public.community_posts_public limit 1)), 'not t2s post'; end $$;
select public.delete_my_post((select value from public.t_vars where name = 'post'));
select public.mark_answer_helpful((select id from public.community_answers limit 1), true);
do $$ begin assert (select count(*) from public.community_posts_public) = 1, 't2 cannot delete'; end $$;
do $$ begin assert not (select helpful from public.community_answers limit 1), 't2 cannot mark helpful'; end $$;
select public.t_as('11111111-1111-1111-1111-111111111111');
do $$ begin assert public.is_my_post((select id from public.community_posts_public limit 1)), 't1 owns the post'; end $$;
select public.mark_answer_helpful((select id from public.community_answers limit 1), true);
do $$ begin assert (select helpful from public.community_answers limit 1), 't1 marked helpful'; end $$;
reset role;
set role anon;
select set_config('request.jwt.claims', '', false);
do $$ begin
  assert (select count(*) from public.community_posts_public) = 1, 'anon sees public post';
  assert (select partner_name from public.community_answers_public) = 'Pia Cruz', 'anon sees named answer';
end $$;
reset role;
set role authenticated;
select public.t_as('11111111-1111-1111-1111-111111111111');
select public.delete_my_post((select value from public.t_vars where name = 'post'));
do $$ begin assert (select count(*) from public.community_posts_public) = 0, 't1 deleted post'; end $$;

-- 14. Reviews: only clients; the author stays hidden.
insert into public.partner_reviews (partner_user_id, rating, body) values ('33333333-3333-3333-3333-333333333333', 5, 'Very helpful');
select public.t_as('22222222-2222-2222-2222-222222222222');
select public.t_expect_error($$insert into public.partner_reviews (partner_user_id, rating, body) values ('33333333-3333-3333-3333-333333333333', 1, 'Never met')$$, 'row-level security');
select public.t_expect_error($$select author_user_id from public.partner_reviews$$, 'permission denied');
reset role;
do $$ begin assert (select rating_avg from public.partner_profiles where user_id = '33333333-3333-3333-3333-333333333333') = 5.0, 'rating updated'; end $$;

-- 15. Server-only tables and functions.
set role authenticated;
select public.t_as('11111111-1111-1111-1111-111111111111');
select public.t_expect_error($$insert into public.payments (account_id, payer_user_id, purpose, amount_centavos) select id, auth.uid(), 'run', 19900 from public.accounts$$, 'permission denied');
select public.t_expect_error($$select public.ai_spend_today()$$, 'permission denied');
select public.t_expect_error($$select * from public.ai_spend$$, 'permission denied|row-level');
reset role;
do $$ begin assert public.ai_spend_today() = 0, 'server reads spend'; end $$;

-- 16. Deleting a person removes their conversations and messages (cascades are allowed).
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.messages) = 0, 'messages removed with the account';
  assert (select count(*) from public.conversations) = 0, 'conversation removed with the account';
end $$;

select 'ALL BEHAVIOUR CHECKS PASSED';
