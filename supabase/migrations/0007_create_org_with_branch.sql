-- =====================================================================
-- IDK Fiscal — Migration 0007: Estender create_organization_with_owner
-- Wave 1.2b — Cria org + branch HQ + membership owner em chamada unica.
-- Adaptacoes (MSG-w12b5302): preserva assinatura de parametros existente,
-- mas troca tipo de retorno de uuid para table(org_id, branch_id).
-- Caller unico: src/server/organizations/create-organization.ts (atualizado).
-- =====================================================================

-- Drop antes de recriar com novo retorno
drop function if exists public.create_organization_with_owner(
  text, text, text, regime_tributario, character, text, text
);

create or replace function public.create_organization_with_owner(
  p_cnpj                text,
  p_razao_social        text,
  p_nome_fantasia       text,
  p_regime_tributario   regime_tributario,
  p_uf                  character,
  p_inscricao_estadual  text,
  p_inscricao_municipal text
)
returns table (
  organization_id uuid,
  branch_id       uuid
)
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
    inscricao_estadual, inscricao_municipal, created_by
  )
  values (
    p_razao_social, p_nome_fantasia, p_regime_tributario, p_uf,
    p_inscricao_estadual, p_inscricao_municipal, v_user_id
  )
  returning id into v_org_id;

  -- Branch HQ: replica dados da org como matriz
  insert into public.organization_branches (
    organization_id, cnpj, razao_social, nome_fantasia,
    inscricao_estadual, inscricao_municipal,
    is_headquarters, status, uf,
    created_by
  )
  values (
    v_org_id, p_cnpj, p_razao_social, p_nome_fantasia,
    p_inscricao_estadual, p_inscricao_municipal,
    true, 'active'::branch_status, p_uf,
    v_user_id
  )
  returning id into v_branch_id;

  insert into public.organization_members (
    organization_id, user_id, role, accepted_at
  )
  values (
    v_org_id, v_user_id, 'owner', now()
  );

  organization_id := v_org_id;
  branch_id := v_branch_id;
  return next;
end;
$$;

revoke all on function public.create_organization_with_owner(
  text, text, text, regime_tributario, character, text, text
) from public;

grant execute on function public.create_organization_with_owner(
  text, text, text, regime_tributario, character, text, text
) to authenticated;

comment on function public.create_organization_with_owner(
  text, text, text, regime_tributario, character, text, text
) is
  'Cria organizacao + branch HQ + membership owner. Retorna (org_id, branch_id). Wave 1.2b.';
