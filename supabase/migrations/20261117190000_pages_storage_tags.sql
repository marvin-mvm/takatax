-- =============================================================================================
-- Takatax: pages counted across uploads, storage that can be checked, and tags on documents.
--
-- 1. Pages. A Standard account has pages: a run adds some (80 for each run, 10 for the free
--    trial, each extra page bought) and every page sent for reading uses one, whatever upload it
--    came in. runs.pages_added records what each run added; account_usage() adds it all up, with
--    the storage the account's files take. open_run() opens a run in one step, after checking
--    that nothing changed since the price was worked out, so two uploads at the same time cannot
--    both use the same pages left.
-- 2. Storage. account_usage() also returns the bytes of the files still stored, so the upload
--    function can refuse a file that does not fit in the tier's storage.
-- 3. Tags. documents.tags holds short labels ("Exp Q1 2026") the owner or a professional with
--    access puts on files to find them again; tag_documents() adds and removes them.
--
-- Applies on top of 20261117150000_document_review.sql.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- 1. Pages
-- ---------------------------------------------------------------------------------------------

-- Standard pages this run added to the account: 80 for a run, 10 for the free trial, plus any
-- extra pages bought with it. Zero for a run read from pages already on the account.
alter table public.runs
  add column pages_added integer not null default 0 check (pages_added >= 0);

-- Before this, every upload was its own run of up to 80 free pages. Each account keeps one such
-- run: its first run is the one that added the 80 pages; later ones used them.
update public.runs r set pages_added = 80
where r.id in (
  select distinct on (account_id) id from public.runs
  where kind in ('trial', 'regular', 'partner') and status <> 'awaiting_payment'
  order by account_id, created_at, id);

-- An account's Standard pages: what its runs added, and what was sent for reading against them.
-- A run that is not paid yet counts for nothing. Nor do the pages of a run that read nothing
-- and whose documents are all gone (deleted before they were read): nothing was read for them.
-- Deleting a document after it was read gives no pages back.
create function public.standard_pages(account uuid, out added integer, out used integer)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(r.pages_added), 0)::integer,
         coalesce(sum(case when r.pages_read = 0
                                and not exists (select 1 from public.documents d where d.run_id = r.id)
                           then 0 else r.page_count end), 0)::integer
  from public.runs r
  where r.account_id = account and r.kind in ('trial', 'regular', 'partner')
    and r.status <> 'awaiting_payment'
$$;
revoke execute on function public.standard_pages(uuid) from public, anon, authenticated;
grant execute on function public.standard_pages(uuid) to service_role;

-- What an account has used, for its owner and for a professional with access (nothing for
-- anyone else): its tier, its Standard pages (added and used), and the size and number of the
-- files still in storage.
create function public.account_usage(account uuid)
returns table (tier text, pages_added integer, pages_used integer, storage_bytes bigint, files integer)
language sql stable security definer set search_path = '' as $$
  select
    case when a.premium_until is not null and a.premium_until > now()
         then 'premium' else 'standard' end,
    (select p.added from public.standard_pages(a.id) p),
    (select p.used from public.standard_pages(a.id) p),
    coalesce((select sum(d.bytes) from public.documents d
              where d.account_id = a.id and d.file_deleted_at is null
                and d.status <> 'waiting_for_storage'), 0)::bigint,
    (select count(*) from public.documents d
     where d.account_id = a.id and d.file_deleted_at is null
       and d.status <> 'waiting_for_storage')::integer
  from public.accounts a
  where a.id = account and public.has_account_access(a.id)
$$;
revoke execute on function public.account_usage(uuid) from public, anon;
grant execute on function public.account_usage(uuid) to authenticated, service_role;

-- Opens a run for documents waiting to be read, for the create-checkout function only (it has
-- already checked who is asking and worked out the price).
--   expected_added, expected_used  the account's Standard pages the price was worked out from.
-- Answers the new run's id, or null when something changed meanwhile (another run was opened,
-- or a document is no longer waiting): the caller then works the price out again. The account
-- row is locked while this runs, so two requests cannot both use the same pages left.
create function public.open_run(
  account uuid, actor uuid, document_ids uuid[], run_kind text, pages integer, price integer,
  added integer, expected_added integer, expected_used integer, uses_trial boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  now_added integer;
  now_used integer;
  found_documents integer;
  found_pages integer;
  run uuid;
begin
  perform 1 from public.accounts a where a.id = account for update;
  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  select p.added, p.used into now_added, now_used from public.standard_pages(account) p;
  if now_added <> expected_added or now_used <> expected_used then
    return null;
  end if;
  select count(*), coalesce(sum(d.page_count), 0) into found_documents, found_pages
  from public.documents d
  where d.account_id = account and d.id = any (document_ids)
    and d.status = 'waiting_for_reader' and d.run_id is null;
  if found_documents = 0 or found_documents <> coalesce(array_length(document_ids, 1), 0)
     or found_pages <> pages then
    return null;
  end if;
  insert into public.runs (account_id, kind, document_count, page_count, pages_added,
                           price_centavos, status, paid_at, created_by)
  values (account, run_kind, found_documents, pages, greatest(added, 0), price,
          case when price = 0 then 'paid' else 'awaiting_payment' end,
          case when price = 0 then now() end, actor)
  returning id into run;
  update public.documents d set run_id = run
  where d.account_id = account and d.id = any (document_ids);
  if uses_trial then
    update public.accounts a set trial_used = true where a.id = account;
  end if;
  return run;
end $$;
revoke execute on function
  public.open_run(uuid, uuid, uuid[], text, integer, integer, integer, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function
  public.open_run(uuid, uuid, uuid[], text, integer, integer, integer, integer, integer, boolean)
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Tags
-- ---------------------------------------------------------------------------------------------

alter table public.documents add column tags text[] not null default '{}';
create index documents_tags_idx on public.documents using gin (tags);

-- The activity log also records the files a professional tagged.
alter table public.access_events drop constraint access_events_action_check;
alter table public.access_events add constraint access_events_action_check check (action in (
  -- invitations and access
  'invited', 'invite_cancelled', 'accepted', 'declined', 'access_removed', 'left',
  -- what the professional opened
  'opened_account', 'opened_document', 'asked_assistant',
  -- what the professional changed
  'uploaded_document', 'started_reading', 'edited_record', 'confirmed_cor', 'deleted_document',
  'checked_document', 'tagged_documents'
));

-- Adds and removes tags on documents of an account, for its owner or a professional with
-- access. A tag is 1 to 30 characters without commas; upper and lower case are the same tag
-- (the spelling already on a file is kept); a file holds up to 10. Answers how many files were
-- touched. A professional's tagging goes in the client's activity log.
create function public.tag_documents(account uuid, document_ids uuid[], add_tags text[],
                                     remove_tags text[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  adding text[];
  removing text[];
  touched integer;
  acting uuid;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not public.has_account_access(account) then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if coalesce(array_length(document_ids, 1), 0) = 0 or array_length(document_ids, 1) > 1000 then
    raise exception 'Choose 1 to 1,000 files' using errcode = '22023';
  end if;
  -- Tidy the names: no spaces around, single spaces inside, each one once whatever its case.
  select coalesce(array_agg(name order by lower(name)), '{}') into adding from (
    select distinct on (lower(name)) name from (
      select btrim(regexp_replace(raw, '\s+', ' ', 'g')) as name
      from unnest(coalesce(add_tags, '{}')) raw) tidy
    where name <> '' order by lower(name), name) once;
  select coalesce(array_agg(lower(btrim(regexp_replace(raw, '\s+', ' ', 'g')))), '{}')
  into removing from unnest(coalesce(remove_tags, '{}')) raw;
  if exists (select 1 from unnest(adding) name where char_length(name) > 30 or name like '%,%') then
    raise exception 'A tag is 1 to 30 characters, without commas' using errcode = '22023';
  end if;

  update public.documents d
  set tags = (
    select coalesce(array_agg(name order by lower(name)), '{}') from (
      select name from unnest(d.tags) name where lower(name) <> all (removing)
      union all
      select name from unnest(adding) name
      where lower(name) <> all (removing)
        and lower(name) <> all (select lower(have) from unnest(d.tags) have)) kept)
  where d.account_id = account and d.id = any (document_ids);
  get diagnostics touched = row_count;
  if exists (select 1 from public.documents d
             where d.account_id = account and d.id = any (document_ids)
               and coalesce(array_length(d.tags, 1), 0) > 10) then
    raise exception 'A file can have up to 10 tags' using errcode = '22023';
  end if;

  acting := public.acting_partner(account, me);
  if acting is not null and touched > 0 then
    perform public.write_access_event(
      account, acting, acting, 'tagged_documents', null,
      jsonb_build_object('documents', touched, 'added', to_jsonb(adding),
                         'removed', to_jsonb(coalesce(remove_tags, '{}'))));
  end if;
  return touched;
end $$;
revoke execute on function public.tag_documents(uuid, uuid[], text[], text[]) from public, anon;
grant execute on function public.tag_documents(uuid, uuid[], text[], text[])
  to authenticated, service_role;
