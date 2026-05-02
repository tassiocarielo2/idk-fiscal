import { z } from "zod";

const cnpj14 = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 14, { message: "CNPJ deve ter 14 digitos" });

export const CreateBranchSchema = z.object({
  organization_id: z.string().uuid(),
  cnpj: cnpj14,
  razao_social: z.string().min(1).max(200),
  nome_fantasia: z.string().max(200).optional().nullable(),
  uf: z
    .string()
    .length(2)
    .transform((v) => v.toUpperCase()),
  inscricao_estadual: z.string().max(30).optional().nullable(),
  inscricao_municipal: z.string().max(30).optional().nullable(),
  logradouro: z.string().max(200).optional().nullable(),
  numero: z.string().max(20).optional().nullable(),
  complemento: z.string().max(100).optional().nullable(),
  bairro: z.string().max(100).optional().nullable(),
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 8, {
      message: "CEP deve ter 8 digitos",
    })
    .optional()
    .nullable(),
  municipio_ibge: z
    .string()
    .regex(/^\d{7}$/)
    .optional()
    .nullable(),
});

export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;
