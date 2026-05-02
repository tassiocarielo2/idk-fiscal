# infra/

Infraestrutura como código.

A criar conforme as sessões avançam:

- `supabase/` — migrações SQL, políticas RLS, seeds, edge functions
- `vercel/` — configurações de deploy (vercel.json, env vars de referência)

Vazio por enquanto — esta pasta existe pra fixar a estrutura no Git.

## Notas operacionais

- **Migrações Supabase** seguem ordem cronológica: `YYYYMMDDHHMMSS_descricao_em_kebab.sql`
- **RLS** é obrigatório em todas as tabelas com dados de cliente. Sem exceção.
- **Edge Functions** seguem padrão de naming: `verbo-recurso` (ex: `ingest-nfe`, `classify-ncm`)
