-- =====================================================================
-- IDK Fiscal — RLS test 0004: Certificates + usage log isolation
-- Wave 1.2b — Garante que cert de org A nao e visivel por user de org B,
-- que dedup por (org, thumbprint) funciona, que branch_scope filtra
-- vista de cert, e que certificate_usage_log respeita isolamento.
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
  v_cert_a    uuid := gen_random_uuid();
  v_cert_b1   uuid := gen_random_uuid();
  v_cert_b2   uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_user_a,  'cert-a@test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
    (v_user_b,  'cert-b@test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
    (v_user_b2, 'cert-b2@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now());

  insert into public.organizations (id, razao_social, regime_tributario, uf, created_by)
  values
    (v_org_a, 'Cert Org A', 'simples_nacional', 'ES', v_user_a),
    (v_org_b, 'Cert Org B', 'simples_nacional', 'ES', v_user_b);

  insert into public.organization_members (organization_id, user_id, role, accepted_at, branch_scope)
  values
    (v_org_a, v_user_a,  'owner',  now(), null),
    (v_org_b, v_user_b,  'owner',  now(), null);

  insert into public.organization_branches (id, organization_id, cnpj, razao_social, is_headquarters)
  values
    (v_branch_a,  v_org_a, '11222333000181', 'Cert Org A Matriz',  true),
    (v_branch_b1, v_org_b, '44555666000172', 'Cert Org B Matriz',  true),
    (v_branch_b2, v_org_b, '44555666000253', 'Cert Org B Filial 2', false);

  -- v_user_b2 e member da org B com escopo restrito a branch_b1
  insert into public.organization_members (organization_id, user_id, role, accepted_at, branch_scope)
  values
    (v_org_b, v_user_b2, 'member', now(), array[v_branch_b1]);

  -- Certs (vault_secret_ref preenchido pra simular saga concluida)
  insert into public.certificates_metadata (
    id, organization_id, branch_id, cnpj_titular, razao_social_titular,
    valid_from, valid_until, serial_number, thumbprint_sha256,
    storage_path, vault_secret_ref, status, purpose, uploaded_by
  )
  values
    (v_cert_a,  v_org_a, v_branch_a,  '11222333000181', 'A',  now() - interval '10 days', now() + interval '300 days', 'AAA1', 'thumb_a',  'org_a/branch_a/x.pfx',  'vault-a',  'active', 'multi', v_user_a),
    (v_cert_b1, v_org_b, v_branch_b1, '44555666000172', 'B1', now() - interval '10 days', now() + interval '300 days', 'BBB1', 'thumb_b1', 'org_b/branch_b1/x.pfx', 'vault-b1', 'active', 'multi', v_user_b),
    (v_cert_b2, v_org_b, v_branch_b2, '44555666000253', 'B2', now() - interval '10 days', now() + interval '300 days', 'BBB2', 'thumb_b2', 'org_b/branch_b2/x.pfx', 'vault-b2', 'active', 'multi', v_user_b);

  insert into public.certificate_usage_log (certificate_id, organization_id, branch_id, user_id, action)
  values
    (v_cert_a,  v_org_a, v_branch_a,  v_user_a, 'upload'),
    (v_cert_b1, v_org_b, v_branch_b1, v_user_b, 'upload'),
    (v_cert_b2, v_org_b, v_branch_b2, v_user_b, 'upload');

  -- ========================================================
  -- Assert 1: user A so ve cert da propria org
  -- ========================================================
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_user_a::text, 'role', 'authenticated', 'aud', 'authenticated'
  )::text, true);
  perform set_config('role', 'authenticated', true);

  if (select count(*) from public.certificates_metadata) <> 1 then
    raise exception 'FAIL assert 1: user A deveria ver 1 cert (proprio), viu %',
      (select count(*) from public.certificates_metadata);
  end if;

  -- Assert 2: user A nao acessa cert de org B
  if exists (
    select 1 from public.certificates_metadata where organization_id = v_org_b
  ) then
    raise exception 'FAIL assert 2: user A vazou cert de org B';
  end if;

  -- Assert 3: user A nao ve usage_log de org B
  if (select count(*) from public.certificate_usage_log) <> 1 then
    raise exception 'FAIL assert 3: user A deveria ver 1 log, viu %',
      (select count(*) from public.certificate_usage_log);
  end if;

  -- ========================================================
  -- Assert 4: user B (owner, escopo NULL) ve os 2 certs da org B
  -- ========================================================
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_user_b::text, 'role', 'authenticated', 'aud', 'authenticated'
  )::text, true);

  if (select count(*) from public.certificates_metadata where organization_id = v_org_b) <> 2 then
    raise exception 'FAIL assert 4: owner B deveria ver 2 certs, viu %',
      (select count(*) from public.certificates_metadata where organization_id = v_org_b);
  end if;

  if (select count(*) from public.certificate_usage_log where organization_id = v_org_b) <> 2 then
    raise exception 'FAIL assert 4b: owner B deveria ver 2 logs';
  end if;

  -- ========================================================
  -- Assert 5: user B2 (member, escopo b1) so ve cert de branch_b1
  -- ========================================================
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_user_b2::text, 'role', 'authenticated', 'aud', 'authenticated'
  )::text, true);

  if (select count(*) from public.certificates_metadata where organization_id = v_org_b) <> 1 then
    raise exception 'FAIL assert 5: member b2 com escopo b1 deveria ver 1 cert (do branch_b1), viu %',
      (select count(*) from public.certificates_metadata where organization_id = v_org_b);
  end if;

  if exists (
    select 1 from public.certificates_metadata
     where organization_id = v_org_b and branch_id = v_branch_b2
  ) then
    raise exception 'FAIL assert 5b: member b2 vazou cert de branch_b2 (fora do escopo)';
  end if;

  -- ========================================================
  -- Assert 6: dedup (org, thumbprint) bloqueia cert duplicado
  -- ========================================================
  perform set_config('role', 'service_role', true);
  begin
    insert into public.certificates_metadata (
      organization_id, branch_id, cnpj_titular, razao_social_titular,
      valid_from, valid_until, serial_number, thumbprint_sha256,
      storage_path, vault_secret_ref, status, purpose, uploaded_by
    ) values (
      v_org_a, v_branch_a, '11222333000181', 'A dup',
      now(), now() + interval '1 day', 'DUP', 'thumb_a',
      'org_a/branch_a/dup.pfx', 'vault-dup', 'active', 'multi', v_user_a
    );
    raise exception 'FAIL assert 6: dedup deveria ter bloqueado thumbprint repetido';
  exception when unique_violation then
    null; -- esperado
  end;

  -- ========================================================
  -- Assert 7: append-only — UPDATE em usage_log e bloqueado
  -- ========================================================
  begin
    update public.certificate_usage_log
       set action = 'tampered'
     where certificate_id = v_cert_a;
    raise exception 'FAIL assert 7: update em usage_log deveria ser bloqueado';
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL assert 7b: errcode esperado 42501, veio %', sqlstate;
    end if;
  end;

  raise notice '0004_certificates: 7/7 asserts OK';
end$fixtures$;

rollback;
