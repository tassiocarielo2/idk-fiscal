-- =====================================================================
-- IDK Fiscal — Migration 0014: NF-e inbound (notas recebidas / compras)
-- Wave 2.1 — captura por upload manual + alertas determinísticos.
--
-- Decisão: tabelas separadas das nfe_documents (que modelam emissão).
-- Notas recebidas têm semântica diferente: emissor é externo, numero/serie
-- pertencem ao fornecedor, não ao nosso cliente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Enums
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'nfe_inbound_status') then
    create type nfe_inbound_status as enum (
      'autorizada',
      'cancelada',
      'denegada',
      'desconhecida'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'nfe_inbound_alert_kind') then
    create type nfe_inbound_alert_kind as enum (
      'pis_cofins_sem_credito',
      'cfop_sem_credito',
      'cst_icms_bloqueador',
      'fornecedor_inativo',
      'duplicidade_chave'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'nfe_inbound_alert_severity') then
    create type nfe_inbound_alert_severity as enum ('info', 'warn', 'critical');
  end if;
end$$;

-- =====================================================================
-- 1. nfe_inbound_documents
-- =====================================================================
create table if not exists public.nfe_inbound_documents (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete restrict,
  branch_id             uuid not null references public.organization_branches(id) on delete restrict,

  chave_acesso          char(44) not null,
  modelo                char(2)  not null default '55',
  serie                 int      not null,
  numero                int      not null,
  ambiente              smallint not null default 1,

  natureza_operacao     text not null,
  data_emissao          timestamptz not null,
  data_recebimento      timestamptz not null default now(),

  status                nfe_inbound_status not null default 'autorizada',
  protocolo             text,

  xml_path              text not null,
  xml_sha256            char(64) not null,

  -- Emitente (fornecedor)
  emit_cnpj             char(14) not null,
  emit_nome             text not null,
  emit_uf               char(2) not null,
  emit_ie               text,

  -- Destinatario (nosso cliente, denormalizado pra checagem)
  dest_cnpj_cpf         text not null,
  dest_nome             text not null,

  -- Totais
  total_produtos        numeric(15,2) not null default 0,
  total_descontos       numeric(15,2) not null default 0,
  total_frete           numeric(15,2) not null default 0,
  total_icms            numeric(15,2) not null default 0,
  total_pis             numeric(15,2) not null default 0,
  total_cofins          numeric(15,2) not null default 0,
  total_nota            numeric(15,2) not null default 0,

  -- Sinalizadores derivados (preenchidos pelo detector de alertas)
  has_credit_risk       boolean not null default false,
  alerts_count          int     not null default 0,

  created_at            timestamptz not null default now(),
  created_by            uuid not null references auth.users(id) on delete restrict,

  constraint nfe_inbound_chave_format_chk check (chave_acesso ~ '^[0-9]{44}$'),
  constraint nfe_inbound_modelo_chk       check (modelo in ('55','65')),
  constraint nfe_inbound_ambiente_chk     check (ambiente in (1,2)),
  constraint nfe_inbound_emit_cnpj_chk    check (emit_cnpj ~ '^[0-9]{14}$'),
  constraint nfe_inbound_emit_uf_chk      check (emit_uf ~ '^[A-Z]{2}$'),
  constraint nfe_inbound_xml_sha_chk      check (xml_sha256 ~ '^[0-9a-f]{64}$')
);

create unique index if not exists nfe_inbound_org_chave_uniq
  on public.nfe_inbound_documents (organization_id, chave_acesso);

create index if not exists nfe_inbound_org_emissao_idx
  on public.nfe_inbound_documents (organization_id, data_emissao desc);

create index if not exists nfe_inbound_branch_emissao_idx
  on public.nfe_inbound_documents (branch_id, data_emissao desc);

create index if not exists nfe_inbound_emit_cnpj_idx
  on public.nfe_inbound_documents (organization_id, emit_cnpj);

create index if not exists nfe_inbound_credit_risk_idx
  on public.nfe_inbound_documents (organization_id, has_credit_risk)
  where has_credit_risk;

comment on table public.nfe_inbound_documents is
  'NF-e recebidas (compras). Captura por upload manual no MVP; DistDFe vira em wave futura.';

-- =====================================================================
-- 2. nfe_inbound_items
-- =====================================================================
create table if not exists public.nfe_inbound_items (
  id                       uuid primary key default gen_random_uuid(),
  inbound_document_id      uuid not null references public.nfe_inbound_documents(id) on delete cascade,
  numero_item              int not null,
  codigo                   text not null,
  descricao                text not null,
  ncm                      char(8) not null,
  cfop                     char(4) not null,
  unidade                  text not null,
  quantidade               numeric(15,4) not null,
  valor_unitario           numeric(15,4) not null,
  valor_total              numeric(15,2) not null,
  desconto                 numeric(15,2) not null default 0,
  cst_csosn                text,
  icms_aliquota            numeric(5,2) not null default 0,
  icms_valor               numeric(15,2) not null default 0,
  pis_cst                  text,
  pis_aliquota             numeric(5,2) not null default 0,
  pis_valor                numeric(15,2) not null default 0,
  cofins_cst               text,
  cofins_aliquota          numeric(5,2) not null default 0,
  cofins_valor             numeric(15,2) not null default 0,

  constraint nfe_inbound_items_numero_uniq unique (inbound_document_id, numero_item),
  constraint nfe_inbound_items_ncm_chk     check (ncm ~ '^[0-9]{8}$'),
  constraint nfe_inbound_items_cfop_chk    check (cfop ~ '^[0-9]{4}$')
);

create index if not exists nfe_inbound_items_doc_idx
  on public.nfe_inbound_items (inbound_document_id);

create index if not exists nfe_inbound_items_ncm_idx
  on public.nfe_inbound_items (ncm);

-- =====================================================================
-- 3. nfe_inbound_alerts
-- =====================================================================
create table if not exists public.nfe_inbound_alerts (
  id                  uuid primary key default gen_random_uuid(),
  inbound_document_id uuid not null references public.nfe_inbound_documents(id) on delete cascade,
  organization_id     uuid not null references public.organizations(id) on delete restrict,
  kind                nfe_inbound_alert_kind not null,
  severity            nfe_inbound_alert_severity not null default 'warn',
  titulo              text not null,
  detalhe             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists nfe_inbound_alerts_doc_idx
  on public.nfe_inbound_alerts (inbound_document_id);

create index if not exists nfe_inbound_alerts_org_kind_idx
  on public.nfe_inbound_alerts (organization_id, kind, created_at desc);

comment on table public.nfe_inbound_alerts is
  'Alertas determinísticos sobre notas recebidas. Anexados na ingestão.';

-- =====================================================================
-- 4. RLS
-- =====================================================================
alter table public.nfe_inbound_documents enable row level security;
alter table public.nfe_inbound_documents force  row level security;
alter table public.nfe_inbound_items     enable row level security;
alter table public.nfe_inbound_items     force  row level security;
alter table public.nfe_inbound_alerts    enable row level security;
alter table public.nfe_inbound_alerts    force  row level security;

create policy nfe_inbound_documents_select on public.nfe_inbound_documents
for select to authenticated
using (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);

create policy nfe_inbound_documents_insert on public.nfe_inbound_documents
for insert to authenticated
with check (
  public.has_org_role(organization_id, array['owner','admin','member'])
  and public.is_branch_member(branch_id)
  and created_by = auth.uid()
);

-- UPDATE/DELETE: notas recebidas são imutáveis. Reprocessar = deletar + reingerir
-- via service_role em wave futura.

create policy nfe_inbound_items_select on public.nfe_inbound_items
for select to authenticated
using (exists (
  select 1 from public.nfe_inbound_documents d
   where d.id = nfe_inbound_items.inbound_document_id
     and public.is_org_member(d.organization_id)
     and public.is_branch_member(d.branch_id)
));

create policy nfe_inbound_items_insert on public.nfe_inbound_items
for insert to authenticated
with check (exists (
  select 1 from public.nfe_inbound_documents d
   where d.id = nfe_inbound_items.inbound_document_id
     and public.has_org_role(d.organization_id, array['owner','admin','member'])
     and public.is_branch_member(d.branch_id)
));

create policy nfe_inbound_alerts_select on public.nfe_inbound_alerts
for select to authenticated
using (public.is_org_member(organization_id));

create policy nfe_inbound_alerts_insert on public.nfe_inbound_alerts
for insert to authenticated
with check (
  public.has_org_role(organization_id, array['owner','admin','member'])
  and exists (
    select 1 from public.nfe_inbound_documents d
     where d.id = nfe_inbound_alerts.inbound_document_id
       and d.organization_id = nfe_inbound_alerts.organization_id
       and public.is_branch_member(d.branch_id)
  )
);

grant select, insert on public.nfe_inbound_documents to authenticated;
grant select, insert on public.nfe_inbound_items     to authenticated;
grant select, insert on public.nfe_inbound_alerts    to authenticated;

-- =====================================================================
-- 5. Storage: policy INSERT no bucket nfe para subpasta inbound/
--
-- A migration 0011 já criou o bucket "nfe" e o helper de path. Apenas
-- adicionamos INSERT/UPDATE para que clientes autenticados possam fazer
-- upload de XMLs recebidos sob o prefixo inbound/.
-- =====================================================================
drop policy if exists "nfe_insert_member" on storage.objects;
create policy "nfe_insert_member"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'nfe'
  and storage.nfe_path_org(name) is not null
  and public.has_org_role(
    storage.nfe_path_org(name),
    array['owner','admin','member']
  )
  and (
    storage.nfe_path_branch(name) is null
    or public.is_branch_member(storage.nfe_path_branch(name))
  )
);
