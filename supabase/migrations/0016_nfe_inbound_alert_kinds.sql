-- =====================================================================
-- IDK Fiscal — Migration 0016: novos kinds de alerta inbound
-- Wave 2.1 — adiciona ncm_monofasico e cfop_devolucao_entrada.
--
-- ALTER TYPE ... ADD VALUE não pode rodar dentro de transação (default
-- do psql). Em CI cada arquivo é aplicado fora de uma transação explícita,
-- então funciona; localmente via supabase CLI também.
-- =====================================================================

alter type public.nfe_inbound_alert_kind add value if not exists 'ncm_monofasico';
alter type public.nfe_inbound_alert_kind add value if not exists 'cfop_devolucao_entrada';
