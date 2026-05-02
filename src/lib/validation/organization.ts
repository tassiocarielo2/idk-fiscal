import { z } from "zod";
import { isValidCnpj, normalizeCnpj } from "./cnpj";

export const RegimeTributario = z.enum([
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
]);

export type RegimeTributario = z.infer<typeof RegimeTributario>;

export const CreateOrganizationSchema = z.object({
  cnpj: z
    .string()
    .transform(normalizeCnpj)
    .refine(isValidCnpj, "CNPJ invalido"),
  razao_social: z.string().min(3).max(200),
  nome_fantasia: z.string().max(200).optional().nullable(),
  regime_tributario: RegimeTributario,
  uf: z.string().regex(/^[A-Z]{2}$/, "UF deve ter 2 letras maiusculas"),
  inscricao_estadual: z.string().max(20).optional().nullable(),
  inscricao_municipal: z.string().max(20).optional().nullable(),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
