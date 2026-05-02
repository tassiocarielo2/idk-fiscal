export type CertificatePurpose = "nfe" | "ecnpj" | "ecpf" | "outro";

export type CertificateStatus = "active" | "expired" | "revoked" | "superseded";

export interface ParsedCertificate {
  subjectCn: string;
  issuerCn: string;
  serialNumber: string;
  thumbprintSha256: string;
  validFrom: Date;
  validUntil: Date;
  signatureAlgorithm: string;
  cnpjFromSubject: string | null;
}

export interface CertificateMetadata {
  id: string;
  organization_id: string;
  branch_id: string | null;
  purpose: CertificatePurpose;
  status: CertificateStatus;
  cnpj_titular: string;
  razao_social_titular: string;
  subject_cn: string | null;
  issuer_cn: string | null;
  serial_number: string;
  thumbprint_sha256: string;
  signature_algorithm: string | null;
  storage_path: string;
  storage_bucket: string;
  vault_secret_ref: string | null;
  valid_from: string;
  valid_until: string;
  uploaded_at: string;
  uploaded_by: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_reason: string | null;
}

export type CertificateUploadErrorCode =
  | "wrong_password"
  | "invalid_pfx"
  | "weak_signature"
  | "expired"
  | "duplicate_thumbprint"
  | "forbidden"
  | "branch_not_found"
  | "file_too_large"
  | "internal";

export class CertificateUploadError extends Error {
  constructor(
    public readonly code: CertificateUploadErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CertificateUploadError";
  }
}
