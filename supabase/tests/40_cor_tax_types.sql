-- Behaviour checks for the COR's tax types (20261116150000_cor_tax_types.sql). Runs after
-- 10_behaviour.sql (or 20_behaviour_api.sql), which create the t_as() helper. No psql variables,
-- so the same file works in the rolled-back dry run through the Management API.
--
-- People: C taxpayer (c…), S stranger (d…).

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cora@example.com', '{"full_name":"Cora Lim","account_type":"taxpayer"}'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'sam@example.com', '{"full_name":"Sam Tan","account_type":"taxpayer"}');
insert into public.accounts (id, owner_user_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.documents (id, account_id, kind, file_name, mime_type, bytes, status)
  values ('cccccccc-0000-0000-0000-0000000000d1', 'cccccccc-0000-0000-0000-000000000001', 'cor',
          'cor.pdf', 'application/pdf', 1000, 'needs_review');

-- 1. A new account has no tax types yet.
do $$ begin
  assert (select cor_tax_types from public.accounts where id = 'cccccccc-0000-0000-0000-000000000001') = '[]'::jsonb,
    'no tax types before the COR is confirmed';
end $$;

-- 2. Confirming the COR saves its tax types and forms, and the owner can read them.
set role authenticated;
select public.t_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
select public.confirm_cor('cccccccc-0000-0000-0000-0000000000d1', '{
  "tin": "912-345-678", "registeredName": "CORA LIM", "rdoCode": "039",
  "registeredAddress": "1 Mabini St., Brgy. 1, Manila", "lineOfBusiness": "Bookkeeping services",
  "withholdingAgent": true, "incomeTaxOption": "graduated_osd",
  "taxTypes": [
    {"taxType": "WITHHOLDING TAX - EXPANDED", "form": "0619-E", "frequency": "Monthly", "effectiveDate": null},
    {"taxType": "WITHHOLDING TAX - EXPANDED", "form": "1601-EQ", "frequency": "Quarterly", "effectiveDate": null},
    {"taxType": "PERCENTAGE TAX - QUARTERLY", "form": "2551Q", "frequency": "Quarterly", "effectiveDate": null}
  ]}');
do $$ begin
  assert (select jsonb_array_length(cor_tax_types) from public.accounts) = 3, 'three forms saved';
  assert (select cor_tax_types -> 1 ->> 'form' from public.accounts) = '1601-EQ', 'forms kept in order';
  assert (select registered_address from public.accounts) = '1 Mabini St., Brgy. 1, Manila', 'address saved';
  assert (select withholding_agent from public.accounts), 'withholding agent saved';
end $$;

-- 3. Anything that is not a list is stored as an empty list.
select public.confirm_cor('cccccccc-0000-0000-0000-0000000000d1', '{"tin":"912-345-678","registeredName":"CORA LIM","rdoCode":"039","taxTypes":"2551Q"}');
do $$ begin
  assert (select cor_tax_types from public.accounts) = '[]'::jsonb, 'non-list ignored';
end $$;

-- 4. Strangers see nothing and cannot confirm.
select public.t_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
do $$ begin
  assert (select count(*) from public.accounts where id = 'cccccccc-0000-0000-0000-000000000001') = 0, 'stranger sees no account';
end $$;
select public.t_expect_error($$select public.confirm_cor('cccccccc-0000-0000-0000-0000000000d1', '{}')$$, 'COR not found');
reset role;

select 'ALL COR TAX TYPE CHECKS PASSED';
