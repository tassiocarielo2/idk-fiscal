# IDK Fiscal

> **Codinome operacional provisório.** O nome definitivo do produto será definido quando houver clientes reais e demo funcional. Ver [`docs/adr/ADR-001-codinome-operacional.md`](./docs/adr/ADR-001-codinome-operacional.md).

---

## O que é

Plataforma de inteligência fiscal nativa de IA para empresas brasileiras navegarem a transição tributária 2026–2033 (LC 214/2025).

**Foco inicial:**

- Captura de NF-e recebidas (compras) — hoje upload manual, DistDFe planejado
- Emissão de NF-e (mod 55) homologação SEFAZ-ES com DANFE e cancelamento
- Detecção determinística de risco de não-creditamento de PIS/COFINS, ICMS bloqueador, NCM monofásico e CFOP de devolução
- Dashboard de aproveitamento de crédito tributário com totalizadores mensais e top fornecedores/NCMs
- Em planejamento: NFS-e nacional (ADN-NFSe), categorização IA, simulação de impacto da reforma

**Posicionamento atual (rascunho):** a camada de inteligência fiscal que detecta créditos perdidos e riscos da reforma tributária antes do contador.

---

## Por que agora

A NFS-e padrão nacional virou obrigatória em janeiro/2026 (LC 214/2025), unificando 5500+ sistemas municipais. A reforma tributária entra em transição entre 2026 e 2033, criando demanda massiva por software que ajude empresas a:

1. Capturar dados fiscais de forma confiável.
2. Identificar onde estão perdendo crédito hoje.
3. Simular o impacto da migração CBS/IBS antes de virar problema.

Os incumbentes do mercado (Qive, Avalara, Jettax, TecnoSpeed, e-Auditoria) têm produtos pesados, focados em compliance retroativo, com vendas consultivas tradicionais. Há espaço para um produto IA-first, leve, com captação digital.

---

## Estrutura do repositório

```
idk-fiscal/
├── docs/
│   └── adr/                    Architecture Decision Records (canônicos)
├── e2e/                        Playwright smoke tests
├── src/
│   ├── app/                    Next.js App Router
│   │   ├── (app)/              Rotas autenticadas (dashboard, /notas, /nfe, /admin/*, /billing)
│   │   ├── (auth)/             /login, /sign-up
│   │   ├── api/                Route handlers (REST)
│   │   ├── help, status, legal Páginas públicas
│   ├── components/ui/          shadcn/ui
│   ├── lib/
│   │   ├── certificates/       Parser PFX (node-forge)
│   │   ├── danfe/              Renderização DANFE (HTML; PDF stub)
│   │   ├── nfe/                Parser, signer, transmitter, alerts
│   │   ├── sefaz/              Endpoints SEFAZ-ES
│   │   ├── supabase/           Clientes (client/server/admin/middleware)
│   │   └── validation/         Zod schemas
│   ├── server/                 Server actions
│   └── proxy.ts                Refresh de sessão Supabase (Next.js 16)
├── supabase/
│   ├── migrations/             0001 → 0016 (versionadas)
│   └── tests/rls/              0001 → 0006 (asserts via SQL)
├── scripts/                    Wrappers de dev (ex.: MCP Supabase)
├── playwright.config.ts        Smoke E2E
├── vitest.config.ts            Unit
└── .github/workflows/          rls-tests, quality, e2e
```

Decisão de Sessão 2: Next.js plano na raiz (não monorepo). ADR-010 (Notion).

---

## Stack

| Camada | Tecnologia | Status |
|---|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind 4 | Operacional |
| Backend / API | Next.js Route Handlers | Operacional |
| Banco | Supabase Postgres + RLS forçada | Operacional (16 migrations) |
| Auth | Supabase Auth (email/senha + Google OAuth) | Operacional |
| Storage | Supabase Storage (cert A1, XML NF-e) | Operacional |
| Custódia A1 | Supabase Vault | MVP — KMS dedicado quando primeiro cliente externo (ADR-013) |
| Emissão NF-e | node-forge + undici (mTLS) — SEFAZ-ES | Homologação validada |
| Captura compras | Upload manual de XMLs | Operacional (ADR-022) |
| DANFE | HTML (PDF stub aguardando puppeteer-core) | HTML ok |
| Testes | Vitest 4 (unit) + psql (RLS) + Playwright (E2E smoke) | 3 vetores em CI |
| Deploy | Vercel | Configurado |

---

## Como o trabalho está organizado

O projeto é construído em sessões de trabalho documentadas. Cada sessão tem foco claro, entregas listadas, e gera um prompt de abertura para a próxima.

A **memória externa do projeto vive no Notion** (workspace privado do Tássio), com 5 databases: Sessões, Decisões e ADRs, Backlog Priorizado, Pipeline Comercial, Conteúdo.

Este repo armazena **código, configuração e ADRs técnicas**. O Notion armazena **estado operacional, decisões e tarefas vivas**. As ADRs aqui (em markdown) são versão canônica controlada por git; no Notion ficam para consulta rápida com filtros e views.

Detalhes do fluxo de trabalho em [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Estado atual

Waves entregues em `main`:

| Wave | Entrega |
|---|---|
| 1.1 | Bootstrap Next.js, Supabase Auth, signup → onboarding → dashboard, schema multi-tenant |
| 1.2a | `organization_branches` (multi-CNPJ), branch-scoped membership, convites por email |
| 1.2b | Certificado A1: Vault + Storage + UI admin |
| 1.3 | NF-e homologação SEFAZ-ES — assinatura, transmissão, persistência |
| 1.4 | DANFE (HTML), cancelamento, dashboard NF-e |
| 2.0 | Billing/LGPD/suporte: planos, trial 14d, consent, `/legal`, `/help`, `/status`, `/billing` |

Em desenvolvimento (branch `claude/review-system-improvements-X59Tz`):

| Wave | Entrega |
|---|---|
| 2.1 | Captura inbound por upload (`/notas`), parser, alertas determinísticos, dashboard de overview, página de detalhe, filtros, Vitest+Playwright, ADR-023 incident response |

Bloqueios não-código para vender a primeiro cliente externo (Notion Sessão 8): termos com advogado, DPA, seguro RC, DPO formal, KMS dedicado.

---

## Setup local

### Pré-requisitos

- Node.js 20+
- pnpm 10+
- Conta Supabase com projeto criado

### Passos

1. Instalar dependências:
   ```bash
   pnpm install
   ```
2. Copiar `.env.example` para `.env.local` e preencher:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (apenas server-side, nunca exposto)
   - `NEXT_PUBLIC_APP_URL` (ex.: `http://localhost:3000`)
   - `SUPABASE_ACCESS_TOKEN` (apenas para uso do MCP do Supabase via Claude Code)
3. Aplicar migrations no projeto Supabase. Duas opções:
   - **Dashboard:** abrir SQL Editor → colar cada arquivo de `supabase/migrations/` em ordem (0001 → 0016) → Run.
   - **MCP (Claude Code):** com `SUPABASE_ACCESS_TOKEN` exportado, `apply_migration` aplica programaticamente.
4. Rodar dev server:
   ```bash
   pnpm dev
   ```
5. Acessar http://localhost:3000, criar conta em `/sign-up`, cadastrar primeira organização em `/onboarding`.

### Comandos disponíveis

| Comando | O que faz |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Build de produção |
| `pnpm start` | Roda build de produção |
| `pnpm lint` | ESLint (0 errors, 0 warnings esperado) |
| `pnpm test` | Vitest run (unit) |
| `pnpm test:watch` | Vitest watch |
| `pnpm e2e` | Playwright smoke |
| `pnpm e2e:ui` | Playwright em modo UI |

### CI

| Workflow | Disparo | Cobre |
|---|---|---|
| `.github/workflows/quality.yml` | PR + push em `main` | lint + tsc --noEmit + Vitest |
| `.github/workflows/e2e.yml` | PR + push em `main` | Playwright smoke (Chromium) |
| `.github/workflows/rls-tests.yml` | PR/push tocando `supabase/` | Aplica migrations num Postgres em service e roda os 6 testes RLS |

---

## Detentora e licença

O produto é detido pela **IDK Engenharia Ltda** (CNPJ próprio, regime Simples Nacional). Ver [`docs/adr/ADR-002-entidade-detentora.md`](./docs/adr/ADR-002-entidade-detentora.md).

Repositório privado. Sem licença pública neste momento.

---

## Contato

Tássio Carielo — sócio da IDK Engenharia, Diretor Administrativo da Cermont Montagem Industrial.
