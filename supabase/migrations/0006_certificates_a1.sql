-- =====================================================================
-- IDK Fiscal — Migration 0006: Certificados A1 (Vault + Storage + Saga)
-- Wave 1.2b — Estende certificates_metadata, cria certificate_usage_log,
-- RPCs SECURITY DEFINER de leitura/revogacao, helper de auditoria.
-- ADRs aplicaveis: ADR-013 (Vault A1), ADR-014 (a registrar)
-- Adaptacoes vs MSG-w12b5301 (autorizadas em MSG-w12b5302):
--   - Reusa is_org_member / has_org_role do projeto.
--   - Estende certificates_metadata (criada na 0001) ao inves de criar paralela.
--   - Mantem thumbprint_sha256 (SHA-256, mais forte que SHA-1 da MSG).
--   - UNIQUE relaxada para (organization_id, thumbprint_sha256).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensao Vault (idempotente)
-- ---------------------------------------------------------------------
create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------------
-- 1. Enums novos / extensoes de enum
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'certificate_purpose') then
    create type certificate_purpose as enum (
      'nfe',
      'ecnpj',
      'ecpf',
      'outro'
    );
  end if;
end$$;

-- Adicionar 'superseded' ao certificate_status (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'certificate_status' and e.enumlabel = 'superseded'
  ) then
    alter type certificate_status add value 'superseded';
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2. Estender certificates_metadata
-- ---------------------------------------------------------------------
alter table public.certificates_metadata
  add column if not exists branch_id        uuid references public.organization_branches(id) on delete restrict,
  add column if not exists purpose          certificate_purpose not null default 'nfe',
  add column if not exists storage_bucket   text not null default 'certificates',
  add column if not exists subject_cn       text,
  add column if not exists issuer_cn        text,
  add column if not exists signature_algorithm text,
  add column if not exists superseded_at    timestamptz,
  add column if not exists superseded_by    uuid references public.certificates_metadata(id) on delete set null,
  add column if not exists revoked_at       timestamptz,
  add column if not exists revoked_by       uuid references auth.users(id) on delete set null,
  add column if not exists revoked_reason   text;

-- Tornar vault_secret_ref NOT NULL para certs futuros (ja era estavel; default vazio para historico)
-- Skip: deixar nullable porque a 0001 deixou assim e nao ha rows hoje.

-- Trocar UNIQUE global para (org, thumbprint) — relaxa para permitir mesmo cert em orgs distintas
alter table public.certificates_metadata
  drop constraint if exists certificates_thumbprint_uniq;

create unique index if not exists certificates_org_thumbprint_uniq
  on public.certificates_metadata (organization_id, thumbprint_sha256);

-- Index parcial para "certificado ativo por (org, branch, purpose)"
create index if not exists certificates_active_by_purpose_idx
  on public.certificates_metadata (organization_id, branch_id, purpose, status)
  where status = 'active';

-- ---------------------------------------------------------------------
-- 3. Tabela: certificate_usage_log (append-only)
-- ---------------------------------------------------------------------
create table if not exists public.certificate_usage_log (
  id              uuid primary key default gen_random_uuid(),
  certificate_id  uuid not null references public.certificates_metadata(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  used_by         uuid not null references auth.users(id) on delete restrict,
  used_at         timestamptz not null default now(),
  purpose_text    text,
  source_ip       inet,
  user_agent      text
);

create index if not exists certificate_usage_log_cert_idx
  on public.certificate_usage_log (certificate_id, used_at desc);
create index if not exists certificate_usage_log_org_idx
  on public.certificate_usage_log (organization_id, used_at desc);

comment on table public.certificate_usage_log is
  'Log append-only de uso de certificado A1. UPDATE/DELETE bloqueados por trigger.';

-- Trigger append-only enforcement
create or replace function public.enforce_certificate_usage_log_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'certificate_usage_log e append-only: % bloqueado', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists certificate_usage_log_no_update on public.certificate_usage_log;
create trigger certificate_usage_log_no_update
before update on public.certificate_usage_log
for each row execute function public.enforce_certificate_usage_log_append_only();

drop trigger if exists certificate_usage_log_no_delete on public.certificate_usage_log;
create trigger certificate_usage_log_no_delete
before delete on public.certificate_usage_log
for each row execute function public.enforce_certificate_usage_log_append_only();

-- ---------------------------------------------------------------------
-- 4. RLS em certificate_usage_log
-- ---------------------------------------------------------------------
alter table public.certificate_usage_log enable row level security;
alter table public.certificate_usage_log force  row level security;

-- SELECT: membros da org veem o log. INSERT direto bloqueado (so via SECURITY DEFINER).
-- UPDATE/DELETE bloqueados por trigger AND ausencia de policy.
create policy certificate_usage_log_select on public.certificate_usage_log
for select to authenticated
using (public.is_org_member(organization_id));

-- Sem INSERT/UPDATE/DELETE policies: usuario comum nao pode escrever.
-- A RPC SECURITY DEFINER bypassa RLS porque roda como owner da function.

-- ---------------------------------------------------------------------
-- 5. RPC: get_certificate_for_signing
--    Valida member + status + nao-expirado, le senha do Vault, registra log.
-- ---------------------------------------------------------------------
create or replace function public.get_certificate_for_signing(
  p_certificate_id uuid,
  p_purpose_text   text default null
)
returns table (
  storage_path  text,
  storage_bucket text,
  vault_password text,
  serial_number text,
  subject_cn    text,
  valid_until   timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp, vault
as $$
declare
  v_user_id uuid := auth.uid();
  v_cert    public.certificates_metadata%rowtype;
  v_pwd     text;
begin
  if v_user_id is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  select * into v_cert
    from public.certificates_metadata
   where id = p_certificate_id;

  if not found then
    raise exception 'Certificado nao encontrado' using errcode = '22023';
  end if;

  if not public.is_org_member(v_cert.organization_id) then
    raise exception 'Acesso negado a este certificado' using errcode = '42501';
  end if;

  if v_cert.status <> 'active' then
    raise exception 'Certificado nao esta ativo (status=%)', v_cert.status
      using errcode = '22023';
  end if;

  if v_cert.valid_until <= now() then
    raise exception 'Certificado expirado em %', v_cert.valid_until
      using errcode = '22023';
  end if;

  -- Le senha do Vault (vault_secret_ref guarda o id do secret)
  if v_cert.vault_secret_ref is null then
    raise exception 'Certificado sem vault_secret_ref' using errcode = '22023';
  end if;

  select decrypted_secret into v_pwd
    from vault.decrypted_secrets
   where id = v_cert.vault_secret_ref::uuid;

  if v_pwd is null then
    raise exception 'Senha nao encontrada no Vault' using errcode = '22023';
  end if;

  -- Append log
  insert into public.certificate_usage_log (
    certificate_id, organization_id, used_by, purpose_text,
    source_ip, user_agent
  )
  values (
    v_cert.id, v_cert.organization_id, v_user_id, p_purpose_text,
    nullif(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', '')::inet,
    current_setting('request.headers', true)::jsonb->>'user-agent'
  );

  return query select
    v_cert.storage_path,
    v_cert.storage_bucket,
    v_pwd,
    v_cert.serial_number,
    v_cert.subject_cn,
    v_cert.valid_until;
end;
$$;

revoke all on function public.get_certificate_for_signing(uuid, text) from public;
grant execute on function public.get_certificate_for_signing(uuid, text) to authenticated;

comment on function public.get_certificate_for_signing(uuid, text) is
  'Retorna senha (Vault) + path do cert para assinatura. Gate por is_org_member. Append em usage_log.';

-- ---------------------------------------------------------------------
-- 6. RPC: revoke_certificate
-- ---------------------------------------------------------------------
create or replace function public.revoke_certificate(
  p_certificate_id uuid,
  p_reason         text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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
   where id = p_certificate_id;

  if not found then
    raise exception 'Certificado nao encontrado' using errcode = '22023';
  end if;

  if not public.has_org_role(v_cert.organization_id, array['owner','admin']) then
    raise exception 'Apenas owner/admin podem revogar' using errcode = '42501';
  end if;

  if v_cert.status = 'revoked' then
    raise exception 'Certificado ja esta revogado' using errcode = '22023';
  end if;

  update public.certificates_metadata
     set status = 'revoked',
         revoked_at = now(),
         revoked_by = v_user_id,
         revoked_reason = p_reason
   where id = p_certificate_id;
end;
$$;

revoke all on function public.revoke_certificate(uuid, text) from public;
grant execute on function public.revoke_certificate(uuid, text) to authenticated;

comment on function public.revoke_certificate(uuid, text) is
  'Revoga certificado. Gate por has_org_role(owner/admin).';

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
grant select on public.certificate_usage_log to authenticated;
-- INSERT/UPDATE/DELETE em usage_log nao concedidos a authenticated.
-- A RPC SECURITY DEFINER faz o INSERT.
