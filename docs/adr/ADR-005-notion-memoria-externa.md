# ADR-005 — Notion como memória externa; Carta do Tássio fica nas conversas com Claude

- **Status:** Aceita
- **Data:** 2026-04-30
- **Categoria:** Operacional
- **Autores:** Tássio Carielo, Claude (Sessão 1)

---

## Contexto

Claude (assistente de IA da Anthropic) não persiste estado entre sessões. Algumas memórias auto-derivadas existem no sistema da Anthropic, mas são resumos parciais — não substituem documentação estruturada de decisões, estado de tarefas, histórico comercial e plano de próximas sessões.

Necessário um mecanismo externo confiável para preservar o contexto crítico do projeto entre sessões e ao longo do tempo. O mecanismo precisa atender a três requisitos:

1. **Recuperável.** Tássio (ou outra pessoa) precisa poder reconstruir o estado do projeto a qualquer momento sem depender da memória do Claude.
2. **Estruturado.** Decisões, tarefas e pipeline precisam ser navegáveis por filtros e visualizações, não apenas texto corrido.
3. **De baixa fricção.** Manutenção semanal precisa ser leve para não virar dívida operacional.

---

## Alternativas consideradas

1. **Workspace Notion compartilhado entre Tássio e Claude diretamente.** Inviável. Claude não tem login Notion próprio. O acesso ao Notion acontece via conector MCP, que opera com credenciais do Tássio.
2. **Apenas chat conversacional sem persistência externa.** Rejeitado. Cada nova sessão começaria do zero, perda de contexto sistemática, retrabalho cumulativo.
3. **Memória do Claude (sistema interno) como única fonte.** Insuficiente. As memórias são resumos não estruturados, não substituem documentação de decisões com racional explícito e estado de tarefas com prioridades.
4. **Google Docs único.** Viável, mas inferior. A estrutura de databases do Notion oferece query, filtros e views que Docs não dão. Tracking de status de tarefas em Doc seria caótico.
5. **Trello, Linear, Asana, ClickUp.** Viáveis para tarefas, mas exigiriam integração separada para documentos longos (ADRs, decisões). Notion concentra os dois.

---

## Decisão

**Notion serve como memória externa estruturada do projeto.** Estrutura adotada:

- **Página-mãe** "🧭 IDK Fiscal — Comando Central" — visão, posicionamento, meta, status da semana, convenções.
- **Cinco databases como sub-páginas:**
  - 📓 **Sessões** — registro de cada sessão de trabalho.
  - 🏛️ **Decisões e ADRs** — espelho operacional das ADRs deste repositório.
  - ✅ **Backlog Priorizado** — tarefas com prioridade e status.
  - 🤝 **Pipeline Comercial** — leads, pilotos, clientes.
  - 📝 **Conteúdo** — calendário editorial e tracking de performance.

**Carta do Tássio pro Claude vive nas conversas com Claude diretamente, sem página dedicada.**

No início de cada sessão, Tássio cola um bloco curto com contexto e atualizações do mundo real desde a última sessão. Esse bloco é registrado no campo "Contexto/atualizações" do registro da sessão correspondente no Database de Sessões — funciona como log histórico permanente.

**Cada sessão termina obrigatoriamente com:**

1. Atualização do registro da sessão no Notion (entregas, decisões tomadas, bloqueios encontrados, próximos passos).
2. Geração do prompt de abertura completo da próxima sessão, salvo no campo correspondente no registro da sessão atual.

**Fonte canônica em caso de divergência:**

- **ADRs:** o repositório git (`docs/adr/`) vence. Notion é espelho operacional.
- **Tarefas:** Notion vence. ADRs registram apenas decisões estruturais, não tarefas operacionais.
- **Estado de cliente/pipeline:** Notion vence. Repositório não armazena dados comerciais.

---

## Consequências

**Aceitas:**

- Tássio precisa abrir o Notion no início de cada sessão e copiar o bloco de contexto/atualizações para colar no Claude. Custo: aproximadamente 30 segundos por sessão.
- Manutenção do Notion exige disciplina semanal mínima: atualizar status da semana, mover tarefas concluídas, registrar decisões novas.
- Risco de o Notion virar depósito morto se Tássio parar de manter. Mitigação: Claude propõe atualizações ao final de cada sessão e nunca aceita encerrar uma sessão sem ter feito as atualizações.

**Ganhos:**

- Estado completo do projeto recuperável por Tássio ou outra pessoa a qualquer momento.
- Histórico de decisões e racional preservado em ADRs (versão canônica em git, não se perde com troca de modelo Claude ou mudança de produto Anthropic).
- Filtros e views do Notion dão overview operacional sem precisar abrir Claude.
- Separação clara de responsabilidades entre repositório (técnico, versionado) e Notion (operacional, vivo).
