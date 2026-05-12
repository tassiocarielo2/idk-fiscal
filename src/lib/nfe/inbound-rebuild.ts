import type { ParsedNFe, ParsedNFeItem } from "./parser";

type DocRow = {
  id: string;
  chave_acesso: string;
  modelo: string;
  serie: number;
  numero: number;
  ambiente: number;
  natureza_operacao: string;
  data_emissao: string;
  status: string;
  protocolo: string | null;
  emit_cnpj: string;
  emit_nome: string;
  emit_uf: string;
  emit_ie: string | null;
  dest_cnpj_cpf: string;
  dest_nome: string;
  total_produtos: number | string;
  total_descontos: number | string;
  total_frete: number | string;
  total_icms: number | string;
  total_pis: number | string;
  total_cofins: number | string;
  total_nota: number | string;
  xml_sha256: string;
};

type ItemRow = {
  numero_item: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number | string;
  valor_unitario: number | string;
  valor_total: number | string;
  desconto: number | string;
  cst_csosn: string | null;
  icms_aliquota: number | string;
  icms_valor: number | string;
  pis_cst: string | null;
  pis_aliquota: number | string;
  pis_valor: number | string;
  cofins_cst: string | null;
  cofins_aliquota: number | string;
  cofins_valor: number | string;
};

/**
 * Reconstrói um `ParsedNFe` a partir das linhas persistidas
 * (`nfe_inbound_documents` + `nfe_inbound_items`) — usado pelo job de
 * reprocessamento de alertas, que precisa rodar `detectAlerts` sem ter
 * acesso ao XML cru.
 *
 * Mantém apenas os campos que `detectAlerts` lê hoje. `rawXml` fica vazio
 * porque nenhum detector consome — se algum detector futuro precisar do
 * XML, busca-se via `xml_path` no Storage.
 */
export function rebuildParsedNFeFromDb(
  doc: DocRow,
  items: ItemRow[],
): ParsedNFe {
  return {
    chaveAcesso: doc.chave_acesso,
    modelo: doc.modelo === "65" ? "65" : "55",
    serie: doc.serie,
    numero: doc.numero,
    ambiente: doc.ambiente === 2 ? 2 : 1,
    naturezaOperacao: doc.natureza_operacao,
    dataEmissao: new Date(doc.data_emissao),
    status: parseStatus(doc.status),
    protocolo: doc.protocolo,
    emitente: {
      cnpj: doc.emit_cnpj,
      nome: doc.emit_nome,
      uf: doc.emit_uf,
      ie: doc.emit_ie,
    },
    destinatario: {
      cnpjCpf: doc.dest_cnpj_cpf,
      nome: doc.dest_nome,
    },
    totais: {
      produtos: Number(doc.total_produtos),
      descontos: Number(doc.total_descontos),
      frete: Number(doc.total_frete),
      icms: Number(doc.total_icms),
      pis: Number(doc.total_pis),
      cofins: Number(doc.total_cofins),
      nota: Number(doc.total_nota),
    },
    itens: items.map(toItem),
    xmlSha256: doc.xml_sha256,
    rawXml: "",
  };
}

function toItem(it: ItemRow): ParsedNFeItem {
  return {
    numeroItem: it.numero_item,
    codigo: it.codigo,
    descricao: it.descricao,
    ncm: it.ncm,
    cfop: it.cfop,
    unidade: it.unidade,
    quantidade: Number(it.quantidade),
    valorUnitario: Number(it.valor_unitario),
    valorTotal: Number(it.valor_total),
    desconto: Number(it.desconto),
    cstCsosn: it.cst_csosn,
    icmsAliquota: Number(it.icms_aliquota),
    icmsValor: Number(it.icms_valor),
    pisCst: it.pis_cst,
    pisAliquota: Number(it.pis_aliquota),
    pisValor: Number(it.pis_valor),
    cofinsCst: it.cofins_cst,
    cofinsAliquota: Number(it.cofins_aliquota),
    cofinsValor: Number(it.cofins_valor),
  };
}

function parseStatus(s: string): ParsedNFe["status"] {
  if (s === "autorizada" || s === "cancelada" || s === "denegada") return s;
  return "desconhecida";
}
