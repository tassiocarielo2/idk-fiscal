# ADR-002 — IDK Engenharia Ltda como entidade detentora do produto

- **Status:** Aceita
- **Data:** 2026-04-30
- **Categoria:** Legal
- **Autores:** Tássio Carielo, Claude (Sessão 1)

---

## Contexto

Necessário definir qual entidade jurídica detém o produto SaaS futuro: emite notas fiscais, assina contratos com clientes, detém a propriedade intelectual, e paga eventuais contratados externos.

Tássio é sócio de duas empresas:

1. **Cermont Montagem Industrial Ltda** — Lucro Real, contratos com Vale e ArcelorMittal Tubarão, opera no setor de montagem industrial pesada.
2. **IDK Engenharia Ltda** — Simples Nacional, presta serviços de assessoria/escritório, com CNAEs de serviços empresariais.

Tássio também é empresário em outras operações menores fora dessas duas.

---

## Alternativas consideradas

1. **Cermont como detentora.** Rejeitado. Cermont tem objeto social específico (montagem industrial), contratos pesados de longo prazo, regime Lucro Real e contabilidade complexa relacionada à atividade industrial. Misturar SaaS lá geraria contaminação contábil-fiscal e exposição de risco entre operações.

2. **Abrir empresa nova exclusiva para o produto.** Prematuro. Constituição, conta bancária, contabilidade mensal e contador acompanhante representam custo fixo recorrente sem receita ainda. Faz sentido abrir empresa nova **depois** que o produto valida (estimado: a partir de 5 clientes pagantes ou faturamento mensal recorrente acima de R$ 30k).

3. **Operar como pessoa física.** Inviável para B2B sério. Empresas-cliente exigem PJ contraparte para assinar contratos, emitir nota fiscal, garantir continuidade.

4. **Constituir holding nova.** Mesmo problema da empresa nova, com complexidade adicional sem ganho.

---

## Decisão

**IDK Engenharia Ltda é a entidade detentora do produto IDK Fiscal e de qualquer evolução futura.**

Motivações específicas:

- IDK presta serviços (assessoria/escritório) — os CNAEs atuais permitem emissão de NFS-e para os primeiros clientes sem alteração contratual.
- IDK está no Simples Nacional — limite de R$ 4,8M/ano de faturamento global. Suficiente para o estágio inicial, com folga.
- Estrutura mínima (alvará, conta bancária, CNPJ, contador) já está ativa e operacional.
- Tássio já desenvolveu o módulo de download de notas via IDK, validando o modelo na prática. Não há conflito de IP com Cermont, e a estrutura é replicável.
- Alteração contratual para incluir CNAE específico de SaaS (62.04-0 ou 63.11-9) será feita quando o faturamento do produto justificar — não agora.

---

## Consequências

**Aceitas:**

- Limite de faturamento do Simples Nacional (R$ 4,8M/ano) somando Cermont (que já fatura via Cermont, então não conta para IDK) e IDK. Necessário acompanhar mensalmente o faturamento da IDK para identificar antecipadamente quando se aproximar do teto.
- CNAEs atuais não são ideais para SaaS, mas a jurisprudência consolidada do STJ e do CARF reconhece SaaS como prestação de serviço, e a Receita Federal já trata dessa forma. IDK pode emitir NFS-e cobrindo o produto sem reclassificação imediata.
- Acumulação de propriedade intelectual em pessoa jurídica que tem outros sócios eventuais ou histórico operacional — risco mitigado por ser a IDK uma empresa controlada por Tássio.

**Mitigações:**

- Acompanhar mensalmente o faturamento total IDK e provisionar alteração contratual de CNAE quando o faturamento mensal recorrente do produto ultrapassar R$ 10k (sinal de preparação para escalar).
- Manter contador da IDK ciente do projeto desde o primeiro faturamento, para que possa orientar enquadramento e regime adequado.
- Quando o produto crescer e fizer sentido isolar a operação, considerar abrir subsidiária ou empresa controlada exclusivamente para o SaaS — mas isso é decisão para ADR futura.

**Ganhos:**

- Custo zero para começar.
- Reaproveita modelo já testado (módulo de download de notas).
- Sem conflito de IP nem de objeto social com Cermont.
- Identidade jurídica clara desde o dia um.
