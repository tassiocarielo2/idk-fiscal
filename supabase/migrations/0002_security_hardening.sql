-- =====================================================================
-- IDK Fiscal — Migration 0002: Security Hardening
-- Endereca avisos do supabase database advisor pos-0001:
--   1. function_search_path_mutable (4 funcoes)
--   2. extension_in_public (citext movida para schema extensions)
--   3. anon/authenticated_security_definer_function_executable
--      (revogar EXECUTE de is_org_member e has_org_role para nao expor
--       via PostgREST /rpc — RLS continua funcionando porque policies
--       chamam a funcao no contexto SECURITY DEFINER do proprio dono)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Travar search_path das funcoes que nao tinham
-- ---------------------------------------------------------------------
alter function public.set_updated_at()
  set search_path = public, pg_temp;

alter function public.is_valid_cnpj_format(text)
  set search_path = public, pg_temp;

alter function public.enforce_owner_invariants()
  set search_path = public, pg_temp;

alter function public.audit_log_block_mutations()
  set search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 2. Mover extension citext de public para schema extensions
-- ---------------------------------------------------------------------
create schema if not exists extensions;
alter extension citext set schema extensions;

-- ---------------------------------------------------------------------
-- 3. Revogar EXECUTE das funcoes RLS helpers para roles expostas
--    via PostgREST. As policies continuam podendo chama-las porque
--    sao SECURITY DEFINER e o owner mantem EXECUTE.
-- ---------------------------------------------------------------------
revoke execute on function public.is_org_member(uuid) from authenticated, anon, public;
revoke execute on function public.has_org_role(uuid, text[]) from authenticated, anon, public;
