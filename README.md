# IDK Fiscal

> **Codinome operacional provisório.** O nome definitivo do produto será definido quando houver clientes reais e demo funcional. Ver [`docs/adr/ADR-001-codinome-operacional.md`](./docs/adr/ADR-001-codinome-operacional.md).

---

## O que é

Plataforma de inteligência fiscal nativa de IA para empresas brasileiras navegarem a transição tributária 2026–2033 (LC 214/2025).

**Foco inicial:**

- Captura automatizada de NF-e (compras) e NFS-e padrão nacional
- Detecção de variação de preço em suprimentos via IA
- Detecção de risco de não-creditamento de PIS/COFINS e IBS/CBS
- Dashboards de aproveitamento de crédito tributário
- Simulação de impacto da reforma tributária

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
├── docs/                       Documentação e ADRs
│   └── adr/                    Decisões estruturais documentadas
├── src/
│   ├── app/                    Next.js App Router (rotas + layouts)
│   ├── components/ui/          shadcn/ui
│   ├── lib/
│   │   ├── supabase/           Clientes (client/server/proxy)
│   │   └── validation/         CNPJ + Zod schemas
│   ├── server/                 Server actions
│   └── proxy.ts                Next.js proxy (refresh de sessão Supabase)
├── supabase/migrations/        Migrations SQL versionadas
├── scripts/                    Wrappers de dev (ex.: MCP Supabase)
├── .mcp.json                   MCP server do Supabase com escopo de projeto
└── .github/                    Workflows e templates
```

Decisão de Sessão 2: Next.js plano na raiz (não monorepo). ADR-010.

---

## Stack planejada

| Camada | Tecnologia | Status |
|---|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind | A iniciar |
| Backend / API | Next.js Route Handlers + Supabase Edge Functions | A iniciar |
| Banco | Supabase (Postgres) com RLS estrita | A iniciar |
| Auth | Supabase Auth | A iniciar |
| Deploy | Vercel | A iniciar |
| IA | Anthropic Claude API + OpenAI quando aplicável | A iniciar |
| Captura NF-e | Certificado A1 + parser XML próprio | A iniciar |
| Captura NFS-e | API ADN-NFSe (Receita Federal) | A pesquisar |

Decisões técnicas serão documentadas em ADRs conforme tomadas. Ver [`docs/adr/`](./docs/adr/).

---

## Como o trabalho está organizado

O projeto é construído em sessões de trabalho documentadas. Cada sessão tem foco claro, entregas listadas, e gera um prompt de abertura para a próxima.

A **memória externa do projeto vive no Notion** (workspace privado do Tássio), com 5 databases:

- **Sessões** — registro de cada sessão de trabalho
- **Decisões e ADRs** — espelho das ADRs deste repo, com mais contexto operacional
- **Backlog Priorizado** — tarefas com prioridade e status
- **Pipeline Comercial** — leads, pilotos, clientes
- **Conteúdo** — calendário editorial e tracking

Este repo armazena **código, configuração e ADRs técnicas**. O Notion armazena **estado operacional, decisões e tarefas vivas**. As ADRs aqui (em markdown) são versão canônica controlada por git; no Notion ficam para consulta rápida com filtros e views.

Detalhes do fluxo de trabalho em [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Estado atual

Wave 1.1 entregue: schema multi-tenant aplicado no Supabase, bootstrap Next.js 15 + Supabase Auth, fluxo signup → onboarding (criar org) → dashboard.

- **Wave 1.2 (próxima):** convites por email, upload de certificado A1 (ADR-008), tabela `organization_branches` (multi-CNPJ).
- **Wave 1.3:** Vault para senha do certificado, primeiros pilotos.

---

## Setup local

### Pré-requisitos

- Node.js 20+
- pnpm 9+
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
   - `SUPABASE_ACCESS_TOKEN` (apenas para uso do MCP do Supabase via Claude Code)
3. Aplicar migrations no projeto Supabase. Duas opções:
   - **Dashboard:** abrir SQL Editor → colar o conteúdo de `supabase/migrations/0001_init_multitenant.sql` → Run. Repetir para `0002_security_hardening.sql`.
   - **MCP (Claude Code):** com `SUPABASE_ACCESS_TOKEN` exportado, o `.mcp.json` aponta para o projeto e expõe `apply_migration`.
4. Rodar dev server:
   ```bash
   pnpm dev
   ```
5. Acessar http://localhost:3000, criar conta em `/sign-up`, cadastrar primeira organização em `/onboarding`.

### Build de produção

```bash
pnpm build
pnpm start
```

---

## Detentora e licença

O produto é detido pela **IDK Engenharia Ltda** (CNPJ próprio, regime Simples Nacional). Ver [`docs/adr/ADR-002-entidade-detentora.md`](./docs/adr/ADR-002-entidade-detentora.md).

Repositório privado. Sem licença pública neste momento.

---

## Contato

Tássio Carielo — sócio da IDK Engenharia, Diretor Administrativo da Cermont Montagem Industrial.
