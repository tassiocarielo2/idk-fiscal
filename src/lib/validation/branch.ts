import { z } from "zod";
import { isValidCnpj, normalizeCnpj } from "./cnpj";

export const CreateBranchSchema = z.object({
  organization_id: z.string().uuid(),
  cnpj: z
    .string()
    .transform(normalizeCnpj)
    .refine(isValidCnpj, "CNPJ invalido"),
  razao_social: z.string().min(3).max(200),
  nome_fantasia: z.string().max(200).optional().nullable(),
  uf: z.string().regex(/^[A-Z]{2}$/, "UF deve ter 2 letras maiusculas"),
  municipio_ibge: z
    .string()
    .regex(/^\d{7}$/, "municipio_ibge precisa ter 7 digitos")
    .optional()
    .nullable(),
  inscricao_estadual: z.string().max(20).optional().nullable(),
  inscricao_municipal: z.string().max(20).optional().nullable(),
  logradouro: z.string().max(200).optional().default(""),
  numero: z.string().max(20).optional().default(""),
  complemento: z.string().max(100).optional().nullable(),
  bairro: z.string().max(100).optional().default(""),
  cep: z
    .string()
    .regex(/^\d{8}$/, "CEP precisa ter 8 digitos")
    .optional()
    .or(z.literal("")),
});

export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;
