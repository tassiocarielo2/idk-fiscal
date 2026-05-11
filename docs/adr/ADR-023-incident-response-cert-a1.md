# ADR-023 — Resposta a incidente: certificado A1 comprometido

- **Status:** Aceita
- **Data:** 2026-05-11
- **Categoria:** Operacional / Segurança

## Contexto

O certificado A1 é a chave criptográfica que autoriza emissão de NF-e em nome do contribuinte. Vazamento permite a terceiros emitir notas (gerar passivo fiscal), assinar eventos (cancelamentos, CC-e) e consultar dados na SEFAZ. ADR-013 escolheu Supabase Vault como custódia no MVP — adequado para piloto interno, mas a primeira vez que isso ficar diante de um cliente externo o procedimento de resposta a incidente precisa estar escrito antes, não depois.

Cenários de comprometimento que o procedimento cobre:

1. **Vazamento direto**: arquivo `.pfx` ou senha exposto (chat, screenshot, log, repositório, e-mail).
2. **Comprometimento da infra**: acesso indevido ao Supabase (service_role vazado, conta admin invadida) → atacante extrai segredos da Vault.
3. **Comprometimento do tenant**: invasão de conta do cliente com role `owner`/`admin` que tem permissão de download/uso do cert.
4. **Suspeita de uso indevido**: emissão de NF-e que o cliente nega ter autorizado.

## Decisão

Procedimento de 5 fases. Toda a operação fica registrada em `audit_log` (org + actor + action + context).

### Fase 1 — Contenção (≤ 15 min do alerta)

1. **Desabilitar o certificado no sistema**: `UPDATE certificates_metadata SET status='revoked', revoke_reason='incident', revoked_at=now() WHERE id = :cert_id`. Nenhuma rota de emissão deve aceitar `revoked`.
2. **Bloquear emissões em curso**: identificar `nfe_documents` com `status='pendente'` para a org/branch afetada e marcar `status='rejeitada'` com `motivo_rejeicao='incident_freeze'`.
3. **Revogar tokens de admin** suspeitos via `supabase.auth.admin.signOut()` para todas as sessões da org afetada.
4. **Apagar o segredo da Vault**: `select vault.delete_secret(:vault_secret_ref)`. A senha precisa sumir antes da rotação do `.pfx` — atacante com senha + cópia local ainda emite até o cert ser revogado na AC.

### Fase 2 — Revogação na AC (≤ 4h em horário comercial)

1. **Notificar o cliente** (e-mail + telefone) com instrução de revogar o A1 imediatamente na Autoridade Certificadora emissora (Serasa, Certisign, Soluti, etc). A revogação é responsabilidade do titular do certificado, não nossa — temos só uma cópia da chave; o vínculo CNPJ↔cert vive na AC.
2. **Solicitar comprovante de revogação** (CRL / OCSP atualizado mostrando o serial revogado).
3. **Anotar `revoke_proof_url`** em `certificates_metadata` (campo a adicionar em wave futura — por enquanto fica em `revoke_reason` como texto livre).

### Fase 3 — Avaliação de uso indevido (em paralelo à Fase 2)

1. **Consultar SEFAZ DistDFe** (ou portal estadual quando DistDFe ainda não estiver implementado) por NF-e emitidas com o CNPJ no período suspeito.
2. Marcar como `investigacao` cada NF-e que **não** está em `nfe_documents` do nosso banco mas aparece na SEFAZ — é emissão por terceiro.
3. Para cada emissão fraudulenta: protocolar **cancelamento dentro do prazo** (24h após autorização) ou **denúncia espontânea + ajuste fiscal** quando passar do prazo. Esse passo é executado pelo cliente com o contador dele; nosso papel é fornecer a lista de chaves suspeitas.

### Fase 4 — Reposição (1–7 dias)

1. Cliente emite novo A1 na AC.
2. Upload via fluxo normal de `/admin/certificates` cria nova linha em `certificates_metadata` com novo `thumbprint_sha256` (não reutiliza id — auditoria fica limpa).
3. Validação dupla (CNPJ titular do PFX == CNPJ da matriz/filial) é re-aplicada na ingestão.

### Fase 5 — Post-mortem (≤ 7 dias após contenção)

1. Documento em `docs/incidents/AAAA-MM-DD-<short>.md` (template a criar): linha do tempo, causa raiz, impacto financeiro/reputacional, ações corretivas com prazo.
2. Se causa raiz é falha do produto (ex.: senha logada acidentalmente, RLS bypass, vazamento por bug): abre ADR ou patch correspondente.
3. Se causa raiz é do cliente (senha compartilhada, phishing): documentar para o playbook e reforçar onboarding.

## Anti-padrões explicitamente proibidos

- **Não enviar a senha de cert por e-mail/WhatsApp.** Mesmo durante incidente: upload pelo cliente direto na UI sob HTTPS.
- **Não restaurar backup que contenha o segredo comprometido.** Após apagar da Vault, qualquer backup anterior à revogação é tóxico para o `vault_secret_ref` antigo.
- **Não usar `--no-verify` para empurrar correções emergenciais** sem revisão. Pressão de incidente é justamente quando regression test salva — manter `quality.yml` e `e2e.yml` bloqueantes.

## Consequências

**Ganhos**
- Procedimento existe antes do primeiro cliente externo (gatilho do ADR-013).
- Lista clara de "primeiros 15 minutos" reduz tempo de resposta.
- Auditoria por design — toda ação no procedimento já tem ponto de log existente.

**Trade-offs aceitos**
- A Fase 3 ainda é manual hoje (sem DistDFe não conseguimos consultar SEFAZ programaticamente). Vira automática quando captura DistDFe entrar.
- Sem SLA contratual de tempo de resposta no MVP (ADR-021). Suporte WhatsApp 8h úteis (plano Empresa) significa que incidente fora de horário pode levar mais que 15 min para chegar até o operador.
- O `revoke_proof_url` ficou pendente — não bloqueia procedimento (campo livre em `revoke_reason` resolve), mas seria limpo adicionar em wave futura.

**Próximos gatilhos**
- Primeiro cliente externo pagante: revisar com advogado, decidir sobre seguro RC, e potencialmente externalizar Fase 3 (DistDFe) para automação.
- Volume > 5 incidentes/ano: avaliar contratar L1 de suporte 24×7 (ADR-021 reabre).
