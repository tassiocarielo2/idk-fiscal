# ADR-001 — Codinome operacional provisório: IDK Fiscal

- **Status:** Aceita
- **Data:** 2026-04-30
- **Categoria:** Marca
- **Autores:** Tássio Carielo, Claude (Sessão 1)

---

## Contexto

A discussão de naming durante a Sessão 1 explorou oito rodadas de brainstorm com mais de cem candidatos: nomes mitológicos (Argos, Janus, Mnemo), latinos (Veritas, Acumen, Lumen), brasileiros elevados (Capivara, Tucano, Bento, Brasa), neologismos (Welda, Verion, Lumetria), e palavras curtas inglesas (Weld, Ember, Spark). Nenhum candidato convenceu Tássio o suficiente para fechar.

Padrão observado: enquanto o produto ainda é abstrato — sem código, sem cliente, sem demo — qualquer nome parece insuficiente. Os nomes de produto mais memoráveis na história recente do SaaS (Slack, Stripe, Notion) ganharam alma com o uso, não no brainstorm. Tiny Speck virou Slack depois de meses operando com nome interno; Odeo virou Twitter; The Facebook virou Facebook.

Continuar a busca durante a Sessão 1 estava custando tempo significativo sem convergir, e bloqueando entregas de maior valor (estrutura de Notion, repositório, plano de conteúdo, mapeamento de rede).

---

## Alternativas consideradas

1. **Definir nome definitivo durante a Sessão 1.** Tentado. Não convergiu.
2. **Forçar fechamento em algum candidato "menos pior"** (Welda ou Verion eram os mais fortes). Rejeitado: amarrar marca sem convicção cria dívida psicológica que prejudica investimento em copy, domínio e identidade visual.
3. **Pagar consultoria de naming.** Prematuro. A empresa ainda não tem produto nem cliente.
4. **Codinome neutro tipo "Projeto Norte".** Considerado. Inferior a "IDK Fiscal" porque não aproveita a entidade jurídica existente, e cria uma camada extra de tradução mental.

---

## Decisão

Adotar **IDK Fiscal** como codinome operacional provisório.

- **Uso interno:** workspace Notion, repositório GitHub (`idk-fiscal` em kebab-case), comunicações entre Tássio e Claude, prompts de sessão.
- **Não usar em marketing público**, domínio definitivo, identidade visual de produto, ou qualquer ativo que crie fricção para troca futura.
- **Naming definitivo será revisitado quando** pelo menos uma destas condições for verdadeira:
  1. Houver duas ou mais conversas reais com possíveis clientes ou pilotos.
  2. O produto tiver demo mínima funcional.
  3. Tássio tiver insight orgânico forte fora de sessão de brainstorm.
- A lista de candidatos descartados ou considerados é arquivada para referência futura — não se perde o trabalho, apenas se reconhece que ele foi feito cedo demais.

---

## Consequências

**Aceitas:**

- "IDK Fiscal" não tem alma de marca de produto para mercado, e não vende sozinho.
- Será necessário trocar antes de qualquer campanha pública significativa: artigo longo com URL fixa, lead magnet com assets de marca, domínio `.com` pago, identidade visual completa.
- Cria dívida técnica de marca: refatorar referências quando o nome definitivo for escolhido (repositórios, páginas, domínios de teste, comentários em código, links em ADRs).

**Mitigações:**

- O repositório usa codinome `idk-fiscal` (kebab-case), facilmente renomeável via GitHub sem perda de histórico.
- Posts iniciais no LinkedIn não dependem de marca de produto — falam em nome do Tássio, com autoridade pessoal sobre transição tributária.
- Quando a troca acontecer, será um rebranding **antes** do lançamento público (low-stakes), não com base instalada (high-stakes).

**Ganhos:**

- Destrava o restante da Sessão 1 e as próximas sessões.
- Reconhece honestamente que naming é problema mal-definido sem mais sinal de mercado.
- Mantém identidade jurídica clara: a IDK Engenharia será a detentora de qualquer marca futura, independentemente do nome final do produto.
