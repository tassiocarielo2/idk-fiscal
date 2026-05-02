-- =====================================================================
-- IDK Fiscal — Migration 0009: Vault wrappers (service_role only)
-- Wave 1.2b — Permite que service_role crie/delete secrets via RPC,
-- evitando exposicao direta do schema vault em route handlers.
-- =====================================================================

create or replace function public.vault_create_secret(
  p_secret      text,
  p_name        text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp, vault
as $$
declare
  v_role text := current_setting('request.jwt.claims', true)::jsonb->>'role';
  v_id   uuid;
begin
  if v_role is null or v_role <> 'service_role' then
    raise exception 'Apenas service_role pode criar secrets' using errcode = '42501';
  end if;

  v_id := vault.create_secret(p_secret, p_name, p_description);
  return v_id;
end;
$$;

revoke all on function public.vault_create_secret(text, text, text) from public, anon, authenticated;
grant execute on function public.vault_create_secret(text, text, text) to service_role;

create or replace function public.vault_delete_secret(
  p_secret_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp, vault
as $$
declare
  v_role text := current_setting('request.jwt.claims', true)::jsonb->>'role';
begin
  if v_role is null or v_role <> 'service_role' then
    raise exception 'Apenas service_role pode deletar secrets' using errcode = '42501';
  end if;

  delete from vault.secrets where id = p_secret_id;
end;
$$;

revoke all on function public.vault_delete_secret(uuid) from public, anon, authenticated;
grant execute on function public.vault_delete_secret(uuid) to service_role;

comment on function public.vault_create_secret(text, text, text) is
  'Wrapper SECURITY DEFINER para vault.create_secret. Gate por service_role JWT claim.';
comment on function public.vault_delete_secret(uuid) is
  'Wrapper SECURITY DEFINER para deletar secret do Vault. Gate por service_role JWT claim.';
