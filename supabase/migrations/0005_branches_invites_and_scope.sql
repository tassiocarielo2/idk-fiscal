-- =====================================================================
-- IDK Fiscal — Migration 0005: Branches, Invites and Branch-scoped Membership
-- Wave 1.2a — Multi-CNPJ via filiais; convites por email; escopo de filial.
-- ADRs aplicaveis: ADR-009 (multi-tenant + RLS), ADR-012 (testes),
--                  ADR-013 (Vault A1 — implementacao em wave futura)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Enums novos
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'branch_status') then
    create type branch_status as enum (
      'active',
      'suspended',
      'inactive'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'invite_role') then
    create type invite_role as enum (
      'admin',
      'member',
      'viewer'
    );
  end if;
end$$;

-- =====================================================================
-- 1. Tabela: organization_branches
-- =====================================================================
create table if not exists public.organization_branches (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  cnpj                  text not null,
  razao_social          text not null,
  nome_fantasia         text,
  inscricao_estadual    text,
  inscricao_municipal   text,
  is_headquarters       boolean not null default false,
  status                branch_status not null default 'active',
  -- Endereco
  logradouro            text not null default '',
  numero                text not null default '',
  complemento           text,
  bairro                text not null default '',
  cep                   text not null default '',
  municipio_ibge        char(7),
  uf                    char(2) not null default 'XX',
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null,
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,

  constraint organization_branches_cnpj_format_chk
    check (public.is_valid_cnpj_format(cnpj)),
  constraint organization_branches_uf_chk
    check (uf ~ '^[A-Z]{2}$'),
  constraint organization_branches_municipio_ibge_chk
    check (municipio_ibge is null or municipio_ibge ~ '^[0-9]{7}$'),
  constraint organization_branches_cep_chk
    check (cep = '' or cep ~ '^[0-9]{8}$')
);

-- CNPJ unico globalmente entre filiais ATIVAS
create unique index if not exists organization_branches_cnpj_active_uniq
  on public.organization_branches (cnpj)
  where deleted_at is null;

-- Exatamente UMA matriz por org (constraint forte via indice unique parcial)
create unique index if not exists organization_branches_one_hq_per_org
  on public.organization_branches (organization_id)
  where is_headquarters and deleted_at is null;

create index if not exists organization_branches_org_idx
  on public.organization_branches (organization_id);

create trigger organization_branches_set_updated_at
before update on public.organization_branches
for each row execute function public.set_updated_at();

comment on table public.organization_branches is
  'Filiais (matriz e demais) de uma organizacao. CNPJ unico globalmente; exatamente 1 matriz por org.';

-- =====================================================================
-- 2. Migracao de dados: organizations.cnpj -> organization_branches (matriz)
-- =====================================================================
insert into public.organization_branches (
  organization_id, cnpj, razao_social, nome_fantasia,
  inscricao_estadual, inscricao_municipal,
  is_headquarters, status, uf, municipio_ibge,
  created_by, created_at
)
select
  o.id,
  o.cnpj,
  o.razao_social,
  o.nome_fantasia,
  o.inscricao_estadual,
  o.inscricao_municipal,
  true,
  'active'::branch_status,
  o.uf,
  o.municipio_ibge,
  o.created_by,
  o.created_at
from public.organizations o
where o.deleted_at is null
  and not exists (
    select 1 from public.organization_branches b
     where b.organization_id = o.id and b.is_headquarters
  );

-- Sanity: cada org ativa precisa ter exatamente 1 matriz
do $$
declare
  v_orgs_sem_matriz int;
  v_orgs_com_multi int;
begin
  select count(*) into v_orgs_sem_matriz
    from public.organizations o
   where o.deleted_at is null
     and not exists (
       select 1 from public.organization_branches b
        where b.organization_id = o.id and b.is_headquarters
     );
  if v_orgs_sem_matriz > 0 then
    raise exception 'Migracao 0005: % organizacoes ficaram sem matriz.', v_orgs_sem_matriz;
  end if;

  select count(*) into v_orgs_com_multi
    from (
      select organization_id from public.organization_branches
       where is_headquarters and deleted_at is null
       group by organization_id having count(*) > 1
    ) x;
  if v_orgs_com_multi > 0 then
    raise exception 'Migracao 0005: % organizacoes com mais de 1 matriz.', v_orgs_com_multi;
  end if;
end$$;

-- Drop da coluna cnpj em organizations apos migracao bem-sucedida
alter table public.organizations drop constraint if exists organizations_cnpj_format_chk;
drop index if exists public.organizations_cnpj_active_uniq;
alter table public.organizations drop column if exists cnpj;

-- =====================================================================
-- 3. Branch scope no membership existente
-- =====================================================================
alter table public.organization_members
  add column if not exists branch_scope uuid[];

-- owner/admin sempre veem tudo (branch_scope = NULL); member/viewer pode ter array
alter table public.organization_members drop constraint if exists organization_members_branch_scope_chk;
alter table public.organization_members
  add constraint organization_members_branch_scope_chk
  check (
    (role in ('owner', 'admin') and branch_scope is null)
    or role in ('member', 'viewer')
  );

comment on column public.organization_members.branch_scope is
  'NULL = acesso a todas as filiais. Array uuid = restrito as filiais listadas. Owner/admin sempre NULL.';

-- =====================================================================
-- 4. Helper RLS: is_branch_member
-- =====================================================================
create or replace function public.is_branch_member(p_branch_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
      from public.organization_branches b
      join public.organization_members m
        on m.organization_id = b.organization_id
     where b.id = p_branch_id
       and b.deleted_at is null
       and m.user_id = auth.uid()
       and m.accepted_at is not null
       and (
         m.branch_scope is null
         or b.id = any (m.branch_scope)
       )
  );
$$;

revoke all on function public.is_branch_member(uuid) from public;
grant execute on function public.is_branch_member(uuid) to authenticated;

-- =====================================================================
-- 5. Tabela: organization_invites
-- =====================================================================
create table if not exists public.organization_invites (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  email             extensions.citext not null,
  role              invite_role not null,
  branch_scope      uuid[],
  token             text not null,
  invited_by        uuid not null references auth.users(id) on delete restrict,
  expires_at        timestamptz not null default (now() + interval '7 days'),
  accepted_at       timestamptz,
  accepted_by       uuid references auth.users(id) on delete set null,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),

  constraint organization_invites_token_uniq unique (token),
  constraint organization_invites_accept_consistency_chk check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  )
);

-- 1 convite "vivo" por (org, email): pendente = nao aceito e nao revogado
-- (expiracao e checada na RPC porque now() nao e immutable)
create unique index if not exists organization_invites_pending_uniq
  on public.organization_invites (organization_id, email)
  where accepted_at is null and revoked_at is null;

create index if not exists organization_invites_org_idx
  on public.organization_invites (organization_id);
create index if not exists organization_invites_email_idx
  on public.organization_invites (email);

comment on table public.organization_invites is
  'Convites por email. Token gerado server-side. DELETE bloqueado (use revoked_at).';

-- =====================================================================
-- 6. RPC: create_invite
-- =====================================================================
create or replace function public.create_invite(
  p_organization_id uuid,
  p_email           text,
  p_role            invite_role,
  p_branch_scope    uuid[] default null
)
returns public.organization_invites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_token       text;
  v_normalized  extensions.citext := p_email::extensions.citext;
  v_invite      public.organization_invites%rowtype;
  v_orphan_count int;
begin
  if v_user_id is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  if not public.has_org_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Apenas owner/admin podem criar convites'
      using errcode = '42501';
  end if;

  -- Validar branch_scope: cada branch deve pertencer a org
  if p_branch_scope is not null then
    if array_length(p_branch_scope, 1) is null then
      raise exception 'branch_scope nao pode ser array vazio (use NULL para todas)'
        using errcode = '22023';
    end if;
    select count(*) into v_orphan_count
      from unnest(p_branch_scope) as b(id)
     where not exists (
       select 1 from public.organization_branches br
        where br.id = b.id
          and br.organization_id = p_organization_id
          and br.deleted_at is null
     );
    if v_orphan_count > 0 then
      raise exception 'branch_scope contem filiais que nao pertencem a org %', p_organization_id
        using errcode = '22023';
    end if;
  end if;

  -- Token: 32 bytes random, base64url
  v_token := translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=', '-_'
  );

  insert into public.organization_invites (
    organization_id, email, role, branch_scope, token, invited_by
  )
  values (
    p_organization_id, v_normalized, p_role, p_branch_scope, v_token, v_user_id
  )
  returning * into v_invite;

  return v_invite;
end;
$$;

revoke all on function public.create_invite(uuid, text, invite_role, uuid[]) from public;
grant execute on function public.create_invite(uuid, text, invite_role, uuid[]) to authenticated;

-- =====================================================================
-- 7. RPC: accept_invite
-- =====================================================================
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_email       extensions.citext;
  v_invite      public.organization_invites%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  select email::extensions.citext into v_email
    from auth.users where id = v_user_id;
  if v_email is null then
    raise exception 'Usuario sem email' using errcode = '28000';
  end if;

  select * into v_invite
    from public.organization_invites
   where token = p_token
   for update;

  if not found then
    raise exception 'Convite nao encontrado' using errcode = '22023';
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'Convite revogado' using errcode = '22023';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'Convite ja aceito' using errcode = '22023';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'Convite expirado' using errcode = '22023';
  end if;

  if v_invite.email <> v_email then
    raise exception 'Email do convite nao corresponde ao usuario logado'
      using errcode = '28000';
  end if;

  -- Insere ou atualiza membership
  insert into public.organization_members (
    organization_id, user_id, role, branch_scope, invited_by, accepted_at
  )
  values (
    v_invite.organization_id,
    v_user_id,
    v_invite.role::text::org_member_role,
    case when v_invite.role::text in ('member', 'viewer') then v_invite.branch_scope else null end,
    v_invite.invited_by,
    now()
  )
  on conflict (organization_id, user_id) do update set
    role = excluded.role,
    branch_scope = excluded.branch_scope,
    accepted_at = coalesce(public.organization_members.accepted_at, excluded.accepted_at);

  update public.organization_invites
     set accepted_at = now(),
         accepted_by = v_user_id
   where id = v_invite.id;

  return v_invite.organization_id;
end;
$$;

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

-- =====================================================================
-- 8. RPC publica: peek_invite
--    Acessivel sem login (pre-aceitacao): so metadados nao-sensiveis.
-- =====================================================================
create or replace function public.peek_invite(p_token text)
returns table (
  organization_id    uuid,
  organization_name  text,
  email              text,
  role               invite_role,
  expires_at         timestamptz,
  accepted_at        timestamptz,
  revoked_at         timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    i.organization_id,
    o.razao_social as organization_name,
    i.email::text,
    i.role,
    i.expires_at,
    i.accepted_at,
    i.revoked_at
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token;
$$;

revoke all on function public.peek_invite(text) from public;
grant execute on function public.peek_invite(text) to anon, authenticated;

-- =====================================================================
-- 9. RLS: organization_branches
-- =====================================================================
alter table public.organization_branches enable row level security;
alter table public.organization_branches force  row level security;

create policy organization_branches_select on public.organization_branches
for select to authenticated
using (
  deleted_at is null
  and public.is_org_member(organization_id)
);

create policy organization_branches_insert on public.organization_branches
for insert to authenticated
with check (public.has_org_role(organization_id, array['owner','admin']));

create policy organization_branches_update on public.organization_branches
for update to authenticated
using (public.has_org_role(organization_id, array['owner','admin']))
with check (public.has_org_role(organization_id, array['owner','admin']));

create policy organization_branches_delete on public.organization_branches
for delete to authenticated
using (public.has_org_role(organization_id, array['owner','admin']));

-- =====================================================================
-- 10. RLS: organization_invites
-- =====================================================================
alter table public.organization_invites enable row level security;
alter table public.organization_invites force  row level security;

create policy organization_invites_select on public.organization_invites
for select to authenticated
using (public.has_org_role(organization_id, array['owner','admin']));

create policy organization_invites_insert on public.organization_invites
for insert to authenticated
with check (public.has_org_role(organization_id, array['owner','admin']));

create policy organization_invites_update on public.organization_invites
for update to authenticated
using (public.has_org_role(organization_id, array['owner','admin']))
with check (public.has_org_role(organization_id, array['owner','admin']));

-- DELETE: SEM policy. RLS forced => nega tudo. Use revoked_at via UPDATE.

-- =====================================================================
-- 11. Grants
-- =====================================================================
grant select, insert, update, delete on public.organization_branches to authenticated;
grant select, insert, update on public.organization_invites to authenticated;

-- =====================================================================
-- 12. Coments finais
-- =====================================================================
comment on column public.organization_branches.is_headquarters is
  'Matriz unica por org: garantida por unique index parcial.';
comment on function public.is_branch_member(uuid) is
  'RLS helper: dado um branch_id, true se auth.uid() e membro ativo da org dona da filial e branch_scope permite.';
comment on function public.create_invite(uuid, text, invite_role, uuid[]) is
  'Cria convite. Caller deve ser owner/admin. Token gerado server-side.';
comment on function public.accept_invite(text) is
  'Aceita convite por token. Email do caller deve bater (case-insensitive) com email do convite.';
comment on function public.peek_invite(text) is
  'Leitura publica de metadados do convite (anon allowed). Sem dados sensiveis.';
