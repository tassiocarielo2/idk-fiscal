## Resumo

Wave 1.2a implementa multi-CNPJ via tabela de filiais, escopo de filial em membership, e fluxo completo de convites por email com pagina de aceite.

## Schema (migration 0005)

- `organization_branches`: 1+ filiais por org, matriz unica via indice unique parcial. CNPJ unico globalmente.
- `organization_members.branch_scope uuid[]`: NULL = todas, array = subset. Owner/admin forcados a NULL via check.
- `is_branch_member(branch_id)`: helper RLS que respeita branch_scope.
- `organization_invites`: convites por email, token gerado server-side (32 bytes), expira em 7 dias.
- RPCs `create_invite` / `accept_invite` (authenticated) e `peek_invite` (anon allowed, so metadados).
- Migracao de dados: `organizations.cnpj` -> `organization_branches` como matriz; coluna dropada.

## App

- `POST /api/invites` — owner/admin cria convite. Dispara email via `auth.admin.inviteUserByEmail`; retorna link como fallback.
- `POST /api/invites/accept` — autenticado; mapeia codigos pg para HTTP (28000→401, 42501→403, 22023→400).
- `GET /invite/[token]` — server component com 6 estados: invalido / revogado / aceito / expirado / nao-autenticado (redirect login) / email-mismatch / ok (botao de aceite).
- `src/lib/supabase/admin.ts` — wrapper service_role.

## ADRs

- ADR-012 — testes em 3 camadas (Vitest unit + RLS SQL fixtures + Playwright E2E). RLS bloqueante para merge em main.
- ADR-013 — Vault para senha do A1 no MVP; KMS externo dispara no primeiro cliente externo pagante.

## Riscos residuais

- `peek_invite` sem rate limit (token 32B torna brute-force inviavel, mas enumeracao em massa por anon e teoricamente possivel; plano: edge rate limiter antes de cliente externo).
- `inviteUserByEmail` falha silencioso se email ja existe em `auth.users` — endpoint retorna link como fallback.

## Variaveis de ambiente novas

- `SUPABASE_SERVICE_ROLE_KEY` (server-only, ja documentada em `.env.example`).
- `NEXT_PUBLIC_APP_URL` (base url para construir link de aceite).

## Estado da migration

**Migration nao aplicada nesta PR.** O arquivo esta em `supabase/migrations/0005_branches_invites_and_scope.sql` para revisao. Aplicacao no banco depende de aprovacao explicita do chat (arquiteto) — abrir nova MSG no Mesh autorizando `apply_migration` se aprovado.

## Testes

- 3 arquivos em `supabase/tests/rls/` (`0001_org_isolation.sql`, `0002_branch_scope.sql`, `0003_invite_acceptance.sql`).
- Padrao `begin/rollback` puro. Roda via `execute_sql` do MCP Supabase.
- **Nao foram executados nesta wave** porque dependem da migration estar aplicada.

## Como testar localmente

1. Aplicar migration 0005 (Supabase MCP ou `supabase db push`).
2. Rodar `supabase/tests/rls/000{1,2,3}*.sql` via `execute_sql`.
3. `pnpm dev` e abrir `/invite/<token-de-teste>`.
