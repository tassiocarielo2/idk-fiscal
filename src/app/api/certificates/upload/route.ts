import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePfx, CertificateParseError } from "@/lib/certificates/parser";
import {
  UploadCertificateMetaSchema,
  type CertificatePurpose,
} from "@/lib/validation/certificate";

// node-forge precisa de Node runtime; Edge nao tem Buffer/asn1.
export const runtime = "nodejs";

const MAX_PFX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  // 1. Auth: usuario logado.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // 2. Parse multipart.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = formData.get("file");
  const meta = UploadCertificateMetaSchema.safeParse({
    organization_id: formData.get("organization_id"),
    branch_id: formData.get("branch_id"),
    purpose: formData.get("purpose") ?? "multi",
    password: formData.get("password"),
  });

  if (!meta.success) {
    return NextResponse.json(
      { error: "invalid_meta", issues: meta.error.issues },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_PFX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  // 3. Autorizacao: caller deve ser owner/admin da org.
  const { data: roleCheck, error: roleErr } = await supabase
    .rpc("has_org_role", {
      p_org_id: meta.data.organization_id,
      p_required_roles: ["owner", "admin"],
    })
    .single();
  if (roleErr || !roleCheck) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 4. Branch deve existir e pertencer a org. Pega CNPJ pra mismatch warning.
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

  // 5. Parse + validacao dupla (formato + senha).
  const pfxBytes = new Uint8Array(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parsePfx(pfxBytes, meta.data.password, branch.cnpj);
  } catch (e) {
    if (e instanceof CertificateParseError) {
      return NextResponse.json(
        { error: e.code.toLowerCase(), message: e.message },
        { status: e.code === "WRONG_PASSWORD" ? 400 : 422 },
      );
    }
    console.error("[POST /api/certificates/upload] parse failed:", e);
    return NextResponse.json({ error: "parse_failed" }, { status: 422 });
  }

  // 6. Saga (ADR-014): metadata → storage → vault.
  const admin = createAdminClient();

  // Fase 1: insert metadata (status active, vault_secret_ref NULL)
  const { data: insertedRows, error: metaErr } = await admin
    .from("certificates_metadata")
    .insert({
      organization_id: meta.data.organization_id,
      branch_id: meta.data.branch_id,
      cnpj_titular: parsed.cnpjTitular ?? branch.cnpj,
      razao_social_titular: parsed.razaoSocialTitular,
      subject_cn: parsed.subjectCN,
      issuer_cn: parsed.issuerCN,
      valid_from: parsed.validFrom.toISOString(),
      valid_until: parsed.validUntil.toISOString(),
      serial_number: parsed.serialNumber,
      thumbprint_sha256: parsed.thumbprintSha256,
      storage_path: "", // preenchido na fase 2
      purpose: meta.data.purpose as CertificatePurpose,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (metaErr || !insertedRows) {
    if (metaErr?.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_thumbprint" },
        { status: 409 },
      );
    }
    console.error("[upload] insert metadata:", metaErr);
    return NextResponse.json({ error: "metadata_insert_failed" }, { status: 500 });
  }

  const certId = insertedRows.id as string;
  const storagePath = `org_${meta.data.organization_id}/branch_${meta.data.branch_id}/${certId}.pfx`;

  // Fase 2: storage upload
  const { error: uploadErr } = await admin.storage
    .from("certificates")
    .upload(storagePath, pfxBytes, {
      contentType: "application/x-pkcs12",
      upsert: false,
    });

  if (uploadErr) {
    await admin.from("certificates_metadata").delete().eq("id", certId);
    console.error("[upload] storage:", uploadErr);
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }

  await admin
    .from("certificates_metadata")
    .update({ storage_path: storagePath })
    .eq("id", certId);

  // Fase 3: vault secret + atualiza vault_secret_ref via RPC
  const { error: vaultErr } = await admin.rpc("set_certificate_password", {
    p_certificate_id: certId,
    p_password: meta.data.password,
  });

  if (vaultErr) {
    await admin.storage.from("certificates").remove([storagePath]);
    await admin.from("certificates_metadata").delete().eq("id", certId);
    console.error("[upload] vault:", vaultErr);
    return NextResponse.json({ error: "vault_failed" }, { status: 500 });
  }

  // Fase 4 (best-effort): log de upload.
  await admin.from("certificate_usage_log").insert({
    certificate_id: certId,
    organization_id: meta.data.organization_id,
    branch_id: meta.data.branch_id,
    user_id: user.id,
    action: "upload",
    context: {
      cnpj_mismatch_warning: parsed.cnpjMismatchWarning,
      purpose: meta.data.purpose,
    },
  });

  return NextResponse.json({
    certificate: {
      id: certId,
      cnpj_titular: parsed.cnpjTitular,
      subject_cn: parsed.subjectCN,
      issuer_cn: parsed.issuerCN,
      valid_from: parsed.validFrom.toISOString(),
      valid_until: parsed.validUntil.toISOString(),
      serial_number: parsed.serialNumber,
      thumbprint_sha256: parsed.thumbprintSha256,
      cnpj_mismatch_warning: parsed.cnpjMismatchWarning,
    },
  });
}
