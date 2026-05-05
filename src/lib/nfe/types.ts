/**
 * Tipos do dominio NF-e.
 * Aderente ao leiaute 4.00 (PL 12) — homologacao ES.
 */

export type NFeAmbiente = 1 | 2; // 1=prod, 2=homologacao

export type NFeFinalidade = 1 | 2 | 3 | 4;
export type NFeTipoOperacao = 0 | 1; // 0=entrada, 1=saida

export type NFeDestinatario = {
  cnpjCpf: string;
  nome: string;
  ie: string | null;
  uf: string;
  // Endereco (obrigatorio em prod)
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  municipioIbge?: string;
  email?: string;
  telefone?: string;
};

export type NFeItem = {
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string;          // 8 digitos
  cfop: string;         // 4 digitos
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;   // = quantidade * valorUnitario - desconto
  desconto?: number;
  cstCsosn?: string;
  icmsAliquota?: number;
  icmsValor?: number;
  pisCst?: string;
  pisAliquota?: number;
  pisValor?: number;
  cofinsCst?: string;
  cofinsAliquota?: number;
  cofinsValor?: number;
  informacoesAdicionais?: string;
};

export type NFeTotais = {
  totalProdutos: number;
  totalDescontos: number;
  totalFrete: number;
  totalIcms: number;
  totalPis: number;
  totalCofins: number;
  totalNota: number;
};

export type NFeInput = {
  organizationId: string;
  branchId: string;
  certificateId: string;

  modelo: "55";
  serie: number;
  numero: number;             // tirado de next_nfe_numero
  ambiente: NFeAmbiente;
  tipoOperacao: NFeTipoOperacao;
  finalidade: NFeFinalidade;
  naturezaOperacao: string;
  dataEmissao: Date;
  dataSaida?: Date;

  destinatario: NFeDestinatario;
  itens: NFeItem[];
  totais: NFeTotais;
  observacoes?: string;
};
