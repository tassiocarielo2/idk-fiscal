-- =====================================================================
-- IDK Fiscal — RLS test 0001: Isolamento de organizacao
-- Wave 1.2a — Garante que usuario de org A nao ve dados de org B.
-- Padrao: begin/rollback (nao persiste). Roda via execute_sql do MCP
-- ou via psql contra branch de desenvolvimento.
-- =====================================================================

begin;

-- Fixtures: 2 orgs, 2 users
do $fixtures$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_org_a  uuid := gen_random_uuid();
  v_org_b  uuid := gen_random_uuid();
  v_branch_a uuid := gen_random_uuid();
  v_branch_b uuid := gen_random_uuid();
begin
  -- Cria users em auth.users (minimo necessario)
  insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_user_a, 'a@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
    (v_user_b, 'b@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now());

  insert into public.organizations (id, razao_social, regime_tributario, uf, created_by)
  values
    (v_org_a, 'Org A SA', 'simples_nacional', 'SP', v_user_a),
    (v_org_b, 'Org B SA', 'simples_nacional', 'RJ', v_user_b);

  insert into public.organization_members (organization_id, user_id, role, accepted_at)
  values
    (v_org_a, v_user_a, 'owner', now()),
    (v_org_b, v_user_b, 'owner', now());

  insert into public.organization_branches (id, organization_id, cnpj, razao_social, is_headquarters)
  values
    (v_branch_a, v_org_a, '11222333000181', 'Org A Matriz', true),
    (v_branch_b, v_org_b, '44555666000172', 'Org B Matriz', true);

  -- Convite na org B para email de C (nao envolve A)
  insert into public.organization_invites (organization_id, email, role, token, invited_by)
  values (v_org_b, 'c@test.local', 'member', 'token-b-' || v_branch_b::text, v_user_b);

  -- ASSERT 1: user_a (com role authenticated + jwt) so deve ver branch A
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role','authenticated')::text, true);

  if (select count(*) from public.organization_branches) <> 1 then
    raise exception 'FAIL 0001-A: user_a deveria ver exatamente 1 filial, viu %',
      (select count(*) from public.organization_branches);
  end if;

  if (select count(*) from public.organization_branches where id = v_branch_b) <> 0 then
    raise exception 'FAIL 0001-A: user_a viu filial da org B';
  end if;

  -- ASSERT 2: user_a NAO deve ver convites da org B
  if (select count(*) from public.organization_invites) <> 0 then
    raise exception 'FAIL 0001-A: user_a viu convites de outra org, count=%',
      (select count(*) from public.organization_invites);
  end if;

  reset role;

  -- ASSERT 3: user_b ve sua filial e seu convite
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role','authenticated')::text, true);

  if (select count(*) from public.organization_branches) <> 1 then
    raise exception 'FAIL 0001-B: user_b deveria ver 1 filial';
  end if;

  if (select count(*) from public.organization_invites) <> 1 then
    raise exception 'FAIL 0001-B: user_b deveria ver 1 convite';
  end if;

  reset role;

  raise notice 'PASS 0001 — Isolamento de organizacao';
end$fixtures$;

rollback;
