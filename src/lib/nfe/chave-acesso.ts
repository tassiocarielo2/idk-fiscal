import { UF_IBGE } from "@/lib/sefaz/es-config";

/**
 * Gera os 44 digitos da chave de acesso da NF-e conforme leiaute SEFAZ:
 *
 *  cUF (2) | aamm (4) | CNPJ emit (14) | mod (2) | serie (3) |
 *  nNF (9) | tpEmis (1) | cNF (8) | cDV (1) = 44
 *
 * O DV e modulo-11 conforme spec.
 */
export type ChaveInput = {
  uf: string;            // 'ES'
  dataEmissao: Date;
  cnpjEmitente: string;  // 14 digitos
  modelo: string;        // '55'
  serie: number;
  numero: number;
  tipoEmissao: number;   // 1=normal
  codigoNumerico?: number; // cNF, 8 digitos. Default = random.
};

export function gerarChaveAcesso(input: ChaveInput): string {
  const cuf = UF_IBGE[input.uf];
  if (!cuf) throw new Error(`UF invalida: ${input.uf}`);

  const aamm =
    String(input.dataEmissao.getFullYear()).slice(-2) +
    String(input.dataEmissao.getMonth() + 1).padStart(2, "0");

  const cnpj = input.cnpjEmitente.padStart(14, "0");
  const mod = input.modelo.padStart(2, "0");
  const serie = String(input.serie).padStart(3, "0");
  const numero = String(input.numero).padStart(9, "0");
  const tpEmis = String(input.tipoEmissao).padStart(1, "0");
  const cnf =
    typeof input.codigoNumerico === "number"
      ? String(input.codigoNumerico).padStart(8, "0").slice(0, 8)
      : String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

  const sem_dv = `${cuf}${aamm}${cnpj}${mod}${serie}${numero}${tpEmis}${cnf}`;
  if (sem_dv.length !== 43) {
    throw new Error(`Chave (sem DV) com tamanho invalido: ${sem_dv.length}`);
  }

  const dv = calcularDvChave(sem_dv);
  return sem_dv + String(dv);
}

function calcularDvChave(chave43: string): number {
  // Modulo-11 com pesos 2..9 ciclicos
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return dv === 10 || dv === 11 ? 0 : dv;
}

export function validarChaveAcesso(chave44: string): boolean {
  if (!/^\d{44}$/.test(chave44)) return false;
  const sem_dv = chave44.slice(0, 43);
  const dv = Number(chave44[43]);
  return calcularDvChave(sem_dv) === dv;
}
