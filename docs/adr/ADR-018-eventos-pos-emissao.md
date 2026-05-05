# ADR-018 — Eventos pos-emissao (cancelamento, CC-e, inutilizacao)

- **Status:** Aceita
- **Data:** 2026-05-02
- **Categoria:** Tecnica / Compliance

## Contexto

Wave 1.4 adiciona suporte a:

- **Cancelamento (110111)**: ate 24h apos autorizacao no ES.
- **Carta de Correcao Eletronica (110110)**: ate 30 dias apos autorizacao.
- **Inutilizacao de numeracao**: faixa nNF que nunca chegou a virar nota
  (ex: numero perdido por falha de transmissao).

Cada evento gera XML proprio, e assinado, transmitido a SEFAZ-ES e
persistido em `nfe_events` (append-only).

## Decisao

### Janelas

- Cancelamento: **bloqueado** apos 24h (validacao no UI + RPC).
- CC-e: **bloqueado** apos 30 dias.
- Inutilizacao: aplicavel apenas a numeros nunca usados (sem entrada em
  `nfe_documents`).

Janelas codificadas em `src/lib/nfe/events/window.ts`.

### Modelo

Cada evento = nova linha em `nfe_events` com:

- `tipo_evento`: codigo SEFAZ ('110110', '110111', '110112').
- `numero_sequencial`: SEFAZ exige incrementar a cada novo evento do
  mesmo tipo na mesma chave. Comeca em 1.
- `status`: pendente -> homologado / rejeitado.
- `xml_path`: XML do evento em `nfe/<org>/<branch>/<chave>-evt-<tipo>-<seq>.xml`.

### Idempotencia

Re-tentativas com mesma `(chave, tipo, seq)` bloqueadas por UNIQUE.
Caller incrementa `seq` para tentar de novo apos rejeicao.

### Estado-maquina pos-evento

- Cancelamento homologado (cStat 135 ou 155) → atualiza
  `nfe_documents.status = 'cancelada'`.
- CC-e homologada → mantem status `autorizada`, soma 1 evento.
- Inutilizacao homologada → cria entrada em `nfe_documents` com status
  `inutilizada` (nao tem chave valida).

## Riscos

- **Cancelar nota emitida para cliente em prod = problema fiscal**.
  Owner/admin only via UI com double-confirm + justificativa
  ≥ 15 caracteres.
- **CC-e nao corrige tudo**: por lei, CC-e nao serve para alterar valores,
  CFOP, NCM, dados do remetente/destinatario. UI bloqueia campos invalidos.
- **Re-tentar cancelamento apos 24h e impossivel**. Operador precisa
  emitir nota de devolucao em vez disso. UI direciona pra esse fluxo.
