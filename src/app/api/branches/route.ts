import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CreateBranchSchema } from "@/lib/validation/branch";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("organization_id");
  if (!orgId) {
    return NextResponse.json({ error: "organization_id_required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("organization_branches")
    .select(
      "id, cnpj, razao_social, nome_fantasia, is_headquarters, status, uf, municipio_ibge, inscricao_estadual, inscricao_municipal, logradouro, numero, complemento, bairro, cep, created_at",
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("is_headquarters", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ branches: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateBranchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .rpc("create_branch", {
      p_organization_id: parsed.data.organization_id,
      p_cnpj: parsed.data.cnpj,
      p_razao_social: parsed.data.razao_social,
      p_nome_fantasia: parsed.data.nome_fantasia ?? null,
      p_uf: parsed.data.uf,
      p_municipio_ibge: parsed.data.municipio_ibge ?? null,
      p_inscricao_estadual: parsed.data.inscricao_estadual ?? null,
      p_inscricao_municipal: parsed.data.inscricao_municipal ?? null,
      p_logradouro: parsed.data.logradouro ?? "",
      p_numero: parsed.data.numero ?? "",
      p_complemento: parsed.data.complemento ?? null,
      p_bairro: parsed.data.bairro ?? "",
      p_cep: parsed.data.cep ?? "",
    })
    .single();

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error.code === "23505") {
      return NextResponse.json({ error: "cnpj_duplicate" }, { status: 409 });
    }
    console.error("[POST /api/branches]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({ branch: data });
}
