-- =====================================================================
-- IDK Fiscal — Migration 0004: RPC create_organization_with_owner
-- Garante atomicidade real (org + membership owner em uma transacao).
-- Substitui o rollback explicito best-effort do server action.
-- Adiantamento de TODO previsto para Wave 1.2.
-- =====================================================================

create or replace function public.create_organization_with_owner(
  p_cnpj                text,
  p_razao_social        text,
  p_nome_fantasia       text,
  p_regime_tributario   regime_tributario,
  p_uf                  char(2),
  p_inscricao_estadual  text,
  p_inscricao_municipal text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
begin
  if v_user_id is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  insert into public.organizations (
    cnpj, razao_social, nome_fantasia, regime_tributario, uf,
    inscricao_estadual, inscricao_municipal, created_by
  )
  values (
    p_cnpj, p_razao_social, p_nome_fantasia, p_regime_tributario, p_uf,
    p_inscricao_estadual, p_inscricao_municipal, v_user_id
  )
  returning id into v_org_id;

  insert into public.organization_members (
    organization_id, user_id, role, accepted_at
  )
  values (
    v_org_id, v_user_id, 'owner', now()
  );

  return v_org_id;
end;
$$;

revoke all on function public.create_organization_with_owner(
  text, text, text, regime_tributario, char, text, text
) from public;
grant execute on function public.create_organization_with_owner(
  text, text, text, regime_tributario, char, text, text
) to authenticated;
