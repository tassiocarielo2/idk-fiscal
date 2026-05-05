-- =====================================================================
-- IDK Fiscal — Migration 0006: Certificates A1 (Vault + Usage Log + RPCs)
-- Wave 1.2b — Custodia da senha em Supabase Vault, log append-only,
--             dedup por thumbprint dentro da org, branch_id, purpose.
-- ADRs aplicaveis: ADR-013 (Vault A1, Modelo 1), ADR-014 (saga upload)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'certificate_purpose') then
    create type certificate_purpose as enum (
      'nfe',
      'nfse',
      'cte',
      'mdfe',
      'recepcao_eventos',
      'multi'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2. ALTER certificates_metadata: branch_id, purpose, CNs, superseded_at
-- ---------------------------------------------------------------------
alter table public.certificates_metadata
  add column if not exists branch_id        uuid references public.organization_branches(id) on delete restrict,
  add column if not exists purpose          certificate_purpose not null default 'multi',
  add column if not exists subject_cn       text,
  add column if not exists issuer_cn        text,
  add column if not exists superseded_at    timestamptz,
  add column if not exists superseded_by    uuid references public.certificates_metadata(id) on delete set null,
  add column if not exists revoked_at       timestamptz,
  add column if not exists revoked_by       uuid references auth.users(id) on delete set null,
  add column if not exists revoke_reason    text;

-- Dedup: thumbprint global ja existe (certificates_thumbprint_uniq).
-- Trocamos para escopo (organization_id, thumbprint) pois um mesmo cert pode
-- ser usado por multiplas orgs em piloto interno.
alter table public.certificates_metadata
  drop constraint if exists certificates_thumbprint_uniq;

create unique index if not exists certificates_org_thumbprint_uniq
  on public.certificates_metadata (organization_id, thumbprint_sha256)
  where status = 'active';

-- Index util para "qual cert ativo desta filial pra esse proposito"
create index if not exists certificates_branch_purpose_idx
  on public.certificates_metadata (branch_id, purpose, status)
  where status = 'active' and superseded_at is null;

comment on column public.certificates_metadata.branch_id is
  'Filial dona do certificado. NULL = certificado da org (raro: pre-multi-CNPJ).';
comment on column public.certificates_metadata.purpose is
  'Proposito do certificado. multi = serve qualquer documento fiscal.';
comment on column public.certificates_metadata.superseded_at is
  'Setado quando outro cert ativo cobre o mesmo (branch_id, purpose). Imutavel apos set.';

-- =====================================================================
-- 3. Tabela: certificate_usage_log (append-only, para auditoria e billing)
-- =====================================================================
create table if not exists public.certificate_usage_log (
  id              bigint generated always as identity primary key,
  certificate_id  uuid not null references public.certificates_metadata(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id       uuid references public.organization_branches(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,
  action          text not null,
  -- ex: 'upload', 'sign.nfe', 'sign.event', 'read.metadata', 'revoke'
  context         jsonb,
  created_at      timestamptz not null default now(),

  constraint certificate_usage_log_action_chk
    check (action ~ '^[a-z][a-z0-9_.]*$')
);

create index if not exists cert_usage_log_cert_idx
  on public.certificate_usage_log (certificate_id, created_at desc);
create index if not exists cert_usage_log_org_action_idx
  on public.certificate_usage_log (organization_id, action, created_at desc);

-- Bloqueio append-only via trigger
create or replace function public.cert_usage_log_block_mutations()
returns trigger
language plpgsql
as $$
begin
  raise exception 'certificate_usage_log e append-only. % bloqueado.', tg_op
    using errcode = '42501';
end;
$$;

create trigger cert_usage_log_no_update
before update on public.certificate_usage_log
for each row execute function public.cert_usage_log_block_mutations();

create trigger cert_usage_log_no_delete
before delete on public.certificate_usage_log
for each row execute function public.cert_usage_log_block_mutations();

comment on table public.certificate_usage_log is
  'Log append-only de uso de certificado (assinatura, leitura, revogacao).';

-- =====================================================================
-- 4. RPC: set_certificate_password
--    Chamado APOS o blob estar no Storage. Cria secret no Vault e atualiza
--    vault_secret_ref. Idempotente sob dedup por thumbprint.
--    Roda como service_role (chamado pelo route handler, nao pelo cliente).
-- =====================================================================
create or replace function public.set_certificate_password(
  p_certificate_id uuid,
  p_password       text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp, vault
as $$
declare
  v_org_id      uuid;
  v_existing    text;
  v_secret_id   text;
  v_secret_name text;
begin
  -- Lookup pra garantir que a linha existe e pegar a org
  select organization_id, vault_secret_ref
    into v_org_id, v_existing
    from public.certificates_metadata
   where id = p_certificate_id;

  if v_org_id is null then
    raise exception 'Certificado % nao encontrado', p_certificate_id
      using errcode = '22023';
  end if;

  -- Se ja existe secret, atualiza in-place; senao cria novo
  if v_existing is not null then
    update vault.secrets
       set secret = p_password
     where id = v_existing::uuid;
    v_secret_id := v_existing;
  else
    v_secret_name := 'cert.a1.' || p_certificate_id::text;
    select vault.create_secret(p_password, v_secret_name) into v_secret_id;

    update public.certificates_metadata
       set vault_secret_ref = v_secret_id
     where id = p_certificate_id;
  end if;

  return v_secret_id;
end;
$$;

revoke all on function public.set_certificate_password(uuid, text) from public, anon, authenticated;
-- NAO concedemos a authenticated. Apenas service_role pode chamar.

comment on function public.set_certificate_password(uuid, text) is
  'service_role only. Cria/atualiza segredo no Vault associado ao certificado.';

-- =====================================================================
-- 5. RPC: get_certificate_for_signing
--    Retorna metadados + senha decifrada. service_role only.
--    Cada chamada gera registro em certificate_usage_log.
-- =====================================================================
create or replace function public.get_certificate_for_signing(
  p_certificate_id uuid,
  p_action         text default 'sign.nfe',
  p_context        jsonb default '{}'::jsonb
)
returns table (
  id                 uuid,
  organization_id    uuid,
  branch_id          uuid,
  cnpj_titular       text,
  storage_path       text,
  password           text,
  valid_from         timestamptz,
  valid_until        timestamptz,
  status             certificate_status
)
language plpgsql
security definer
set search_path = public, pg_temp, vault
as $$
declare
  v_cert      public.certificates_metadata%rowtype;
  v_password  text;
begin
  if p_action !~ '^[a-z][a-z0-9_.]*$' then
    raise exception 'p_action invalido' using errcode = '22023';
  end if;

  select * into v_cert
    from public.certificates_metadata
   where id = p_certificate_id
     for update;

  if not found then
    raise exception 'Certificado % nao encontrado', p_certificate_id
      using errcode = '22023';
  end if;

  if v_cert.status <> 'active' or v_cert.revoked_at is not null then
    raise exception 'Certificado nao esta ativo (status=%, revoked=%)',
      v_cert.status, v_cert.revoked_at
      using errcode = '22023';
  end if;

  if v_cert.valid_until <= now() then
    -- Auto-marca como expirado e bloqueia
    update public.certificates_metadata
       set status = 'expired'
     where id = v_cert.id;
    raise exception 'Certificado expirado em %', v_cert.valid_until
      using errcode = '22023';
  end if;

  if v_cert.vault_secret_ref is null then
    raise exception 'Certificado sem senha no Vault'
      using errcode = '22023';
  end if;

  select decrypted_secret into v_password
    from vault.decrypted_secrets
   where id = v_cert.vault_secret_ref::uuid;

  if v_password is null then
    raise exception 'Falha ao recuperar senha do Vault'
      using errcode = 'XX000';
  end if;

  insert into public.certificate_usage_log (
    certificate_id, organization_id, branch_id, user_id, action, context
  )
  values (
    v_cert.id, v_cert.organization_id, v_cert.branch_id,
    auth.uid(), p_action, p_context
  );

  return query select
    v_cert.id, v_cert.organization_id, v_cert.branch_id,
    v_cert.cnpj_titular, v_cert.storage_path, v_password,
    v_cert.valid_from, v_cert.valid_until, v_cert.status;
end;
$$;

revoke all on function public.get_certificate_for_signing(uuid, text, jsonb) from public, anon, authenticated;

comment on function public.get_certificate_for_signing(uuid, text, jsonb) is
  'service_role only. Retorna metadados + senha do cert. Loga cada chamada.';

-- =====================================================================
-- 6. RPC: revoke_certificate
--    Acessivel para owner/admin via authenticated (vai por has_org_role).
-- =====================================================================
create or replace function public.revoke_certificate(
  p_certificate_id uuid,
  p_reason         text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp, vault
as $$
declare
  v_user_id uuid := auth.uid();
  v_cert    public.certificates_metadata%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  select * into v_cert
    from public.certificates_metadata
   where id = p_certificate_id
     for update;

  if not found then
    raise exception 'Certificado nao encontrado' using errcode = '22023';
  end if;

  if not public.has_org_role(v_cert.organization_id, array['owner', 'admin']) then
    raise exception 'Apenas owner/admin podem revogar' using errcode = '42501';
  end if;

  if v_cert.status = 'revoked' or v_cert.revoked_at is not null then
    return; -- idempotente
  end if;

  update public.certificates_metadata
     set status = 'revoked',
         revoked_at = now(),
         revoked_by = v_user_id,
         revoke_reason = p_reason
   where id = p_certificate_id;

  -- Apaga o segredo no Vault (defesa em profundidade)
  if v_cert.vault_secret_ref is not null then
    delete from vault.secrets where id = v_cert.vault_secret_ref::uuid;
    update public.certificates_metadata
       set vault_secret_ref = null
     where id = p_certificate_id;
  end if;

  insert into public.certificate_usage_log (
    certificate_id, organization_id, branch_id, user_id, action, context
  )
  values (
    v_cert.id, v_cert.organization_id, v_cert.branch_id,
    v_user_id, 'revoke', jsonb_build_object('reason', p_reason)
  );
end;
$$;

revoke all on function public.revoke_certificate(uuid, text) from public;
grant execute on function public.revoke_certificate(uuid, text) to authenticated;

comment on function public.revoke_certificate(uuid, text) is
  'Revoga cert (status=revoked, apaga vault secret). Idempotente. Owner/admin only.';

-- =====================================================================
-- 7. RPC: supersede_certificate
--    Marca um cert antigo como superseded quando outro entra no lugar.
-- =====================================================================
create or replace function public.supersede_certificate(
  p_old_id uuid,
  p_new_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.certificates_metadata%rowtype;
  v_new public.certificates_metadata%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  select * into v_old from public.certificates_metadata where id = p_old_id for update;
  select * into v_new from public.certificates_metadata where id = p_new_id for update;

  if v_old.id is null or v_new.id is null then
    raise exception 'Certificado nao encontrado' using errcode = '22023';
  end if;

  if v_old.organization_id <> v_new.organization_id then
    raise exception 'Certs de orgs diferentes' using errcode = '22023';
  end if;

  if not public.has_org_role(v_old.organization_id, array['owner', 'admin']) then
    raise exception 'Apenas owner/admin' using errcode = '42501';
  end if;

  update public.certificates_metadata
     set superseded_at = now(),
         superseded_by = p_new_id,
         status = case when status = 'active' then 'expired'::certificate_status else status end
   where id = p_old_id
     and superseded_at is null;
end;
$$;

revoke all on function public.supersede_certificate(uuid, uuid) from public;
grant execute on function public.supersede_certificate(uuid, uuid) to authenticated;

-- =====================================================================
-- 8. RLS update: certificates_metadata (branch_id awareness)
-- =====================================================================
-- A policy de SELECT existente usa is_org_member, suficiente. Para casos
-- de membership branch-scoped, refinamos para respeitar branch_scope.

drop policy if exists certificates_select on public.certificates_metadata;

create policy certificates_select on public.certificates_metadata
for select to authenticated
using (
  public.is_org_member(organization_id)
  and (
    branch_id is null
    or public.is_branch_member(branch_id)
  )
);

-- =====================================================================
-- 9. RLS: certificate_usage_log
-- =====================================================================
alter table public.certificate_usage_log enable row level security;
alter table public.certificate_usage_log force  row level security;

-- SELECT: members veem logs da propria org
create policy cert_usage_log_select on public.certificate_usage_log
for select to authenticated
using (public.is_org_member(organization_id));

-- INSERT/UPDATE/DELETE: bloqueado para authenticated; so service_role escreve.

grant select on public.certificate_usage_log to authenticated;

-- =====================================================================
-- 10. Comentarios finais
-- =====================================================================
comment on schema public is
  'IDK Fiscal — schema multi-tenant com Vault A1 (Wave 1.2b). Ver ADR-013, ADR-014.';
