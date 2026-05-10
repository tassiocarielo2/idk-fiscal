import type { ParsedNFe, ParsedNFeItem } from "./parser";

export type AlertKind =
  | "pis_cofins_sem_credito"
  | "cfop_sem_credito"
  | "cst_icms_bloqueador"
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
    valor_total: it.valorTotal,
  };
}

function sum<T>(arr: T[], pick: (x: T) => number): number {
  return arr.reduce((acc, x) => acc + pick(x), 0);
}
