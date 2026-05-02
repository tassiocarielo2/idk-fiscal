# Prompt — Claude Code Cloud — IDK Fiscal Wave 1.1 Bootstrap

Você está trabalhando no repositório **idk-fiscal** (owner: tassiocarielo2) sob o produto IDK Fiscal — uma plataforma fiscal SaaS para PMEs brasileiras (Simples Nacional, Lucro Presumido, Lucro Real). Detentora: IDK Engenharia Ltda. Esta é a primeira PR de código do projeto.

## Contexto técnico já decidido (não questionar — ADRs vinculadas)

- **ADR-007**: MVP atende os três regimes
- **ADR-008**: Custódia de A1 no servidor, Opção A (blob criptografado em Storage, senha em Vault)
- **ADR-009**: Multi-tenant shared schema + RLS por `organization_id`
- **ADR-010**: Next.js 15 App Router + pnpm + TypeScript estrito + Tailwind v4 + shadcn/ui + Supabase Auth + Vercel

## Objetivo desta PR

Bootstrappar a aplicação Next.js no repo, configurar integração com Supabase, criar estrutura de pastas, e adicionar a primeira migration SQL versionada (que será aplicada manualmente via Supabase Dashboard ou MCP em outra sessão).

**Não** crie schema no Supabase nesta PR. Apenas o arquivo de migration versionado no repo.

## Tarefas

### 1. Inicialização do projeto

Na raiz do repo:

```bash
pnpm create next-app@latest . \
  --ts --app --tailwind --eslint --src-dir \
  --import-alias "@/*" --use-pnpm --no-turbopack
```

Se o `create-next-app` reclamar de arquivos existentes (README, .gitignore, ADRs em `/docs/adrs/`), aceite e mescle preservando o que já está lá.

### 2. tsconfig estrito

Garanta no `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 3. Dependências adicionais

```bash
pnpm add @supabase/supabase-js @supabase/ssr zod
pnpm add -D @types/node
```

### 4. Estrutura de pastas

Crie:

```
src/
  app/
    (auth)/
      login/page.tsx
      sign-up/page.tsx
    (app)/
      onboarding/page.tsx          # cadastro da primeira organização
      dashboard/page.tsx           # placeholder
      layout.tsx                   # layout autenticado
    api/                           # route handlers virão depois
    layout.tsx
    page.tsx                       # landing minimal
  components/
    ui/                            # shadcn/ui components
  lib/
    supabase/
      client.ts                    # browser client
      server.ts                    # server client (RSC + Route Handlers)
      middleware.ts                # session refresh middleware
    validation/
      cnpj.ts                      # validador de CNPJ (dígito verificador)
      organization.ts              # zod schema da org
  server/
    organizations/
      create-organization.ts       # server action
  middleware.ts                    # next middleware (refresh de sessão Supabase)
supabase/
  migrations/
    0001_init_multitenant.sql      # arquivo fornecido junto com este prompt
  config.toml                      # opcional, se for usar Supabase CLI local
```

### 5. Clientes Supabase (`src/lib/supabase/`)

Implemente `client.ts`, `server.ts` e `middleware.ts` seguindo o padrão oficial `@supabase/ssr` para Next.js App Router. Use as env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (apenas server-side, nunca exposto)

Crie um `.env.example` listando essas três e adicione `.env.local` ao `.gitignore` (já deve estar).

### 6. Validador de CNPJ

`src/lib/validation/cnpj.ts`: função `isValidCnpj(value: string): boolean` que:
- normaliza (remove tudo que não for dígito)
- verifica 14 dígitos
- valida os dois dígitos verificadores (algoritmo oficial Receita Federal)
- rejeita CNPJs com todos os dígitos iguais

Exporte também `formatCnpj(value: string): string` (formato `XX.XXX.XXX/XXXX-XX`) e `normalizeCnpj(value: string): string`.

### 7. Zod schema de organização

`src/lib/validation/organization.ts`:

```ts
import { z } from "zod";
import { isValidCnpj, normalizeCnpj } from "./cnpj";

export const RegimeTributario = z.enum([
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
]);

export const CreateOrganizationSchema = z.object({
  cnpj: z.string().transform(normalizeCnpj).refine(isValidCnpj, "CNPJ inválido"),
  razao_social: z.string().min(3).max(200),
  nome_fantasia: z.string().max(200).optional().nullable(),
  regime_tributario: RegimeTributario,
  uf: z.string().regex(/^[A-Z]{2}$/),
  inscricao_estadual: z.string().max(20).optional().nullable(),
  inscricao_municipal: z.string().max(20).optional().nullable(),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
```

### 8. Server action: criar organização

`src/server/organizations/create-organization.ts`: server action que:
1. Recebe input validado pelo schema acima
2. Pega o `user.id` da sessão (Supabase server client)
3. Insere na tabela `organizations` com `created_by = user.id`
4. Insere em `organization_members` com `role = 'owner'`, `user_id = user.id`, `accepted_at = now()`
5. Retorna `{ ok: true, organizationId }` ou `{ ok: false, error }`

Faça as duas inserts em uma transação lógica — se a segunda falhar, faça rollback da primeira via DELETE explícito (Supabase REST não suporta transação client-side; alternativa é criar uma RPC `create_organization_with_owner` em migration futura, mas para esta PR o rollback explícito está ok e deve ser comentado como TODO Wave 1.2).

### 9. Páginas mínimas

- **`/`** (landing): hero "IDK Fiscal — Compliance fiscal automatizado para PMEs" + botão "Entrar"
- **`/login`**: form email/senha + botão Google OAuth (placeholder funcional)
- **`/sign-up`**: form email/senha
- **`/onboarding`**: form de cadastro da primeira organização (CNPJ, razão social, nome fantasia, regime, UF). Submit chama a server action. Se OK, redireciona para `/dashboard`.
- **`/dashboard`**: placeholder mostrando nome da org ativa e role do usuário

Estética: **dark theme, ultraminimalista, industrial**. Inspiração: Cermont Hub. Sem ilustrações, sem gradientes coloridos. Tipografia: a fonte default do Next (Geist) está ok. Use shadcn/ui para inputs e botões.

### 10. Setup shadcn/ui

```bash
pnpm dlx shadcn@latest init
```

Quando perguntar:
- Style: New York
- Base color: Zinc
- CSS variables: yes

Adicione componentes mínimos:

```bash
pnpm dlx shadcn@latest add button input label select card form
```

### 11. Middleware de auth

`src/middleware.ts`: usa `@supabase/ssr` para refresh de sessão. Redireciona:
- Não autenticado tentando acessar `/dashboard` ou `/onboarding` → `/login`
- Autenticado tentando acessar `/login` ou `/sign-up` → `/dashboard` (ou `/onboarding` se ainda não tem org)

A checagem "tem org?" pode ser uma query simples a `organization_members` filtrando por `user_id` e `accepted_at IS NOT NULL`.

### 12. Migration

Coloque o arquivo `0001_init_multitenant.sql` (fornecido pelo Tássio em anexo a este prompt) em `supabase/migrations/`. Não tente aplicar — apenas versionar.

### 13. README atualização

Adicione ao README seção "Setup local" com:
- Pré-requisitos (Node 20+, pnpm 9+)
- `pnpm install`
- `cp .env.example .env.local` e preencher com credenciais Supabase
- `pnpm dev`
- Como aplicar migration (Supabase Dashboard → SQL Editor → colar conteúdo de `supabase/migrations/0001_init_multitenant.sql`)

### 14. PR

Abra a PR com título: `feat(wave-1.1): bootstrap Next.js + Supabase + onboarding org`

Descrição da PR deve listar:
- ADRs aplicadas (ADR-007, ADR-008, ADR-009, ADR-010)
- Estrutura criada
- Como testar localmente (após aplicar a migration)
- O que **não** está nesta PR (auth Google ainda não funcional ponta a ponta, upload de certificado, fluxo de convite — Wave 1.2)

## Restrições

- **Não** instale libs além das listadas (sem react-hook-form, sem react-query nesta PR — server actions + RSC dão conta)
- **Não** crie tabelas, RPCs ou triggers no Supabase nesta PR
- **Não** exponha `SUPABASE_SERVICE_ROLE_KEY` em código client-side; só pode aparecer em código sob `src/server/` ou em route handlers explicitamente server-only
- **Não** use emojis no código nem em comentários
- Commits granulares, mensagens em inglês no formato Conventional Commits
