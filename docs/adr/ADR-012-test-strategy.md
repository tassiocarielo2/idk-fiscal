# ADR-012 — Estrategia de testes

- **Status:** Aceita
- **Data:** 2026-05-02
- **Categoria:** Tecnica

## Contexto

O projeto comeca a ter superficie suficiente (RLS, RPCs, fluxos web) onde regressao silenciosa e cara: um bug em policy de RLS pode vazar dados entre tenants, e um bug em fluxo de convite trava onboarding. Precisamos de uma estrategia de testes definida antes que o codigo cresca mais.

## Alternativas consideradas

1. **Apenas testes E2E** (Playwright contra ambiente real). Cobertura ampla, mas lentos e quebradicos para regras de RLS/RPC isoladas.
2. **Apenas unit tests** com mocks do Supabase. Rapidos, mas falsificam o que importa: nada garante que a RLS real esta correta.
3. **Camadas combinadas** (selecionada).

## Decisao

Tres camadas, cada uma com proposito definido:

1. **Unit (Vitest)** — para validacao Zod, helpers puros (CNPJ, normalizacao), logica em server actions sem I/O. Rapido (< 1s por arquivo). Nao mocka Supabase em testes que dependem de RLS.

2. **RLS (SQL fixtures)** — para policies, helpers (`is_org_member`, `is_branch_member`, `has_org_role`) e RPCs com `SECURITY DEFINER`. Cada arquivo `supabase/tests/rls/NNNN_*.sql` e um `begin/...//rollback;` que cria fixtures, alterna o role/JWT e usa `raise exception` para asserts. Roda via `execute_sql` do MCP Supabase ou `psql` contra branch de desenvolvimento. **RLS e bloqueante para merge em main.**

3. **E2E (Playwright)** — para fluxos completos que valem o custo de subir o app: signup, onboarding, criar/aceitar convite, multi-org switch. Roda contra branch de desenvolvimento Supabase + dev server local. Smoke test em CI; cobertura ampla rodada antes de releases.

## Consequencias

- **Trade-off**: setup inicial (3 toolings) maior que uma camada so. Mitigado por escopo claro: cada camada testa o que so ela ve direito.
- **Custo de RLS tests**: usam `extensions.gen_random_bytes` e `auth.users` direto, exigem servico real (nao Postgres puro). Aceito porque RLS e a propria fronteira de seguranca multi-tenant.
- **Ganho**: regressao em RLS ou RPC quebra build, nao producao. Bug de UI quebra E2E em CI, nao no dia da reuniao.
- **Bloqueio em main**: arquivos em `supabase/tests/rls/` precisam passar antes de qualquer merge para `main` que toque RLS. Wave 1.2a e a primeira a usar essa regra.
