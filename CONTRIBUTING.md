# Contribuindo com o IDK Fiscal

Este projeto é construído em colaboração entre **Tássio Carielo** (humano, sócio da IDK Engenharia) e **Claude** (assistente de IA da Anthropic, via interface web e via Claude Code no VS Code com MCPs de GitHub, Vercel e Supabase). Este documento descreve o fluxo de trabalho.

---

## Divisão de responsabilidades

**Tássio assume:**
- Responsabilidade humana, jurídica e legal pelas decisões.
- Vendas, descoberta de produto e relacionamento com clientes.
- Decisões estratégicas (produto, comercial, contratuais).
- Aprovação de mudanças estruturais (ADRs com status `Aceita`).
- Execução de comandos sensíveis (commits em main, deploys de produção, mudanças em RLS).

**Claude assume:**
- Arquitetura técnica e código.
- Copy de marketing, materiais, documentação.
- Estruturação de decisões em ADRs.
- Análise de dados que Tássio fornecer.
- Rascunhos de comunicações comerciais.
- Manutenção da memória externa do projeto (Notion + ADRs no repo).

---

## Sessões de trabalho

O projeto é construído em **sessões** numeradas e documentadas. Cada sessão:

1. Começa com Tássio colando um prompt de abertura no Claude (web). O prompt traz contexto, foco e atualizações do mundo real desde a última sessão.
2. Progride em blocos de entrega, com confirmação humana antes de mudanças estruturais.
3. Termina com:
   - Atualização do registro da sessão no Notion (entregas, decisões, bloqueios, próximos passos).
   - Geração do prompt de abertura da próxima sessão (também salvo no Notion).
   - Commits dos arquivos produzidos.

A numeração de sessões é incremental e nunca reaproveitada. **Sessão 1** foi a primeira (infraestrutura de continuidade).

---

## Architecture Decision Records (ADRs)

Decisões estruturais ficam em [`docs/adr/`](./docs/adr/) como markdown. Cada ADR tem o formato:

```
ADR-NNN-titulo-curto-em-kebab-case.md
```

Estrutura padrão de cada ADR:

- **Título e código** (ADR-NNN)
- **Status** (Proposta / Aceita / Substituída / Rejeitada)
- **Data**
- **Categoria** (Produto / Técnica / Comercial / Legal / Marca / Operacional)
- **Contexto** — qual problema motivou a decisão
- **Alternativas consideradas**
- **Decisão** — o que foi decidido
- **Consequências** — trade-offs aceitos, mitigações, ganhos

ADRs são **a fonte canônica** das decisões estruturais. O Notion espelha o conteúdo para consulta rápida com filtros, mas em caso de divergência o repositório vence.

ADRs **substituídas** ou **rejeitadas** continuam no repositório com status atualizado — não removemos histórico de decisão.

---

## Fluxo de commits e branches

Por enquanto, com apenas um colaborador humano (Tássio):

- **`main`** é a única branch.
- Commits frequentes, mensagens em português, no formato:
  ```
  tipo(escopo): descrição curta

  Detalhes opcionais em parágrafo.
  ```
  Tipos: `feat`, `fix`, `docs`, `chore`, `refactor`, `infra`, `adr`.
- Exemplos:
  - `docs(adr): adiciona ADR-001 sobre codinome operacional`
  - `feat(captura): adiciona parser inicial de XML NF-e`
  - `chore(infra): configura supabase migrations`

Quando o projeto crescer ou tiver mais colaboradores, migra para PR-driven (a documentar em ADR futura).

---

## Canal de execução do Claude

Claude opera por dois canais complementares:

1. **Claude na web** (interface chat). Responsável por discussão estratégica, redação, ADRs, planejamento. Não executa comandos diretos no repositório.

2. **Claude Code no VS Code** (com MCPs de GitHub, Vercel e Supabase). Responsável por execução: criar arquivos, rodar comandos, abrir PRs, executar migrations, deploys. Recebe prompts gerados pelo Claude web e executa após aprovação humana.

**Regra:** Claude web nunca pede para Tássio fazer manualmente algo que Claude Code pode fazer via MCP. Quando uma ação requer execução, Claude web entrega um **prompt pronto para colar** no Claude Code.

---

## Convenções

- **Idioma operacional:** português (Brasil) em código, comentários, documentação e commits. Termos técnicos (NF-e, NCM, CFOP, RLS, etc.) ficam em sua forma original.
- **Caminhos de arquivos:** kebab-case (`docs/adr/adr-001-codinome.md`).
- **Nomes de tabelas Supabase:** snake_case (`fiscal_documents`, `ncm_classifications`).
- **Nomes de componentes React:** PascalCase (`InvoiceList.tsx`).
- **Variáveis e funções:** camelCase em TS/JS, snake_case em Python e SQL.
- **Constantes:** SCREAMING_SNAKE_CASE.

---

## Segurança

- **Nunca** commitar `.env`, certificados digitais, chaves de API, credenciais de banco.
- `service_role` do Supabase **nunca** vai pro frontend — só em Edge Functions ou route handlers server-side.
- RLS (Row-Level Security) é obrigatória em **todas** as tabelas a partir da Sessão 2.
- Logs nunca registram CNPJ completo de cliente (ofuscar com `XX.XXX.XXX/0001-XX`).
- 2FA ativada em GitHub, Notion, Vercel, Supabase, Google. Sem exceção.

---

## Quando algo está estranho

Se algum padrão deste documento estiver criando fricção, abrir uma ADR propondo mudança em vez de fazer exceção silenciosa. ADRs são feitas pra evoluir.
