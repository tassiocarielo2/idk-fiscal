# ADR-016 — Modelo de dados NF-e

- **Status:** Aceita
- **Data:** 2026-05-02
- **Categoria:** Tecnica / Modelagem

## Contexto

Precisamos persistir NF-e (modelo 55) com:

- Cabecalho + emitente + destinatario + totais.
- Itens com NCM, CFOP, CST/CSOSN, ICMS, PIS/COFINS, valores.
- Transmissao: ambiente, status, chave de acesso, protocolo.
- Eventos pos-emissao: cancelamento, CC-e, inutilizacao.
- Anexos: XML autorizado + DANFE (PDF) em Storage.

Multi-tenant ja garantido por `organization_id` + `branch_id`.
Regime tributario gravado em `organizations.regime_tributario` afeta
quais campos sao validos (CST vs CSOSN, regime PIS/COFINS).

## Decisao

3 tabelas principais + Storage:

### `nfe_documents` (cabecalho e ciclo de vida)

```
id                   uuid PK
organization_id      uuid FK
branch_id            uuid FK   -- emitente da NF-e
certificate_id       uuid FK   -- com qual A1 foi assinada
chave_acesso         char(44) -- mvAttr 'Id' do XML
numero               int      -- nNF
serie                int      -- serie
modelo               char(2)  -- '55' (NF-e) ou '65' (NFC-e futuro)
ambiente             smallint -- 1=prod, 2=homologacao
tipo_operacao        smallint -- 0=entrada, 1=saida
finalidade           smallint -- 1=normal, 2=complementar, 3=ajuste, 4=devolucao
natureza_operacao    text
data_emissao         timestamptz
data_saida           timestamptz
status               nfe_status -- enum (rascunho, pendente, autorizada, rejeitada, cancelada, denegada, inutilizada)
motivo_rejeicao      text       -- xMotivo + cStat se status='rejeitada'
protocolo            text       -- nProt
xml_path             text       -- storage://nfe/<org>/<branch>/<chave>.xml
xml_authorized_path  text       -- storage://nfe/<org>/<branch>/<chave>-procNFe.xml (com protocolo)
-- destinatario embebido (denormaliza pra evitar JOIN em listagens)
dest_cnpj_cpf        text
dest_nome            text
dest_uf              char(2)
dest_ie              text
-- totais (precisao 2 casas, mas guardamos numeric(15,2))
total_produtos       numeric(15,2)
total_descontos      numeric(15,2)
total_frete          numeric(15,2)
total_icms           numeric(15,2)
total_pis            numeric(15,2)
total_cofins         numeric(15,2)
total_nota           numeric(15,2)
-- meta
created_at           timestamptz
created_by           uuid FK auth.users
transmitted_at       timestamptz
authorized_at        timestamptz

unique (organization_id, modelo, serie, numero)
unique (chave_acesso) where status not in ('rascunho','inutilizada')
```

### `nfe_items` (produtos/servicos)

```
id                  uuid PK
nfe_document_id     uuid FK ON DELETE CASCADE
numero_item         int       -- nItem (1, 2, 3...)
codigo              text
descricao           text
ncm                 char(8)
cfop                char(4)
unidade             text
quantidade          numeric(15,4)
valor_unitario      numeric(15,4)
valor_total         numeric(15,2)
desconto            numeric(15,2)
cst_csosn           text       -- CSOSN se Simples; CST se Lucro
icms_aliquota       numeric(5,2)
icms_valor          numeric(15,2)
pis_cst             text
pis_aliquota        numeric(5,2)
pis_valor           numeric(15,2)
cofins_cst          text
cofins_aliquota     numeric(5,2)
cofins_valor        numeric(15,2)
informacoes_adicionais text

unique (nfe_document_id, numero_item)
```

### `nfe_events` (cancelamento, CC-e, inutilizacao)

```
id                  uuid PK
nfe_document_id     uuid FK ON DELETE RESTRICT
organization_id     uuid FK
tipo_evento         text   -- '110111'=cancelamento, '110110'=CC-e, '110112'=EPEC, etc
numero_sequencial   int    -- nSeqEvento (importante: evento nao se repete na mesma seq)
data_evento         timestamptz
status              text
xml_path            text
protocolo           text
justificativa       text   -- min 15 chars conforme MOC
created_by          uuid FK
created_at          timestamptz

unique (nfe_document_id, tipo_evento, numero_sequencial)
```

### Storage

Bucket `nfe` privado:
- `org_<id>/branch_<id>/<chave>.xml`            → XML assinado
- `org_<id>/branch_<id>/<chave>-procNFe.xml`    → XML + protocolo autorizado
- `org_<id>/branch_<id>/<chave>-cancel.xml`     → evento cancelamento
- `org_<id>/branch_<id>/<chave>.pdf`            → DANFE (Wave 1.4)

## Decisoes de modelagem

1. **Denormaliza destinatario no cabecalho**: listagens nao precisam JOIN.
2. **`numeric(15,2)` para valores monetarios**: bate com leiaute SEFAZ.
3. **`numeric(15,4)` para quantidade e valor unitario**: leiaute permite 4 casas.
4. **`certificate_id` no documento**: rastrea com qual cert a NF foi assinada (auditoria).
5. **`status` como enum**: estado-maquina com transicoes validadas em trigger
   ou no app. Estados terminais: `autorizada`, `cancelada`, `denegada`, `inutilizada`.
6. **`chave_acesso` UNIQUE com WHERE NOT IN ('rascunho', 'inutilizada')**:
   permite rascunhos sem chave + inutilizadas que nunca chegaram a ter chave valida.
7. **`numero_sequencial` em events**: SEFAZ exige unicidade por (chave, tipo, seq).

## Trade-offs aceitos

- **Sem JOIN para destinatario**: dados de cliente repetidos em N notas.
  Aceito porque cliente externo nao e tenant aqui (sao counterparties).
- **`nfe_items.cst_csosn` como text**: nao usamos enum para nao prender
  o cadastro a uma versao de NT. Validacao no app.
- **`pis_aliquota` e `pis_valor` como `numeric(5,2)/numeric(15,2)`**:
  PIS/COFINS no Simples e zero (nota suplementar). Mantemos por
  homogeneidade com Lucro Presumido/Real.

## Schema seguinte (Wave 1.4)

- `nfe_inutilizacoes` (faixa de numeracao inutilizada — NF-e que nunca chegou a sair).
- `nfe_correcoes` (CC-e materializada).

## RLS

Todas as tabelas com RLS forced. SELECT por `is_org_member` +
`is_branch_member(branch_id)`. INSERT/UPDATE so via RPCs ou
service_role (`/api/nfe/issue`).
