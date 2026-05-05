# ADR-020 — LGPD e tratamento de dados de cliente externo

- **Status:** Aceita
- **Data:** 2026-05-02
- **Categoria:** Compliance / Juridica

## Contexto

Onboarding de cliente externo aciona obrigacoes LGPD inexistentes no
piloto interno:

- NF-e contem dados pessoais (CPF do destinatario PF, email, telefone).
- Cert A1 e a chave da identidade fiscal do cliente — vazamento e
  catastrofico.
- Logs de uso (cert.password.read, sign.nfe) tem dados pessoais.

## Decisao

### Termos publicados antes do primeiro cliente

1. **Termo de Uso** (`/legal/termos`):
   - Limitacao de responsabilidade por erros de SEFAZ.
   - Janela de SLA: 24h uteis email, sem SLA de uptime no v1.
   - Direito de rescisao livre com export de dados em 30 dias.

2. **Politica de Privacidade** (`/legal/privacidade`):
   - Listagem dos dados coletados e finalidade.
   - Retencao: dados fiscais 5 anos (exigencia legal); telemetria 6 meses.
   - DPO: Tassio como inicial; substituir quando volume justificar
     contratar advogado externo.
   - Direitos LGPD: acesso, retificacao, exclusao via email.

3. **DPA — Data Processing Agreement** (`/legal/dpa.pdf`):
   - Padrao para clientes B2B exigentes.
   - Lista de sub-processadores: Supabase (DB+Auth+Storage+Vault), Vercel
     (hosting), SEFAZ (transmissao). Atualizado por changelog.

### Tecnico

- **Logs**: nao loggar dados pessoais alem do estritamente necessario
  (org_id, branch_id, user_id sao OK; CPF/email do destinatario nao).
- **Export de dados**: rota `/api/data-export` (Wave 2.1) gera ZIP com
  XMLs + DANFE + tabela CSV em response signed URL TTL 24h.
- **Soft delete em cascata**: ao soft-deletar uma org, anonimizar logs
  apos 5 anos (cron job dedicado, Wave 2.1).

### Custodia A1

- Reforco: Vault Supabase no MVP (ADR-013). Migracao para KMS dedicado
  ao primeiro cliente externo pagante (ADR-013 trigger).
- Cliente assina aditivo no DPA reconhecendo Vault Supabase como
  caixa-forte.

## Riscos

- Vazamento de A1 = expulsao de cliente + processo judicial. Mitigamos
  com Vault + RLS + log append-only + admin auditavel.
- Cobertura de seguro civil: avaliar com corretor (TODO antes de
  primeiro cliente externo).

## Pendencias antes de primeiro cliente

1. Termos publicados em produção.
2. DPA padrao revisado por advogado.
3. Pagina /legal/privacidade publicada.
4. Cliente assina termos no signup (checkbox bloqueante).
5. Corretora confirma se seguro RC profissional cobre.
