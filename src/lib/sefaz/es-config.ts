/**
 * Endpoints SEFAZ-ES por ambiente.
 *
 * Espirito Santo usa autorizador propprio (nao SVRS). Verificar versao
 * mais recente em https://nfe.sefaz.es.gov.br/ antes de promover prod.
 */

export type SefazAmbiente = 1 | 2;

export type SefazEndpoint = {
  uf: "ES";
  ambiente: SefazAmbiente;
  recepcao: string;
  retAutorizacao: string;
  consultaProtocolo: string;
  inutilizacao: string;
  recepcaoEvento: string;
  consultaCadastro: string;
  statusServico: string;
};

const ES_HOMOLOG: SefazEndpoint = {
  uf: "ES",
  ambiente: 2,
  recepcao:
    "https://homologacao.nfe.sefaz.es.gov.br/ws/nfeautorizacao/NFeAutorizacao4.asmx",
  retAutorizacao:
    "https://homologacao.nfe.sefaz.es.gov.br/ws/nferetautorizacao/NFeRetAutorizacao4.asmx",
  consultaProtocolo:
    "https://homologacao.nfe.sefaz.es.gov.br/ws/nfeconsultaprotocolo/NFeConsultaProtocolo4.asmx",
  inutilizacao:
    "https://homologacao.nfe.sefaz.es.gov.br/ws/nfeinutilizacao/NFeInutilizacao4.asmx",
  recepcaoEvento:
    "https://homologacao.nfe.sefaz.es.gov.br/ws/nferecepcaoevento/NFeRecepcaoEvento4.asmx",
  consultaCadastro:
    "https://homologacao.nfe.sefaz.es.gov.br/ws/cadconsultacadastro/CadConsultaCadastro4.asmx",
  statusServico:
    "https://homologacao.nfe.sefaz.es.gov.br/ws/nfestatusservico/NFeStatusServico4.asmx",
};

const ES_PROD: SefazEndpoint = {
  uf: "ES",
  ambiente: 1,
  recepcao:
    "https://nfe.sefaz.es.gov.br/ws/nfeautorizacao/NFeAutorizacao4.asmx",
  retAutorizacao:
    "https://nfe.sefaz.es.gov.br/ws/nferetautorizacao/NFeRetAutorizacao4.asmx",
  consultaProtocolo:
    "https://nfe.sefaz.es.gov.br/ws/nfeconsultaprotocolo/NFeConsultaProtocolo4.asmx",
  inutilizacao:
    "https://nfe.sefaz.es.gov.br/ws/nfeinutilizacao/NFeInutilizacao4.asmx",
  recepcaoEvento:
    "https://nfe.sefaz.es.gov.br/ws/nferecepcaoevento/NFeRecepcaoEvento4.asmx",
  consultaCadastro:
    "https://nfe.sefaz.es.gov.br/ws/cadconsultacadastro/CadConsultaCadastro4.asmx",
  statusServico:
    "https://nfe.sefaz.es.gov.br/ws/nfestatusservico/NFeStatusServico4.asmx",
};

export function getEsEndpoint(ambiente: SefazAmbiente): SefazEndpoint {
  return ambiente === 1 ? ES_PROD : ES_HOMOLOG;
}

/** UF -> codigo IBGE de 2 digitos (cUF do leiaute). */
export const UF_IBGE: Record<string, number> = {
  AC: 12, AL: 27, AM: 13, AP: 16, BA: 29, CE: 23, DF: 53, ES: 32,
  GO: 52, MA: 21, MG: 31, MS: 50, MT: 51, PA: 15, PB: 25, PE: 26,
  PI: 22, PR: 41, RJ: 33, RN: 24, RO: 11, RR: 14, RS: 43, SC: 42,
  SE: 28, SP: 35, TO: 17,
};

/** cStat de rejeicao agrupados por familia (para retry policy). */
export const CSTAT_REJECT_FAMILIES = {
  schemaValidation: ["215", "216", "217", "218", "219", "228", "240"],
  duplicate: ["204", "539"],
  certInvalid: ["280", "281", "283"],
  serviceDown: ["108", "109"],
  authorized: ["100"],
  cancelled: ["101", "135"],
} as const;
