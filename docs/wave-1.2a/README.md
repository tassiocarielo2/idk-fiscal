# Wave 1.2a — Branches, branch-scoped membership e convites

## O que muda

### Schema (migration 0005)

- Nova tabela `organization_branches`: 1+ filiais por organizacao, com matriz unica garantida por indice unique parcial. CNPJ unico globalmente.
- Coluna `organization_members.branch_scope uuid[]`: NULL = todas as filiais; array = subset. Owner/admin sempre NULL (constraint).
- Helper RLS `is_branch_member(branch_id)`: pivot para policies de tabelas filhas em waves futuras.
- Nova tabela `organization_invites`: convites por email, token gerado no servidor, expiracao default 7 dias.
- Tres novas RPCs: `create_invite`, `accept_invite` (autenticadas), `peek_invite` (publica, so metadados nao-sensiveis).
- Migracao de dados: `organizations.cnpj` movido para `organization_branches` como matriz; coluna dropada de `organizations`.

### App

- `POST /api/invites` — owner/admin cria convite, email disparado via Supabase Admin (best-effort), retorna link como fallback.
- `POST /api/invites/accept` — autenticado, valida email, chama RPC.
- `GET /invite/[token]` — pagina publica que mostra estado do convite (valido/revogado/aceito/expirado/email-mismatch) e botao de aceite.

### ADRs criadas

- ADR-012 — estrategia de testes (Vitest unit + RLS via SQL + Playwright E2E).
- ADR-013 — custodia da senha do certificado A1 (Supabase Vault no MVP, KMS externo no primeiro cliente pagante).

## Variaveis de ambiente novas

- `SUPABASE_SERVICE_ROLE_KEY` — apenas server-side; usada pelo admin client para `inviteUserByEmail`.
- `NEXT_PUBLIC_APP_URL` — base url da app, usada para construir o link de aceite (`/invite/[token]`).

## Como aplicar a migration

A migration **nao foi aplicada** automaticamente nesta wave. Para aplicar:

```sh
# Opcao 1: via Supabase MCP (autorizado pelo arquiteto)
# Pedir aprovacao no chat para "apply_migration name=branches_invites_and_scope"

# Opcao 2: via Supabase CLI
supabase db push
```

## Testes

```sh
# Os 3 arquivos em supabase/tests/rls/ rodam como begin/rollback puros.
# Apos a migration estar aplicada, executa-los um a um via execute_sql.
```

## Riscos residuais

- `peek_invite` nao tem rate limit. Token de 32 bytes torna brute-force inviavel, mas enumeracao em massa via anon ainda e possivel teoricamente. Plano: cloudflare/rate limiter no edge antes do primeiro cliente externo.
- `inviteUserByEmail` retorna erro silencioso se o email ja existe em `auth.users` — endpoint trata isso retornando o link como fallback. UX precisa instruir admin a copiar o link nesses casos.
- Email do convite e armazenado lowercase (`citext` + transformacao Zod), mas comparacao no `accept_invite` usa cast explicito. Cobertura via teste 0003.
