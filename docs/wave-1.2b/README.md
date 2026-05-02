# Wave 1.2b — Certificado A1

Conteúdo entregue: ver ADR-014. Esta pasta contém artefatos auxiliares.

## `rls-tests.yml`

Workflow CI proposto. Não foi colocado em `.github/workflows/` no commit
porque o `GITHUB_TOKEN` usado para o push não tem o scope `workflow`.

**Para ativar**: copiar `docs/wave-1.2b/rls-tests.yml` para
`.github/workflows/rls-tests.yml` num próximo commit feito com token que
tenha o scope `workflow` (ou via UI do GitHub).

## Verificação manual local

```bash
# Aplicar migrations em ordem
for f in supabase/migrations/*.sql; do psql -f "$f"; done

# Rodar pgTAP
psql -f supabase/tests/rls/03_certificates.sql
```
