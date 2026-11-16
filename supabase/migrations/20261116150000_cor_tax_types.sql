-- =============================================================================================
-- Takatax: the tax types and forms printed on the COR, kept on the account.
--
-- A COR (BIR Form 2303) lists each tax type with the BIR form it is filed on, for example
-- "Withholding Tax - Expanded" on 0619-E and 1601-EQ, "Percentage Tax - Quarterly" on 2551Q.
-- The reader reads them one by one; the owner (or their professional) checks them on the My COR
-- page and confirm_cor saves them here, with the rest of the COR.
--
-- Applies on top of 20261116120000_invitations_activity.sql.
-- =============================================================================================

-- One entry per form: { taxType, form, frequency, effectiveDate } (see
-- supabase/functions/_shared/parser/registration.ts).
alter table public.accounts
  add column cor_tax_types jsonb not null default '[]'::jsonb
    check (jsonb_typeof(cor_tax_types) = 'array');

-- Readable like the other COR columns (owner and professionals with access, through the
-- accounts policies); written only by confirm_cor.
grant select (cor_tax_types) on public.accounts to authenticated;

-- Same as before, and now also saves the COR's tax types and forms.
create or replace function public.confirm_cor(document uuid, details jsonb) returns void
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
    cor_tax_types = case
      when jsonb_typeof(details -> 'taxTypes') = 'array' then details -> 'taxTypes'
      else '[]'::jsonb
    end,
    cor_document_id = document,
    updated_at = now()
  where id = target;
  update public.documents set status = 'accepted', updated_at = now() where id = document;
end $$;

-- The activity log also records changes to the tax types when a professional confirms a COR.
create or replace function public.log_account_change() returns trigger
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
                  'income_tax_option', 'business_type', 'mixed_income', 'cor_document_id',
                  'cor_tax_types');
  perform public.write_access_event(
    new.id, partner, partner, 'confirmed_cor', new.cor_document_id,
    jsonb_build_object('changes', coalesce(changes, '{}'::jsonb)));
  return null;
end $$;
