import { z } from "zod";

export const NFeItemSchema = z.object({
  codigo: z.string().min(1).max(60),
  descricao: z.string().min(1).max(120),
  ncm: z.string().regex(/^\d{8}$/, "NCM precisa ter 8 digitos"),
  cfop: z.string().regex(/^\d{4}$/, "CFOP precisa ter 4 digitos"),
  unidade: z.string().min(1).max(6),
  quantidade: z.number().positive(),
  valor_unitario: z.number().nonnegative(),
  desconto: z.number().nonnegative().optional().default(0),
  cst_csosn: z.string().max(4).optional().default("102"),
});

export const NFeIssueSchema = z.object({
  organization_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  certificate_id: z.string().uuid(),
  ambiente: z.union([z.literal(1), z.literal(2)]).default(2),
  natureza_operacao: z.string().min(3).max(60),
  destinatario: z.object({
    cnpj_cpf: z.string().regex(/^\d{11}$|^\d{14}$/),
    nome: z.string().min(2).max(60),
    ie: z.string().nullable().optional(),
    uf: z.string().regex(/^[A-Z]{2}$/),
    municipio_ibge: z
      .string()
      .regex(/^\d{7}$/)
      .optional(),
    logradouro: z.string().max(60).optional(),
    numero: z.string().max(10).optional(),
    bairro: z.string().max(60).optional(),
    cep: z.string().regex(/^\d{8}$/).optional(),
    email: z.string().email().optional(),
  }),
  itens: z.array(NFeItemSchema).min(1).max(990),
  observacoes: z.string().max(500).optional(),
});

export type NFeIssueInput = z.infer<typeof NFeIssueSchema>;
