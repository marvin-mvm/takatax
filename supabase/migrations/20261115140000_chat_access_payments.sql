-- =============================================================================================
-- Takatax, part 2: chat between taxpayers and partners, who can see an account, partner
-- verification, payments, and the AI spend log.
--
-- Applies on top of 20261115120000_takatax_core.sql.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Takatax staff and partner verification
-- ---------------------------------------------------------------------------------------------

-- Staff who check partners' BIR accreditation or PRC licence. Add one with:
--   insert into public.admins (user_id) select id from auth.users where email = '<staff email>';
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy "staff see themselves" on public.admins for select using (user_id = auth.uid());

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- Staff see every partner profile, including ones waiting to be verified.
create policy "staff see all partner profiles" on public.partner_profiles
  for select using (public.is_admin());

-- When a partner changes their accreditation or licence number, they must be checked again.
create function public.guard_partner_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.bir_accreditation_no is distinct from old.bir_accreditation_no
      or new.prc_license_no is distinct from old.prc_license_no)
     and not public.is_admin() then
    new.verified_at := null;
  end if;
  return new;
end $$;

create trigger partner_profiles_guard
  before update on public.partner_profiles
  for each row execute function public.guard_partner_profile();

-- Staff approve (or withdraw) a partner. Verified partners are listed in the directory, can
-- answer in the community, can be given access and can be messaged.
create function public.verify_partner(partner uuid, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only Takatax staff can verify partners' using errcode = '42501';
  end if;
  update public.partner_profiles
  set verified_at = case when approve then now() else null end
  where user_id = partner;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Who can see an account
-- ---------------------------------------------------------------------------------------------

-- The signed-in taxpayer lets a verified partner into their account (again, if they had removed
-- them before). Creates the taxpayer's account if they have none yet.
create function public.grant_partner_access(partner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  account uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if partner = auth.uid() then
    raise exception 'You cannot give access to yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.partner_profiles where user_id = partner and verified_at is not null) then
    raise exception 'Only verified professionals can be given access' using errcode = '42501';
  end if;
  account := public.ensure_my_account();
  insert into public.partner_access (account_id, partner_user_id)
  values (account, partner)
  on conflict (account_id, partner_user_id)
    do update set revoked_at = null, granted_at = now();
end $$;

-- The signed-in taxpayer removes a partner's access. Takes effect at once: every policy checks
-- revoked_at through has_account_access().
create function public.revoke_partner_access(partner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.partner_access
  set revoked_at = now()
  where account_id = public.my_account_id() and partner_user_id = partner and revoked_at is null;
end $$;

-- A partner stops working on a client's account.
create function public.leave_client(account uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.partner_access
  set revoked_at = now()
  where account_id = account and partner_user_id = auth.uid() and revoked_at is null;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Chat: one conversation per taxpayer and partner; messages can never be edited
-- ---------------------------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  taxpayer_user_id uuid not null references auth.users (id) on delete cascade,
  partner_user_id uuid not null references public.partner_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  -- When each side last opened the conversation, for the unread badges.
  taxpayer_read_at timestamptz not null default now(),
  partner_read_at timestamptz not null default now(),
  unique (taxpayer_user_id, partner_user_id),
  check (taxpayer_user_id <> partner_user_id)
);
create index conversations_partner_idx on public.conversations (partner_user_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  -- The real clock time, so messages sent within one transaction still keep their order.
  created_at timestamptz not null default clock_timestamp()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- True when the signed-in user and `other` work together: a conversation between them, or
-- access (current or past) from one to the other's account. Used to show each other's names.
create function public.works_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where (c.taxpayer_user_id = auth.uid() and c.partner_user_id = other)
       or (c.partner_user_id = auth.uid() and c.taxpayer_user_id = other)
  ) or exists (
    select 1 from public.partner_access pa
    join public.accounts a on a.id = pa.account_id
    where (a.owner_user_id = auth.uid() and pa.partner_user_id = other)
       or (pa.partner_user_id = auth.uid() and a.owner_user_id = other)
  )
$$;

create function public.is_conversation_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = target and auth.uid() in (c.taxpayer_user_id, c.partner_user_id)
  )
$$;

-- Messages are a record of what was said: no one can change one, not even the server. They go
-- away only with their conversation or their sender's account (cascades run inside a trigger,
-- so pg_trigger_depth() is 2 or more for them).
create function public.keep_messages_unchanged() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Messages cannot be edited' using errcode = '42501';
  end if;
  if pg_trigger_depth() < 2 then
    raise exception 'Messages cannot be deleted' using errcode = '42501';
  end if;
  return old;
end $$;

create trigger messages_unchanged
  before update or delete on public.messages
  for each row execute function public.keep_messages_unchanged();

-- Keeps the conversation list in order and marks the sender's side as read.
create function public.after_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations c
  set last_message_at = new.created_at,
      taxpayer_read_at = case when c.taxpayer_user_id = new.sender_user_id then new.created_at else c.taxpayer_read_at end,
      partner_read_at = case when c.partner_user_id = new.sender_user_id then new.created_at else c.partner_read_at end
  where c.id = new.conversation_id;
  return null;
end $$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.after_message();

-- Opens (or creates) the conversation between the signed-in user and `other`.
-- A taxpayer can message any verified partner. A partner can message their clients, and
-- anyone who has already written to them.
create function public.start_conversation(other uuid) returns uuid
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
      where pa.partner_user_id = me and pa.revoked_at is null and a.owner_user_id = other
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

-- Marks the conversation as read for the signed-in user.
create function public.mark_conversation_read(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations c
  set taxpayer_read_at = case when c.taxpayer_user_id = auth.uid() then clock_timestamp() else c.taxpayer_read_at end,
      partner_read_at = case when c.partner_user_id = auth.uid() then clock_timestamp() else c.partner_read_at end
  where c.id = target and auth.uid() in (c.taxpayer_user_id, c.partner_user_id);
end $$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "members see their conversations" on public.conversations
  for select using (auth.uid() in (taxpayer_user_id, partner_user_id));
-- Conversations are created and marked read only through the functions above.
revoke insert, update, delete on public.conversations from anon, authenticated;

create policy "members read messages" on public.messages
  for select using (public.is_conversation_member(conversation_id));
create policy "members send messages" on public.messages
  for insert to authenticated with check (
    sender_user_id = auth.uid() and public.is_conversation_member(conversation_id)
  );
revoke update, delete on public.messages from anon, authenticated;

-- People who talk or work together can see each other's name.
create policy "names of people you work with" on public.profiles
  for select using (public.works_with(user_id));

-- The conversation list: the other person's name, the last message, and whether it is unread.
create view public.conversation_list with (security_invoker = true) as
  select
    c.id,
    c.taxpayer_user_id,
    c.partner_user_id,
    c.created_at,
    c.last_message_at,
    c.taxpayer_read_at,
    c.partner_read_at,
    coalesce(pp.display_name, '') as partner_name,
    pp.kind as partner_kind,
    coalesce(tp.full_name, '') as taxpayer_name,
    last_message.body as last_body,
    last_message.sender_user_id as last_sender_user_id
  from public.conversations c
  left join public.partner_profiles pp on pp.user_id = c.partner_user_id
  left join public.profiles tp on tp.user_id = c.taxpayer_user_id
  left join lateral (
    select m.body, m.sender_user_id
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last_message on true;

grant select on public.conversation_list to authenticated;

-- New messages arrive in open chats without a refresh (Supabase Realtime; row-level security
-- still decides who receives them).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Community extras: "This helped" and deleting your own question
-- ---------------------------------------------------------------------------------------------

create function public.is_my_post(post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_posts where id = post and author_user_id = auth.uid())
$$;

create function public.mark_answer_helpful(answer uuid, helped boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.community_answers a
  set helpful = helped
  where a.id = answer
    and exists (
      select 1 from public.community_posts p
      where p.id = a.post_id and p.author_user_id = auth.uid()
    );
end $$;

create function public.delete_my_post(post uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.community_posts set deleted_at = now()
  where id = post and author_user_id = auth.uid() and deleted_at is null;
end $$;

-- ---------------------------------------------------------------------------------------------
-- COR confirmation
-- ---------------------------------------------------------------------------------------------

-- The reader saves what it read from a COR on the document only. The owner (or their partner)
-- checks the fields, picks the income tax option, and confirms here; only then do the tax
-- types and deadlines change.
create function public.confirm_cor(document uuid, details jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  select d.account_id into target from public.documents d where d.id = document and d.kind = 'cor';
  if target is null or not public.has_account_access(target) then
    raise exception 'COR not found' using errcode = '42501';
  end if;
  update public.accounts set
    tin = nullif(regexp_replace(coalesce(details ->> 'tin', ''), '\D', '', 'g'), ''),
    registered_name = nullif(btrim(details ->> 'registeredName'), ''),
    trade_name = nullif(btrim(details ->> 'tradeName'), ''),
    rdo_code = nullif(btrim(details ->> 'rdoCode'), ''),
    registered_address = nullif(btrim(details ->> 'registeredAddress'), ''),
    line_of_business = nullif(btrim(details ->> 'lineOfBusiness'), ''),
    registration_date = nullif(details ->> 'registrationDate', '')::date,
    vat_registered = coalesce((details ->> 'vatRegistered')::boolean, false),
    withholding_agent = coalesce((details ->> 'withholdingAgent')::boolean, false),
    income_tax_option = coalesce(nullif(details ->> 'incomeTaxOption', ''), 'graduated_osd')::public.income_tax_option,
    business_type = case when details ->> 'businessType' = 'goods' then 'goods' else 'services' end,
    mixed_income = coalesce((details ->> 'mixedIncome')::boolean, false),
    cor_document_id = document,
    updated_at = now()
  where id = target;
  update public.documents set status = 'accepted', updated_at = now() where id = document;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Runs, payments and Premium
-- ---------------------------------------------------------------------------------------------

-- Which run (and so which payment) covers each document.
alter table public.documents add column run_id uuid references public.runs (id) on delete set null;
create index documents_run_idx on public.documents (run_id);

alter table public.runs
  add column paid_at timestamptz,
  -- Pages in the run (the price is per page), and how many the reader has finished, for the
  -- progress bar. The reading happens in a Trigger.dev job; its id is kept for support.
  add column page_count integer not null default 0,
  add column pages_read integer not null default 0,
  add column trigger_run_id text;

-- A Premium month: documents read inside the window are covered up to the monthly allowance.
alter table public.accounts
  add column premium_started_at timestamptz,
  add column premium_until timestamptz;

-- One checkout with the payment provider (a merchant of record, still to be chosen), for a run
-- or a Premium month.
-- edge functions only; the payer can read their own.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  payer_user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('run', 'premium_month')),
  run_id uuid references public.runs (id) on delete set null,
  amount_centavos integer not null check (amount_centavos > 0),
  provider text not null, -- the payment provider (merchant of record), see _lib/payments.ts
  provider_checkout_id text unique,
  provider_payment_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_account_idx on public.payments (account_id, created_at desc);
alter table public.payments enable row level security;
-- Only the person who paid: a partner with access to an account does not see its payments.
create policy "payers read their payments" on public.payments
  for select using (payer_user_id = auth.uid());
revoke insert, update, delete on public.payments from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- AI spend log (for the daily spending cap)
-- ---------------------------------------------------------------------------------------------

create table public.ai_spend (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  function_name text not null,
  model text not null,
  step text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_spend_created_idx on public.ai_spend (created_at);
-- Server only: no policies and no privileges, so browsers can neither read nor write it.
alter table public.ai_spend enable row level security;
revoke all on public.ai_spend from anon, authenticated;

-- Today's AI spend in US dollars (Manila day), for the edge functions' spending cap.
create function public.ai_spend_today() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cost_usd), 0) from public.ai_spend
  where created_at >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')
$$;
-- Functions are executable by everyone by default; this one is for the server only.
revoke execute on function public.ai_spend_today() from public, anon, authenticated;
