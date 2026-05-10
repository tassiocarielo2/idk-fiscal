import { createHash } from "node:crypto";

export type ParsedNFeItem = {
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  desconto: number;
  cstCsosn: string | null;
  icmsAliquota: number;
  icmsValor: number;
  pisCst: string | null;
  pisAliquota: number;
  pisValor: number;
  cofinsCst: string | null;
  cofinsAliquota: number;
  cofinsValor: number;
};

export type ParsedNFe = {
  chaveAcesso: string;
  modelo: "55" | "65";
  serie: number;
  numero: number;
  ambiente: 1 | 2;
  naturezaOperacao: string;
  dataEmissao: Date;
  status: "autorizada" | "cancelada" | "denegada" | "desconhecida";
  protocolo: string | null;
  emitente: {
    cnpj: string;
    nome: string;
    uf: string;
    ie: string | null;
  };
  destinatario: {
    cnpjCpf: string;
    nome: string;
  };
  totais: {
    produtos: number;
    descontos: number;
    frete: number;
    icms: number;
    pis: number;
    cofins: number;
    nota: number;
  };
  itens: ParsedNFeItem[];
  xmlSha256: string;
  rawXml: string;
};

export class ParseNFeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseNFeError";
  }
}

/**
 * Extrai dados estruturados de um XML de NF-e (procNFe ou NFe inline).
 *
 * Regex-based — suficiente pra leiaute 4.00 estável. Não cobre casos exóticos
 * (ICMS-ST aninhado, regimes especiais). Em wave futura migrar pra parser
 * baseado em árvore se justificar.
 */
export function parseNFeXml(xml: string): ParsedNFe {
  const xmlSha256 = createHash("sha256").update(xml).digest("hex");

  const chaveAcesso = pickAttr(xml, "infNFe", "Id")?.replace(/^NFe/, "") ?? "";
  if (!/^[0-9]{44}$/.test(chaveAcesso)) {
    throw new ParseNFeError("Chave de acesso ausente ou inválida no XML");
  }

  const ide = section(xml, "ide");
  if (!ide) throw new ParseNFeError("Seção <ide> não encontrada");

  const modeloRaw = pickTag(ide, "mod") ?? "55";
  if (modeloRaw !== "55" && modeloRaw !== "65") {
    throw new ParseNFeError(`Modelo ${modeloRaw} não suportado`);
  }
  const modelo = modeloRaw as "55" | "65";

  const serie = parseInt(pickTag(ide, "serie") ?? "1", 10);
  const numero = parseInt(pickTag(ide, "nNF") ?? "0", 10);
  const ambienteRaw = pickTag(ide, "tpAmb") ?? "1";
  const ambiente = ambienteRaw === "2" ? 2 : 1;
  const naturezaOperacao = pickTag(ide, "natOp") ?? "";
  const dhEmi = pickTag(ide, "dhEmi") ?? pickTag(ide, "dEmi") ?? "";
  const dataEmissao = new Date(dhEmi);
  if (Number.isNaN(dataEmissao.getTime())) {
    throw new ParseNFeError(`Data de emissão inválida: ${dhEmi}`);
  }

  const emit = section(xml, "emit");
  if (!emit) throw new ParseNFeError("Seção <emit> não encontrada");
  const emitente = {
    cnpj: pickTag(emit, "CNPJ") ?? "",
    nome: pickTag(emit, "xNome") ?? "",
    uf: pickTag(emit, "UF") ?? "",
    ie: pickTag(emit, "IE") ?? null,
  };
  if (!/^[0-9]{14}$/.test(emitente.cnpj)) {
    throw new ParseNFeError(`CNPJ do emitente inválido: ${emitente.cnpj}`);
  }

  const dest = section(xml, "dest");
  const destinatario = {
    cnpjCpf:
      pickTag(dest ?? "", "CNPJ") ?? pickTag(dest ?? "", "CPF") ?? "",
    nome: pickTag(dest ?? "", "xNome") ?? "",
  };

  const total = section(xml, "ICMSTot");
  const totais = {
    produtos: numTag(total, "vProd"),
    descontos: numTag(total, "vDesc"),
    frete: numTag(total, "vFrete"),
    icms: numTag(total, "vICMS"),
    pis: numTag(total, "vPIS"),
    cofins: numTag(total, "vCOFINS"),
    nota: numTag(total, "vNF"),
  };

  const itens = parseItems(xml);

  // Status: se tiver protNFe/cStat, usa. Senão é desconhecida.
  const cStat = pickTag(xml, "cStat");
  const protocolo = pickTag(xml, "nProt");
  let status: ParsedNFe["status"] = "desconhecida";
  if (cStat === "100") status = "autorizada";
  else if (cStat === "101" || cStat === "151" || cStat === "135") status = "cancelada";
  else if (cStat === "110" || cStat === "301" || cStat === "302") status = "denegada";

  return {
    chaveAcesso,
    modelo,
    serie,
    numero,
    ambiente,
    naturezaOperacao,
    dataEmissao,
    status,
    protocolo,
    emitente,
    destinatario,
    totais,
    itens,
    xmlSha256,
    rawXml: xml,
  };
}

function parseItems(xml: string): ParsedNFeItem[] {
  const items: ParsedNFeItem[] = [];
  const detRegex = /<det\s+nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/g;
  let m: RegExpExecArray | null;
  while ((m = detRegex.exec(xml)) !== null) {
    const numeroItem = parseInt(m[1] ?? "0", 10);
    const body = m[2] ?? "";
    const prod = section(body, "prod") ?? "";
    const imposto = section(body, "imposto") ?? "";

    items.push({
      numeroItem,
      codigo: pickTag(prod, "cProd") ?? "",
      descricao: pickTag(prod, "xProd") ?? "",
      ncm: pickTag(prod, "NCM") ?? "00000000",
      cfop: pickTag(prod, "CFOP") ?? "0000",
      unidade: pickTag(prod, "uCom") ?? "UN",
      quantidade: numTag(prod, "qCom"),
      valorUnitario: numTag(prod, "vUnCom"),
      valorTotal: numTag(prod, "vProd"),
      desconto: numTag(prod, "vDesc"),
      cstCsosn: pickTag(imposto, "CSOSN") ?? pickTag(imposto, "CST") ?? null,
      icmsAliquota: numTag(imposto, "pICMS"),
      icmsValor: numTag(imposto, "vICMS"),
      pisCst: pickPisCofinsCst(imposto, "PIS"),
      pisAliquota: numTag(imposto, "pPIS"),
      pisValor: numTag(imposto, "vPIS"),
      cofinsCst: pickPisCofinsCst(imposto, "COFINS"),
      cofinsAliquota: numTag(imposto, "pCOFINS"),
      cofinsValor: numTag(imposto, "vCOFINS"),
    });
  }
  return items;
}

function pickPisCofinsCst(imposto: string, kind: "PIS" | "COFINS"): string | null {
  const block = section(imposto, kind);
  if (!block) return null;
  return pickTag(block, "CST");
}

function section(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(re);
  return m && m[1] !== undefined ? m[1] : null;
}

function pickTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)<\\/${tag}>`);
  const m = xml.match(re);
  return m && m[1] !== undefined ? m[1].trim() : null;
}

function pickAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\s${attr}="([^"]+)"`, "i");
  const m = xml.match(re);
  return m && m[1] !== undefined ? m[1] : null;
}

function numTag(xml: string | null, tag: string): number {
  if (!xml) return 0;
  const v = pickTag(xml, tag);
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
