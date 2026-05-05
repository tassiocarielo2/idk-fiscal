import { UF_IBGE } from "@/lib/sefaz/es-config";
import type { NFeInput } from "./types";

/**
 * Serializa NFeInput para XML conforme leiaute 4.00.
 *
 * NOTA: Este serializador cobre o tronco principal e regime Simples
 * Nacional (CSOSN). Casos como ICMS-ST, ISS, exportacao, IPI requerem
 * extensao em Wave 1.4+.
 *
 * O XML retornado AINDA NAO e assinado. O elemento <infNFe> tem o atributo
 * `Id` no formato "NFe<chaveAcesso>" exigido pelo XML-DSig (referencia
 * URI="#NFe<chave>").
 */
export function serializeNFe(
  input: NFeInput,
  chaveAcesso: string,
): string {
  const dv = chaveAcesso.slice(-1);
  const cnpjEmitente = chaveAcesso.slice(6, 20);
  const cnf = chaveAcesso.slice(35, 43);
  const cuf = UF_IBGE[input.destinatario.uf] ?? UF_IBGE.ES;

  const dhEmi = isoZ(input.dataEmissao);
  const dhSaiEnt = input.dataSaida ? isoZ(input.dataSaida) : "";

  const itens = input.itens.map(serializeItem).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
<infNFe Id="NFe${chaveAcesso}" versao="4.00">
<ide>
<cUF>${cuf}</cUF>
<cNF>${cnf}</cNF>
<natOp>${escapeXml(input.naturezaOperacao)}</natOp>
<mod>${input.modelo}</mod>
<serie>${input.serie}</serie>
<nNF>${input.numero}</nNF>
<dhEmi>${dhEmi}</dhEmi>
${dhSaiEnt ? `<dhSaiEnt>${dhSaiEnt}</dhSaiEnt>` : ""}
<tpNF>${input.tipoOperacao}</tpNF>
<idDest>1</idDest>
<cMunFG>3205002</cMunFG>
<tpImp>1</tpImp>
<tpEmis>1</tpEmis>
<cDV>${dv}</cDV>
<tpAmb>${input.ambiente}</tpAmb>
<finNFe>${input.finalidade}</finNFe>
<indFinal>1</indFinal>
<indPres>1</indPres>
<procEmi>0</procEmi>
<verProc>idk-fiscal-1.3</verProc>
</ide>
<emit>
<CNPJ>${cnpjEmitente}</CNPJ>
<xNome>EMITENTE PLACEHOLDER</xNome>
<enderEmit>
<xLgr>RUA</xLgr>
<nro>S/N</nro>
<xBairro>CENTRO</xBairro>
<cMun>3205002</cMun>
<xMun>VITORIA</xMun>
<UF>ES</UF>
<CEP>29010000</CEP>
<cPais>1058</cPais>
<xPais>BRASIL</xPais>
</enderEmit>
<IE>ISENTO</IE>
<CRT>1</CRT>
</emit>
${serializeDestinatario(input)}
${itens}
${serializeTotal(input)}
<transp><modFrete>9</modFrete></transp>
<infAdic><infCpl>${escapeXml(input.observacoes ?? "")}</infCpl></infAdic>
</infNFe>
</NFe>`.replace(/\n\s*/g, "");
  // Note: SEFAZ aceita XML compacto. Whitespace em indents quebra c14n
  // se for aplicado depois — entao serializamos compacto direto.
}

function serializeDestinatario(input: NFeInput): string {
  const d = input.destinatario;
  const docTag = d.cnpjCpf.length === 14 ? "CNPJ" : "CPF";
  const ie = d.ie ? `<IE>${d.ie}</IE>` : "<indIEDest>9</indIEDest>";
  return `<dest>
<${docTag}>${d.cnpjCpf}</${docTag}>
<xNome>${escapeXml(d.nome)}</xNome>
<enderDest>
<xLgr>${escapeXml(d.logradouro ?? "ND")}</xLgr>
<nro>${escapeXml(d.numero ?? "S/N")}</nro>
<xBairro>${escapeXml(d.bairro ?? "ND")}</xBairro>
<cMun>${d.municipioIbge ?? "3205002"}</cMun>
<xMun>ND</xMun>
<UF>${d.uf}</UF>
<CEP>${(d.cep ?? "00000000").padStart(8, "0")}</CEP>
<cPais>1058</cPais>
<xPais>BRASIL</xPais>
</enderDest>
${ie}
${d.email ? `<email>${escapeXml(d.email)}</email>` : ""}
</dest>`;
}

function serializeItem(item: ReturnType<typeof Object> & {
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  desconto?: number;
  cstCsosn?: string;
  icmsAliquota?: number;
  icmsValor?: number;
  pisCst?: string;
  pisAliquota?: number;
  pisValor?: number;
  cofinsCst?: string;
  cofinsAliquota?: number;
  cofinsValor?: number;
}): string {
  const csosn = item.cstCsosn ?? "102";
  return `<det nItem="${item.numeroItem}">
<prod>
<cProd>${escapeXml(item.codigo)}</cProd>
<cEAN>SEM GTIN</cEAN>
<xProd>${escapeXml(item.descricao)}</xProd>
<NCM>${item.ncm}</NCM>
<CFOP>${item.cfop}</CFOP>
<uCom>${escapeXml(item.unidade)}</uCom>
<qCom>${fmt4(item.quantidade)}</qCom>
<vUnCom>${fmt4(item.valorUnitario)}</vUnCom>
<vProd>${fmt2(item.valorTotal)}</vProd>
<cEANTrib>SEM GTIN</cEANTrib>
<uTrib>${escapeXml(item.unidade)}</uTrib>
<qTrib>${fmt4(item.quantidade)}</qTrib>
<vUnTrib>${fmt4(item.valorUnitario)}</vUnTrib>
<indTot>1</indTot>
</prod>
<imposto>
<ICMS><ICMSSN102>
<orig>0</orig>
<CSOSN>${csosn}</CSOSN>
</ICMSSN102></ICMS>
<PIS><PISOutr>
<CST>${item.pisCst ?? "99"}</CST>
<vBC>0.00</vBC>
<pPIS>0.00</pPIS>
<vPIS>0.00</vPIS>
</PISOutr></PIS>
<COFINS><COFINSOutr>
<CST>${item.cofinsCst ?? "99"}</CST>
<vBC>0.00</vBC>
<pCOFINS>0.00</pCOFINS>
<vCOFINS>0.00</vCOFINS>
</COFINSOutr></COFINS>
</imposto>
</det>`;
}

function serializeTotal(input: NFeInput): string {
  const t = input.totais;
  return `<total>
<ICMSTot>
<vBC>0.00</vBC>
<vICMS>${fmt2(t.totalIcms)}</vICMS>
<vICMSDeson>0.00</vICMSDeson>
<vFCP>0.00</vFCP>
<vBCST>0.00</vBCST>
<vST>0.00</vST>
<vFCPST>0.00</vFCPST>
<vFCPSTRet>0.00</vFCPSTRet>
<vProd>${fmt2(t.totalProdutos)}</vProd>
<vFrete>${fmt2(t.totalFrete)}</vFrete>
<vSeg>0.00</vSeg>
<vDesc>${fmt2(t.totalDescontos)}</vDesc>
<vII>0.00</vII>
<vIPI>0.00</vIPI>
<vIPIDevol>0.00</vIPIDevol>
<vPIS>${fmt2(t.totalPis)}</vPIS>
<vCOFINS>${fmt2(t.totalCofins)}</vCOFINS>
<vOutro>0.00</vOutro>
<vNF>${fmt2(t.totalNota)}</vNF>
</ICMSTot>
</total>`;
}

function fmt2(n: number): string {
  return n.toFixed(2);
}
function fmt4(n: number): string {
  return n.toFixed(4);
}

function isoZ(d: Date): string {
  // 2026-05-02T15:34:00-03:00 — leiaute exige timezone
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  const tz = d.getTimezoneOffset();
  const sign = tz <= 0 ? "+" : "-";
  const abs = Math.abs(tz);
  const tzh = pad(Math.floor(abs / 60));
  const tzm = pad(abs % 60);
  return `${y}-${mo}-${da}T${h}:${mi}:${s}${sign}${tzh}:${tzm}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
