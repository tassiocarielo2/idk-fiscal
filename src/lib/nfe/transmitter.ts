import { Agent, fetch as undiciFetch } from "undici";
import { getEsEndpoint, type SefazAmbiente } from "@/lib/sefaz/es-config";

export type TransmitterInput = {
  uf: "ES";
  ambiente: SefazAmbiente;
  pfxBytes: Uint8Array;
  pfxPassword: string;
  /** XML completo da NF-e ja assinado. */
  signedXml: string;
  /** chave de acesso da nota (sem dv separado). */
  chaveAcesso: string;
};

export type SefazResponse = {
  cStat: string;
  xMotivo: string;
  protocolo?: string;
  rawXml: string;
  authorizedXml?: string;  // procNFe
};

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

/**
 * Envia para SEFAZ-ES via NFeAutorizacao4 com modo sincrono (indSinc=1).
 * Constroi mTLS com PKCS#12 inline (Node 18+ via undici).
 */
export async function transmitNFe(input: TransmitterInput): Promise<SefazResponse> {
  const ep = getEsEndpoint(input.ambiente);

  const idLote = Date.now().toString().slice(-15);
  const enviNFe =
    `<enviNFe xmlns="${NFE_NS}" versao="4.00">` +
    `<idLote>${idLote}</idLote>` +
    `<indSinc>1</indSinc>` +
    stripXmlDeclaration(input.signedXml) +
    `</enviNFe>`;

  const soap = wrapSoap(enviNFe, "nfeAutorizacaoLote");

  const agent = new Agent({
    connect: {
      pfx: Buffer.from(input.pfxBytes),
      passphrase: input.pfxPassword,
      // SEFAZ ainda exige minVersion permissiva em alguns autorizadores
      minVersion: "TLSv1.2",
    },
  });

  const res = await undiciFetch(ep.recepcao, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(soap, "utf8")),
    },
    body: soap,
    dispatcher: agent,
  });

  const rawXml = await res.text();
  if (!res.ok) {
    return {
      cStat: "999",
      xMotivo: `HTTP ${res.status}`,
      rawXml,
    };
  }

  return parseRetorno(rawXml);
}

function wrapSoap(payloadXml: string, action: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope" ` +
    `xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl/${action}">` +
    `<soap12:Body>` +
    `<nfe:nfeDadosMsg>${payloadXml}</nfe:nfeDadosMsg>` +
    `</soap12:Body></soap12:Envelope>`
  );
}

function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^\s*<\?xml[^?]*\?>\s*/, "");
}

function parseRetorno(rawXml: string): SefazResponse {
  const cStat = pickTag(rawXml, "cStat") ?? "999";
  const xMotivo = pickTag(rawXml, "xMotivo") ?? "Sem retorno";

  if (cStat === "100") {
    const nProt = pickTag(rawXml, "nProt");
    const protNFeXml = pickElement(rawXml, "protNFe") ?? "";
    const procNFe = buildProcNFe(rawXml, protNFeXml);
    return {
      cStat,
      xMotivo,
      protocolo: nProt ?? undefined,
      rawXml,
      authorizedXml: procNFe,
    };
  }

  return { cStat, xMotivo, rawXml };
}

function pickTag(xml: string, name: string): string | null {
  const re = new RegExp(`<${name}>([^<]+)</${name}>`);
  const m = xml.match(re);
  return m?.[1] ?? null;
}

function pickElement(xml: string, name: string): string | null {
  const re = new RegExp(`<${name}[^>]*>[\\s\\S]*?</${name}>`);
  return xml.match(re)?.[0] ?? null;
}

/**
 * Monta procNFe (NFe + protNFe) que e o XML autorizado oficial.
 * Stub: na pratica precisamos do <NFe> assinado original; recebido
 * em nfeProc do retorno, ou montado a partir da NFe assinada que enviamos.
 */
function buildProcNFe(retorno: string, protNFeXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<nfeProc xmlns="${NFE_NS}" versao="4.00">` +
    `<!-- NFe assinada original deve ser injetada antes do protNFe -->` +
    protNFeXml +
    `</nfeProc>`
  );
}
