import forge from "node-forge";

export type ParsedCertificate = {
  cnpjTitular: string | null;
  razaoSocialTitular: string;
  subjectCN: string;
  issuerCN: string;
  validFrom: Date;
  validUntil: Date;
  serialNumber: string;
  thumbprintSha256: string;
  cnpjMismatchWarning: boolean;
};

export type ParsedCertificateErrorCode =
  | "INVALID_PFX"
  | "WRONG_PASSWORD"
  | "NO_CERT_BAG"
  | "EXPIRED"
  | "MALFORMED";

export class CertificateParseError extends Error {
  code: ParsedCertificateErrorCode;

  constructor(code: ParsedCertificateErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "CertificateParseError";
  }
}

const CN_CNPJ_REGEX = /:?(\d{14})\b/;

/**
 * Faz parse e validacao dupla do .pfx:
 * 1. Tenta abrir com a senha (validacao real do password).
 * 2. Extrai metadados do certificado de assinatura.
 *
 * NAO retorna a chave privada nem a senha — quem chama nao deve ver isso.
 *
 * @param pfxBuffer  Conteudo binario do arquivo .pfx (PKCS#12).
 * @param password   Senha em texto claro.
 * @param expectedCnpj CNPJ da branch dona (somente numeros, 14 digitos).
 *                     Usado pra warning de mismatch (nao bloqueia).
 */
export function parsePfx(
  pfxBuffer: Uint8Array,
  password: string,
  expectedCnpj?: string,
): ParsedCertificate {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const der = forge.util.createBuffer(
      Buffer.from(pfxBuffer).toString("binary"),
    );
    const asn1 = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (
      msg.includes("password") ||
      msg.includes("mac") ||
      msg.includes("invalid")
    ) {
      throw new CertificateParseError(
        "WRONG_PASSWORD",
        "Senha do certificado nao confere ou arquivo corrompido.",
      );
    }
    throw new CertificateParseError("INVALID_PFX", "PFX invalido.");
  }

  const certBagOid = forge.pki.oids.certBag as string;
  const certBags = p12.getBags({ bagType: certBagOid });
  const bags = (certBags[certBagOid] ?? []) as forge.pkcs12.Bag[];
  const signingBag = bags.find((b: forge.pkcs12.Bag) => b.cert);
  if (!signingBag || !signingBag.cert) {
    throw new CertificateParseError(
      "NO_CERT_BAG",
      "PFX nao contem certificado de assinatura.",
    );
  }

  const cert = signingBag.cert;
  const subjectCN = readCN(cert.subject.attributes);
  const issuerCN = readCN(cert.issuer.attributes);
  const cnpjFromSubject = extractCnpjFromCN(subjectCN);

  // Razao social: parte antes do ':' do CN (padrao ICP-Brasil)
  const razaoSocialTitular = subjectCN.split(":")[0]?.trim() ?? subjectCN;

  // SHA-256 do certificado em DER (padrao thumbprint moderno)
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(certDer);
  const thumbprintSha256 = md.digest().toHex();

  const validFrom = cert.validity.notBefore;
  const validUntil = cert.validity.notAfter;

  if (!(validUntil instanceof Date) || Number.isNaN(validUntil.getTime())) {
    throw new CertificateParseError("MALFORMED", "Validade do cert invalida.");
  }

  const cnpjMismatchWarning = Boolean(
    expectedCnpj &&
      cnpjFromSubject &&
      onlyDigits(expectedCnpj) !== cnpjFromSubject,
  );

  return {
    cnpjTitular: cnpjFromSubject,
    razaoSocialTitular,
    subjectCN,
    issuerCN,
    validFrom,
    validUntil,
    serialNumber: cert.serialNumber,
    thumbprintSha256,
    cnpjMismatchWarning,
  };
}

function readCN(attributes: forge.pki.CertificateField[]): string {
  const cn = attributes.find((a) => a.shortName === "CN" || a.name === "commonName");
  const value = cn?.value;
  if (typeof value === "string") return value;
  return "";
}

function extractCnpjFromCN(cn: string): string | null {
  const match = cn.match(CN_CNPJ_REGEX);
  return match?.[1] ?? null;
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}
