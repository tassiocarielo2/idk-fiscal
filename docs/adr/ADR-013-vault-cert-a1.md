# ADR-013 — Custodia da senha do certificado A1

- **Status:** Aceita
- **Data:** 2026-05-02
- **Categoria:** Tecnica / Seguranca

## Contexto

Certificado A1 e um par chave/cert + senha. Para emitir NF-e e similares, o backend precisa decifrar o certificado em memoria com a senha. Onde guardamos a senha?

Restricoes:

- A senha **nao pode** estar em texto claro em log, banco aberto, env var compartilhada ou no client.
- A operacao de decifrar acontece em rotas server-side curtas (job worker e route handlers que chamam SEFAZ).
- MVP precisa funcionar com pequena base de clientes; primeiro cliente pagante externo dispara compliance review formal.

## Alternativas consideradas

1. **Supabase Vault** (extensao `supabase_vault`, ja instalada). Armazena segredos cifrados com chave master gerenciada pela plataforma; acesso via SQL com SECURITY DEFINER. Boa integracao com nosso stack. Nao e KMS HSM-grade.
2. **AWS KMS / HashiCorp Vault**. Padrao de mercado, mas exige infra extra, custo recorrente e mais um vetor de operacao. Faz sentido quando o volume justifica.
3. **Browser-only com WebCrypto** (cliente decripta). Quebra: precisamos assinar XML server-side para enviar a SEFAZ.
4. **Senha derivada de master password do tenant**. Aumenta risco (se master vaza, tudo vaza). Rejeitado.

## Decisao

**MVP: Supabase Vault.** Cada certificado tem `vault_secret_ref` em `certificates_metadata` apontando para o segredo no schema `vault`. Apenas service_role descifra no servidor; nunca cliente, nunca log.

**Trigger para troca: primeiro cliente externo pagante.** Quando assinarmos contrato com cliente que nao seja a IDK Engenharia, migramos para KMS externo (provavelmente AWS KMS via FDW ou edge function dedicada). A migracao envolve re-cifrar segredos com nova chave; planejada em wave dedicada quando o trigger acontecer.

## Consequencias

- **Wave 1.2a nao implementa custodia.** Coluna `vault_secret_ref` ja existe (migration 0001) mas nao e populada ainda. Implementacao real fica em **Wave 1.2b** ou **Wave 1.3** (a definir).
- **Trade-off aceito**: Vault nao e HSM. Para uso interno + pilotos, e suficiente. Para producao com clientes externos pagantes, sera substituido antes do go-live.
- **Auditoria**: toda leitura de senha de certificado deve gerar `audit_log` com `action='cert.password.read'` e `entity_id=certificate.id`. Trigger de auditoria e Wave 1.3.
- **Rotacao**: rotacao da master key da Supabase Vault e responsabilidade da plataforma. Rotacao das senhas dos certificados e responsabilidade do tenant (substituir certificado quando renovar).
