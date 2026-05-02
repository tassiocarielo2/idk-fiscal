-- =====================================================================
-- IDK Fiscal — Migration 0003: Restore EXECUTE on RLS helpers
-- Reverte parte da 0002 que revogou EXECUTE de is_org_member e
-- has_org_role para authenticated. As policies invocam essas funcoes
-- no role do caller (authenticated), nao no owner — portanto o EXECUTE
-- precisa estar concedido para o role chamador, mesmo sendo SECURITY
-- DEFINER. O aviso do advisor sobre exposicao via /rpc continua: solucao
-- futura seria mover essas funcoes para um schema nao-exposto pelo
-- PostgREST (ex.: schema `private`).
-- =====================================================================

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
