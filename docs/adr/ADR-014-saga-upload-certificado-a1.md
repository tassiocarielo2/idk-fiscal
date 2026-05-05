# ADR-014 — Saga aplicacional para upload de certificado A1

- **Status:** Aceita
- **Data:** 2026-05-02
- **Categoria:** Tecnica / Seguranca
- **Sucessor de:** ADR-013 (decisao de Vault — Modelo 1)

## Contexto

O upload de certificado A1 envolve tres recursos com persistencias diferentes:

1. **Supabase Vault** (schema `vault`): senha em texto claro guardada cifrada com master key da plataforma.
2. **Supabase Storage** (bucket privado `certificates`): blob `.pfx` em si.
3. **Postgres** (`certificates_metadata`): metadados (CNs, validade, thumbprint, FK org+branch).

Nao ha XA / 2PC entre Vault, Storage e Postgres. Uma transacao SQL nao
cobre operacoes em Storage. Precisamos de uma saga aplicacional com
rollback explicito.

## Alternativas consideradas

1. **Saga 3-fases com rollback explicito** (escolhida).
2. **Postgres-only**: persistir o `.pfx` em `bytea` na tabela. Rejeitado:
   row size > 8KB triggera TOAST out-of-line storage que perde compressao
   util; backup logico fica pesado; revogar = `update` deixa pista no WAL.
3. **Storage-only** com senha embutida via `pkcs12.create` re-cifrado:
   complexo demais; perde dedup natural por thumbprint; perde isolamento
   da senha em Vault.

## Decisao

Saga em 3 fases com rollback explicito a cada falha:

```
1. Validar PFX em memoria com node-forge:
   - Tenta abrir com a senha → erro fatal se falha.
   - Extrai cert + chave + extrai metadados (CNs, validade, thumbprint).
   - Verifica CNPJ no Subject → warning se mismatch (ICP-Brasil tem PF).
2. Inserir em certificates_metadata (status='active', vault_secret_ref=NULL).
   - Dedup por (organization_id, thumbprint_sha256) via UNIQUE INDEX.
   - Em conflito → 409 ao caller, sem efeito colateral.
3. Upload do .pfx para Storage path "org_<id>/branch_<id>/<cert_id>.pfx".
   - Em falha → DELETE certificates_metadata, retorna erro. Vault ainda nao foi tocado.
4. set_certificate_password(cert_id, senha) cria secret no Vault e atualiza vault_secret_ref.
   - Em falha → DELETE storage object, DELETE certificates_metadata, retorna erro.
5. INSERT em certificate_usage_log action='upload' (best-effort).
```

A ordem `metadata → storage → vault` minimiza vetor de leak: Vault so
recebe a senha apos o blob estar persistido; metadata so vira "completo"
(vault_secret_ref non-null) na ultima fase.

## Consequencias

- **Nao-transacional, mas dedup mitiga reentrada**. Se a saga abortar
  entre fase 2 e 3, fica uma row "orfa" em metadata sem storage. Mitigamos
  com cleanup explicito no catch e com idempotencia: re-upload do mesmo
  thumbprint volta 409, nao duplica.
- **Auditoria completa**: cada operacao loga em `certificate_usage_log`.
- **Revogacao apaga Vault + zera vault_secret_ref**. Storage fica para
  retencao legal (30 dias minimo na pratica fiscal).
- **service_role only para fases 3 e 4**. Cliente nao toca Vault nem
  Storage de cert diretamente.

## Implementacao concreta

- Migrations 0006 (vault wrappers + RPCs), 0008 (storage bucket + RLS).
- Route handler `/api/certificates/upload` com `runtime = 'nodejs'`
  (node-forge precisa de Node, nao Edge).
- Parser em `src/lib/certificates/parser.ts`.

## Riscos residuais

- Race entre dois uploads simultaneos do mesmo PFX → dedup UNIQUE
  resolve.
- Falha apos fase 3 antes da 4 → metadata + blob existem mas sem senha.
  Operador ve `vault_secret_ref IS NULL` no admin e pode re-tentar fase 4
  manualmente OU revogar e re-subir.
- Vault.create_secret nao e idempotente por padrao → usamos secret_name
  com `cert.a1.<cert_id>` para garantir 1 secret por cert.
