-- =============================================================================================
-- Takatax, part 3: invitations and the activity log.
--
-- - Only a taxpayer invites a professional (bookkeeper, CPA or tax lawyer) into their account.
--   The professional accepts or declines. The taxpayer can cancel an invitation and remove
--   access; the professional can leave. There are no firms or groups yet.
-- - Professionals see the client's documents (receipts, sales, Forms 2307, COR), ledger and
--   tracker. They do not see the client's plan, payments or who else has access.
-- - Every invitation step, and what a professional opens or changes inside the account, is
--   written to an activity log that only the account owner can read, and nobody can edit.
--
-- Applies on top of 20261115140000_chat_access_payments.sql.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Invitations: partner_access gets a status
-- ---------------------------------------------------------------------------------------------

-- One row per taxpayer and professional (unique account_id, partner_user_id), reused when the
-- taxpayer invites the same professional again. The full history is in access_events.
--   pending   invited, waiting for the professional
--   active    accepted: the professional can see the account
--   declined  the professional said no
--   cancelled the taxpayer withdrew the invitation before an answer
--   revoked   the taxpayer removed access
--   left      the professional stopped working on the account
alter table public.partner_access rename column revoked_at to ended_at;
alter table public.partner_access
  add column status text not null default 'active'
    check (status in ('pending', 'active', 'declined', 'cancelled', 'revoked', 'left')),
  add column invited_at timestamptz not null default now(),
  add column responded_at timestamptz;
update public.partner_access set status = 'revoked' where ended_at is not null;
update public.partner_access set invited_at = granted_at, responded_at = granted_at;
alter table public.partner_access alter column status set default 'pending';
-- granted_at: when access began (the answer "accept"); ended_at: when the invitation or the
-- access ended, for any of the reasons above.
alter table public.partner_access alter column granted_at drop not null;
alter table public.partner_access alter column granted_at drop default;
alter table public.partner_access add constraint partner_access_dates check (
  case status
    when 'pending' then granted_at is null and ended_at is null
    when 'active' then granted_at is not null and ended_at is null
    when 'declined' then granted_at is null and ended_at is not null
    when 'cancelled' then granted_at is null and ended_at is not null
    else granted_at is not null and ended_at is not null
  end
);
create index partner_access_partner_idx on public.partner_access (partner_user_id, status);

-- Only accepted, current access opens the account. Every policy and edge function checks
-- access through this function.
create or replace function public.has_account_access(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.accounts a where a.id = target and a.owner_user_id = auth.uid())
      or exists (
        select 1 from public.partner_access pa
        where pa.account_id = target and pa.partner_user_id = auth.uid() and pa.status = 'active'
      )
$$;

-- Access now starts with an invitation the professional accepts.
drop function public.grant_partner_access(uuid);

-- The signed-in taxpayer invites a verified professional. Creates the taxpayer's account if
-- they have none yet. Inviting someone who was invited before (or had access before) opens a
-- new invitation; inviting someone with a pending invitation changes nothing.
create function public.invite_partner(partner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  account uuid;
  current_status text;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if partner = me then
    raise exception 'You cannot invite yourself' using errcode = '22023';
  end if;
  if coalesce((select role from public.profiles where user_id = me), 'taxpayer') <> 'taxpayer' then
    raise exception 'Only taxpayers can invite professionals' using errcode = '42501';
  end if;
  if not exists (select 1 from public.partner_profiles where user_id = partner and verified_at is not null) then
    raise exception 'Only verified professionals can be invited' using errcode = '42501';
  end if;
  account := public.ensure_my_account();
  select status into current_status from public.partner_access
  where account_id = account and partner_user_id = partner;
  if current_status = 'active' then
    raise exception 'This professional already has access' using errcode = '23505';
  end if;
  if current_status = 'pending' then
    return;
  end if;
  insert into public.partner_access (account_id, partner_user_id, status, invited_at)
  values (account, partner, 'pending', now())
  on conflict (account_id, partner_user_id) do update
    set status = 'pending', invited_at = now(), responded_at = null, granted_at = null,
        ended_at = null;
end $$;

-- The signed-in taxpayer withdraws an invitation that has not been answered.
create function public.cancel_partner_invite(partner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.partner_access
  set status = 'cancelled', ended_at = now()
  where account_id = public.my_account_id() and partner_user_id = partner and status = 'pending';
  if not found then
    raise exception 'There is no open invitation to cancel' using errcode = 'P0002';
  end if;
end $$;

-- The signed-in taxpayer removes a professional's access. Takes effect at once: every policy
-- checks the status through has_account_access().
create or replace function public.revoke_partner_access(partner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.partner_access
  set status = 'revoked', ended_at = now()
  where account_id = public.my_account_id() and partner_user_id = partner and status = 'active';
end $$;

-- The signed-in professional accepts or declines an invitation.
create function public.respond_to_invite(account uuid, accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if accept and not exists (
    select 1 from public.partner_profiles where user_id = auth.uid() and verified_at is not null
  ) then
    raise exception 'Your profile must be verified before you can accept' using errcode = '42501';
  end if;
  update public.partner_access
  set status = case when accept then 'active' else 'declined' end,
      responded_at = now(),
      granted_at = case when accept then now() end,
      ended_at = case when accept then null else now() end
  where account_id = account and partner_user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'This invitation is no longer open' using errcode = 'P0002';
  end if;
end $$;

-- A professional stops working on a client's account.
create or replace function public.leave_client(account uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.partner_access
  set status = 'left', ended_at = now()
  where account_id = account and partner_user_id = auth.uid() and status = 'active';
end $$;

-- The signed-in professional's open invitations, with the name of who invited them. (Before
-- they accept, they cannot read the account itself.)
create function public.my_invitations()
returns table (account_id uuid, taxpayer_user_id uuid, taxpayer_name text, business_name text,
               invited_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select pa.account_id, a.owner_user_id, coalesce(p.full_name, ''),
         coalesce(nullif(a.trade_name, ''), nullif(a.registered_name, ''), ''), pa.invited_at
  from public.partner_access pa
  join public.accounts a on a.id = pa.account_id
  left join public.profiles p on p.user_id = a.owner_user_id
  where pa.partner_user_id = auth.uid() and pa.status = 'pending'
  order by pa.invited_at desc
$$;

-- A professional can message a taxpayer who invited them (to ask before accepting) or a
-- current client, and anyone who already wrote to them. Taxpayers can message any verified
-- professional, as before.
create or replace function public.start_conversation(other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  my_role public.account_role;
  taxpayer uuid;
  partner uuid;
  found uuid;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select role into my_role from public.profiles where user_id = me;
  if coalesce(my_role, 'taxpayer') = 'taxpayer' then
    if not exists (select 1 from public.partner_profiles where user_id = other and verified_at is not null) then
      raise exception 'You can message verified professionals only' using errcode = '42501';
    end if;
    taxpayer := me;
    partner := other;
  else
    if not exists (
      select 1 from public.partner_access pa
      join public.accounts a on a.id = pa.account_id
      where pa.partner_user_id = me and pa.status in ('pending', 'active') and a.owner_user_id = other
    ) and not exists (
      select 1 from public.conversations where partner_user_id = me and taxpayer_user_id = other
    ) then
      raise exception 'You can message your clients only' using errcode = '42501';
    end if;
    taxpayer := other;
    partner := me;
  end if;
  insert into public.conversations (taxpayer_user_id, partner_user_id)
  values (taxpayer, partner)
  on conflict (taxpayer_user_id, partner_user_id) do nothing;
  select id into found from public.conversations
  where taxpayer_user_id = taxpayer and partner_user_id = partner;
  return found;
end $$;

-- Only clients who actually let the professional in can review them (not ones who were only
-- invited).
drop policy "clients review partners they worked with" on public.partner_reviews;
create policy "clients review partners they worked with" on public.partner_reviews
  for insert with check (
    author_user_id = auth.uid()
    and exists (
      select 1 from public.partner_access pa
      where pa.partner_user_id = partner_reviews.partner_user_id
        and pa.account_id = public.my_account_id()
        and pa.granted_at is not null
    )
  );

-- ---------------------------------------------------------------------------------------------
-- What a professional can see: records and COR, not the plan or payments
-- ---------------------------------------------------------------------------------------------

-- The free trial and Premium dates are the owner's billing: no browser reads them from the
-- table (edge functions use the service role). The owner reads them through my_plan().
revoke select on public.accounts from anon, authenticated;
grant select (id, owner_user_id, tin, registered_name, trade_name, rdo_code, registered_address,
              line_of_business, registration_date, vat_registered, withholding_agent,
              income_tax_option, business_type, mixed_income, cor_document_id, created_at,
              updated_at)
  on public.accounts to authenticated;

create function public.my_plan()
returns table (account_id uuid, trial_used boolean, premium_started_at timestamptz,
               premium_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, trial_used, premium_started_at, premium_until
  from public.accounts where owner_user_id = auth.uid()
$$;

-- Runs carry prices. The owner sees all of their account's runs; a professional sees only the
-- runs they started for the client (to follow the reading).
drop policy "owner reads runs" on public.runs;
create policy "owner reads runs, professionals read their own" on public.runs
  for select using (
    account_id = public.my_account_id()
    or (created_by = auth.uid() and public.has_account_access(account_id))
  );

-- ---------------------------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------------------------

create table public.access_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- The professional the entry is about, and who did it (the owner for invitations and
  -- removals, the professional for everything else).
  partner_user_id uuid references auth.users (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action in (
    -- invitations and access
    'invited', 'invite_cancelled', 'accepted', 'declined', 'access_removed', 'left',
    -- what the professional opened
    'opened_account', 'opened_document', 'asked_assistant',
    -- what the professional changed
    'uploaded_document', 'started_reading', 'edited_record', 'confirmed_cor'
  )),
  -- The document or ledger record it concerns, if any.
  target_id uuid,
  -- A snapshot for display (file name, the fields changed, the professional's name), so the
  -- entry still reads correctly after the thing it describes changes or is removed.
  details jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index access_events_account_idx on public.access_events (account_id, created_at desc);

alter table public.access_events enable row level security;
create policy "owners read their account's activity" on public.access_events
  for select using (account_id = public.my_account_id());
-- Entries are written only by the triggers and log_access_event() below.
revoke insert, update, delete on public.access_events from anon, authenticated;

-- The log is a record: no one can change or remove an entry, not even the server. Entries go
-- only with their account, and a deleted person's id is cleared (cascades run inside a
-- trigger, so pg_trigger_depth() is 2 or more for them).
create function public.keep_access_events_unchanged() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'The activity log cannot be changed' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger access_events_unchanged
  before update or delete on public.access_events
  for each row execute function public.keep_access_events_unchanged();

-- Writes one entry. `partner` is the professional it is about; their name is kept with it.
create function public.write_access_event(account uuid, partner uuid, actor uuid, activity text,
                                          target uuid, details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.access_events (account_id, partner_user_id, actor_user_id, action, target_id, details)
  values (account, partner, actor, activity, target,
          coalesce(details, '{}'::jsonb) || jsonb_build_object(
            'partnerName',
            coalesce((select display_name from public.partner_profiles where user_id = partner), '')))
$$;
revoke execute on function public.write_access_event(uuid, uuid, uuid, text, uuid, jsonb)
  from public, anon, authenticated;

-- The professional (with active access, not the owner) behind a change, or null.
create function public.acting_partner(account uuid, who uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select pa.partner_user_id from public.partner_access pa
  join public.accounts a on a.id = pa.account_id
  where who is not null and pa.account_id = account and pa.partner_user_id = who
    and pa.status = 'active' and a.owner_user_id <> who
$$;
revoke execute on function public.acting_partner(uuid, uuid) from public, anon, authenticated;

-- What a professional opened. Called by the app and by the document-link and assistant-chat
-- functions. The owner's own visits are not logged, and the same thing opened again within
-- ten minutes is one entry.
create function public.log_access_event(account uuid, activity text, target uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  file text;
  file_kind text;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if activity not in ('opened_account', 'opened_document', 'asked_assistant') then
    raise exception 'Unknown activity' using errcode = '22023';
  end if;
  if exists (select 1 from public.accounts where id = account and owner_user_id = me) then
    return;
  end if;
  if public.acting_partner(account, me) is null then
    raise exception 'You do not have access to this account' using errcode = '42501';
  end if;
  if activity = 'opened_document' then
    select d.file_name, d.kind::text into file, file_kind
    from public.documents d where d.id = target and d.account_id = account;
    if file is null then
      raise exception 'Document not found' using errcode = 'P0002';
    end if;
  else
    target := null;
  end if;
  if exists (
    select 1 from public.access_events e
    where e.account_id = account and e.actor_user_id = me and e.action = activity
      and e.target_id is not distinct from target
      and e.created_at > clock_timestamp() - interval '10 minutes'
  ) then
    return;
  end if;
  perform public.write_access_event(
    account, me, me, activity, target,
    case when file is null then '{}'::jsonb
         else jsonb_build_object('fileName', file, 'documentKind', file_kind) end);
end $$;

-- Invitations and access changes, whoever made them.
create function public.log_partner_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  perform public.write_access_event(
    new.account_id, new.partner_user_id, auth.uid(),
    case new.status
      when 'pending' then 'invited'
      when 'active' then 'accepted'
      when 'declined' then 'declined'
      when 'cancelled' then 'invite_cancelled'
      when 'revoked' then 'access_removed'
      else 'left'
    end,
    null, '{}'::jsonb);
  return null;
end $$;

create trigger partner_access_log
  after insert or update of status on public.partner_access
  for each row execute function public.log_partner_access();

-- A professional corrected a figure: which fields, from what to what.
create function public.log_record_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  partner uuid := public.acting_partner(new.account_id, auth.uid());
  changes jsonb;
begin
  if partner is null or pg_trigger_depth() > 1 then
    return null;
  end if;
  select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
  into changes
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    and n.key in ('record_date', 'counterparty', 'counterparty_tin', 'description', 'category',
                  'amount_centavos', 'vat_centavos', 'tax_withheld_centavos');
  if changes is null then
    return null;
  end if;
  perform public.write_access_event(
    new.account_id, partner, partner, 'edited_record', new.id,
    jsonb_build_object('kind', new.kind, 'counterparty', new.counterparty,
                       'recordDate', new.record_date, 'changes', changes));
  return null;
end $$;

create trigger ledger_records_log
  after update on public.ledger_records
  for each row execute function public.log_record_change();

-- A professional uploaded a document for the client: logged once the file is in storage.
-- (Uploads go through edge functions, so the uploader is the row's uploaded_by.)
create function public.log_document_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  partner uuid := public.acting_partner(new.account_id, new.uploaded_by);
begin
  if partner is null or old.status <> 'waiting_for_storage' or new.status = 'waiting_for_storage' then
    return null;
  end if;
  perform public.write_access_event(
    new.account_id, partner, partner, 'uploaded_document', new.id,
    jsonb_build_object('fileName', new.file_name, 'documentKind', new.kind, 'pages', new.page_count));
  return null;
end $$;

create trigger documents_upload_log
  after update of status on public.documents
  for each row execute function public.log_document_upload();

-- A professional sent documents to be read (a run).
create function public.log_run_start() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  partner uuid := public.acting_partner(new.account_id, new.created_by);
begin
  if partner is null then
    return null;
  end if;
  perform public.write_access_event(
    new.account_id, partner, partner, 'started_reading', new.id,
    jsonb_build_object('documents', new.document_count, 'pages', new.page_count));
  return null;
end $$;

create trigger runs_start_log
  after insert on public.runs
  for each row execute function public.log_run_start();

-- A professional confirmed the client's COR (through confirm_cor), changing their tax setup.
create function public.log_account_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  partner uuid := public.acting_partner(new.id, auth.uid());
  changes jsonb;
begin
  if partner is null then
    return null;
  end if;
  select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
  into changes
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    and n.key in ('tin', 'registered_name', 'trade_name', 'rdo_code', 'registered_address',
                  'line_of_business', 'registration_date', 'vat_registered', 'withholding_agent',
                  'income_tax_option', 'business_type', 'mixed_income', 'cor_document_id');
  perform public.write_access_event(
    new.id, partner, partner, 'confirmed_cor', new.cor_document_id,
    jsonb_build_object('changes', coalesce(changes, '{}'::jsonb)));
  return null;
end $$;

create trigger accounts_change_log
  after update on public.accounts
  for each row execute function public.log_account_change();

-- Trigger functions are not meant to be called directly.
revoke execute on function public.log_partner_access(), public.log_record_change(),
  public.log_document_upload(), public.log_run_start(), public.log_account_change(),
  public.keep_access_events_unchanged()
  from public, anon, authenticated;
