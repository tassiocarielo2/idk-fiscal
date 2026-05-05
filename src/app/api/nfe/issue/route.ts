import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NFeIssueSchema } from "@/lib/validation/nfe";
import { gerarChaveAcesso } from "@/lib/nfe/chave-acesso";
import { serializeNFe } from "@/lib/nfe/serializer";
import { signNFeXml } from "@/lib/nfe/signer";
import { transmitNFe } from "@/lib/nfe/transmitter";
import type { NFeInput } from "@/lib/nfe/types";

export const runtime = "nodejs";

/**
 * Emissao sincrona de NF-e em homologacao SEFAZ-ES.
 *
 * Fluxo:
 * 1. Valida input + autorizacao.
 * 2. Pega proximo numero (next_nfe_numero).
 * 3. Insere nfe_documents status=rascunho + nfe_items.
 * 4. Recupera senha cert via get_certificate_for_signing (service_role).
 * 5. Baixa .pfx do Storage.
 * 6. Gera chave de acesso, serializa XML, assina.
 * 7. Persiste XML em storage://nfe/<org>/<branch>/<chave>.xml.
 * 8. Atualiza status=pendente, transmite SEFAZ.
 * 9. Atualiza status conforme cStat. Se 100, persiste procNFe.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = NFeIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // 1. Autorizacao + branch
  const { data: branch, error: brErr } = await supabase
    .from("organization_branches")
    .select("id, organization_id, cnpj")
    .eq("id", parsed.data.branch_id)
    .eq("organization_id", parsed.data.organization_id)
    .is("deleted_at", null)
    .single();
  if (brErr || !branch) {
    return NextResponse.json({ error: "branch_not_found" }, { status: 404 });
  }

  // 2. Numero
  const { data: numero, error: numErr } = await supabase
    .rpc("next_nfe_numero", {
      p_branch_id: parsed.data.branch_id,
      p_modelo: "55",
      p_serie: 1,
      p_ambiente: parsed.data.ambiente,
    })
    .single();
  if (numErr || typeof numero !== "number") {
    if (numErr?.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "next_numero_failed" }, { status: 500 });
  }

  const dataEmissao = new Date();
  const totalProdutos = parsed.data.itens.reduce(
    (s, i) => s + i.quantidade * i.valor_unitario,
    0,
  );
  const totalDescontos = parsed.data.itens.reduce(
    (s, i) => s + (i.desconto ?? 0),
    0,
  );
  const totalNota = totalProdutos - totalDescontos;

  // 3. Cria documento + itens em rascunho
  const admin = createAdminClient();
  const { data: doc, error: docErr } = await admin
    .from("nfe_documents")
    .insert({
      organization_id: parsed.data.organization_id,
      branch_id: parsed.data.branch_id,
      certificate_id: parsed.data.certificate_id,
      numero,
      serie: 1,
      modelo: "55",
      ambiente: parsed.data.ambiente,
      tipo_operacao: 1,
      finalidade: 1,
      natureza_operacao: parsed.data.natureza_operacao,
      data_emissao: dataEmissao.toISOString(),
      status: "rascunho",
      dest_cnpj_cpf: parsed.data.destinatario.cnpj_cpf,
      dest_nome: parsed.data.destinatario.nome,
      dest_uf: parsed.data.destinatario.uf,
      dest_ie: parsed.data.destinatario.ie ?? null,
      total_produtos: totalProdutos,
      total_descontos: totalDescontos,
      total_frete: 0,
      total_icms: 0,
      total_pis: 0,
      total_cofins: 0,
      total_nota: totalNota,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (docErr || !doc) {
    console.error("[POST /api/nfe/issue] insert doc:", docErr);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
  const docId = doc.id as string;

  await admin.from("nfe_items").insert(
    parsed.data.itens.map((it, idx) => ({
      nfe_document_id: docId,
      numero_item: idx + 1,
      codigo: it.codigo,
      descricao: it.descricao,
      ncm: it.ncm,
      cfop: it.cfop,
      unidade: it.unidade,
      quantidade: it.quantidade,
      valor_unitario: it.valor_unitario,
      valor_total: it.quantidade * it.valor_unitario - (it.desconto ?? 0),
      desconto: it.desconto ?? 0,
      cst_csosn: it.cst_csosn,
    })),
  );

  // 4. Senha cert
  const { data: certData, error: certErr } = await admin
    .rpc("get_certificate_for_signing", {
      p_certificate_id: parsed.data.certificate_id,
      p_action: "sign.nfe",
      p_context: { nfe_document_id: docId, ambiente: parsed.data.ambiente },
    })
    .single();
  if (certErr || !certData) {
    await admin
      .from("nfe_documents")
      .update({ status: "rejeitada", motivo_rejeicao: "Cert indisponivel" })
      .eq("id", docId);
    return NextResponse.json({ error: "cert_unavailable" }, { status: 500 });
  }

  const cert = certData as {
    storage_path: string;
    password: string;
  };

  // 5. Baixa pfx
  const pfxBlob = await admin.storage
    .from("certificates")
    .download(cert.storage_path);
  if (pfxBlob.error || !pfxBlob.data) {
    return NextResponse.json({ error: "cert_download_failed" }, { status: 500 });
  }
  const pfxBytes = new Uint8Array(await pfxBlob.data.arrayBuffer());

  // 6. Chave + serializa + assina
  const chave = gerarChaveAcesso({
    uf: "ES",
    dataEmissao,
    cnpjEmitente: branch.cnpj,
    modelo: "55",
    serie: 1,
    numero,
    tipoEmissao: 1,
  });

  const nfeInput: NFeInput = {
    organizationId: parsed.data.organization_id,
    branchId: parsed.data.branch_id,
    certificateId: parsed.data.certificate_id,
    modelo: "55",
    serie: 1,
    numero,
    ambiente: parsed.data.ambiente,
    tipoOperacao: 1,
    finalidade: 1,
    naturezaOperacao: parsed.data.natureza_operacao,
    dataEmissao,
    destinatario: {
      cnpjCpf: parsed.data.destinatario.cnpj_cpf,
      nome: parsed.data.destinatario.nome,
      ie: parsed.data.destinatario.ie ?? null,
      uf: parsed.data.destinatario.uf,
      logradouro: parsed.data.destinatario.logradouro,
      numero: parsed.data.destinatario.numero,
      bairro: parsed.data.destinatario.bairro,
      cep: parsed.data.destinatario.cep,
      municipioIbge: parsed.data.destinatario.municipio_ibge,
      email: parsed.data.destinatario.email,
    },
    itens: parsed.data.itens.map((it, idx) => ({
      numeroItem: idx + 1,
      codigo: it.codigo,
      descricao: it.descricao,
      ncm: it.ncm,
      cfop: it.cfop,
      unidade: it.unidade,
      quantidade: it.quantidade,
      valorUnitario: it.valor_unitario,
      valorTotal: it.quantidade * it.valor_unitario - (it.desconto ?? 0),
      desconto: it.desconto,
      cstCsosn: it.cst_csosn,
    })),
    totais: {
      totalProdutos,
      totalDescontos,
      totalFrete: 0,
      totalIcms: 0,
      totalPis: 0,
      totalCofins: 0,
      totalNota,
    },
    observacoes: parsed.data.observacoes,
  };

  const xml = serializeNFe(nfeInput, chave);
  const signed = signNFeXml({ xml, pfxBytes, pfxPassword: cert.password });

  // 7. Persiste XML
  const xmlPath = `org_${parsed.data.organization_id}/branch_${parsed.data.branch_id}/${chave}.xml`;
  await admin.storage.from("nfe").upload(xmlPath, new Blob([signed.xml]), {
    contentType: "application/xml",
    upsert: false,
  });

  await admin
    .from("nfe_documents")
    .update({
      chave_acesso: chave,
      status: "pendente",
      xml_path: xmlPath,
      transmitted_at: new Date().toISOString(),
    })
    .eq("id", docId);

  // 8. Transmite
  const resp = await transmitNFe({
    uf: "ES",
    ambiente: parsed.data.ambiente,
    pfxBytes,
    pfxPassword: cert.password,
    signedXml: signed.xml,
    chaveAcesso: chave,
  });

  // 9. Atualiza status
  if (resp.cStat === "100") {
    const procPath = `org_${parsed.data.organization_id}/branch_${parsed.data.branch_id}/${chave}-procNFe.xml`;
    if (resp.authorizedXml) {
      await admin.storage.from("nfe").upload(procPath, new Blob([resp.authorizedXml]), {
        contentType: "application/xml",
        upsert: false,
      });
    }
    await admin
      .from("nfe_documents")
      .update({
        status: "autorizada",
        protocolo: resp.protocolo,
        xml_authorized_path: procPath,
        authorized_at: new Date().toISOString(),
      })
      .eq("id", docId);

    return NextResponse.json({
      ok: true,
      nfe_document_id: docId,
      chave_acesso: chave,
      protocolo: resp.protocolo,
      status: "autorizada",
    });
  }

  await admin
    .from("nfe_documents")
    .update({
      status: "rejeitada",
      motivo_rejeicao: `[${resp.cStat}] ${resp.xMotivo}`,
    })
    .eq("id", docId);

  return NextResponse.json(
    {
      ok: false,
      nfe_document_id: docId,
      chave_acesso: chave,
      cStat: resp.cStat,
      xMotivo: resp.xMotivo,
      status: "rejeitada",
    },
    { status: 422 },
  );
}
