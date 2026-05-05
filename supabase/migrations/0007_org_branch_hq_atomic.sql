-- =====================================================================
-- IDK Fiscal — Migration 0007: create_organization_with_owner v2
-- Cria org + membership owner + branch HQ atomicamente, com endereco
-- da matriz embutido. Substitui a versao 0004.
-- =====================================================================

-- Drop da versao antiga (assinatura diferente: agora aceita endereco)
drop function if exists public.create_organization_with_owner(
  text, text, text, regime_tributario, char, text, text
);

create or replace function public.create_organization_with_owner(
  p_cnpj                text,
  p_razao_social        text,
  p_nome_fantasia       text,
  p_regime_tributario   regime_tributario,
  p_uf                  char(2),
  p_inscricao_estadual  text,
  p_inscricao_municipal text,
  p_municipio_ibge      char(7) default null,
  p_branch_logradouro   text default '',
  p_branch_numero       text default '',
  p_branch_complemento  text default null,
  p_branch_bairro       text default '',
  p_branch_cep          text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid := auth.uid();
  v_org_id    uuid;
  v_branch_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  insert into public.organizations (
    razao_social, nome_fantasia, regime_tributario, uf,
    municipio_ibge, inscricao_estadual, inscricao_municipal, created_by
  )
  values (
    p_razao_social, p_nome_fantasia, p_regime_tributario, p_uf,
    p_municipio_ibge, p_inscricao_estadual, p_inscricao_municipal, v_user_id
  )
  returning id into v_org_id;

  insert into public.organization_members (
    organization_id, user_id, role, accepted_at
  )
  values (
    v_org_id, v_user_id, 'owner', now()
  );

  insert into public.organization_branches (
    organization_id, cnpj, razao_social, nome_fantasia,
    inscricao_estadual, inscricao_municipal,
    is_headquarters, status, uf, municipio_ibge,
    logradouro, numero, complemento, bairro, cep,
    created_by
  )
  values (
    v_org_id, p_cnpj, p_razao_social, p_nome_fantasia,
    p_inscricao_estadual, p_inscricao_municipal,
    true, 'active'::branch_status, p_uf, p_municipio_ibge,
    coalesce(p_branch_logradouro, ''), coalesce(p_branch_numero, ''),
    p_branch_complemento, coalesce(p_branch_bairro, ''),
    coalesce(p_branch_cep, ''),
    v_user_id
  )
  returning id into v_branch_id;

  return v_org_id;
end;
$$;

revoke all on function public.create_organization_with_owner(
  text, text, text, regime_tributario, char, text, text,
  char, text, text, text, text, text
) from public;
grant execute on function public.create_organization_with_owner(
  text, text, text, regime_tributario, char, text, text,
  char, text, text, text, text, text
) to authenticated;

comment on function public.create_organization_with_owner(
  text, text, text, regime_tributario, char, text, text,
  char, text, text, text, text, text
) is
  'Cria org + membership owner + branch HQ atomicamente. Substitui versao 0004.';

-- =====================================================================
-- RPC: create_branch
--    Cria uma filial nao-matriz na org. Owner/admin only.
-- =====================================================================
create or replace function public.create_branch(
  p_organization_id     uuid,
  p_cnpj                text,
  p_razao_social        text,
  p_nome_fantasia       text default null,
  p_uf                  char(2) default 'XX',
  p_municipio_ibge      char(7) default null,
  p_inscricao_estadual  text default null,
  p_inscricao_municipal text default null,
  p_logradouro          text default '',
  p_numero              text default '',
  p_complemento         text default null,
  p_bairro              text default '',
  p_cep                 text default ''
)
returns public.organization_branches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_branch  public.organization_branches%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  if not public.has_org_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Apenas owner/admin podem criar filial' using errcode = '42501';
  end if;

  insert into public.organization_branches (
    organization_id, cnpj, razao_social, nome_fantasia,
    inscricao_estadual, inscricao_municipal,
    is_headquarters, status, uf, municipio_ibge,
    logradouro, numero, complemento, bairro, cep,
    created_by
  )
  values (
    p_organization_id, p_cnpj, p_razao_social, p_nome_fantasia,
    p_inscricao_estadual, p_inscricao_municipal,
    false, 'active'::branch_status, p_uf, p_municipio_ibge,
    coalesce(p_logradouro, ''), coalesce(p_numero, ''),
    p_complemento, coalesce(p_bairro, ''), coalesce(p_cep, ''),
    v_user_id
  )
  returning * into v_branch;

  return v_branch;
end;
$$;

revoke all on function public.create_branch(
  uuid, text, text, text, char, char, text, text, text, text, text, text, text
) from public;
grant execute on function public.create_branch(
  uuid, text, text, text, char, char, text, text, text, text, text, text, text
) to authenticated;

-- =====================================================================
-- RPC: revoke_invite
--    Marca convite como revogado. Owner/admin only.
-- =====================================================================
create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite  public.organization_invites%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  select * into v_invite
    from public.organization_invites
   where id = p_invite_id
     for update;

  if not found then
    raise exception 'Convite nao encontrado' using errcode = '22023';
  end if;

  if not public.has_org_role(v_invite.organization_id, array['owner', 'admin']) then
    raise exception 'Apenas owner/admin podem revogar' using errcode = '42501';
  end if;

  if v_invite.revoked_at is not null or v_invite.accepted_at is not null then
    return; -- idempotente
  end if;

  update public.organization_invites
     set revoked_at = now()
   where id = p_invite_id;
end;
$$;

revoke all on function public.revoke_invite(uuid) from public;
grant execute on function public.revoke_invite(uuid) to authenticated;
