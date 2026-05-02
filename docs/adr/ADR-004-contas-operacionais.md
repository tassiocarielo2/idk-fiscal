# ADR-004 — Contas operacionais (Notion, GitHub, Vercel, Supabase) em conta pessoal de Tássio

- **Status:** Aceita
- **Data:** 2026-04-30
- **Categoria:** Operacional
- **Autores:** Tássio Carielo, Claude (Sessão 1)

---

## Contexto

Necessário decidir onde hospedar Notion, GitHub, Vercel, Supabase, Drive iniciais.

Tássio tem benefícios pessoais relevantes obtidos via Mensa Brasil, que oferece descontos em ferramentas de produtividade para membros:

- **Notion Plus** ativo no workspace pessoal "My Space".
- **GitHub Pro** ativo na conta pessoal `tassiocarielo2`.

Vercel e Supabase têm planos pessoais gratuitos suficientes para o estágio inicial.

A escolha é: usar contas pessoais existentes (com benefícios já ativos) ou criar contas novas vinculadas à IDK Engenharia desde o início.

---

## Alternativas consideradas

1. **Notion no workspace "IDK Engenharia" separado.** Rejeitado. Tássio já tem Plus via Mensa em "My Space". Criar conta paga adicional sem ganho operacional não faz sentido.
2. **GitHub com organização própria `idk-engenharia`.** Considerado, mas adiado. Cria fricção de gerenciamento (convites, billing, permissões) sem ganho imediato. Repositório individual em conta pessoal Pro funciona idêntico até o produto ter equipe.
3. **Migrar tudo para contas IDK desde já.** Prematuro. Custo de tempo agora sem ganho proporcional.
4. **Usar contas Cermont.** Inviável. Contaminação de IP e de objeto social.

---

## Decisão

Usar **contas pessoais existentes do Tássio** nas plataformas:

- **Notion:** workspace "My Space" (Plus via Mensa).
- **GitHub:** conta pessoal `tassiocarielo2` (Pro via Mensa).
- **Vercel:** conta pessoal.
- **Supabase:** conta pessoal.

A migração para contas específicas IDK Engenharia será feita quando o produto crescer — estimativa: a partir do momento em que o produto tiver equipe formada (segundo desenvolvedor além de Claude/Tássio) ou faturamento mensal recorrente que justifique o overhead administrativo.

---

## Consequências

**Aceitas:**

- Quando crescer e precisar migrar, há custo de transferência:
  - **GitHub:** transferência de repositório é um clique, mantendo histórico, issues e stars. Baixo custo.
  - **Notion:** pode-se duplicar workspace ou exportar e reimportar. Médio custo.
  - **Vercel:** projetos podem ser transferidos para nova organização. Baixo custo.
  - **Supabase:** transferência de projeto entre organizações é suportada nativamente. Baixo custo.
- Conta pessoal de Tássio acumula propriedade intelectual de produto que pertence à IDK Engenharia. Mistura jurídica que precisa ser endereçada quando relevante.
- Risco de acesso: se algo acontecer com as credenciais pessoais de Tássio, o projeto fica vulnerável.

**Mitigações:**

- **2FA ativada imediatamente** em GitHub, Notion, Vercel, Supabase, Google. Sem exceção. Códigos de recovery salvos em gerenciador de senhas.
- **Documentar lista de contas e acessos** em ADR futura sobre "Gestão de acessos" (a criar antes da Sessão 3).
- **Quando migrar:** transferir ownership formal de repositórios e projetos para conta IDK; documentar em ADR de migração; e formalizar transferência de IP da pessoa física para IDK Engenharia via instrumento contratual simples (cessão de direitos autorais sobre o software).

**Ganhos:**

- Custo zero adicional para começar.
- Aproveitamento dos benefícios Mensa já pagos.
- Velocidade máxima para destravar Sessão 1 e seguintes.
