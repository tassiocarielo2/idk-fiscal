-- =====================================================================
-- IDK Fiscal — RLS test 0003: Fluxo de convite
-- Wave 1.2a — create_invite (forbidden p/ nao-admin); accept_invite
-- valida email do caller; segunda aceitacao falha.
-- =====================================================================

begin;

do $fixtures$
declare
  v_admin   uuid := gen_random_uuid();
  v_invitee uuid := gen_random_uuid();
  v_other   uuid := gen_random_uuid();
  v_org     uuid := gen_random_uuid();
  v_branch  uuid := gen_random_uuid();
  v_token   text;
  v_invite  public.organization_invites%rowtype;
  v_caught  boolean;
  v_returned_org uuid;
begin
  insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_admin,   'admin@test.local',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','', now(), now(), now()),
    (v_invitee, 'invitee@test.local', '00000000-0000-0000-0000-000000000000','authenticated','authenticated','', now(), now(), now()),
    (v_other,   'other@test.local',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','', now(), now(), now());

  insert into public.organizations (id, razao_social, regime_tributario, uf, created_by)
  values (v_org, 'Org Teste', 'simples_nacional', 'SP', v_admin);

  insert into public.organization_members (organization_id, user_id, role, accepted_at)
  values (v_org, v_admin, 'admin', now());

  insert into public.organization_branches (id, organization_id, cnpj, razao_social, is_headquarters)
  values (v_branch, v_org, '11222333000181', 'Matriz', true);

  -- ASSERT 1: nao-membro (v_other) nao pode chamar create_invite
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role','authenticated')::text, true);
  v_caught := false;
  begin
    perform public.create_invite(v_org, 'invitee@test.local', 'member'::invite_role, null);
  exception when others then v_caught := true;
  end;
  if not v_caught then
    raise exception 'FAIL 0003-1: nao-membro conseguiu criar convite';
  end if;
  reset role;

  -- ASSERT 2: admin cria convite com sucesso
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_invite := public.create_invite(v_org, 'invitee@test.local', 'member'::invite_role, null);
  v_token := v_invite.token;
  if v_token is null or length(v_token) < 32 then
    raise exception 'FAIL 0003-2: token invalido (len=%)', coalesce(length(v_token), 0);
  end if;
  reset role;

  -- ASSERT 3: aceitacao falha quando email do caller nao bate
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role','authenticated')::text, true);
  v_caught := false;
  begin
    perform public.accept_invite(v_token);
  exception when others then v_caught := true;
  end;
  if not v_caught then
    raise exception 'FAIL 0003-3: aceitacao com email errado nao foi bloqueada';
  end if;
  reset role;

  -- ASSERT 4: invitee aceita com sucesso
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role','authenticated')::text, true);
  v_returned_org := public.accept_invite(v_token);
  if v_returned_org <> v_org then
    raise exception 'FAIL 0003-4: org retornada incorreta';
  end if;
  reset role;

  -- ASSERT 5: membership criada
  if not exists (
    select 1 from public.organization_members
     where organization_id = v_org and user_id = v_invitee and accepted_at is not null
  ) then
    raise exception 'FAIL 0003-5: membership nao foi criada';
  end if;

  -- ASSERT 6: segunda aceitacao falha
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role','authenticated')::text, true);
  v_caught := false;
  begin
    perform public.accept_invite(v_token);
  exception when others then v_caught := true;
  end;
  if not v_caught then
    raise exception 'FAIL 0003-6: segunda aceitacao do mesmo token nao foi bloqueada';
  end if;
  reset role;

  raise notice 'PASS 0003 — Fluxo de convite';
end$fixtures$;

rollback;
