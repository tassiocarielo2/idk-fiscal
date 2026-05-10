-- =====================================================================
-- IDK Fiscal — Migration 0015: views de agregação para dashboard
-- Wave 2.1 — visões resumidas sobre nfe_inbound_*. Todas com
-- security_invoker=true para herdar RLS do caller (PG 15+).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Mensal por organização
-- ---------------------------------------------------------------------
create or replace view public.nfe_inbound_monthly
with (security_invoker = true) as
select
  organization_id,
  date_trunc('month', data_emissao) as mes,
  count(*)                          as notas,
  coalesce(sum(total_nota), 0)      as total_compras,
  coalesce(sum(total_pis), 0)       as total_pis,
  coalesce(sum(total_cofins), 0)    as total_cofins,
  coalesce(sum(total_icms), 0)      as total_icms,
  count(*) filter (where has_credit_risk) as notas_em_risco
from public.nfe_inbound_documents
group by organization_id, date_trunc('month', data_emissao);

comment on view public.nfe_inbound_monthly is
  'Agregação mensal de NF-e recebidas por org. RLS herdada (security_invoker).';

-- ---------------------------------------------------------------------
-- 2. Totais por fornecedor (top N feito no caller via order/limit)
-- ---------------------------------------------------------------------
create or replace view public.nfe_inbound_supplier_totals
with (security_invoker = true) as
select
  organization_id,
  emit_cnpj,
  emit_nome,
  emit_uf,
  count(*)                       as notas,
  coalesce(sum(total_nota), 0)   as total_compras,
  coalesce(sum(total_pis), 0)    as total_pis,
  coalesce(sum(total_cofins), 0) as total_cofins,
  max(data_emissao)              as ultima_emissao,
  count(*) filter (where has_credit_risk) as notas_em_risco
from public.nfe_inbound_documents
group by organization_id, emit_cnpj, emit_nome, emit_uf;

-- ---------------------------------------------------------------------
-- 3. Totais por NCM (precisa join com items)
-- ---------------------------------------------------------------------
create or replace view public.nfe_inbound_ncm_totals
with (security_invoker = true) as
select
  d.organization_id,
  i.ncm,
  count(distinct d.id)            as notas,
  count(*)                        as itens,
  coalesce(sum(i.valor_total), 0) as valor_total,
  coalesce(sum(i.pis_valor), 0)   as pis_valor,
  coalesce(sum(i.cofins_valor), 0) as cofins_valor
from public.nfe_inbound_items i
join public.nfe_inbound_documents d on d.id = i.inbound_document_id
group by d.organization_id, i.ncm;

-- ---------------------------------------------------------------------
-- 4. Resumo de alertas por tipo
-- ---------------------------------------------------------------------
create or replace view public.nfe_inbound_alert_summary
with (security_invoker = true) as
select
  organization_id,
  kind,
  severity,
  count(*) as total,
  max(created_at) as ultimo
from public.nfe_inbound_alerts
group by organization_id, kind, severity;

-- ---------------------------------------------------------------------
-- 5. Grants — views herdam RLS, mas precisam de SELECT explícito.
-- ---------------------------------------------------------------------
grant select on public.nfe_inbound_monthly         to authenticated;
grant select on public.nfe_inbound_supplier_totals to authenticated;
grant select on public.nfe_inbound_ncm_totals      to authenticated;
grant select on public.nfe_inbound_alert_summary   to authenticated;
