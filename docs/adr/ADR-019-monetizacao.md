# ADR-019 — Modelo de monetizacao MVP

- **Status:** Aceita
- **Data:** 2026-05-02
- **Categoria:** Comercial / Estrategica

## Contexto

Sessao 8 marca a transicao de piloto interno para produto vendido. Meta:
R\$ 20k/mes de receita pessoal. Decisao de pricing afeta tipo de cliente
viavel, churn, cap maximo de revenue por hora de Tassio investida.

## Alternativas

### A) SaaS por organizacao, flat (escolhida no MVP)

R\$ 199/mes por org com volume ilimitado em homologacao + 200 NF-e/mes
em prod. Acima do limite, R\$ 0,20 por NF-e excedente.

### B) SaaS por NF-e

R\$ 0,50 por NF-e em prod, sem mensalidade. Linear com uso.

### C) Plano enterprise (≥ R\$ 999/mes)

Multi-branch, governanca, SLA, integracao com ERP. Para 20-40 contas
ja chegamos a meta.

## Decisao

**MVP: A) flat por org + tier B na faixa enterprise.**

Razao: para chegar a R\$ 20k/mes precisamos de:

- **Plano A**: ~100 orgs ativas. Improvavel em 6 meses sem CAC alto.
- **Plano C**: 20-40 orgs ativas. Mais alcancavel via venda consultiva.

Combinamos: lancar Plano Pequena (R\$ 199) para captura digital +
Plano Empresa (R\$ 999) para venda consultiva. Validacao primeiro
cliente externo numa conta Pequena.

## Tabela inicial

| Plano    | R\$/mes | NF-e prod incluidas | NF-e excedente | Filiais | Suporte    |
|----------|---------|---------------------|----------------|---------|------------|
| Pequena  | 199     | 200                 | R\$ 0,20       | 2       | Email 24h  |
| Empresa  | 999     | Ilimitado*          | —              | 20      | WhatsApp   |
| OnPrem   | sob med | Ilimitado           | —              | ∞       | dedicado   |

\* Fair use: ate 5000/mes; alem disso, nova negociacao.

## Cobranca

- **Inter Bank API** (jah temos relacionamento). Boleto recorrente +
  PIX manual no MVP.
- **Stripe / cartao recorrente**: Wave 2.1, depois de validar primeiro
  cliente real.

## Trial

- 14 dias gratis em homologacao (cap 50 NF-e).
- Sem cartao a pedir.
- Apos o trial: org desativada por 7 dias, depois soft-deleted.

## Risco principal

Vender com alta friccao (Tassio em cada onboarding) queima reputacao.
Se ao chegar nesta wave o self-service nao estiver pronto, **pausar
comercializacao** ate Wave 2.0a (self-service refinado).
