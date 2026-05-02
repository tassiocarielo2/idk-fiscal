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
  let q = supabase
    .from("organization_branches")
    .select(
      "id, organization_id, cnpj, razao_social, nome_fantasia, is_headquarters, status, uf, inscricao_estadual, inscricao_municipal, logradouro, numero, bairro, cep, municipio_ibge, created_at",
    )
    .is("deleted_at", null)
    .order("is_headquarters", { ascending: false })
    .order("razao_social", { ascending: true });
  if (orgId) q = q.eq("organization_id", orgId);

  const { data, error } = await q;
  if (error) {
    console.error("[GET /api/branches] error:", error);
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

  // INSERT eh gateado por RLS (has_org_role owner/admin).
  const { data, error } = await supabase
    .from("organization_branches")
    .insert({
      organization_id: parsed.data.organization_id,
      cnpj: parsed.data.cnpj,
      razao_social: parsed.data.razao_social,
      nome_fantasia: parsed.data.nome_fantasia ?? null,
      uf: parsed.data.uf,
      inscricao_estadual: parsed.data.inscricao_estadual ?? null,
      inscricao_municipal: parsed.data.inscricao_municipal ?? null,
      logradouro: parsed.data.logradouro ?? "",
      numero: parsed.data.numero ?? "",
      complemento: parsed.data.complemento ?? null,
      bairro: parsed.data.bairro ?? "",
      cep: parsed.data.cep ?? "",
      municipio_ibge: parsed.data.municipio_ibge ?? null,
      is_headquarters: false,
      status: "active",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST301") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_cnpj" },
        { status: 409 },
      );
    }
    console.error("[POST /api/branches] error:", error);
    return NextResponse.json(
      { error: "internal", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ branch: data }, { status: 201 });
}
