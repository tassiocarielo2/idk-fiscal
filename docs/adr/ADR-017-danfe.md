# ADR-017 — Geracao de DANFE (PDF)

- **Status:** Aceita
- **Data:** 2026-05-02
- **Categoria:** Tecnica

## Contexto

Wave 1.4 inclui geracao de DANFE — o documento auxiliar em PDF que
acompanha o produto fisico ou e-mail do cliente. Layout definido pelo
MOC SEFAZ atual.

## Alternativas

1. **Puppeteer + HTML/CSS** (escolhida).
2. **pdf-lib + montagem manual**: muito codigo para layout fiscal complexo.
3. **Servico externo (DocRaptor, ABCpdf)**: custo recorrente; lock-in.
4. **wkhtmltopdf**: deprecado.

## Decisao

**Puppeteer + template HTML/CSS** rodando em route handler nodejs.
Template HTML em `src/lib/danfe/template.html` com substituicao de
placeholders. Renderiza via `puppeteer-core` + `@sparticuz/chromium`
para compatibilidade com serverless (Vercel).

## Estrutura

```
src/lib/danfe/
├── template.html      # Layout MOC compatível com mobile + impressao
├── render.ts          # NF-e autorizada -> HTML -> PDF
└── styles.ts          # Estilos inline para garantir paginacao A4
```

## Trade-offs

- **Custo de cold-start**: ~2s extras por chromium em serverless.
  Mitigamos com Edge runtime para listagem e Node runtime so na geracao.
- **Tamanho do binary**: chromium pesa ~80MB. Aceitavel.
- **Layout fiscal e detalhado**: posicao do code-bar, espacos legais,
  sao definidos por MOC. Iteracao ate ficar conforme aceito.

## Persistencia

DANFE gerado e armazenado em `storage://nfe/<org>/<branch>/<chave>.pdf`
imediatamente apos autorizacao. Exposto via signed URL com TTL 5min em
GET `/api/nfe/[id]/danfe`.

## Riscos

- Layout incorreto pode invalidar nota em fiscalizacao. Mitigacao:
  validacao manual contra DANFE referencia oficial antes de cada release.
- Codigos de barras tem que estar legíveis. Usamos lib `bwip-js` server-side.
