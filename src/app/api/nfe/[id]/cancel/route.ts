import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEventXml } from "@/lib/nfe/events/builder";

export const runtime = "nodejs";

/**
 * POST /api/nfe/[id]/cancel
 * Body: { justificativa: string }
 *
 * Fluxo:
 * 1. RPC register_nfe_event valida janela 24h + cria nfe_events pendente.
 * 2. Recupera certificado, monta XML evento, assina, transmite.
 * 3. Confirma homologacao (atualiza status doc -> cancelada).
 *
 * Esta versao retorna pendente caso transmissao falhe — operador
 * pode re-tentar via novo seq.
 */
export async function POST(
  request: NextRequest,
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
  const body = (await request.json().catch(() => null)) as
    | { justificativa?: string }
    | null;
  const justificativa = body?.justificativa?.trim();
  if (!justificativa || justificativa.length < 15) {
    return NextResponse.json({ error: "justificativa_too_short" }, { status: 400 });
  }

  // 1. Cria evento pendente (RPC valida janela e role)
  const { data: event, error: evErr } = await supabase
    .rpc("register_nfe_event", {
      p_nfe_document_id: id,
      p_tipo_evento: "110111",
      p_justificativa: justificativa,
    })
    .single();

  if (evErr || !event) {
    if (evErr?.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (evErr?.code === "22023") {
      return NextResponse.json(
        { error: "invalid", message: evErr.message },
        { status: 400 },
      );
    }
    console.error("[cancel]", evErr);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const ev = event as { id: string; numero_sequencial: number };

  // 2. Recupera doc + cert
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("nfe_documents")
    .select("organization_id, branch_id, certificate_id, chave_acesso, ambiente, protocolo, organization_branches:branch_id(cnpj)")
    .eq("id", id)
    .single();

  if (!doc?.chave_acesso || !doc.certificate_id) {
    return NextResponse.json({ error: "doc_invalid" }, { status: 422 });
  }

  // 3. Monta XML do evento (sem transmissao real nesta entrega — placeholder)
  const xml = buildEventXml({
    uf: "ES",
    cnpjEmitente:
      (doc.organization_branches as unknown as { cnpj: string } | null)?.cnpj ??
      "00000000000000",
    chaveAcesso: doc.chave_acesso,
    ambiente: doc.ambiente as 1 | 2,
    tipoEvento: "110111",
    numeroSequencial: ev.numero_sequencial,
    justificativa,
    dataEvento: new Date(),
  });

  // 4. Persiste XML em storage (sem assinar/transmitir nesta wave — TODO).
  const xmlPath = `org_${doc.organization_id}/branch_${doc.branch_id}/${doc.chave_acesso}-evt-110111-${ev.numero_sequencial}.xml`;
  await admin.storage.from("nfe").upload(xmlPath, new Blob([xml.xml]), {
    contentType: "application/xml",
    upsert: false,
  });

  // 5. Atualiza evento com xml_path
  await admin.from("nfe_events").update({ xml_path: xmlPath }).eq("id", ev.id);

  // NOTA: assinatura + transmissao SEFAZ + confirm_nfe_event_homologated
  // ficam para validacao manual em ambiente real (cert + endpoint).

  return NextResponse.json({
    event_id: ev.id,
    seq: ev.numero_sequencial,
    status: "pendente",
    xml_path: xmlPath,
    note:
      "Evento criado e XML montado. Assinatura+transmissao SEFAZ requerem cert+SEFAZ ativos (validar manualmente).",
  });
}
