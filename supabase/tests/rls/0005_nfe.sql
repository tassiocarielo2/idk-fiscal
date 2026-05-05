-- =====================================================================
-- IDK Fiscal — RLS test 0005: NF-e isolamento
-- Wave 1.3 — orgs nao se enxergam, branch_scope respeitado em listagem.
-- =====================================================================
begin;

do $fixtures$
declare
  v_user_a   uuid := gen_random_uuid();
  v_user_b   uuid := gen_random_uuid();
  v_user_b2  uuid := gen_random_uuid();
  v_org_a    uuid := gen_random_uuid();
  v_org_b    uuid := gen_random_uuid();
  v_branch_a uuid := gen_random_uuid();
  v_branch_b1 uuid := gen_random_uuid();
  v_branch_b2 uuid := gen_random_uuid();
  v_doc_a    uuid := gen_random_uuid();
  v_doc_b1   uuid := gen_random_uuid();
  v_doc_b2   uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_user_a,  'nfe-a@test.local',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now()),
    (v_user_b,  'nfe-b@test.local',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now()),
    (v_user_b2, 'nfe-b2@test.local', '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now());

  insert into public.organizations (id, razao_social, regime_tributario, uf, created_by) values
    (v_org_a, 'NFe A', 'simples_nacional', 'ES', v_user_a),
    (v_org_b, 'NFe B', 'simples_nacional', 'ES', v_user_b);

  insert into public.organization_members (organization_id, user_id, role, accepted_at, branch_scope) values
    (v_org_a, v_user_a, 'owner', now(), null),
    (v_org_b, v_user_b, 'owner', now(), null);

  insert into public.organization_branches (id, organization_id, cnpj, razao_social, is_headquarters) values
    (v_branch_a,  v_org_a, '11222333000181', 'A Matriz', true),
    (v_branch_b1, v_org_b, '44555666000172', 'B Matriz', true),
    (v_branch_b2, v_org_b, '44555666000253', 'B F2',     false);

  insert into public.organization_members (organization_id, user_id, role, accepted_at, branch_scope) values
    (v_org_b, v_user_b2, 'member', now(), array[v_branch_b1]);

  insert into public.nfe_documents (
    id, organization_id, branch_id, numero, ambiente, natureza_operacao,
    dest_cnpj_cpf, dest_nome, dest_uf, total_nota, created_by
  ) values
    (v_doc_a,  v_org_a, v_branch_a,  1, 2, 'VENDA', '00000000000', 'X', 'ES', 100, v_user_a),
    (v_doc_b1, v_org_b, v_branch_b1, 1, 2, 'VENDA', '00000000000', 'Y', 'ES', 200, v_user_b),
    (v_doc_b2, v_org_b, v_branch_b2, 1, 2, 'VENDA', '00000000000', 'Z', 'ES', 300, v_user_b);

  -- Assert 1: user A so ve doc A
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_user_a::text, 'role', 'authenticated', 'aud', 'authenticated'
  )::text, true);
  perform set_config('role', 'authenticated', true);

  if (select count(*) from public.nfe_documents) <> 1 then
    raise exception 'FAIL 1: user A deveria ver 1 NF-e, viu %',
      (select count(*) from public.nfe_documents);
  end if;

  if exists (select 1 from public.nfe_documents where organization_id = v_org_b) then
    raise exception 'FAIL 2: user A vazou NF-e de org B';
  end if;

  -- Assert 3: user B (owner) ve as 2 docs da org B
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_user_b::text, 'role', 'authenticated', 'aud', 'authenticated'
  )::text, true);

  if (select count(*) from public.nfe_documents where organization_id = v_org_b) <> 2 then
    raise exception 'FAIL 3: owner B deveria ver 2 NF-e';
  end if;

  -- Assert 4: user B2 (member, escopo b1) so ve doc do branch_b1
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_user_b2::text, 'role', 'authenticated', 'aud', 'authenticated'
  )::text, true);

  if (select count(*) from public.nfe_documents where organization_id = v_org_b) <> 1 then
    raise exception 'FAIL 4: member b2 com escopo b1 deveria ver 1 NF-e';
  end if;

  if exists (
    select 1 from public.nfe_documents
     where organization_id = v_org_b and branch_id = v_branch_b2
  ) then
    raise exception 'FAIL 4b: member b2 vazou NF-e de branch fora do escopo';
  end if;

  -- Assert 5: nfe_events nao deletavel
  perform set_config('role', 'service_role', true);
  insert into public.nfe_events (
    nfe_document_id, organization_id, tipo_evento, numero_sequencial, justificativa
  ) values (v_doc_b1, v_org_b, '110111', 1, 'Cancelamento teste com mais de 15 caracteres');

  begin
    delete from public.nfe_events where nfe_document_id = v_doc_b1;
    raise exception 'FAIL 5: delete em nfe_events deveria ser bloqueado';
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL 5b: errcode esperado 42501, veio %', sqlstate;
    end if;
  end;

  raise notice '0005_nfe: 5/5 asserts OK';
end$fixtures$;

rollback;
