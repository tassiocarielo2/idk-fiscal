# Architecture Decision Records (ADRs)

Este diretório contém as decisões estruturais do projeto IDK Fiscal documentadas em formato ADR. Cada decisão importante (técnica, comercial, legal, de marca ou operacional) que tem impacto não-trivial e custo de reversão fica aqui.

---

## Por que ADRs

Decisões estruturais ficam em arquivos versionados em git para que:

1. **O racional não se perca.** Daqui a seis meses, quando precisarmos voltar e lembrar **por que** algo foi decidido daquele jeito, o contexto está aqui.
2. **A evolução fique visível.** Decisões mudam — uma ADR substituída fica no repositório com status atualizado, mostrando a história.
3. **Onboarding seja barato.** Quem entrar no projeto depois lê ADRs em ordem e entende rapidamente onde estamos e por quê.

---

## Formato

Cada ADR tem nome no padrão:

```
ADR-NNN-titulo-curto-em-kebab-case.md
```

Estrutura interna:

- **Título e código** (ADR-NNN)
- **Status** — Proposta, Aceita, Substituída, Rejeitada
- **Data**
- **Categoria** — Produto, Técnica, Comercial, Legal, Marca, Operacional
- **Contexto** — qual problema motivou a decisão
- **Alternativas consideradas**
- **Decisão**
- **Consequências** — trade-offs aceitos, mitigações, ganhos

---

## Índice

| Código | Título | Categoria | Status |
|---|---|---|---|
| [ADR-001](./ADR-001-codinome-operacional.md) | Codinome operacional provisório: IDK Fiscal | Marca | Aceita |
| [ADR-002](./ADR-002-entidade-detentora.md) | IDK Engenharia Ltda como entidade detentora | Legal | Aceita |
| [ADR-003](./ADR-003-estrategia-comercial.md) | Estratégia comercial: marketing digital + pilotos próprios + rede | Comercial | Aceita |
| [ADR-004](./ADR-004-contas-operacionais.md) | Contas operacionais em conta pessoal de Tássio | Operacional | Aceita |
| [ADR-005](./ADR-005-notion-memoria-externa.md) | Notion como memória externa; Carta nas conversas | Operacional | Aceita |

---

## Espelhamento com Notion

As ADRs deste diretório são **a fonte canônica**. O Notion contém um database "🏛️ Decisões e ADRs" que espelha estas decisões para consulta rápida com filtros e views — em caso de divergência, o repositório vence.

ADRs novas são criadas primeiro aqui (versionadas em git) e depois replicadas para o Notion no encerramento de cada sessão.
