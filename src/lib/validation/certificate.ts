import { z } from "zod";

export const CertificatePurpose = z.enum([
  "nfe",
  "nfse",
  "cte",
  "mdfe",
  "recepcao_eventos",
  "multi",
]);
export type CertificatePurpose = z.infer<typeof CertificatePurpose>;

export const UploadCertificateMetaSchema = z.object({
  organization_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  purpose: CertificatePurpose.default("multi"),
  password: z.string().min(1).max(256),
});

export type UploadCertificateMeta = z.infer<typeof UploadCertificateMetaSchema>;

export const RevokeCertificateSchema = z.object({
  certificate_id: z.string().uuid(),
  reason: z.string().min(3).max(500),
});
