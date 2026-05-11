import type { ParsedNFe, ParsedNFeItem } from "./parser";

export type AlertKind =
  | "pis_cofins_sem_credito"
  | "cfop_sem_credito"
  | "cst_icms_bloqueador"
  | "ncm_monofasico"
  | "cfop_devolucao_entrada"
  | "fornecedor_inativo"
  | "duplicidade_chave";

export type AlertSeverity = "info" | "warn" | "critical";

export type DetectedAlert = {
  kind: AlertKind;
  severity: AlertSeverity;
  titulo: string;
  detalhe: Record<string, unknown>;
};

/**
 * CSTs de PIS/COFINS que NÃO geram crédito no regime não-cumulativo:
 * 04 = operação tributada monofásica (revenda)
 * 05 = ST
 * 06 = alíquota zero
 * 07 = isenta
 * 08 = sem incidência
 * 09 = suspensão
 * 49 = outras saídas
 * 70-99 = outras operações de entrada sem direito a crédito
 *
 * Fonte: IN RFB 2.121/2022 e tabela CST PIS/COFINS.
 * Empresas no Lucro Real precisam ver isso pra não escriturar crédito indevido.
 */
const PIS_COFINS_SEM_CREDITO = new Set([
  "04", "05", "06", "07", "08", "09",
  "49",
  "70", "71", "72", "73", "74", "75",
  "98", "99",
]);

/**
 * CFOPs de entrada que tipicamente NÃO geram crédito (uso/consumo, ativo
 * imobilizado, brindes, etc.) Lista conservadora; expandir conforme regras
 * por regime tributário forem refinadas.
 */
const CFOP_SEM_CREDITO_ENTRADA = new Set([
  "1556", "2556", // Compra de material para uso ou consumo
  "1551", "2551", // Compra de bem para o ativo imobilizado
  "1910", "2910", // Entrada de bonificação, doação ou brinde
  "1949", "2949", // Outra entrada de mercadoria não especificada
]);

/**
 * CSTs de ICMS no regime normal que indicam ICMS já cobrado por ST,
 * isenção/suspensão ou outras situações onde o destinatário não pode
 * escriturar crédito na entrada.
 *
 * - 10 / 30 / 60 / 70: substituição tributária (já cobrado antes)
 * - 40: isenta
 * - 41: não tributada
 * - 50: suspensão
 * - 51: diferimento (crédito só na saída)
 * - 90: outras (gerar revisão manual)
 *
 * CSOSN do Simples (102, 103, 300, 400, 500, 900) é tratado em wave futura —
 * regra de crédito de Simples é diferente (depende de PGDAS).
 */
const CST_ICMS_BLOQUEADOR = new Set([
  "10", "30", "40", "41", "50", "51", "60", "70", "90",
]);

/**
 * NCMs sujeitos à tributação monofásica de PIS/COFINS (incidência concentrada
 * no produtor/importador). Revendedor desses produtos não pode escriturar
 * crédito mesmo com CST aparentemente normal — risco silencioso.
 *
 * Lista por prefixo de 4 dígitos (capítulo NCM). Cobertura conservadora:
 *
 * - 2710 — combustíveis e derivados de petróleo
 * - 2202 — águas, refrigerantes
 * - 2203 — cervejas de malte
 * - 2204 / 2205 — vinhos
 * - 2206 — outras bebidas fermentadas
 * - 2207 / 2208 — álcool / bebidas destiladas
 * - 3303 — perfumes
 * - 3304 — cosméticos e maquiagem
 * - 3305 — capilares
 * - 3306 — higiene bucal
 * - 3307 — barbear e desodorantes
 * - 4011 — pneus novos
 * - 4013 — câmaras de ar
 * - 8702-8704 — veículos automotores
 * - 8711 — motocicletas
 *
 * Fonte: Lei 10.485/2002, Lei 10.833/2003, IN RFB 2.121/2022.
 */
const NCM_MONOFASICO_PREFIXOS = [
  "2710",
  "2202", "2203", "2204", "2205", "2206", "2207", "2208",
  "3303", "3304", "3305", "3306", "3307",
  "4011", "4013",
  "8702", "8703", "8704", "8711",
];

/**
 * CFOPs de entrada que registram **devolução** de mercadoria anteriormente
 * vendida (fluxo inverso). Não são compra — afetam apuração e exigem revisão
 * para garantir que o ICMS estornado bate.
 */
const CFOP_DEVOLUCAO_ENTRADA = new Set([
  "1201", "2201", // Devolução de venda mercado próprio/outros estados
  "1202", "2202",
  "1410", "2410", // Devolução de remessa simbólica
  "1411", "2411",
  "1503", "2503", // Devolução de mercadoria recebida em ZF
  "1504", "2504",
]);

export function detectAlerts(nfe: ParsedNFe): DetectedAlert[] {
  const alerts: DetectedAlert[] = [];

  const itensSemCreditoPis = nfe.itens.filter(
    (it) => it.pisCst && PIS_COFINS_SEM_CREDITO.has(it.pisCst),
  );
  if (itensSemCreditoPis.length > 0) {
    alerts.push({
      kind: "pis_cofins_sem_credito",
      severity: "warn",
      titulo: `${itensSemCreditoPis.length} item(ns) sem crédito de PIS/COFINS`,
      detalhe: {
        itens: itensSemCreditoPis.map(itemSummary),
        valor_pis: sum(itensSemCreditoPis, (it) => it.pisValor),
        valor_cofins: sum(itensSemCreditoPis, (it) => it.cofinsValor),
      },
    });
  }

  const itensCfopSemCredito = nfe.itens.filter((it) =>
    CFOP_SEM_CREDITO_ENTRADA.has(it.cfop),
  );
  if (itensCfopSemCredito.length > 0) {
    alerts.push({
      kind: "cfop_sem_credito",
      severity: "info",
      titulo: `${itensCfopSemCredito.length} item(ns) com CFOP que não gera crédito`,
      detalhe: {
        itens: itensCfopSemCredito.map(itemSummary),
        cfops: [...new Set(itensCfopSemCredito.map((it) => it.cfop))],
      },
    });
  }

  const itensCstIcmsBloq = nfe.itens.filter(
    (it) => it.cstCsosn && CST_ICMS_BLOQUEADOR.has(it.cstCsosn),
  );
  if (itensCstIcmsBloq.length > 0) {
    alerts.push({
      kind: "cst_icms_bloqueador",
      severity: "warn",
      titulo: `${itensCstIcmsBloq.length} item(ns) com CST ICMS que bloqueia crédito`,
      detalhe: {
        itens: itensCstIcmsBloq.map(itemSummary),
        valor_icms: sum(itensCstIcmsBloq, (it) => it.icmsValor),
        csts: [...new Set(itensCstIcmsBloq.map((it) => it.cstCsosn))],
      },
    });
  }

  const itensMonofasico = nfe.itens.filter((it) =>
    NCM_MONOFASICO_PREFIXOS.some((p) => it.ncm.startsWith(p)),
  );
  if (itensMonofasico.length > 0) {
    alerts.push({
      kind: "ncm_monofasico",
      severity: "warn",
      titulo: `${itensMonofasico.length} item(ns) com NCM de tributação monofásica`,
      detalhe: {
        itens: itensMonofasico.map(itemSummary),
        ncms: [...new Set(itensMonofasico.map((it) => it.ncm))],
        nota:
          "Revendedor de produto monofásico não escritura crédito de PIS/COFINS na entrada.",
      },
    });
  }

  const itensDevolucao = nfe.itens.filter((it) =>
    CFOP_DEVOLUCAO_ENTRADA.has(it.cfop),
  );
  if (itensDevolucao.length > 0) {
    alerts.push({
      kind: "cfop_devolucao_entrada",
      severity: "info",
      titulo: `${itensDevolucao.length} item(ns) registrados como devolução de venda`,
      detalhe: {
        itens: itensDevolucao.map(itemSummary),
        cfops: [...new Set(itensDevolucao.map((it) => it.cfop))],
        nota:
          "Confira se o ICMS estornado bate com o destacado na venda original.",
      },
    });
  }

  return alerts;
}

function itemSummary(it: ParsedNFeItem) {
  return {
    numero: it.numeroItem,
    codigo: it.codigo,
    descricao: it.descricao,
    ncm: it.ncm,
    cfop: it.cfop,
    cst_pis: it.pisCst,
    cst_cofins: it.cofinsCst,
    cst_icms: it.cstCsosn,
    valor_total: it.valorTotal,
  };
}

function sum<T>(arr: T[], pick: (x: T) => number): number {
  return arr.reduce((acc, x) => acc + pick(x), 0);
}
