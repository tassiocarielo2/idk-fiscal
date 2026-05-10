# ADR-022 — Captura inbound: upload manual de XMLs como degrau anterior ao DistDFe

- **Status:** Aceita
- **Data:** 2026-05-10
- **Categoria:** Produto / Técnica

## Contexto

A Wave 1 do plano original previa **captura automática de NF-e de compras via DistDFe** (consulta ao SEFAZ usando o certificado A1 do cliente, paginada por NSU). As Waves 1.3 e 1.4 acabaram entregando emissão (saída), não captura. A tese de marca — "inteligência fiscal que detecta créditos perdidos antes do contador" — depende de ter notas no banco para analisar; sem captura, o produto não cumpre a promessa.

DistDFe envolve:
- mTLS com certificado A1 (em produção)
- Polling com paginação por NSU + persistência do último NSU consumido
- Worker assíncrono separado da request HTTP do usuário
- Tratamento de notas denegadas, canceladas, complementares
- Reprocessamento idempotente

É um pedaço grande, e a integração bancária está fora do MVP por decisão recente, então não há urgência de cobrar pelo serviço — o foco é validar a tese.

## Decisão

Implementar **captura por upload manual de XMLs** como degrau anterior ao DistDFe:

1. Tabelas separadas (`nfe_inbound_documents`, `nfe_inbound_items`, `nfe_inbound_alerts`) — não confunde com o schema de emissão (`nfe_documents`).
2. Endpoint `POST /api/nfe-inbound/upload` aceitando até 50 XMLs por chamada.
3. Parser regex-based (sem libs externas) — leiaute 4.00, modelo 55.
4. Detector determinístico de alertas anexado na ingestão. Inicial: dois alertas — CST de PIS/COFINS sem direito a crédito, CFOP de entrada que não gera crédito.
5. Bucket `nfe` reaproveitado, com prefixo `inbound/<chave>.xml`. Policy de INSERT no Storage adicionada via migration 0014.
6. Deduplicação por `(organization_id, chave_acesso)`.
7. UI `/notas` com listagem, totais e badges de alerta por nota.

## Alternativas consideradas

- **Implementar DistDFe direto.** Custo grande (worker, NSU state, mTLS) sem cliente real puxando. Adiado.
- **Reaproveitar `nfe_documents` com `tipo_operacao=0`.** Sujaria o schema (campos como `next_nfe_numero`, advisory locks de emissão, restrições de CST não fazem sentido em entrada) e poluiria a unicidade `(org, modelo, serie, numero, ambiente)` com números de fornecedores externos.
- **Parser baseado em árvore (`fast-xml-parser`).** Adiciona dependência por ganho marginal no MVP. Migrar quando casos exóticos justificarem.

## Consequências

**Ganhos**
- Destrava pilotos zero (Tássio sobe XMLs das 3 empresas próprias) sem implementar mTLS.
- Cumpre a tese: primeiro alerta determinístico funcional sobre dados reais.
- Base de dados pronta para o próximo passo (dashboard de overview, categorização IA, diagnóstico tributário) — todos consomem `nfe_inbound_*`.

**Trade-offs aceitos**
- Cliente precisa exportar XMLs do emissor (portal SEFAZ, ERP, contador). Atrito inicial alto, mas validável.
- Lista de CFOPs sem crédito é conservadora — false negatives prováveis. Refinar conforme regras por regime forem detalhadas.
- Sem reprocessamento automático: se a regra de alerta mudar, alertas antigos não recalculam. Aceitar até existir um job dedicado.

**Próximos gatilhos**
- DistDFe vira prioridade quando: (a) primeiro cliente externo aceitar piloto pago, ou (b) volume de upload manual passar de ~200 notas/mês por org.
- Migrar para parser baseado em árvore se aparecerem XMLs com namespaces customizados ou estruturas aninhadas que o regex não cobre.
