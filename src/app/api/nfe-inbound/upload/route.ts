import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseNFeXml, ParseNFeError, type ParsedNFe } from "@/lib/nfe/parser";
import { detectAlerts } from "@/lib/nfe/alerts";
import { UploadInboundMetaSchema } from "@/lib/validation/nfe-inbound";

export const runtime = "nodejs";

const MAX_XML_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 50;

type FileResult =
  | { file: string; status: "ok"; chave: string; alerts: number }
  | { file: string; status: "duplicate"; chave: string }
  | { file: string; status: "error"; reason: string };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const meta = UploadInboundMetaSchema.safeParse({
    organization_id: formData.get("organization_id"),
    branch_id: formData.get("branch_id"),
  });
  if (!meta.success) {
    return NextResponse.json(
      { error: "invalid_meta", issues: meta.error.issues },
      { status: 400 },
    );
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "no_files" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: "too_many_files", max: MAX_FILES },
      { status: 413 },
    );
  }

  // Autorização: caller precisa ser owner/admin/member da org E do branch.
  const { data: roleCheck, error: roleErr } = await supabase
    .rpc("has_org_role", {
      p_org_id: meta.data.organization_id,
      p_required_roles: ["owner", "admin", "member"],
    })
    .single();
  if (roleErr || !roleCheck) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: branch, error: branchErr } = await supabase
    .from("organization_branches")
    .select("id, organization_id, cnpj")
    .eq("id", meta.data.branch_id)
    .eq("organization_id", meta.data.organization_id)
    .is("deleted_at", null)
    .single();
  if (branchErr || !branch) {
    return NextResponse.json({ error: "branch_not_found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const results: FileResult[] = [];

  for (const file of files) {
    const fileLabel = file.name || "(sem nome)";
    if (file.size > MAX_XML_BYTES) {
      results.push({ file: fileLabel, status: "error", reason: "file_too_large" });
      continue;
    }

    let xml: string;
    try {
      xml = await file.text();
    } catch {
      results.push({ file: fileLabel, status: "error", reason: "read_failed" });
      continue;
    }

    let parsed: ParsedNFe;
    try {
      parsed = parseNFeXml(xml);
    } catch (e) {
      const reason =
        e instanceof ParseNFeError ? e.message : "parse_failed";
      results.push({ file: fileLabel, status: "error", reason });
      continue;
    }

    // Dedup por (org, chave) antes de tentar storage.
    const { data: existing } = await admin
      .from("nfe_inbound_documents")
      .select("id")
      .eq("organization_id", meta.data.organization_id)
      .eq("chave_acesso", parsed.chaveAcesso)
      .maybeSingle();
    if (existing) {
      results.push({
        file: fileLabel,
        status: "duplicate",
        chave: parsed.chaveAcesso,
      });
      continue;
    }

    const storagePath = `org_${meta.data.organization_id}/branch_${meta.data.branch_id}/inbound/${parsed.chaveAcesso}.xml`;

    const { error: uploadErr } = await admin.storage
      .from("nfe")
      .upload(storagePath, new Blob([xml], { type: "application/xml" }), {
        contentType: "application/xml",
        upsert: false,
      });
    if (uploadErr && !uploadErr.message.includes("already exists")) {
      results.push({
        file: fileLabel,
        status: "error",
        reason: `storage: ${uploadErr.message}`,
      });
      continue;
    }

    const alerts = detectAlerts(parsed);

    const { data: docRow, error: insertErr } = await admin
      .from("nfe_inbound_documents")
      .insert({
        organization_id: meta.data.organization_id,
        branch_id: meta.data.branch_id,
        chave_acesso: parsed.chaveAcesso,
        modelo: parsed.modelo,
        serie: parsed.serie,
        numero: parsed.numero,
        ambiente: parsed.ambiente,
        natureza_operacao: parsed.naturezaOperacao,
        data_emissao: parsed.dataEmissao.toISOString(),
        status: parsed.status,
        protocolo: parsed.protocolo,
        xml_path: storagePath,
        xml_sha256: parsed.xmlSha256,
        emit_cnpj: parsed.emitente.cnpj,
        emit_nome: parsed.emitente.nome,
        emit_uf: parsed.emitente.uf,
        emit_ie: parsed.emitente.ie,
        dest_cnpj_cpf: parsed.destinatario.cnpjCpf,
        dest_nome: parsed.destinatario.nome,
        total_produtos: parsed.totais.produtos,
        total_descontos: parsed.totais.descontos,
        total_frete: parsed.totais.frete,
        total_icms: parsed.totais.icms,
        total_pis: parsed.totais.pis,
        total_cofins: parsed.totais.cofins,
        total_nota: parsed.totais.nota,
        has_credit_risk: alerts.some((a) => a.severity !== "info"),
        alerts_count: alerts.length,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertErr || !docRow) {
      await admin.storage.from("nfe").remove([storagePath]);
      const reason =
        insertErr?.code === "23505"
          ? "duplicate_chave"
          : insertErr?.message ?? "insert_failed";
      results.push({ file: fileLabel, status: "error", reason });
      continue;
    }

    const docId = docRow.id as string;

    if (parsed.itens.length > 0) {
      const { error: itemsErr } = await admin.from("nfe_inbound_items").insert(
        parsed.itens.map((it) => ({
          inbound_document_id: docId,
          numero_item: it.numeroItem,
          codigo: it.codigo,
          descricao: it.descricao,
          ncm: it.ncm,
          cfop: it.cfop,
          unidade: it.unidade,
          quantidade: it.quantidade,
          valor_unitario: it.valorUnitario,
          valor_total: it.valorTotal,
          desconto: it.desconto,
          cst_csosn: it.cstCsosn,
          icms_aliquota: it.icmsAliquota,
          icms_valor: it.icmsValor,
          pis_cst: it.pisCst,
          pis_aliquota: it.pisAliquota,
          pis_valor: it.pisValor,
          cofins_cst: it.cofinsCst,
          cofins_aliquota: it.cofinsAliquota,
          cofins_valor: it.cofinsValor,
        })),
      );
      if (itemsErr) {
        await admin.from("nfe_inbound_documents").delete().eq("id", docId);
        await admin.storage.from("nfe").remove([storagePath]);
        results.push({
          file: fileLabel,
          status: "error",
          reason: `itens: ${itemsErr.message}`,
        });
        continue;
      }
    }

    if (alerts.length > 0) {
      await admin.from("nfe_inbound_alerts").insert(
        alerts.map((a) => ({
          inbound_document_id: docId,
          organization_id: meta.data.organization_id,
          kind: a.kind,
          severity: a.severity,
          titulo: a.titulo,
          detalhe: a.detalhe,
        })),
      );
    }

    results.push({
      file: fileLabel,
      status: "ok",
      chave: parsed.chaveAcesso,
      alerts: alerts.length,
    });
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  return NextResponse.json({ summary, results });
}
