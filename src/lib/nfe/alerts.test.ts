import { describe, it, expect } from "vitest";
import { detectAlerts } from "./alerts";
import type { ParsedNFe, ParsedNFeItem } from "./parser";

function makeNfe(items: Partial<ParsedNFeItem>[]): ParsedNFe {
  const fullItems: ParsedNFeItem[] = items.map((it, i) => ({
    numeroItem: i + 1,
    codigo: `P${i + 1}`,
    descricao: `Item ${i + 1}`,
    ncm: "00000000",
    cfop: "5102",
    unidade: "UN",
    quantidade: 1,
    valorUnitario: 10,
    valorTotal: 10,
    desconto: 0,
    cstCsosn: null,
    icmsAliquota: 0,
    icmsValor: 0,
    pisCst: null,
    pisAliquota: 0,
    pisValor: 0,
    cofinsCst: null,
    cofinsAliquota: 0,
    cofinsValor: 0,
    ...it,
  }));
  return {
    chaveAcesso: "0".repeat(44),
    modelo: "55",
    serie: 1,
    numero: 1,
    ambiente: 1,
    naturezaOperacao: "TEST",
    dataEmissao: new Date("2026-01-01"),
    status: "autorizada",
    protocolo: null,
    emitente: { cnpj: "0".repeat(14), nome: "X", uf: "ES", ie: null },
    destinatario: { cnpjCpf: "0".repeat(14), nome: "Y" },
    totais: {
      produtos: 0,
      descontos: 0,
      frete: 0,
      icms: 0,
      pis: 0,
      cofins: 0,
      nota: 0,
    },
    itens: fullItems,
    xmlSha256: "a".repeat(64),
    rawXml: "",
  };
}

describe("detectAlerts", () => {
  it("nao retorna alerta quando todos os itens tem CST tributavel e CFOP normal", () => {
    const nfe = makeNfe([
      { pisCst: "01", cofinsCst: "01", cfop: "5102" },
      { pisCst: "01", cofinsCst: "01", cfop: "5403" },
    ]);
    expect(detectAlerts(nfe)).toEqual([]);
  });

  it("alerta pis_cofins_sem_credito quando CST PIS bloqueia", () => {
    const nfe = makeNfe([
      { pisCst: "06", cofinsCst: "06", pisValor: 1.65, cofinsValor: 7.6 },
    ]);
    const alerts = detectAlerts(nfe);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe("pis_cofins_sem_credito");
    expect(alerts[0]?.severity).toBe("warn");
    expect(alerts[0]?.detalhe.valor_pis).toBeCloseTo(1.65);
    expect(alerts[0]?.detalhe.valor_cofins).toBeCloseTo(7.6);
  });

  it("alerta cfop_sem_credito quando CFOP de bonificacao", () => {
    const nfe = makeNfe([
      { pisCst: "01", cofinsCst: "01", cfop: "1910" }, // entrada de brinde
    ]);
    const alerts = detectAlerts(nfe);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe("cfop_sem_credito");
    expect(alerts[0]?.severity).toBe("info");
  });

  it("emite ambos alertas quando aplicaveis", () => {
    const nfe = makeNfe([
      { pisCst: "06", cofinsCst: "06" },
      { pisCst: "01", cofinsCst: "01", cfop: "1556" }, // uso e consumo
    ]);
    const alerts = detectAlerts(nfe);
    expect(alerts.map((a) => a.kind).sort()).toEqual([
      "cfop_sem_credito",
      "pis_cofins_sem_credito",
    ]);
  });

  it("ignora item sem CST", () => {
    const nfe = makeNfe([{ pisCst: null, cofinsCst: null }]);
    expect(detectAlerts(nfe)).toEqual([]);
  });

  it("alerta cst_icms_bloqueador para CST 60 (ICMS-ST)", () => {
    const nfe = makeNfe([
      {
        pisCst: "01",
        cofinsCst: "01",
        cfop: "5102",
        cstCsosn: "60",
        icmsValor: 12,
      },
    ]);
    const alerts = detectAlerts(nfe);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe("cst_icms_bloqueador");
    expect(alerts[0]?.detalhe.valor_icms).toBe(12);
    expect(alerts[0]?.detalhe.csts).toEqual(["60"]);
  });

  it("alerta ncm_monofasico para NCM 27101259 (gasolina)", () => {
    const nfe = makeNfe([
      { pisCst: "01", cofinsCst: "01", ncm: "27101259", cfop: "5102" },
    ]);
    const alerts = detectAlerts(nfe);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe("ncm_monofasico");
    expect(alerts[0]?.severity).toBe("warn");
  });

  it("alerta ncm_monofasico para refrigerante (NCM 22021000)", () => {
    const nfe = makeNfe([
      { pisCst: "01", cofinsCst: "01", ncm: "22021000", cfop: "5102" },
    ]);
    const alerts = detectAlerts(nfe);
    expect(alerts.map((a) => a.kind)).toContain("ncm_monofasico");
  });

  it("alerta cfop_devolucao_entrada para CFOP 1201", () => {
    const nfe = makeNfe([
      { pisCst: "01", cofinsCst: "01", cfop: "1201" },
    ]);
    const alerts = detectAlerts(nfe);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe("cfop_devolucao_entrada");
    expect(alerts[0]?.severity).toBe("info");
  });

  it("NCM 73181500 (parafuso) não dispara monofásico", () => {
    const nfe = makeNfe([
      { pisCst: "01", cofinsCst: "01", ncm: "73181500", cfop: "5102" },
    ]);
    expect(detectAlerts(nfe)).toEqual([]);
  });
});
