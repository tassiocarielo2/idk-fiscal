-- =====================================================================
-- IDK Fiscal — RLS test 03: certificates
-- pgTAP. Roda como begin/rollback em CI; nao persiste.
-- Cobre: SELECT cross-org, INSERT permission, UNIQUE thumbprint,
--        usage_log append-only, RPC gates, revoke gate.
-- =====================================================================

begin;

create extension if not exists pgtap;

select plan(13);

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
do $$
declare
  v_user_a uuid := '11111111-1111-1111-1111-111111111111';
  v_user_b uuid := '22222222-2222-2222-2222-222222222222';
  v_org_a  uuid := '33333333-3333-3333-3333-333333333333';
  v_org_b  uuid := '44444444-4444-4444-4444-444444444444';
  v_branch_a uuid := '55555555-5555-5555-5555-555555555555';
  v_branch_b uuid := '66666666-6666-6666-6666-666666666666';
  v_cert_a uuid := '77777777-7777-7777-7777-777777777777';
  v_cert_b uuid := '88888888-8888-8888-8888-888888888888';
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (v_user_a, 'a@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_user_b, 'b@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict do nothing;

  insert into public.organizations (id, razao_social, regime_tributario, uf, created_by)
  values
    (v_org_a, 'Org A LTDA', 'simples_nacional', 'SP', v_user_a),
    (v_org_b, 'Org B LTDA', 'simples_nacional', 'RJ', v_user_b);

  insert into public.organization_members (organization_id, user_id, role, accepted_at)
  values
    (v_org_a, v_user_a, 'owner', now()),
    (v_org_b, v_user_b, 'owner', now());

  insert into public.organization_branches (id, organization_id, cnpj, razao_social, is_headquarters, uf, created_by)
  values
    (v_branch_a, v_org_a, '11222333000181', 'Org A LTDA', true, 'SP', v_user_a),
    (v_branch_b, v_org_b, '44555666000172', 'Org B LTDA', true, 'RJ', v_user_b);

  -- Cert ativo na org A
  insert into public.certificates_metadata (
    id, organization_id, branch_id, purpose, status,
    cnpj_titular, razao_social_titular, subject_cn, issuer_cn,
    serial_number, thumbprint_sha256, signature_algorithm,
    valid_from, valid_until,
    storage_path, storage_bucket, vault_secret_ref,
    uploaded_by
  ) values (
    v_cert_a, v_org_a, v_branch_a, 'nfe', 'active',
    '11222333000181', 'ORG A LTDA:11222333000181',
    'ORG A LTDA:11222333000181', 'AC TEST',
    'ABC123', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'sha256WithRSAEncryption',
    now() - interval '1 day', now() + interval '365 days',
    'org_' || v_org_a || '/branch_' || v_branch_a || '/' || v_cert_a || '.pfx',
    'certificates', null,
    v_user_a
  );

  -- Cert na org B (para testes cross-org)
  insert into public.certificates_metadata (
    id, organization_id, branch_id, purpose, status,
    cnpj_titular, razao_social_titular, subject_cn, issuer_cn,
    serial_number, thumbprint_sha256, signature_algorithm,
    valid_from, valid_until,
    storage_path, storage_bucket, vault_secret_ref,
    uploaded_by
  ) values (
    v_cert_b, v_org_b, v_branch_b, 'nfe', 'active',
    '44555666000172', 'ORG B LTDA:44555666000172',
    'ORG B LTDA:44555666000172', 'AC TEST',
    'DEF456', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'sha256WithRSAEncryption',
    now() - interval '1 day', now() + interval '365 days',
    'org_' || v_org_b || '/branch_' || v_branch_b || '/' || v_cert_b || '.pfx',
    'certificates', null,
    v_user_b
  );
end $$;

-- ---------------------------------------------------------------------
-- Asserts
-- ---------------------------------------------------------------------

-- 1. Owner da Org A ve cert da Org A
set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

select is(
  (select count(*)::int from public.certificates_metadata where organization_id = '33333333-3333-3333-3333-333333333333'),
  1,
  '01: owner Org A ve seus certs'
);

-- 2. Owner Org A NAO ve cert Org B
select is(
  (select count(*)::int from public.certificates_metadata where organization_id = '44444444-4444-4444-4444-444444444444'),
  0,
  '02: owner Org A nao ve certs Org B'
);

-- 3. INSERT cross-org bloqueado para owner Org A em Org B
select throws_ok(
  $$insert into public.certificates_metadata (
      organization_id, cnpj_titular, razao_social_titular, serial_number,
      thumbprint_sha256, valid_from, valid_until, storage_path, uploaded_by
    ) values (
      '44444444-4444-4444-4444-444444444444', '99888777000166', 'X', 'XYZ',
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      now() - interval '1 day', now() + interval '365 days',
      '/x', '11111111-1111-1111-1111-111111111111'
    )$$,
  NULL,
  '03: INSERT cross-org bloqueado por RLS'
);

-- 4. INSERT na propria org PASSA para owner
select lives_ok(
  $$insert into public.certificates_metadata (
      organization_id, branch_id, cnpj_titular, razao_social_titular, serial_number,
      thumbprint_sha256, valid_from, valid_until, storage_path, uploaded_by
    ) values (
      '33333333-3333-3333-3333-333333333333',
      '55555555-5555-5555-5555-555555555555',
      '11222333000181', 'Org A LTDA', 'NEW1',
      'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      now() - interval '1 day', now() + interval '365 days',
      '/x2', '11111111-1111-1111-1111-111111111111'
    )$$,
  '04: owner Org A consegue INSERT em Org A'
);

-- 5. Dedup por thumbprint dispara unique violation
select throws_ok(
  $$insert into public.certificates_metadata (
      organization_id, branch_id, cnpj_titular, razao_social_titular, serial_number,
      thumbprint_sha256, valid_from, valid_until, storage_path, uploaded_by
    ) values (
      '33333333-3333-3333-3333-333333333333',
      '55555555-5555-5555-5555-555555555555',
      '11222333000181', 'Org A LTDA', 'DUP',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      now() - interval '1 day', now() + interval '365 days',
      '/dup', '11111111-1111-1111-1111-111111111111'
    )$$,
  '23505',
  NULL,
  '05: dedup (org, thumbprint) dispara unique violation'
);

-- 6. DELETE bloqueado para non-owner (checa que a policy delete eh restrita).
-- Como user_a EH owner, precisamos checar via member nao-owner. Aqui simplificamos
-- testando que o cert da Org B nao pode ser deletado pelo user_a.
select is(
  (with d as (
     delete from public.certificates_metadata
      where id = '88888888-8888-8888-8888-888888888888'
      returning 1
   ) select count(*)::int from d),
  0,
  '06: DELETE cross-org bloqueado por RLS (0 linhas afetadas)'
);

-- 7. valid_until > valid_from constraint (sanity ja imposta na 0001)
select throws_ok(
  $$insert into public.certificates_metadata (
      organization_id, branch_id, cnpj_titular, razao_social_titular, serial_number,
      thumbprint_sha256, valid_from, valid_until, storage_path, uploaded_by
    ) values (
      '33333333-3333-3333-3333-333333333333',
      '55555555-5555-5555-5555-555555555555',
      '11222333000181', 'Org A', 'BAD',
      'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
      now() + interval '1 day', now() - interval '1 day',
      '/bad', '11111111-1111-1111-1111-111111111111'
    )$$,
  NULL,
  '07: chk_valid_period reforcado (valid_until <= valid_from)'
);

-- 8. usage_log invisivel cross-org
-- Insert log via SECURITY DEFINER (simulando uso): direto via insert nao deve passar para user.
-- Por enquanto, conferimos que SELECT cross-org retorna 0.
do $$ begin
  -- bypass RLS para popular log de teste (rodando como super)
  perform set_config('role', 'postgres', true);
  insert into public.certificate_usage_log (certificate_id, organization_id, used_by)
  values ('88888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222');
  perform set_config('role', 'authenticated', true);
end $$;

select is(
  (select count(*)::int from public.certificate_usage_log where organization_id = '44444444-4444-4444-4444-444444444444'),
  0,
  '08: usage_log cross-org invisivel'
);

-- 9. INSERT direto em usage_log bloqueado para usuario
select throws_ok(
  $$insert into public.certificate_usage_log (certificate_id, organization_id, used_by)
    values ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111')$$,
  NULL,
  '09: INSERT direto em usage_log bloqueado para authenticated'
);

-- 10. RPC get_certificate_for_signing nega cross-org
select throws_ok(
  $$select * from public.get_certificate_for_signing('88888888-8888-8888-8888-888888888888'::uuid, 'nfe')$$,
  NULL,
  '10: get_certificate_for_signing nega cross-org'
);

-- 11. UPDATE em usage_log bloqueado por trigger (append-only)
do $$ begin
  perform set_config('role', 'postgres', true);
end $$;
select throws_ok(
  $$update public.certificate_usage_log set purpose_text = 'changed' where certificate_id = '88888888-8888-8888-8888-888888888888'$$,
  NULL,
  '11: UPDATE em usage_log bloqueado por trigger append-only'
);

-- 12. revoke_certificate nega cross-org (volta para authenticated user_a)
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
end $$;
select throws_ok(
  $$select public.revoke_certificate('88888888-8888-8888-8888-888888888888'::uuid, 'test')$$,
  NULL,
  '12: revoke_certificate nega cross-org'
);

-- 13. revoke_certificate funciona para owner na propria org
select lives_ok(
  $$select public.revoke_certificate('77777777-7777-7777-7777-777777777777'::uuid, 'test motive')$$,
  '13: revoke_certificate funciona para owner na propria org'
);

select * from finish();
rollback;
