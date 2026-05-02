# ADR-014 — Implementação Certificado A1 (Wave 1.2b)

- Status: Aceita
- Data: 2026-05-02
- Contexto: Wave 1.2b. Pré-requisito Wave 1.3 (NF-e).
- ADRs relacionadas: ADR-009 (multi-tenant + RLS), ADR-013 (Vault para A1).

## Contexto

Wave 1.2a entregou o esqueleto multi-CNPJ (filiais, branch-scoped membership,
convites). Para emitir NF-e precisamos do certificado A1 (ICP-Brasil) por filial.

A ADR-013 já decidiu que a senha do `.pfx` vai no Supabase Vault e o blob no
Storage privado. Esta ADR registra **como** implementamos: dedup, validação,
saga, RPCs de leitura/revogação, e log append-only de uso.

## Decisão

### Modelo de dados

- **Estendemos** `public.certificates_metadata` (criada na 0001) ao invés de
  criar tabela paralela. Adicionamos: `branch_id`, `purpose`,
  `subject_cn`, `issuer_cn`, `signature_algorithm`, `superseded_at/by`,
  `revoked_at/by/reason`, `storage_bucket`.
- Enum `certificate_status` ganha valor `superseded`.
- Novo enum `certificate_purpose` (`nfe|ecnpj|ecpf|outro`).
- Nova tabela `certificate_usage_log` append-only (UPDATE/DELETE bloqueados
  por trigger BEFORE).

### Dedup por thumbprint

`UNIQUE (organization_id, thumbprint_sha256)`. Permite que duas orgs
distintas (raro, mas válido) cadastrem o mesmo cert. SHA-256 mantido (mais
forte que SHA-1 da MSG original).

### Validação dupla no upload

1. **Estrutural**: `forge.pkcs12.pkcs12FromAsn1` parseia o PKCS#12.
2. **Senha**: erro do node-forge contém `MAC|password|invalid` →
   `wrong_password`. Erro estrutural sem essa marca → `invalid_pfx`.
3. **Sanity**: rejeitar `md5*` ou `sha1With*` como `weak_signature`. Rejeitar
   expirado a menos que `allow_expired=true` (uso de teste).
4. **CNPJ mismatch**: warning, não bloqueia (alguns A1 ICP-Brasil têm CN com
   nome de pessoa física, não da empresa).

### Saga aplicacional Vault → Storage → metadata

Postgres + Vault + Storage não são transacionais entre si. Para evitar lixo
em caso de falha parcial:

1. `vault_create_secret` (RPC SECURITY DEFINER, gate por service_role JWT).
2. Storage upload com `upsert=false`. Se falhar → rollback Vault.
3. INSERT em `certificates_metadata`. Se falhar → rollback Vault + Storage.

A senha do `.pfx` é zerada no buffer (`buffer.fill(0)`) em todos os caminhos
(sucesso, erro, finally).

### RPCs SECURITY DEFINER

- `get_certificate_for_signing(cert_id, purpose_text)`: gate por
  `is_org_member(org)` + status `active` + `valid_until > now()`. Lê senha
  de `vault.decrypted_secrets`. Append em `certificate_usage_log`. Retorna
  `(storage_path, storage_bucket, vault_password, serial_number, subject_cn,
  valid_until)`.
- `revoke_certificate(cert_id, reason)`: gate por
  `has_org_role(org, ['owner','admin'])`. UPDATE para
  `status='revoked' + revoked_at/by/reason`.

Não criamos `is_org_admin_or_owner` como wrapper — usamos `has_org_role`
diretamente, que é o canon do projeto desde 0001.

### Storage

- Bucket privado `certificates`, 5MB, mime `application/x-pkcs12`.
- Path obrigatório: `org_<org_uuid>/branch_<branch_uuid>/<cert_uuid>.pfx`.
- Helper imutável `cert_path_org_id(text)` extrai org via regex.
- Policy SELECT em `storage.objects` filtra por `is_org_member(cert_path_org_id)`.
- Policies INSERT/UPDATE/DELETE bloqueadas para `authenticated`. Apenas
  `service_role` escreve via wrappers/saga.

### Vault wrappers

`vault_create_secret(secret, name, description)` e
`vault_delete_secret(id)` SECURITY DEFINER, com gate explícito por
`request.jwt.claims->role = 'service_role'`. EXECUTE concedido apenas a
`service_role`. Não expomos `schema vault` em route handlers.

### create_organization_with_owner estendido

A RPC original retornava `uuid` (org_id). Agora retorna `(organization_id,
branch_id)` e cria a branch HQ + membership owner em uma chamada.
Caller único atualizado: `src/server/organizations/create-organization.ts`.

## Consequências

### Positivas

- Toda informação sensível do A1 está em Vault/Storage privados.
- Auditoria completa via `certificate_usage_log` append-only.
- Dedup por `(org, thumbprint)` previne reupload acidental e identifica
  certs duplicados em forks/cópias entre orgs.
- Saga garante consistência eventual mesmo sem transação distribuída.

### Negativas / trade-offs aceitos

- **Não-transacional Vault↔Storage↔Postgres**: mitigado por saga e dedup.
  Cenário de falha extrema (ex.: rollback de metadata após Vault+Storage
  com falha de rede no rollback) deixa um secret + blob órfãos no Vault e
  Storage, sem entry em metadata. Rotina de limpeza fica como dívida (não
  bloqueia Wave 1.2b — risco baixo, e dedup por thumbprint impede
  reentrada).
- **Senha em memória durante upload**: minimizado por `buffer.fill(0)` no
  finally, mas não é zero-knowledge — o route handler precisa decifrar
  o PFX para validar.
- **CNPJ mismatch como warning**: aceita o risco de subir A1 com CN de
  pessoa física para uma branch CNPJ — necessário para A1 e-CPF do
  responsável legal.

## Alternativas consideradas

- **Tabela paralela** ao invés de estender `certificates_metadata`: rejeitada
  para evitar fork de dados. A 0001 já tinha as colunas centrais corretas.
- **`is_org_admin_or_owner` como helper novo**: rejeitada — `has_org_role`
  já cobre, criar duplicata seria ruído.
- **Deletar a UNIQUE global em thumbprint**: feito. UNIQUE virou
  `(org, thumbprint)` para acomodar caso de duas orgs distintas com mesmo
  cert (edge case mas válido).

## Referências

- MSG-w12b5301 (Inbox) — pedido original.
- MSG-w12b5302 (Inbox) — desbloqueio com autonomia expandida (autoriza as
  adaptações ao schema real registradas aqui).
- OUT-w12b5301 (Outbox) — relatório de divergências que motivou a w12b5302.
- ADR-013 — Vault A1 (decisão arquitetural superior).
