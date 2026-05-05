import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderDanfeHtml } from "@/lib/danfe/render";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;

  const { data: doc, error } = await supabase
    .from("nfe_documents")
    .select(
      "chave_acesso, numero, serie, ambiente, data_emissao, protocolo, dest_cnpj_cpf, dest_nome, dest_uf, total_nota, organization_branches:branch_id(razao_social, nome_fantasia, cnpj), nfe_items(codigo, descricao, ncm, cfop, unidade, quantidade, valor_unitario, valor_total)",
    )
    .eq("id", id)
    .single();

  if (error || !doc?.chave_acesso || !doc.protocolo) {
    return NextResponse.json(
      { error: "doc_unavailable_or_unauthorized" },
      { status: 404 },
    );
  }

  const branch = doc.organization_branches as unknown as {
    razao_social: string;
    nome_fantasia: string | null;
    cnpj: string;
  } | null;

  const html = renderDanfeHtml({
    chaveAcesso: doc.chave_acesso,
    protocolo: doc.protocolo,
    numero: doc.numero as number,
    serie: doc.serie as number,
    ambiente: doc.ambiente as 1 | 2,
    dataEmissao: new Date(doc.data_emissao as string),
    emitenteCnpj: branch?.cnpj ?? "",
    emitenteNome: branch?.nome_fantasia ?? branch?.razao_social ?? "",
    destinatarioCnpjCpf: doc.dest_cnpj_cpf as string,
    destinatarioNome: doc.dest_nome as string,
    destinatarioUf: doc.dest_uf as string,
    totalNota: Number(doc.total_nota),
    itens: (doc.nfe_items as Array<Record<string, unknown>>).map((it) => ({
      codigo: String(it.codigo ?? ""),
      descricao: String(it.descricao ?? ""),
      ncm: String(it.ncm ?? ""),
      cfop: String(it.cfop ?? ""),
      unidade: String(it.unidade ?? ""),
      quantidade: Number(it.quantidade ?? 0),
      valorUnitario: Number(it.valor_unitario ?? 0),
      valorTotal: Number(it.valor_total ?? 0),
    })),
  });

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
