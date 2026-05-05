# ADR-021 — Suporte e SLA v1

- **Status:** Aceita
- **Data:** 2026-05-02
- **Categoria:** Operacional

## Contexto

Cliente externo precisa de canal claro de suporte. Tassio nao escala
indefinidamente — definir limites antes do primeiro cliente.

## Decisao

### Canais

| Plano    | Canal primario                     | Backup       |
|----------|-------------------------------------|--------------|
| Pequena  | Email (suporte@idkfiscal.com.br)    | Slack publico|
| Empresa  | WhatsApp Business (numero dedicado) | Email        |
| OnPrem   | Telefone + slack privado            | Email        |

### Tempo de resposta

- **Pequena**: 24h uteis.
- **Empresa**: 8h uteis (8-18 BR).
- **OnPrem**: 4h uteis.

### SLA de uptime

**Sem SLA contratual no v1.** Politica interna de monitoramento, mas nao
garantimos %. Razao: o ponto de falha critico (SEFAZ) e fora do nosso
controle.

### Escala

Tassio cobre todos os canais ate ~ 5 clientes. Apos o 5o, contratar
suporte L1 em PJ ou estagiario fiscal pra triar. Gatilho explicito.

### Telemetria de suporte

- Toda interacao registrada em Notion database `Suporte` com:
  - Tempo de primeira resposta (TFR).
  - Categoria (bug, duvida fiscal, onboarding, billing, NF-e rejeitada).
  - Resolucao.
- TFR > SLA gera alerta automatico via webhook Slack.

### Auto-atendimento

- FAQ publico em `/help` com casos comuns (NF-e rejeitada por X, como
  emitir CC-e, etc).
- Status page em `/status` (Wave 2.1) com saude SEFAZ + uptime nosso.

## Riscos

- **Suporte fiscal e dificil de delegar**: bug fiscal precisa de Tassio
  ou contador parceiro. Preparar runbook de erros de NF-e por cStat.
- **WhatsApp 24/7** ≠ SLA 24h: deixar claro no termo que mensagem de
  domingo so e respondida na 2a.
