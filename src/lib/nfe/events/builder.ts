import { UF_IBGE } from "@/lib/sefaz/es-config";

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

export type EventInput = {
  uf: string;
  cnpjEmitente: string;
  chaveAcesso: string;
  ambiente: 1 | 2;
  tipoEvento: string;          // '110110' | '110111'
  numeroSequencial: number;
  justificativa: string;
  dataEvento: Date;
};

/**
 * Monta o XML do evento (cancelamento, CC-e) sem assinatura.
 * Reference URI no XML-DSig sera "#ID<idEvento>".
 */
export function buildEventXml(input: EventInput): {
  xml: string;
  idEvento: string;
} {
  const cuf = UF_IBGE[input.uf] ?? UF_IBGE.ES;
  const idEvento =
    `ID${input.tipoEvento}${input.chaveAcesso}${String(
      input.numeroSequencial,
    ).padStart(2, "0")}`;

  const detEvento = buildDetEvento(input);

  const dh = isoZ(input.dataEvento);
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<evento xmlns="${NFE_NS}" versao="1.00">` +
    `<infEvento Id="${idEvento}">` +
    `<cOrgao>${cuf}</cOrgao>` +
    `<tpAmb>${input.ambiente}</tpAmb>` +
    `<CNPJ>${input.cnpjEmitente}</CNPJ>` +
    `<chNFe>${input.chaveAcesso}</chNFe>` +
    `<dhEvento>${dh}</dhEvento>` +
    `<tpEvento>${input.tipoEvento}</tpEvento>` +
    `<nSeqEvento>${input.numeroSequencial}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    detEvento +
    `</infEvento>` +
    `</evento>`;

  return { xml, idEvento };
}

function buildDetEvento(input: EventInput): string {
  if (input.tipoEvento === "110111") {
    return (
      `<detEvento versao="1.00">` +
      `<descEvento>Cancelamento</descEvento>` +
      `<nProt>PROTOCOLO_DA_NFE</nProt>` +
      `<xJust>${escapeXml(input.justificativa)}</xJust>` +
      `</detEvento>`
    );
  }
  if (input.tipoEvento === "110110") {
    return (
      `<detEvento versao="1.00">` +
      `<descEvento>Carta de Correcao</descEvento>` +
      `<xCorrecao>${escapeXml(input.justificativa)}</xCorrecao>` +
      `<xCondUso>A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro ocorrido na emissao de documento fiscal, desde que o erro nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; II - a correcao de dados cadastrais que implique mudanca do remetente ou do destinatario; III - a data de emissao ou de saida.</xCondUso>` +
      `</detEvento>`
    );
  }
  throw new Error(`Tipo de evento nao suportado: ${input.tipoEvento}`);
}

function isoZ(d: Date): string {
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
  return `${y}-${mo}-${da}T${h}:${mi}:${s}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
