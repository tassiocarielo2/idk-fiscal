-- =====================================================================
-- IDK Fiscal — Migration 0010: NF-e schema (Wave 1.3)
-- ADR-015 (lib node nativa SEFAZ-ES), ADR-016 (modelo de dados NF-e)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Enums
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'nfe_status') then
    create type nfe_status as enum (
      'rascunho',
      'pendente',       -- enviada, aguardando processamento
      'autorizada',     -- cStat 100 + protocolo
      'rejeitada',      -- cStat de rejeicao
      'cancelada',      -- evento de cancelamento aplicado
      'denegada',       -- cStat denegacao (sem retorno)
      'inutilizada'     -- numero inutilizado antes de emitir
    );
  end if;
end$$;

-- =====================================================================
-- 1. nfe_documents
-- =====================================================================
create table if not exists public.nfe_documents (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete restrict,
  branch_id             uuid not null references public.organization_branches(id) on delete restrict,
  certificate_id        uuid references public.certificates_metadata(id) on delete restrict,

  chave_acesso          char(44),
  numero                int not null,
  serie                 int not null default 1,
  modelo                char(2) not null default '55',
  ambiente              smallint not null default 2,  -- 2=homologacao default
  tipo_operacao         smallint not null default 1,  -- 1=saida
  finalidade            smallint not null default 1,  -- 1=normal
  natureza_operacao     text not null,

  data_emissao          timestamptz not null default now(),
  data_saida            timestamptz,

  status                nfe_status not null default 'rascunho',
  motivo_rejeicao       text,
  protocolo             text,

  xml_path              text,
  xml_authorized_path   text,

  -- Destinatario denormalizado
  dest_cnpj_cpf         text not null,
  dest_nome             text not null,
  dest_uf               char(2) not null,
  dest_ie               text,

  -- Totais
  total_produtos        numeric(15,2) not null default 0,
  total_descontos       numeric(15,2) not null default 0,
  total_frete           numeric(15,2) not null default 0,
  total_icms            numeric(15,2) not null default 0,
  total_pis             numeric(15,2) not null default 0,
  total_cofins          numeric(15,2) not null default 0,
  total_nota            numeric(15,2) not null default 0,

  created_at            timestamptz not null default now(),
  created_by            uuid not null references auth.users(id) on delete restrict,
  transmitted_at        timestamptz,
  authorized_at         timestamptz,

  constraint nfe_documents_modelo_chk check (modelo in ('55','65')),
  constraint nfe_documents_ambiente_chk check (ambiente in (1,2)),
  constraint nfe_documents_chave_format_chk
    check (chave_acesso is null or chave_acesso ~ '^[0-9]{44}$'),
  constraint nfe_documents_dest_uf_chk check (dest_uf ~ '^[A-Z]{2}$'),
  constraint nfe_documents_numero_pos_chk check (numero > 0),
  constraint nfe_documents_serie_nonneg_chk check (serie >= 0)
);

create unique index if not exists nfe_documents_org_modelo_serie_numero_uniq
  on public.nfe_documents (organization_id, modelo, serie, numero, ambiente);

create unique index if not exists nfe_documents_chave_uniq
  on public.nfe_documents (chave_acesso)
  where status not in ('rascunho','inutilizada') and chave_acesso is not null;

create index if not exists nfe_documents_branch_status_idx
  on public.nfe_documents (branch_id, status, data_emissao desc);
create index if not exists nfe_documents_org_emissao_idx
  on public.nfe_documents (organization_id, data_emissao desc);

create trigger nfe_documents_set_updated_at
before update on public.nfe_documents
for each row execute function public.set_updated_at();

comment on table public.nfe_documents is
  'NF-e (mod 55). Estado-maquina: rascunho->pendente->autorizada/rejeitada. Eventos em nfe_events.';

-- =====================================================================
-- 2. nfe_items
-- =====================================================================
create table if not exists public.nfe_items (
  id                       uuid primary key default gen_random_uuid(),
  nfe_document_id          uuid not null references public.nfe_documents(id) on delete cascade,
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
  informacoes_adicionais   text,

  constraint nfe_items_numero_uniq unique (nfe_document_id, numero_item),
  constraint nfe_items_quantidade_pos_chk check (quantidade > 0),
  constraint nfe_items_valor_unit_nonneg_chk check (valor_unitario >= 0),
  constraint nfe_items_ncm_chk check (ncm ~ '^[0-9]{8}$'),
  constraint nfe_items_cfop_chk check (cfop ~ '^[0-9]{4}$')
);

create index if not exists nfe_items_doc_idx on public.nfe_items (nfe_document_id);

-- =====================================================================
-- 3. nfe_events
-- =====================================================================
create table if not exists public.nfe_events (
  id                  uuid primary key default gen_random_uuid(),
  nfe_document_id     uuid not null references public.nfe_documents(id) on delete restrict,
  organization_id     uuid not null references public.organizations(id) on delete restrict,
  tipo_evento         text not null,
  numero_sequencial   int not null,
  data_evento         timestamptz not null default now(),
  status              text not null default 'pendente',
  xml_path            text,
  protocolo           text,
  justificativa       text,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),

  constraint nfe_events_seq_uniq unique (nfe_document_id, tipo_evento, numero_sequencial),
  constraint nfe_events_seq_pos_chk check (numero_sequencial >= 1),
  constraint nfe_events_tipo_chk check (tipo_evento ~ '^[0-9]{6}$')
);

create index if not exists nfe_events_doc_idx
  on public.nfe_events (nfe_document_id, data_evento desc);

-- Bloqueia DELETE em events (audit trail) — mantemos UPDATE pra corrigir
-- status apos retorno SEFAZ (justificavel).
create or replace function public.nfe_events_block_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'nfe_events e append-only.' using errcode = '42501';
end;
$$;
create trigger nfe_events_no_delete
before delete on public.nfe_events
for each row execute function public.nfe_events_block_delete();

comment on table public.nfe_events is
  'Eventos pos-emissao (cancelamento 110111, CC-e 110110, etc). Append-only.';

-- =====================================================================
-- 4. RLS
-- =====================================================================
alter table public.nfe_documents enable row level security;
alter table public.nfe_documents force  row level security;
alter table public.nfe_items     enable row level security;
alter table public.nfe_items     force  row level security;
alter table public.nfe_events    enable row level security;
alter table public.nfe_events    force  row level security;

create policy nfe_documents_select on public.nfe_documents
for select to authenticated
using (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);

create policy nfe_documents_insert on public.nfe_documents
for insert to authenticated
with check (
  public.has_org_role(organization_id, array['owner','admin','member'])
  and public.is_branch_member(branch_id)
  and created_by = auth.uid()
);

create policy nfe_documents_update on public.nfe_documents
for update to authenticated
using (
  public.has_org_role(organization_id, array['owner','admin','member'])
  and public.is_branch_member(branch_id)
)
with check (
  public.has_org_role(organization_id, array['owner','admin','member'])
);

-- DELETE: nao ha policy. Notas autorizadas nao se deletam.
-- Rascunhos podem ser apagados por owner/admin via RPC dedicada (Wave 1.4).

create policy nfe_items_select on public.nfe_items
for select to authenticated
using (exists (
  select 1 from public.nfe_documents d
   where d.id = nfe_items.nfe_document_id
     and public.is_org_member(d.organization_id)
     and public.is_branch_member(d.branch_id)
));

create policy nfe_items_insert on public.nfe_items
for insert to authenticated
with check (exists (
  select 1 from public.nfe_documents d
   where d.id = nfe_items.nfe_document_id
     and public.has_org_role(d.organization_id, array['owner','admin','member'])
     and public.is_branch_member(d.branch_id)
));

create policy nfe_items_update on public.nfe_items
for update to authenticated
using (exists (
  select 1 from public.nfe_documents d
   where d.id = nfe_items.nfe_document_id
     and public.has_org_role(d.organization_id, array['owner','admin','member'])
     and d.status = 'rascunho'
));

create policy nfe_events_select on public.nfe_events
for select to authenticated
using (public.is_org_member(organization_id));

-- INSERT em nfe_events apenas via service_role (RPC dedicada Wave 1.4).

grant select, insert, update on public.nfe_documents to authenticated;
grant select, insert, update on public.nfe_items     to authenticated;
grant select on public.nfe_events to authenticated;

-- =====================================================================
-- 5. RPC: next_nfe_numero
--    Atomico: pega proximo numero disponivel para (branch, modelo, serie, ambiente).
--    Usa advisory lock pra evitar race entre dois emissores concorrentes.
-- =====================================================================
create or replace function public.next_nfe_numero(
  p_branch_id  uuid,
  p_modelo     char(2) default '55',
  p_serie      int     default 1,
  p_ambiente   smallint default 2
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id   uuid;
  v_lock_key bigint;
  v_max      int;
begin
  if auth.uid() is null then
    raise exception 'Sessao nao autenticada' using errcode = '42501';
  end if;

  select organization_id into v_org_id
    from public.organization_branches
   where id = p_branch_id and deleted_at is null;
  if v_org_id is null then
    raise exception 'Filial nao encontrada' using errcode = '22023';
  end if;

  if not public.has_org_role(v_org_id, array['owner','admin','member']) then
    raise exception 'Sem permissao' using errcode = '42501';
  end if;

  if not public.is_branch_member(p_branch_id) then
    raise exception 'Sem permissao na filial' using errcode = '42501';
  end if;

  -- Advisory lock por (branch, ambiente, serie). Liberado no fim da tx.
  v_lock_key := hashtextextended(
    p_branch_id::text || p_modelo || p_serie::text || p_ambiente::text,
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select coalesce(max(numero), 0) into v_max
    from public.nfe_documents
   where branch_id = p_branch_id
     and modelo = p_modelo
     and serie  = p_serie
     and ambiente = p_ambiente;

  return v_max + 1;
end;
$$;

revoke all on function public.next_nfe_numero(uuid, char, int, smallint) from public;
grant execute on function public.next_nfe_numero(uuid, char, int, smallint) to authenticated;

comment on function public.next_nfe_numero(uuid, char, int, smallint) is
  'Proximo numero disponivel para emissao. Usa advisory lock por (branch, ambiente, serie).';
