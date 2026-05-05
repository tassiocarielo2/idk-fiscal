-- =====================================================================
-- IDK Fiscal — Migration 0012: Inutilizacao + RPCs de eventos
-- Wave 1.4 — ADR-018 (eventos pos-emissao).
-- =====================================================================

-- =====================================================================
-- 1. nfe_inutilizacoes — faixa de numeracao inutilizada (nunca virou nota)
-- =====================================================================
create table if not exists public.nfe_inutilizacoes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete restrict,
  branch_id         uuid not null references public.organization_branches(id) on delete restrict,
  ano               smallint not null,
  modelo            char(2) not null,
  serie             int not null,
  ambiente          smallint not null,
  numero_inicial    int not null,
  numero_final      int not null,
  justificativa     text not null,
  protocolo         text,
  status            text not null default 'pendente',
  xml_path          text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),

  constraint nfe_inutilizacoes_range_chk check (numero_final >= numero_inicial),
  constraint nfe_inutilizacoes_just_chk check (length(justificativa) >= 15)
);

create unique index if not exists nfe_inutil_uniq
  on public.nfe_inutilizacoes (branch_id, modelo, serie, numero_inicial, numero_final, ambiente);

create index if not exists nfe_inutil_org_idx
  on public.nfe_inutilizacoes (organization_id, created_at desc);

alter table public.nfe_inutilizacoes enable row level security;
alter table public.nfe_inutilizacoes force  row level security;

create policy nfe_inutil_select on public.nfe_inutilizacoes
for select to authenticated
using (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);

create policy nfe_inutil_insert on public.nfe_inutilizacoes
for insert to authenticated
with check (
  public.has_org_role(organization_id, array['owner','admin'])
  and public.is_branch_member(branch_id)
);

grant select, insert, update on public.nfe_inutilizacoes to authenticated;

-- =====================================================================
-- 2. RPC: register_nfe_event — owner/admin only
--    Valida janelas legais (24h cancelamento, 30d CC-e).
-- =====================================================================
create or replace function public.register_nfe_event(
  p_nfe_document_id   uuid,
  p_tipo_evento       text,
  p_justificativa     text
)
returns public.nfe_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_doc     public.nfe_documents%rowtype;
  v_event   public.nfe_events%rowtype;
  v_seq     int;
  v_now     timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  select * into v_doc from public.nfe_documents where id = p_nfe_document_id for update;
  if not found then
    raise exception 'NF-e nao encontrada' using errcode = '22023';
  end if;

  if not public.has_org_role(v_doc.organization_id, array['owner','admin']) then
    raise exception 'Apenas owner/admin podem registrar eventos' using errcode = '42501';
  end if;

  if v_doc.status <> 'autorizada' then
    raise exception 'NF-e precisa estar autorizada (status atual: %)', v_doc.status
      using errcode = '22023';
  end if;

  if length(coalesce(p_justificativa, '')) < 15 then
    raise exception 'justificativa precisa ter ao menos 15 caracteres'
      using errcode = '22023';
  end if;

  -- Janelas legais
  if p_tipo_evento = '110111' and v_doc.authorized_at < v_now - interval '24 hours' then
    raise exception 'Janela de cancelamento (24h) ja expirou'
      using errcode = '22023';
  end if;

  if p_tipo_evento = '110110' and v_doc.authorized_at < v_now - interval '30 days' then
    raise exception 'Janela de CC-e (30 dias) ja expirou'
      using errcode = '22023';
  end if;

  -- Proximo seq
  select coalesce(max(numero_sequencial), 0) + 1 into v_seq
    from public.nfe_events
   where nfe_document_id = p_nfe_document_id
     and tipo_evento = p_tipo_evento;

  insert into public.nfe_events (
    nfe_document_id, organization_id, tipo_evento, numero_sequencial,
    status, justificativa, created_by
  )
  values (
    p_nfe_document_id, v_doc.organization_id, p_tipo_evento, v_seq,
    'pendente', p_justificativa, v_user_id
  )
  returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.register_nfe_event(uuid, text, text) from public;
grant execute on function public.register_nfe_event(uuid, text, text) to authenticated;

-- =====================================================================
-- 3. RPC: confirm_nfe_event_homologated — service_role only
--    Atualiza status do evento e do documento conforme retorno SEFAZ.
-- =====================================================================
create or replace function public.confirm_nfe_event_homologated(
  p_event_id   uuid,
  p_protocolo  text,
  p_xml_path   text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.nfe_events%rowtype;
begin
  select * into v_event from public.nfe_events where id = p_event_id for update;
  if not found then
    raise exception 'Evento nao encontrado' using errcode = '22023';
  end if;

  update public.nfe_events
     set status = 'homologado',
         protocolo = p_protocolo,
         xml_path = p_xml_path
   where id = p_event_id;

  if v_event.tipo_evento = '110111' then
    update public.nfe_documents
       set status = 'cancelada'
     where id = v_event.nfe_document_id;
  end if;
end;
$$;

revoke all on function public.confirm_nfe_event_homologated(uuid, text, text) from public, authenticated;
-- service_role only

-- =====================================================================
-- 4. View: nfe_dashboard_stats — agregados por org+branch
-- =====================================================================
create or replace view public.nfe_dashboard_stats as
select
  d.organization_id,
  d.branch_id,
  d.ambiente,
  count(*) filter (where d.status = 'autorizada') as autorizadas,
  count(*) filter (where d.status = 'rejeitada')  as rejeitadas,
  count(*) filter (where d.status = 'cancelada')  as canceladas,
  count(*) filter (where d.data_emissao::date = current_date and d.status = 'autorizada') as autorizadas_hoje,
  case when count(*) filter (where d.status in ('autorizada','rejeitada')) = 0 then 0
       else round(
         100.0 * count(*) filter (where d.status = 'rejeitada')::numeric
         / count(*) filter (where d.status in ('autorizada','rejeitada')),
         2
       )
  end as taxa_rejeicao_pct,
  max(d.authorized_at) as ultima_autorizada_em
from public.nfe_documents d
group by d.organization_id, d.branch_id, d.ambiente;

grant select on public.nfe_dashboard_stats to authenticated;

comment on view public.nfe_dashboard_stats is
  'Agregados de NF-e por (org, branch, ambiente). RLS herdada das tabelas-fonte.';
