-- =====================================================================
-- IDK Fiscal — Migration 0013: Billing + LGPD consent
-- Wave 2.0 — ADR-019 (monetizacao), ADR-020 (LGPD), ADR-021 (suporte)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type plan_tier as enum ('trial', 'pequena', 'empresa', 'onprem');
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type subscription_status as enum (
      'trialing','active','past_due','canceled','expired'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'consent_kind') then
    create type consent_kind as enum (
      'terms_of_use','privacy_policy','dpa'
    );
  end if;
end$$;

-- =====================================================================
-- 2. organization_subscriptions
-- =====================================================================
create table if not exists public.organization_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  plan               plan_tier not null default 'trial',
  status             subscription_status not null default 'trialing',
  trial_started_at   timestamptz,
  trial_ends_at      timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  monthly_amount_cents int,
  external_provider  text,            -- 'inter' | 'stripe' | null
  external_id        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint org_sub_uniq unique (organization_id)
);

create trigger org_sub_set_updated_at
before update on public.organization_subscriptions
for each row execute function public.set_updated_at();

alter table public.organization_subscriptions enable row level security;
alter table public.organization_subscriptions force  row level security;

create policy org_sub_select on public.organization_subscriptions
for select to authenticated
using (public.is_org_member(organization_id));

-- INSERT/UPDATE: somente service_role (billing pipeline). Sem policy.

grant select on public.organization_subscriptions to authenticated;

comment on table public.organization_subscriptions is
  'Assinatura SaaS por org. ADR-019. Cobranca via Inter Bank API (boleto/PIX) ou Stripe.';

-- =====================================================================
-- 3. nfe_usage_counters — para cobranca por excedente no plano Pequena
-- =====================================================================
create table if not exists public.nfe_usage_counters (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       uuid references public.organization_branches(id) on delete set null,
  ano             smallint not null,
  mes             smallint not null,
  ambiente        smallint not null,
  autorizadas     int not null default 0,
  rejeitadas      int not null default 0,
  canceladas      int not null default 0,
  updated_at      timestamptz not null default now(),

  constraint nfe_usage_uniq unique (organization_id, branch_id, ano, mes, ambiente),
  constraint nfe_usage_mes_chk check (mes between 1 and 12),
  constraint nfe_usage_ano_chk check (ano between 2026 and 2099)
);

create index if not exists nfe_usage_org_periodo_idx
  on public.nfe_usage_counters (organization_id, ano, mes);

alter table public.nfe_usage_counters enable row level security;
alter table public.nfe_usage_counters force  row level security;

create policy nfe_usage_select on public.nfe_usage_counters
for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.nfe_usage_counters to authenticated;

-- ---------------------------------------------------------------------
-- Trigger: incrementa counter ao autorizar / rejeitar NF-e
-- ---------------------------------------------------------------------
create or replace function public.bump_nfe_usage_counter()
returns trigger
language plpgsql
as $$
declare
  v_action text;
begin
  if (tg_op = 'UPDATE' and old.status <> new.status) then
    if new.status = 'autorizada' then v_action := 'autorizadas';
    elsif new.status = 'rejeitada' then v_action := 'rejeitadas';
    elsif new.status = 'cancelada' then v_action := 'canceladas';
    else return new;
    end if;

    insert into public.nfe_usage_counters (
      organization_id, branch_id, ano, mes, ambiente,
      autorizadas, rejeitadas, canceladas
    ) values (
      new.organization_id, new.branch_id,
      extract(year from new.data_emissao)::smallint,
      extract(month from new.data_emissao)::smallint,
      new.ambiente,
      case when v_action='autorizadas' then 1 else 0 end,
      case when v_action='rejeitadas' then 1 else 0 end,
      case when v_action='canceladas' then 1 else 0 end
    )
    on conflict (organization_id, branch_id, ano, mes, ambiente) do update set
      autorizadas = nfe_usage_counters.autorizadas + case when v_action='autorizadas' then 1 else 0 end,
      rejeitadas  = nfe_usage_counters.rejeitadas  + case when v_action='rejeitadas'  then 1 else 0 end,
      canceladas  = nfe_usage_counters.canceladas  + case when v_action='canceladas'  then 1 else 0 end,
      updated_at  = now();
  end if;

  return new;
end;
$$;

create trigger nfe_documents_bump_usage
after update on public.nfe_documents
for each row execute function public.bump_nfe_usage_counter();

-- =====================================================================
-- 4. user_consents — registro de aceite de termos
-- =====================================================================
create table if not exists public.user_consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  kind            consent_kind not null,
  document_version text not null,
  accepted_at     timestamptz not null default now(),
  ip_address      inet,
  user_agent      text,

  constraint user_consents_kind_uniq unique (user_id, organization_id, kind, document_version)
);

alter table public.user_consents enable row level security;
alter table public.user_consents force  row level security;

create policy user_consents_select on public.user_consents
for select to authenticated
using (user_id = auth.uid());

create policy user_consents_insert on public.user_consents
for insert to authenticated
with check (user_id = auth.uid());

grant select, insert on public.user_consents to authenticated;

comment on table public.user_consents is
  'Aceite de termos / privacidade / DPA. ADR-020. document_version e a versao do doc no momento do aceite.';

-- =====================================================================
-- 5. RPC: register_subscription_trial
--    Cria assinatura em trial automaticamente ao criar org.
--    Idempotente.
-- =====================================================================
create or replace function public.register_subscription_trial(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  if not public.has_org_role(p_organization_id, array['owner']) then
    raise exception 'Apenas owner' using errcode = '42501';
  end if;

  insert into public.organization_subscriptions (
    organization_id, plan, status, trial_started_at, trial_ends_at
  ) values (
    p_organization_id, 'trial'::plan_tier, 'trialing'::subscription_status,
    now(), now() + interval '14 days'
  )
  on conflict (organization_id) do nothing;
end;
$$;

revoke all on function public.register_subscription_trial(uuid) from public;
grant execute on function public.register_subscription_trial(uuid) to authenticated;
