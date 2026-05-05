# ADR-015 — Provedor de comunicacao com SEFAZ

- **Status:** Aceita
- **Data:** 2026-05-02
- **Categoria:** Tecnica / Estrategica

## Contexto

Wave 1.3 abre a comunicacao com a SEFAZ-ES para emissao de NF-e em
homologacao. A decisao de provedor afeta TCO, complexidade da
homologacao, lock-in e capacidade futura de rodar 100% on-prem.

## Alternativas

### A) Lib Node nativa (escolhida)

Implementar serializador NF-e (XML), assinador XML-DSig (xml-crypto +
xmldsigjs ou implementacao propria), comunicacao SOAP/REST com SEFAZ
(undici + cliente PKCS#12) tudo em-house.

**Pros:**
- Zero dependencia de SaaS para funcao fiscal critica.
- Custo marginal por NF-e ~ 0 (apenas tempo de CPU).
- Permite rodar on-prem em cliente regulado futuramente.
- Conhecimento do dominio fica no time.

**Contras:**
- Mais codigo: serializacao XML conforme MOC, schemas XSD versionados,
  XML-DSig conforme NT, contingencia, retry policies.
- Mais bugs possiveis nas notas tecnicas (NT 2024.001, NT 2024.002, etc.).
- Time precisa manter conformidade com cada release SEFAZ.

### B) Gateway externo (NFe.io, Tecnospeed, Focus NFe)

Delegar emissao para SaaS via REST. Provedor cuida de SEFAZ, NTs, contingencia.

**Pros:**
- Time-to-market rapido.
- NTs propagadas automaticamente.

**Contras:**
- Custo recorrente por NF-e (R$ 0,15-0,50 cada).
- Lock-in fiscal: trocar de provedor em prod = re-homologar fluxo critico.
- Cert fica fora ou em provedor (vetor de leak adicional).
- Multi-tenant requer "sub-conta" no gateway → complexidade.
- Dependencia de uptime de terceiro para funcao revenue-critical.

## Decisao

**Opcao A — Lib Node nativa.**

Razao principal: o produto se posiciona como camada de inteligencia
fiscal. Delegar a emissao a SaaS terceira fragmenta o stack e nos
torna refem de roadmap externo. Custo mensal estimado em R\$ 500
para 1000 NF-e/mes via gateway > custo de manutencao incremental
da lib (estimado em 8h/mes apos estabilizar).

**Saida**: se nas Waves 1.3-1.5 a manutencao da lib mostrar TCO maior
que estimado (>20h/mes), revisar para hibrido (lib propria + fallback
para gateway em contingencia).

## Estrutura tecnica

```
src/lib/nfe/
├── builder.ts          # Constroi objeto NF-e a partir de input do usuario
├── serializer.ts       # NF-e -> XML (conforme leiaute 4.00)
├── signer.ts           # XML-DSig com cert A1 (xml-crypto)
├── transmitter.ts      # SOAP/HTTPS para SEFAZ-ES (NFeAutorizacao4)
├── parser-response.ts  # Parse de resposta SEFAZ (cStat, xMotivo, protNFe)
└── schemas/            # XSD do leiaute 4.00 (commitado)

src/lib/sefaz/
├── es-config.ts        # URLs homologacao + producao SEFAZ-ES
├── retry-policy.ts     # Budget de retries por cStat
└── circuit-breaker.ts  # Pausa transmissao apos N rejeicoes seguidas
```

## Consequencias

- **Schemas XSD**: precisam ser commitados (nao baixados em runtime).
  Versao alvo: PL 12 (atual em 2026). Atualizamos via PR quando NT exigir.
- **Validacao XSD em build time**: usaremos `libxmljs2` ou `xsd-schema-validator`
  para validar antes de assinar. Se schema invalido, falha sem chegar
  a SEFAZ.
- **Circuit breaker**: 5 rejeicoes consecutivas em <2min suspende
  transmissao da branch por 5 minutos. Evita ban da SEFAZ.
- **Homologacao primeiro**: nenhuma NF-e em prod ate ter pelo menos
  3 NF-e autorizadas em homologacao SEFAZ-ES com CNPJ teste 99999999000191.

## Riscos

- Implementacao de XML-DSig com canonicalizacao C14N e sensivel a
  whitespace. Estrategia: rodar XML gerado contra validador SEFAZ
  oficial em CI antes de aceitar PR que toca signer.
- NT pode mudar enquanto estamos em desenvolvimento. Mitigacao:
  monitorar publicacao SEFAZ via RSS/feed, abrir issue automatica
  quando muda.
