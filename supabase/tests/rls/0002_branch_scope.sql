-- =====================================================================
-- IDK Fiscal — RLS test 0002: Branch scope (is_branch_member)
-- Wave 1.2a — admin sem escopo passa para qualquer filial da org;
-- member com escopo passa apenas para as filiais listadas;
-- outsider nao passa para nenhuma filial alheia.
-- =====================================================================

begin;

do $fixtures$
declare
  v_admin    uuid := gen_random_uuid();
  v_member   uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_org      uuid := gen_random_uuid();
  v_org_x    uuid := gen_random_uuid();
  v_branch_1 uuid := gen_random_uuid();
  v_branch_2 uuid := gen_random_uuid();
  v_branch_x uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_admin,    'admin@test.local',    '00000000-0000-0000-0000-000000000000','authenticated','authenticated','', now(), now(), now()),
    (v_member,   'member@test.local',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','', now(), now(), now()),
    (v_outsider, 'outsider@test.local', '00000000-0000-0000-0000-000000000000','authenticated','authenticated','', now(), now(), now());

  insert into public.organizations (id, razao_social, regime_tributario, uf, created_by)
  values
    (v_org,   'Org com filiais', 'simples_nacional', 'SP', v_admin),
    (v_org_x, 'Org alheia',      'simples_nacional', 'RJ', v_outsider);

  insert into public.organization_members (organization_id, user_id, role, branch_scope, accepted_at)
  values
    (v_org,   v_admin,  'admin',  null, now()),
    (v_org,   v_member, 'member', array[v_branch_1], now()),
    (v_org_x, v_outsider, 'owner', null, now());

  insert into public.organization_branches (id, organization_id, cnpj, razao_social, is_headquarters)
  values
    (v_branch_1, v_org,   '11222333000181', 'Filial 1', true),
    (v_branch_2, v_org,   '11222333000262', 'Filial 2', false),
    (v_branch_x, v_org_x, '44555666000172', 'Alheia',   true);

  -- Admin sem escopo: deve passar para ambas filiais da sua org
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  if not public.is_branch_member(v_branch_1) then raise exception 'FAIL 0002: admin nao passou em branch 1'; end if;
  if not public.is_branch_member(v_branch_2) then raise exception 'FAIL 0002: admin nao passou em branch 2'; end if;
  if public.is_branch_member(v_branch_x) then raise exception 'FAIL 0002: admin passou em filial de outra org'; end if;
  reset role;

  -- Member com escopo [branch_1]: passa em 1, nao passa em 2
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role','authenticated')::text, true);
  if not public.is_branch_member(v_branch_1) then raise exception 'FAIL 0002: member nao passou em branch dentro do escopo'; end if;
  if public.is_branch_member(v_branch_2) then raise exception 'FAIL 0002: member passou em branch fora do escopo'; end if;
  reset role;

  -- Outsider: nao passa em nenhuma filial da org
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role','authenticated')::text, true);
  if public.is_branch_member(v_branch_1) then raise exception 'FAIL 0002: outsider passou em filial alheia'; end if;
  if public.is_branch_member(v_branch_2) then raise exception 'FAIL 0002: outsider passou em filial alheia'; end if;
  reset role;

  raise notice 'PASS 0002 — Branch scope';
end$fixtures$;

rollback;
