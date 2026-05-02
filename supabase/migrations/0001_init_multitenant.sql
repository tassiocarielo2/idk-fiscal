-- =====================================================================
-- IDK Fiscal — Migration 0001: Init Multi-tenant
-- Wave 1.1 — Schema base: organizations, members, certificates, audit
-- ADRs aplicáveis: ADR-007 (escopo MVP), ADR-008 (custódia A1),
--                  ADR-009 (multi-tenant shared schema + RLS)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'regime_tributario') then
    create type regime_tributario as enum (
      'simples_nacional',
      'lucro_presumido',
      'lucro_real'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'org_member_role') then
    create type org_member_role as enum (
      'owner',
      'admin',
      'member',
      'viewer'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'certificate_status') then
    create type certificate_status as enum (
      'active',
      'expired',
      'revoked'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2. Helper: updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Helper: validar CNPJ (apenas formato — 14 dígitos numéricos)
--    Validação de dígito verificador fica para a aplicação.
-- ---------------------------------------------------------------------
create or replace function public.is_valid_cnpj_format(p_cnpj text)
returns boolean
language plpgsql
immutable
as $$
begin
  return p_cnpj ~ '^[0-9]{14}$';
end;
$$;

-- =====================================================================
-- 4. Tabela: organizations
-- =====================================================================
create table if not exists public.organizations (
  id                    uuid primary key default gen_random_uuid(),
  cnpj                  text not null,
  razao_social          text not null,
  nome_fantasia         text,
  regime_tributario     regime_tributario not null,
  uf                    char(2) not null,
  municipio_ibge        char(7),
  inscricao_estadual    text,
  inscricao_municipal   text,
  created_at            timestamptz not null default now(),
  created_by            uuid not null references auth.users(id) on delete restrict,
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,

  constraint organizations_cnpj_format_chk
    check (public.is_valid_cnpj_format(cnpj)),
  constraint organizations_uf_chk
    check (uf ~ '^[A-Z]{2}$'),
  constraint organizations_municipio_ibge_chk
    check (municipio_ibge is null or municipio_ibge ~ '^[0-9]{7}$')
);

-- CNPJ único entre orgs ATIVAS (deleted_at IS NULL)
create unique index if not exists organizations_cnpj_active_uniq
  on public.organizations (cnpj)
  where deleted_at is null;

create index if not exists organizations_created_by_idx
  on public.organizations (created_by);

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

comment on table public.organizations is
  'Tenant raiz. Toda linha de domínio se vincula via organization_id. Soft delete via deleted_at.';

-- =====================================================================
-- 5. Tabela: organization_members
-- =====================================================================
create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            org_member_role not null,
  invited_by      uuid references auth.users(id) on delete set null,
  accepted_at     timestamptz,
  created_at      timestamptz not null default now(),

  constraint organization_members_uniq
    unique (organization_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id);
create index if not exists organization_members_org_idx
  on public.organization_members (organization_id);

comment on table public.organization_members is
  'N:M entre auth.users e organizations com role. accepted_at NULL = convite pendente (Wave 1.2).';

-- =====================================================================
-- 6. Helpers de RLS (security definer, search_path travado)
-- =====================================================================

-- Verifica se o usuário autenticado é membro ATIVO da org
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.organization_members m
     where m.organization_id = p_org_id
       and m.user_id = auth.uid()
       and m.accepted_at is not null
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

-- Verifica se o usuário tem um dos roles requeridos na org
create or replace function public.has_org_role(p_org_id uuid, p_required_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.organization_members m
     where m.organization_id = p_org_id
       and m.user_id = auth.uid()
       and m.accepted_at is not null
       and m.role::text = any (p_required_roles)
  );
$$;

revoke all on function public.has_org_role(uuid, text[]) from public;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;

-- =====================================================================
-- 7. Trigger: garantir owner único e proteção contra remoção do owner
-- =====================================================================
create or replace function public.enforce_owner_invariants()
returns trigger
language plpgsql
as $$
declare
  v_owner_count int;
begin
  -- Em INSERT/UPDATE: garantir no máximo 1 owner por org
  if (tg_op in ('INSERT', 'UPDATE')) and new.role = 'owner' then
    select count(*)
      into v_owner_count
      from public.organization_members
     where organization_id = new.organization_id
       and role = 'owner'
       and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
    if v_owner_count > 0 then
      raise exception 'Org % já possui owner. Transfira a propriedade antes.', new.organization_id
        using errcode = '23514';
    end if;
  end if;

  -- Em UPDATE: bloquear rebaixamento do único owner
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    select count(*)
      into v_owner_count
      from public.organization_members
     where organization_id = old.organization_id
       and role = 'owner'
       and id <> old.id;
    if v_owner_count = 0 then
      raise exception 'Não é possível rebaixar o único owner da org %.', old.organization_id
        using errcode = '23514';
    end if;
  end if;

  -- Em DELETE: bloquear remoção do único owner
  if tg_op = 'DELETE' and old.role = 'owner' then
    select count(*)
      into v_owner_count
      from public.organization_members
     where organization_id = old.organization_id
       and role = 'owner'
       and id <> old.id;
    if v_owner_count = 0 then
      raise exception 'Não é possível remover o único owner da org %.', old.organization_id
        using errcode = '23514';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger organization_members_enforce_owner
before insert or update or delete on public.organization_members
for each row execute function public.enforce_owner_invariants();

-- =====================================================================
-- 8. Tabela: certificates_metadata
--    APENAS metadados. Blob criptografado em Storage. Senha em Vault (Wave 1.3).
-- =====================================================================
create table if not exists public.certificates_metadata (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete restrict,
  cnpj_titular            text not null,
  razao_social_titular    text not null,
  valid_from              timestamptz not null,
  valid_until             timestamptz not null,
  serial_number           text not null,
  thumbprint_sha256       text not null,
  storage_path            text not null,
  vault_secret_ref        text,
  status                  certificate_status not null default 'active',
  uploaded_at             timestamptz not null default now(),
  uploaded_by             uuid not null references auth.users(id) on delete restrict,

  constraint certificates_thumbprint_uniq
    unique (thumbprint_sha256),
  constraint certificates_validity_chk
    check (valid_until > valid_from),
  constraint certificates_cnpj_titular_format_chk
    check (public.is_valid_cnpj_format(cnpj_titular))
);

create index if not exists certificates_org_idx
  on public.certificates_metadata (organization_id);
create index if not exists certificates_org_status_idx
  on public.certificates_metadata (organization_id, status);

comment on table public.certificates_metadata is
  'Metadados de certificado A1. Blob criptografado fica em bucket privado do Storage; senha em Vault (Wave 1.3).';

-- =====================================================================
-- 9. Tabela: audit_log (append-only)
-- =====================================================================
create table if not exists public.audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid,
  actor_user_id   uuid,
  actor_role      text,
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  payload         jsonb,
  ip_address      inet,
  created_at      timestamptz not null default now()
);

create index if not exists audit_log_org_created_idx
  on public.audit_log (organization_id, created_at desc);
create index if not exists audit_log_action_idx
  on public.audit_log (action);
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id);

-- Trigger: bloquear UPDATE e DELETE
create or replace function public.audit_log_block_mutations()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log é append-only. % não permitido.', tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_log_no_update
before update on public.audit_log
for each row execute function public.audit_log_block_mutations();

create trigger audit_log_no_delete
before delete on public.audit_log
for each row execute function public.audit_log_block_mutations();

comment on table public.audit_log is
  'Log append-only. UPDATE/DELETE bloqueados por trigger. Particionamento por mês: decisão futura.';

-- =====================================================================
-- 10. RLS — habilitar e forçar
-- =====================================================================
alter table public.organizations         enable row level security;
alter table public.organizations         force  row level security;
alter table public.organization_members  enable row level security;
alter table public.organization_members  force  row level security;
alter table public.certificates_metadata enable row level security;
alter table public.certificates_metadata force  row level security;
alter table public.audit_log             enable row level security;
alter table public.audit_log             force  row level security;

-- ---------------------------------------------------------------------
-- 10.1 Policies: organizations
-- ---------------------------------------------------------------------

-- SELECT: só vê orgs em que é membro ativo, e que não estão soft-deleted
create policy organizations_select on public.organizations
for select to authenticated
using (
  deleted_at is null
  and public.is_org_member(id)
);

-- INSERT: qualquer authenticated pode criar; created_by deve ser ele mesmo
create policy organizations_insert on public.organizations
for insert to authenticated
with check (
  created_by = auth.uid()
  and deleted_at is null
);

-- UPDATE: só owner ou admin
create policy organizations_update on public.organizations
for update to authenticated
using (public.has_org_role(id, array['owner','admin']))
with check (public.has_org_role(id, array['owner','admin']));

-- DELETE (hard): só owner. Soft delete preferencial via UPDATE de deleted_at.
create policy organizations_delete on public.organizations
for delete to authenticated
using (public.has_org_role(id, array['owner']));

-- ---------------------------------------------------------------------
-- 10.2 Policies: organization_members
-- ---------------------------------------------------------------------

-- SELECT: vê membros das orgs em que é membro ativo
create policy org_members_select on public.organization_members
for select to authenticated
using (public.is_org_member(organization_id));

-- INSERT: dois caminhos
--   (a) usuário se auto-adiciona como owner ao criar a primeira membership da org
--       (necessário no fluxo de criar org → primeira membership owner)
--   (b) admin ou owner adiciona membros (não-owner) em orgs já existentes
create policy org_members_insert on public.organization_members
for insert to authenticated
with check (
  -- (a) auto-bootstrap: usuário vira owner de uma org sem membros
  (
    user_id = auth.uid()
    and role = 'owner'
    and not exists (
      select 1 from public.organization_members m
       where m.organization_id = organization_members.organization_id
    )
  )
  or
  -- (b) admin/owner adiciona um não-owner
  (
    role <> 'owner'
    and public.has_org_role(organization_id, array['owner','admin'])
  )
);

-- UPDATE: owner pode atualizar qualquer membro; admin pode atualizar
-- members/viewers mas não pode mexer em owner ou em outros admins.
-- Rebaixar/promover owner é bloqueado pelo trigger enforce_owner_invariants.
create policy org_members_update on public.organization_members
for update to authenticated
using (
  public.has_org_role(organization_id, array['owner'])
  or (
    public.has_org_role(organization_id, array['admin'])
    and role in ('member','viewer')
  )
)
with check (
  public.has_org_role(organization_id, array['owner'])
  or (
    public.has_org_role(organization_id, array['admin'])
    and role in ('member','viewer')
  )
);

-- DELETE: owner pode remover qualquer (exceto único owner — bloqueado por trigger).
-- Admin pode remover member/viewer. Member/viewer pode se auto-remover (sair da org).
create policy org_members_delete on public.organization_members
for delete to authenticated
using (
  public.has_org_role(organization_id, array['owner'])
  or (
    public.has_org_role(organization_id, array['admin'])
    and role in ('member','viewer')
  )
  or (
    user_id = auth.uid()
    and role <> 'owner'
  )
);

-- ---------------------------------------------------------------------
-- 10.3 Policies: certificates_metadata
-- ---------------------------------------------------------------------

create policy certificates_select on public.certificates_metadata
for select to authenticated
using (public.is_org_member(organization_id));

-- Apenas owner/admin podem subir certificado
create policy certificates_insert on public.certificates_metadata
for insert to authenticated
with check (
  public.has_org_role(organization_id, array['owner','admin'])
  and uploaded_by = auth.uid()
);

create policy certificates_update on public.certificates_metadata
for update to authenticated
using (public.has_org_role(organization_id, array['owner','admin']))
with check (public.has_org_role(organization_id, array['owner','admin']));

create policy certificates_delete on public.certificates_metadata
for delete to authenticated
using (public.has_org_role(organization_id, array['owner']));

-- ---------------------------------------------------------------------
-- 10.4 Policies: audit_log
-- ---------------------------------------------------------------------

-- SELECT: members veem logs da própria org; admin/owner também veem logs sem org (globais relevantes ao seu contexto não existem por padrão)
create policy audit_log_select on public.audit_log
for select to authenticated
using (
  organization_id is not null
  and public.is_org_member(organization_id)
);

-- INSERT: NÃO há policy para authenticated → escrita só via service_role (server-side)
-- UPDATE/DELETE: bloqueados por trigger antes mesmo de RLS

-- =====================================================================
-- 11. Grants base
-- =====================================================================
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on
  public.organizations,
  public.organization_members,
  public.certificates_metadata
  to authenticated;
grant select on public.audit_log to authenticated;

-- =====================================================================
-- 12. Comentários finais
-- =====================================================================
comment on schema public is
  'IDK Fiscal — schema multi-tenant. Isolamento via organization_id + RLS forçado. Ver ADR-009.';
