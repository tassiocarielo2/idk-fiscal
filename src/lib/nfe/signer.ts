import forge from "node-forge";

/**
 * XML-DSig do elemento <infNFe> conforme MOC SEFAZ 7.0:
 * - Algoritmo: rsa-sha1 (mantido por compat; SEFAZ aceita SHA-1 ate hoje
 *   no XML-DSig de NF-e mod 55).
 * - Canonicalizacao: C14N exclusiva (sem comentarios).
 * - Reference URI = "#NFe<chave>", apontando para o atributo Id de infNFe.
 *
 * IMPORTANTE: Esta implementacao usa node-forge para C14N + RSA. Nao usa
 * lib externa pra reduzir vetor de ataque, mas a canonicalizacao
 * exclusiva implementada e simplificada e PRECISA ser validada contra
 * validador SEFAZ antes de ir pra producao. Marcado em ADR-015 como
 * risco residual.
 */

export type SignedXml = {
  xml: string;          // XML completo com bloco <Signature>
  digestValue: string;
  signatureValue: string;
};

export type SignerInput = {
  /** XML compacto contendo <NFe>...<infNFe Id="NFe..."> ... </infNFe></NFe> */
  xml: string;
  /** Buffer do .pfx */
  pfxBytes: Uint8Array;
  /** Senha do .pfx em texto claro (vinda de get_certificate_for_signing) */
  pfxPassword: string;
};

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

export function signNFeXml(input: SignerInput): SignedXml {
  const { privateKey, certificate } = openPfx(input.pfxBytes, input.pfxPassword);

  const infNFe = extractInfNFe(input.xml);
  if (!infNFe) {
    throw new Error("XML nao contem elemento infNFe com Id");
  }
  const { fragment, idValue } = infNFe;

  const c14n = canonicalizeExclusive(fragment, NFE_NS);
  const digest = sha1Base64(c14n);

  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${idValue}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const signedInfoC14n = canonicalizeExclusive(signedInfo);
  const signatureValue = rsaSignSha1Base64(privateKey, signedInfoC14n);

  const certB64 = forge.util
    .encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes())
    .replace(/(.{76})/g, "$1");

  const signatureBlock =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo>` +
    `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>` +
    `</KeyInfo>` +
    `</Signature>`;

  // Insere a Signature como ultimo filho de <NFe> (envelope-signature)
  const signed = input.xml.replace(/<\/NFe>$/, `${signatureBlock}</NFe>`);

  return {
    xml: signed,
    digestValue: digest,
    signatureValue,
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function openPfx(pfxBytes: Uint8Array, password: string) {
  const der = forge.util.createBuffer(
    Buffer.from(pfxBytes).toString("binary"),
  );
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag
  ];
  const keyBags = p12.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
  })[forge.pki.oids.pkcs8ShroudedKeyBag];

  const certBag = certBags?.[0];
  const keyBag = keyBags?.[0];
  if (!certBag?.cert || !keyBag?.key) {
    throw new Error("PFX nao contem cert + chave privada");
  }
  return {
    certificate: certBag.cert,
    privateKey: keyBag.key as forge.pki.rsa.PrivateKey,
  };
}

function extractInfNFe(xml: string): { fragment: string; idValue: string } | null {
  const re = /<infNFe\s+([^>]*?)\bId="([^"]+)"([^>]*)>([\s\S]*?)<\/infNFe>/;
  const m = xml.match(re);
  if (!m) return null;
  // Reconstroi o fragmento completo do <infNFe ...>...</infNFe>
  const start = xml.indexOf(m[0]);
  const fragment = xml.slice(start, start + m[0].length);
  return { fragment, idValue: m[2] };
}

/**
 * Canonicalizacao exclusiva simplificada.
 * Para a NF-e SEFAZ aceita C14N exclusiva sem comentarios.
 * Esta implementacao NAO e completa (nao normaliza atributos em ordem
 * canonica nem trata namespaces herdados em todos os casos). Marcada
 * como TODO em ADR-015. Para producao, trocar por libxmljs C14N exclusivo
 * ou xml-c14n.
 */
function canonicalizeExclusive(xml: string, defaultNs?: string): string {
  let out = xml.trim();
  // Remove comentarios
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  // Normaliza espacos entre tags (mantem texto)
  out = out.replace(/>\s+</g, "><");
  if (defaultNs && !out.includes(`xmlns="${defaultNs}"`)) {
    out = out.replace(/^<([a-zA-Z]+)/, `<$1 xmlns="${defaultNs}"`);
  }
  return out;
}

function sha1Base64(input: string): string {
  const md = forge.md.sha1.create();
  md.update(input, "utf8");
  return forge.util.encode64(md.digest().getBytes());
}

function rsaSignSha1Base64(
  key: forge.pki.rsa.PrivateKey,
  data: string,
): string {
  const md = forge.md.sha1.create();
  md.update(data, "utf8");
  const sig = key.sign(md);
  return forge.util.encode64(sig);
}
