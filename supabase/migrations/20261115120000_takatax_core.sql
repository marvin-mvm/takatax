-- =============================================================================================
-- Takatax core schema: accounts, documents, ledger, partners, reviews and the community.
--
-- Applied to project thiznrxojzrxkjwqhtjt together with 20261115140000_chat_access_payments.sql.
-- Until a migration is applied, the app shows sample data.
--
-- Column privileges: Supabase grants every table to `anon` and `authenticated`. Revoking one
-- column from a table-wide grant does nothing, so each table that clients may update first
-- loses UPDATE entirely and then gets it back on the columns they may change.
--
-- Money is stored in centavos (bigint). Files live in Cloudflare R2; `documents.storage_key`
-- is the R2 object key. Edge functions write documents and ledger rows with the service role;
-- browsers only read them, through the row-level security policies below.
-- =============================================================================================

create type public.account_role as enum ('taxpayer', 'bookkeeper', 'cpa', 'tax_lawyer');
create type public.document_kind as enum ('sales_invoice', 'expense_receipt', 'form_2307', 'cor', 'unknown');
create type public.document_status as enum (
  'waiting_for_storage', 'waiting_for_reader', 'reading', 'accepted', 'needs_review', 'rejected'
);
create type public.record_kind as enum ('sale', 'expense', 'withholding');
create type public.income_tax_option as enum ('eight_percent', 'graduated_osd', 'graduated_itemized');
create type public.post_visibility as enum ('public', 'members');

-- ---------------------------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------------------------

-- One row per login. The role comes from the sign-up form; a partner role only unlocks partner
-- features once Takatax staff set partner_profiles.verified_at.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.account_role not null default 'taxpayer',
  created_at timestamptz not null default now()
);

-- Public profile of a bookkeeper, CPA or tax lawyer. They pay 25% less per client run and no
-- platform fee; Takatax never handles money between them and their clients.
create table public.partner_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kind public.account_role not null check (kind <> 'taxpayer'),
  display_name text not null default '',
  city text not null default '',
  bio text not null default '' check (char_length(bio) <= 1000),
  specialties text[] not null default '{}',
  years_in_practice integer not null default 0 check (years_in_practice between 0 and 80),
  bir_accreditation_no text,
  prc_license_no text,
  verified_at timestamptz,
  rating_avg numeric(2, 1) not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Creates the profile (and partner profile) when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  chosen text := coalesce(new.raw_user_meta_data ->> 'account_type', 'taxpayer');
  name text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
begin
  if chosen not in ('taxpayer', 'bookkeeper', 'cpa', 'tax_lawyer') then
    chosen := 'taxpayer';
  end if;
  insert into public.profiles (user_id, full_name, role)
  values (new.id, name, chosen::public.account_role);
  if chosen <> 'taxpayer' then
    insert into public.partner_profiles (user_id, kind, display_name)
    values (new.id, chosen::public.account_role, name);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Taxpayer accounts, documents and the ledger
-- ---------------------------------------------------------------------------------------------

-- A taxpayer's workspace: exactly one TIN, filled in from the COR and confirmed by the owner.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users (id) on delete cascade,
  tin text unique,
  registered_name text,
  trade_name text,
  rdo_code text,
  registered_address text,
  line_of_business text,
  registration_date date,
  vat_registered boolean not null default false,
  withholding_agent boolean not null default false,
  income_tax_option public.income_tax_option not null default 'graduated_osd',
  business_type text not null default 'services' check (business_type in ('services', 'goods')),
  mixed_income boolean not null default false,
  cor_document_id uuid,
  trial_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind public.document_kind not null default 'unknown',
  file_name text not null,
  mime_type text not null,
  bytes integer not null check (bytes > 0 and bytes <= 209715200), -- 200 MB a file
  -- Pages the AI will read: 1 for a photo, every page of a PDF (counted in the browser before
  -- upload, checked again by the reader). Runs are priced by pages.
  page_count integer not null default 1 check (page_count between 1 and 1000),
  storage_key text unique,
  status public.document_status not null default 'waiting_for_storage',
  reader_path text[] not null default '{}',
  flags text[] not null default '{}',
  extracted jsonb,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_account_idx on public.documents (account_id, created_at desc);

alter table public.accounts
  add constraint accounts_cor_document_fk
  foreign key (cor_document_id) references public.documents (id) on delete set null;

-- One row per sale, expense or Form 2307, each linked to the document it was read from.
create table public.ledger_records (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  kind public.record_kind not null,
  record_date date not null,
  counterparty text not null default '',
  counterparty_tin text,
  description text not null default '',
  category text,
  amount_centavos bigint not null default 0,
  vat_centavos bigint not null default 0,
  tax_withheld_centavos bigint not null default 0,
  user_corrected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ledger_records_account_date_idx on public.ledger_records (account_id, record_date);

-- A paid (or free) batch of documents to read. create-checkout creates it; free runs (trial,
-- Premium) start paid, and the payments-webhook function marks paid ones.
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null check (kind in ('trial', 'regular', 'partner', 'premium_month')),
  document_count integer not null check (document_count > 0),
  price_centavos integer not null default 0,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'paid', 'reading', 'review', 'complete')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Bookkeepers, CPAs and tax lawyers a taxpayer let into their account.
create table public.partner_access (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  partner_user_id uuid not null references public.partner_profiles (user_id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (account_id, partner_user_id)
);

-- The signed-in user's account id (null when they have none yet).
create function public.my_account_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.accounts where owner_user_id = auth.uid()
$$;

alter table public.partner_access alter column account_id set default public.my_account_id();

-- True when the signed-in user owns the account or is a partner with active access to it.
create function public.has_account_access(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.accounts a where a.id = target and a.owner_user_id = auth.uid())
      or exists (
        select 1 from public.partner_access pa
        where pa.account_id = target and pa.partner_user_id = auth.uid() and pa.revoked_at is null
      )
$$;

-- Creates the signed-in taxpayer's (empty) account if it does not exist, and returns its id.
create function public.ensure_my_account() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  found uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select id into found from public.accounts where owner_user_id = auth.uid();
  if found is null then
    insert into public.accounts (owner_user_id) values (auth.uid()) returning id into found;
  end if;
  return found;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------------------------

create table public.partner_reviews (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null references public.partner_profiles (user_id) on delete cascade,
  author_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  unique (partner_user_id, author_user_id)
);

-- Keeps partner_profiles.rating_avg and rating_count current.
create function public.refresh_partner_rating() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.partner_user_id, old.partner_user_id);
begin
  update public.partner_profiles p
  set rating_avg = coalesce((select round(avg(rating)::numeric, 1) from public.partner_reviews where partner_user_id = target), 0),
      rating_count = (select count(*) from public.partner_reviews where partner_user_id = target)
  where p.user_id = target;
  return null;
end $$;

create trigger partner_reviews_rating
  after insert or update or delete on public.partner_reviews
  for each row execute function public.refresh_partner_rating();

-- ---------------------------------------------------------------------------------------------
-- Community: anonymous questions, answers from verified partners
-- ---------------------------------------------------------------------------------------------

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  -- Never exposed: column privileges below hide it from everyone but the database itself.
  author_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 5 and 160),
  body text not null check (char_length(body) between 10 and 5000),
  topic text not null default 'General',
  -- Public posts can be found on Google; members posts are seen only by signed-in users.
  visibility public.post_visibility not null default 'public',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.community_answers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  partner_user_id uuid not null default auth.uid() references public.partner_profiles (user_id) on delete cascade,
  body text not null check (char_length(body) between 10 and 5000),
  helpful boolean not null default false,
  created_at timestamptz not null default now()
);

-- Blurs TINs, phone numbers, emails and peso amounts (mirror of _shared/community/redact.ts).
create function public.redact_personal_info(input text) returns text
language sql immutable as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(input, '[[:alnum:]._+-]+@[[:alnum:]-]+(\.[[:alnum:]-]+)+', '[email •••]', 'g'),
        '\m\d{3}[ -]?\d{3}[ -]?\d{3}([ -]?\d{3,5})?\M', '[TIN •••]', 'g'),
      '(\+?63[ -]?|\m0)9\d{2}[ -]?\d{3}[ -]?\d{4}\M', '[phone •••]', 'g'),
    '(₱|PHP ?)\s?\d[\d,]*(\.\d{1,2})?', '₱•••', 'gi')
$$;

-- Posts can be deleted but never edited, and are always blurred before they are stored.
create function public.guard_community_post() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.title <> old.title or new.body <> old.body or new.visibility <> old.visibility) then
    raise exception 'Community posts cannot be edited';
  end if;
  new.title := public.redact_personal_info(new.title);
  new.body := public.redact_personal_info(new.body);
  return new;
end $$;

create trigger community_posts_guard
  before insert or update on public.community_posts
  for each row execute function public.guard_community_post();

-- What visitors and members may read: no author column.
create view public.community_posts_public with (security_invoker = true) as
  select id, title, body, topic, visibility, created_at
  from public.community_posts
  where deleted_at is null;

create view public.community_answers_public with (security_invoker = true) as
  select a.id, a.post_id, a.partner_user_id, p.display_name as partner_name, p.kind as partner_kind,
         p.rating_avg as partner_rating, a.body, a.helpful, a.created_at
  from public.community_answers a
  join public.partner_profiles p on p.user_id = a.partner_user_id;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.partner_profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.documents enable row level security;
alter table public.ledger_records enable row level security;
alter table public.runs enable row level security;
alter table public.partner_access enable row level security;
alter table public.partner_reviews enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_answers enable row level security;

create policy "own profile" on public.profiles
  for select using (user_id = auth.uid());
create policy "update own profile" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Only the name: the role is set at sign-up and cannot be changed by the user.
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy "verified partners are public" on public.partner_profiles
  for select using (verified_at is not null or user_id = auth.uid());
create policy "partners edit their own profile" on public.partner_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Partners cannot verify themselves, change their kind or set their own rating.
revoke update on public.partner_profiles from anon, authenticated;
grant update (display_name, city, bio, specialties, years_in_practice, bir_accreditation_no, prc_license_no)
  on public.partner_profiles to authenticated;

create policy "owner or partner reads the account" on public.accounts
  for select using (public.has_account_access(id));
create policy "owner updates the account" on public.accounts
  for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
-- The owner confirms the COR fields; the trial, owner and Premium dates are set by the server.
revoke update on public.accounts from anon, authenticated;
grant update (tin, registered_name, trade_name, rdo_code, registered_address, line_of_business,
              registration_date, vat_registered, withholding_agent, income_tax_option,
              business_type, mixed_income, updated_at)
  on public.accounts to authenticated;

create policy "owner or partner reads documents" on public.documents
  for select using (public.has_account_access(account_id));

create policy "owner or partner reads the ledger" on public.ledger_records
  for select using (public.has_account_access(account_id));
create policy "owner or partner corrects the ledger" on public.ledger_records
  for update using (public.has_account_access(account_id))
  with check (public.has_account_access(account_id));
revoke update on public.ledger_records from anon, authenticated;
grant update (record_date, counterparty, counterparty_tin, description, category, amount_centavos,
              vat_centavos, tax_withheld_centavos, user_corrected, updated_at)
  on public.ledger_records to authenticated;

create policy "owner reads runs" on public.runs
  for select using (public.has_account_access(account_id));

-- Granting and removing access goes through grant_partner_access() and revoke_partner_access()
-- (next migration), which check that the partner is verified.
create policy "owner and partner see access" on public.partner_access
  for select using (
    partner_user_id = auth.uid()
    or account_id = public.my_account_id()
  );

create policy "reviews are public" on public.partner_reviews
  for select using (true);
-- Reviews are public, but not who wrote them.
revoke select on public.partner_reviews from anon, authenticated;
grant select (id, partner_user_id, rating, body, created_at) on public.partner_reviews to anon, authenticated;
create policy "clients review partners they worked with" on public.partner_reviews
  for insert with check (
    author_user_id = auth.uid()
    and exists (
      select 1 from public.partner_access pa
      where pa.partner_user_id = partner_reviews.partner_user_id
        and pa.account_id = public.my_account_id()
    )
  );

create policy "public posts for everyone, members posts for members" on public.community_posts
  for select using (deleted_at is null and (visibility = 'public' or auth.uid() is not null));
create policy "members post questions" on public.community_posts
  for insert to authenticated with check (author_user_id = auth.uid());
create policy "authors delete their posts" on public.community_posts
  for update to authenticated using (author_user_id = auth.uid());
-- Authors can only set deleted_at; the guard trigger also blocks edits to the text.
revoke update on public.community_posts from anon, authenticated;
grant update (deleted_at) on public.community_posts to authenticated;
revoke select on public.community_posts from anon, authenticated;
grant select (id, title, body, topic, visibility, created_at, deleted_at)
  on public.community_posts to anon, authenticated;

create policy "answers follow their post" on public.community_answers
  for select using (
    exists (
      select 1 from public.community_posts p
      where p.id = post_id and p.deleted_at is null
        and (p.visibility = 'public' or auth.uid() is not null)
    )
  );
create policy "verified partners answer" on public.community_answers
  for insert to authenticated with check (
    partner_user_id = auth.uid()
    and exists (
      select 1 from public.partner_profiles pp
      where pp.user_id = auth.uid() and pp.verified_at is not null
    )
  );

grant select on public.community_posts_public, public.community_answers_public to anon, authenticated;
