import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectAlerts } from "@/lib/nfe/alerts";
import { rebuildParsedNFeFromDb } from "@/lib/nfe/inbound-rebuild";

export const runtime = "nodejs";

/**
 * POST /api/nfe-inbound/reprocess-alerts
 * Body opcional: { document_ids?: string[] } — quando ausente, reprocessa
 * todas as notas da org que o caller administra.
 *
 * Reaplica `detectAlerts` em todas as notas selecionadas, substitui os
 * registros em `nfe_inbound_alerts` (delete + insert) e atualiza
 * `alerts_count` + `has_credit_risk`.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { organization_id?: string; document_ids?: string[] } = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      body = await request.json();
    }
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.organization_id) {
    return NextResponse.json(
      { error: "organization_id_required" },
      { status: 400 },
    );
  }

  // Autorização: owner/admin/member da org pode reprocessar (mesma regra
  // de ler/escrever alertas).
  const { data: roleCheck, error: roleErr } = await supabase
    .rpc("has_org_role", {
      p_org_id: body.organization_id,
      p_required_roles: ["owner", "admin"],
    })
    .single();
  if (roleErr || !roleCheck) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  let docsQuery = admin
    .from("nfe_inbound_documents")
    .select(
      `id, chave_acesso, modelo, serie, numero, ambiente, natureza_operacao,
       data_emissao, status, protocolo,
       emit_cnpj, emit_nome, emit_uf, emit_ie,
       dest_cnpj_cpf, dest_nome,
       total_produtos, total_descontos, total_frete, total_icms,
       total_pis, total_cofins, total_nota, xml_sha256`,
    )
    .eq("organization_id", body.organization_id);

  if (body.document_ids?.length) {
    docsQuery = docsQuery.in("id", body.document_ids);
  }

  const { data: docs, error: docsErr } = await docsQuery;
  if (docsErr) {
    return NextResponse.json(
      { error: "fetch_failed", detail: docsErr.message },
      { status: 500 },
    );
  }

  let processed = 0;
  let alertsTotal = 0;
  const errors: Array<{ document_id: string; reason: string }> = [];

  for (const doc of docs ?? []) {
    const { data: items, error: itemsErr } = await admin
      .from("nfe_inbound_items")
      .select(
        `numero_item, codigo, descricao, ncm, cfop, unidade,
         quantidade, valor_unitario, valor_total, desconto,
         cst_csosn, icms_aliquota, icms_valor,
         pis_cst, pis_aliquota, pis_valor,
         cofins_cst, cofins_aliquota, cofins_valor`,
      )
      .eq("inbound_document_id", doc.id);
    if (itemsErr) {
      errors.push({ document_id: doc.id, reason: itemsErr.message });
      continue;
    }

    const parsed = rebuildParsedNFeFromDb(doc, items ?? []);
    const alerts = detectAlerts(parsed);

    const { error: delErr } = await admin
      .from("nfe_inbound_alerts")
      .delete()
      .eq("inbound_document_id", doc.id);
    if (delErr) {
      errors.push({ document_id: doc.id, reason: `delete: ${delErr.message}` });
      continue;
    }

    if (alerts.length > 0) {
      const { error: insErr } = await admin.from("nfe_inbound_alerts").insert(
        alerts.map((a) => ({
          inbound_document_id: doc.id,
          organization_id: body.organization_id,
          kind: a.kind,
          severity: a.severity,
          titulo: a.titulo,
          detalhe: a.detalhe,
        })),
      );
      if (insErr) {
        errors.push({ document_id: doc.id, reason: `insert: ${insErr.message}` });
        continue;
      }
    }

    await admin
      .from("nfe_inbound_documents")
      .update({
        alerts_count: alerts.length,
        has_credit_risk: alerts.some((a) => a.severity !== "info"),
      })
      .eq("id", doc.id);

    processed++;
    alertsTotal += alerts.length;
  }

  return NextResponse.json({
    processed,
    total_alerts: alertsTotal,
    errors,
  });
}
