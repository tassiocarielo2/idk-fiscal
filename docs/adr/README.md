# Architecture Decision Records (ADRs)

Este diretório contém as decisões estruturais do projeto IDK Fiscal documentadas em formato ADR. Cada decisão importante (técnica, comercial, legal, de marca ou operacional) que tem impacto não-trivial e custo de reversão fica aqui.

---

## Por que ADRs

Decisões estruturais ficam em arquivos versionados em git para que:

1. **O racional não se perca.** Daqui a seis meses, quando precisarmos voltar e lembrar **por que** algo foi decidido daquele jeito, o contexto está aqui.
2. **A evolução fique visível.** Decisões mudam — uma ADR substituída fica no repositório com status atualizado, mostrando a história.
3. **Onboarding seja barato.** Quem entrar no projeto depois lê ADRs em ordem e entende rapidamente onde estamos e por quê.

---

## Formato

Cada ADR tem nome no padrão:

```
ADR-NNN-titulo-curto-em-kebab-case.md
```

Estrutura interna:

- **Título e código** (ADR-NNN)
- **Status** — Proposta, Aceita, Substituída, Rejeitada
- **Data**
- **Categoria** — Produto, Técnica, Comercial, Legal, Marca, Operacional
- **Contexto** — qual problema motivou a decisão
- **Alternativas consideradas**
- **Decisão**
- **Consequências** — trade-offs aceitos, mitigações, ganhos

---

## Índice

| Código | Título | Categoria | Status |
|---|---|---|---|
| [ADR-001](./ADR-001-codinome-operacional.md) | Codinome operacional provisório: IDK Fiscal | Marca | Aceita |
| [ADR-002](./ADR-002-entidade-detentora.md) | IDK Engenharia Ltda como entidade detentora | Legal | Aceita |
| [ADR-003](./ADR-003-estrategia-comercial.md) | Estratégia comercial: marketing digital + pilotos próprios + rede | Comercial | Aceita |
| [ADR-004](./ADR-004-contas-operacionais.md) | Contas operacionais em conta pessoal de Tássio | Operacional | Aceita |
| [ADR-005](./ADR-005-notion-memoria-externa.md) | Notion como memória externa; Carta nas conversas | Operacional | Aceita |
| ADR-006 | Orquestração multi-superfície (Chat, Cowork, Code, Design) | Operacional | Aceita (só Notion) |
| ADR-007 | Escopo MVP em 3 waves (NF-e + NFS-e + diagnóstico tributário) | Produto | Aceita (só Notion) |
| ADR-008 | Estratégia de captura via certificado A1: custódia no servidor | Técnica | Aceita (só Notion) |
| ADR-009 | Arquitetura de dados multi-tenant (Shared Schema + RLS) | Técnica | Aceita (só Notion) |
| ADR-010 | Stack frontend (Next.js + pnpm + Supabase Auth) | Técnica | Aceita (só Notion) |
| ADR-011 | Mesh de orquestração entre instâncias via conectores | Operacional | Aceita (só Notion) |
| [ADR-012](./ADR-012-test-strategy.md) | Estratégia de testes (Vitest + RLS via SQL + Playwright E2E) | Técnica | Aceita |
| [ADR-013](./ADR-013-vault-cert-a1.md) | Custódia da senha do certificado A1 (Supabase Vault no MVP) | Técnica | Aceita |
| [ADR-014](./ADR-014-saga-upload-certificado-a1.md) | Saga de upload do certificado A1 (metadata → storage → vault) | Técnica | Aceita |
| [ADR-015](./ADR-015-provedor-sefaz.md) | Provedor SEFAZ: lib node nativa para SEFAZ-ES | Técnica | Aceita |
| [ADR-016](./ADR-016-modelo-nfe.md) | Modelo de dados NF-e (state machine + items + events) | Técnica | Aceita |
| [ADR-017](./ADR-017-danfe.md) | DANFE: HTML como saída inicial; PDF via Puppeteer pendente | Técnica | Aceita |
| [ADR-018](./ADR-018-eventos-pos-emissao.md) | Eventos pós-emissão (cancelamento, CC-e) — append-only | Técnica | Aceita |
| [ADR-019](./ADR-019-monetizacao.md) | Monetização: Pequena R$199 + Empresa R$999 + trial 14 dias | Comercial | Aceita |
| [ADR-020](./ADR-020-lgpd-dpa.md) | LGPD + DPA: consent versionado, retenção 5 anos fiscal | Legal | Aceita |
| [ADR-021](./ADR-021-suporte-sla.md) | Suporte e SLA por plano (24h/8h/4h úteis) | Operacional | Aceita |
| [ADR-022](./ADR-022-captura-inbound-upload-manual.md) | Captura inbound: upload manual antes do DistDFe | Produto | Aceita |
| [ADR-023](./ADR-023-incident-response-cert-a1.md) | Resposta a incidente: certificado A1 comprometido | Operacional | Aceita |

ADRs 006–011 foram aceitas em sessões anteriores e vivem hoje **só no Notion**. Migração para markdown canônico fica como dívida técnica de baixa prioridade — o conteúdo está estável e o Notion segue como fonte de consulta.

---

## Espelhamento com Notion

As ADRs deste diretório são **a fonte canônica**. O Notion contém um database "🏛️ Decisões e ADRs" que espelha estas decisões para consulta rápida com filtros e views — em caso de divergência, o repositório vence.

ADRs novas são criadas primeiro aqui (versionadas em git) e depois replicadas para o Notion no encerramento de cada sessão.
