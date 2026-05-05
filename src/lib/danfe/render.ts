/**
 * Geracao de DANFE em HTML (precursor a PDF via Puppeteer/Chromium).
 *
 * NOTA: A geracao de PDF efetiva via Puppeteer requer:
 *   pnpm add puppeteer-core @sparticuz/chromium
 * Lembrar de configurar Vercel runtime "nodejs" + serverless function
 * com 1024MB RAM.
 *
 * Este modulo retorna o HTML "DANFE-ready" e um helper que envolve
 * a chamada de Puppeteer. Em CI/dev, podemos servir o HTML direto.
 */

export type DanfeData = {
  chaveAcesso: string;
  protocolo: string;
  numero: number;
  serie: number;
  ambiente: 1 | 2;
  dataEmissao: Date;
  emitenteCnpj: string;
  emitenteNome: string;
  destinatarioCnpjCpf: string;
  destinatarioNome: string;
  destinatarioUf: string;
  totalNota: number;
  itens: Array<{
    codigo: string;
    descricao: string;
    ncm: string;
    cfop: string;
    unidade: string;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
  }>;
};

export function renderDanfeHtml(data: DanfeData): string {
  const itensRows = data.itens
    .map(
      (it) => `
      <tr>
        <td>${it.codigo}</td>
        <td>${escapeHtml(it.descricao)}</td>
        <td>${it.ncm}</td>
        <td>${it.cfop}</td>
        <td>${it.unidade}</td>
        <td class="num">${it.quantidade.toFixed(4)}</td>
        <td class="num">${it.valorUnitario.toFixed(4)}</td>
        <td class="num">${it.valorTotal.toFixed(2)}</td>
      </tr>`,
    )
    .join("");

  const ambienteLabel =
    data.ambiente === 2 ? "DANFE EMITIDA EM HOMOLOGACAO — SEM VALOR FISCAL" : "";

  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<title>DANFE ${data.numero}/${data.serie}</title>
<style>
  body { font-family: -apple-system, sans-serif; font-size: 10pt; margin: 0; padding: 12mm; color: #111; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #000; padding-bottom: 6mm; }
  .header h1 { margin: 0; font-size: 14pt; }
  .chave { font-family: monospace; font-size: 9pt; word-break: break-all; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 6mm 0; }
  .card { border: 1px solid #ccc; padding: 4mm; }
  .label { font-size: 8pt; color: #555; text-transform: uppercase; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #f5f5f5; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { text-align: right; padding-top: 6mm; font-size: 12pt; font-weight: 600; }
  .ambiente { background: #fffae0; color: #b08800; padding: 4mm; text-align: center; font-weight: 600; margin: 4mm 0; }
</style>
</head>
<body>

${ambienteLabel ? `<div class="ambiente">${ambienteLabel}</div>` : ""}

<div class="header">
  <div>
    <h1>${escapeHtml(data.emitenteNome)}</h1>
    <p class="label">CNPJ ${data.emitenteCnpj}</p>
  </div>
  <div style="text-align: right;">
    <p class="label">DANFE</p>
    <p>NF-e <strong>${data.numero}</strong> · serie ${data.serie}</p>
    <p class="label">Emissao</p>
    <p>${data.dataEmissao.toLocaleString("pt-BR")}</p>
  </div>
</div>

<div class="grid2">
  <div class="card">
    <p class="label">Destinatario</p>
    <p><strong>${escapeHtml(data.destinatarioNome)}</strong></p>
    <p>${data.destinatarioCnpjCpf} — ${data.destinatarioUf}</p>
  </div>
  <div class="card">
    <p class="label">Chave de acesso</p>
    <p class="chave">${data.chaveAcesso}</p>
    <p class="label">Protocolo</p>
    <p>${data.protocolo}</p>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Cod.</th><th>Descricao</th><th>NCM</th><th>CFOP</th><th>Un.</th>
      <th>Qtd.</th><th>Vlr unit.</th><th>Vlr total</th>
    </tr>
  </thead>
  <tbody>${itensRows}</tbody>
</table>

<p class="total">Total da nota: R$ ${data.totalNota.toFixed(2)}</p>

</body>
</html>`;
}

/**
 * Stub para conversao HTML -> PDF via Puppeteer.
 * Habilitado quando puppeteer-core + chromium estiverem instalados.
 */
export async function renderDanfePdf(_data: DanfeData): Promise<Uint8Array> {
  throw new Error(
    "renderDanfePdf: nao implementado. Instale puppeteer-core + @sparticuz/chromium e descomente.",
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
