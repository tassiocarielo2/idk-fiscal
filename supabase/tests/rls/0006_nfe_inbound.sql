-- =====================================================================
-- IDK Fiscal — RLS test 0006: NF-e inbound (notas recebidas)
-- Wave 2.1 — orgs nao se enxergam, branch_scope respeitado, alertas
-- correlacionados.
-- =====================================================================
begin;

do $fixtures$
declare
  v_user_a    uuid := gen_random_uuid();
  v_user_b    uuid := gen_random_uuid();
  v_user_b2   uuid := gen_random_uuid();
  v_org_a     uuid := gen_random_uuid();
  v_org_b     uuid := gen_random_uuid();
  v_branch_a  uuid := gen_random_uuid();
  v_branch_b1 uuid := gen_random_uuid();
  v_branch_b2 uuid := gen_random_uuid();
  v_doc_a     uuid := gen_random_uuid();
  v_doc_b1    uuid := gen_random_uuid();
  v_doc_b2    uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_user_a,  'inb-a@test.local',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now()),
    (v_user_b,  'inb-b@test.local',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now()),
    (v_user_b2, 'inb-b2@test.local', '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now());

  insert into public.organizations (id, razao_social, regime_tributario, uf, created_by) values
    (v_org_a, 'Inb A', 'simples_nacional', 'ES', v_user_a),
    (v_org_b, 'Inb B', 'simples_nacional', 'ES', v_user_b);

  insert into public.organization_members (organization_id, user_id, role, accepted_at, branch_scope) values
    (v_org_a, v_user_a, 'owner', now(), null),
    (v_org_b, v_user_b, 'owner', now(), null);

  insert into public.organization_branches (id, organization_id, cnpj, razao_social, is_headquarters) values
    (v_branch_a,  v_org_a, '11222333000181', 'A Matriz', true),
    (v_branch_b1, v_org_b, '44555666000172', 'B Matriz', true),
    (v_branch_b2, v_org_b, '44555666000253', 'B F2',     false);

  insert into public.organization_members (organization_id, user_id, role, accepted_at, branch_scope) values
    (v_org_b, v_user_b2, 'member', now(), array[v_branch_b1]);

  insert into public.nfe_inbound_documents (
    id, organization_id, branch_id, chave_acesso, modelo, serie, numero,
    ambiente, natureza_operacao, data_emissao, status, xml_path, xml_sha256,
    emit_cnpj, emit_nome, emit_uf, dest_cnpj_cpf, dest_nome,
    total_nota, created_by
  ) values
    (v_doc_a,  v_org_a, v_branch_a,
     '11111111111111111111111111111111111111111111',
     '55', 1, 100, 1, 'COMPRA', now(), 'autorizada',
     'org_x/branch_x/inbound/a.xml',
     repeat('a', 64),
     '99888777000166', 'Fornecedor X', 'SP',
     '11222333000181', 'Inb A', 1500, v_user_a),
    (v_doc_b1, v_org_b, v_branch_b1,
     '22222222222222222222222222222222222222222222',
     '55', 1, 200, 1, 'COMPRA', now(), 'autorizada',
     'org_y/branch_y1/inbound/b1.xml',
     repeat('b', 64),
     '99888777000247', 'Fornecedor Y', 'MG',
     '44555666000172', 'Inb B', 2500, v_user_b),
    (v_doc_b2, v_org_b, v_branch_b2,
     '33333333333333333333333333333333333333333333',
     '55', 1, 300, 1, 'COMPRA', now(), 'autorizada',
     'org_y/branch_y2/inbound/b2.xml',
     repeat('c', 64),
     '99888777000328', 'Fornecedor Z', 'RJ',
     '44555666000253', 'Inb B', 3500, v_user_b);

  insert into public.nfe_inbound_alerts (
    inbound_document_id, organization_id, kind, severity, titulo
  ) values
    (v_doc_a,  v_org_a, 'pis_cofins_sem_credito', 'warn', 'A item bloqueia'),
    (v_doc_b1, v_org_b, 'cfop_sem_credito',       'info', 'B1 cfop'),
    (v_doc_b2, v_org_b, 'pis_cofins_sem_credito', 'warn', 'B2 cst');

  -- Assert 1: user A so ve doc A
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_user_a::text, 'role', 'authenticated', 'aud', 'authenticated'
  )::text, true);
  perform set_config('role', 'authenticated', true);

  if (select count(*) from public.nfe_inbound_documents) <> 1 then
    raise exception 'FAIL 1: user A deveria ver 1 inbound, viu %',
      (select count(*) from public.nfe_inbound_documents);
  end if;

  if exists (select 1 from public.nfe_inbound_documents where organization_id = v_org_b) then
    raise exception 'FAIL 2: user A vazou inbound de org B';
  end if;

  -- Assert 3: user A so ve alertas da sua org
  if (select count(*) from public.nfe_inbound_alerts) <> 1 then
    raise exception 'FAIL 3: user A deveria ver 1 alerta, viu %',
      (select count(*) from public.nfe_inbound_alerts);
  end if;

  -- Assert 4: user B (owner) ve as 2 docs e 2 alertas
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_user_b::text, 'role', 'authenticated', 'aud', 'authenticated'
  )::text, true);

  if (select count(*) from public.nfe_inbound_documents where organization_id = v_org_b) <> 2 then
    raise exception 'FAIL 4: owner B deveria ver 2 inbound';
  end if;

  if (select count(*) from public.nfe_inbound_alerts where organization_id = v_org_b) <> 2 then
    raise exception 'FAIL 4b: owner B deveria ver 2 alertas';
  end if;

  -- Assert 5: user B2 (member, escopo b1) so ve doc do branch_b1
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_user_b2::text, 'role', 'authenticated', 'aud', 'authenticated'
  )::text, true);

  if (select count(*) from public.nfe_inbound_documents where organization_id = v_org_b) <> 1 then
    raise exception 'FAIL 5: member b2 com escopo b1 deveria ver 1 inbound';
  end if;

  if exists (
    select 1 from public.nfe_inbound_documents
     where organization_id = v_org_b and branch_id = v_branch_b2
  ) then
    raise exception 'FAIL 5b: member b2 vazou inbound de branch fora do escopo';
  end if;

  -- Assert 6: tentativa de duplicar (org, chave) deve falhar
  perform set_config('role', 'service_role', true);
  begin
    insert into public.nfe_inbound_documents (
      organization_id, branch_id, chave_acesso, modelo, serie, numero,
      ambiente, natureza_operacao, data_emissao, status, xml_path, xml_sha256,
      emit_cnpj, emit_nome, emit_uf, dest_cnpj_cpf, dest_nome,
      total_nota, created_by
    ) values (
      v_org_a, v_branch_a,
      '11111111111111111111111111111111111111111111',  -- mesma chave do doc_a
      '55', 1, 999, 1, 'COMPRA', now(), 'autorizada',
      'dup.xml', repeat('d', 64),
      '99888777000166', 'X', 'SP',
      '11222333000181', 'Inb A', 100, v_user_a
    );
    raise exception 'FAIL 6: deveria ter bloqueado duplicidade de chave por org';
  exception when unique_violation then
    null;
  end;

  raise notice '0006_nfe_inbound: 6/6 asserts OK';
end$fixtures$;

rollback;
