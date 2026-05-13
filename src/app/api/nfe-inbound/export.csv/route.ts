import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PERIODOS: Record<string, number | null> = {
  "30d": 30,
  "90d": 90,
  "12m": 365,
  todos: null,
};

const STATUSES = ["autorizada", "cancelada", "denegada", "desconhecida"];

type Row = {
  chave_acesso: string;
  serie: number;
  numero: number;
  ambiente: number;
  status: string;
  data_emissao: string;
  natureza_operacao: string;
  emit_cnpj: string;
  emit_nome: string;
  emit_uf: string;
  emit_ie: string | null;
  total_produtos: number | string;
  total_icms: number | string;
  total_pis: number | string;
  total_cofins: number | string;
  total_nota: number | string;
  alerts_count: number;
  has_credit_risk: boolean;
};

/**
 * GET /api/nfe-inbound/export.csv?periodo=30d&status=autorizada&busca=ACME
 *
 * CSV com BOM UTF-8 (Excel-pt reconhece) e separador ';' (padrão pt-BR).
 * Filtros idênticos aos da listagem `/notas`. Sem cabeçalho de paginação:
 * limite duro 5000 linhas por requisição.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("unauthenticated", { status: 401 });
  }

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .limit(1);
  const orgId = memberships?.[0]?.organization_id;
  if (!orgId) {
    return new Response("no_org", { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const periodoKey = sp.get("periodo") ?? "90d";
  const statusFilter = sp.get("status");
  const busca = (sp.get("busca") ?? "").trim();
  const onlyAlerts = sp.get("alertas") === "1";

  let query = supabase
    .from("nfe_inbound_documents")
    .select(
      `chave_acesso, serie, numero, ambiente, status, data_emissao,
       natureza_operacao, emit_cnpj, emit_nome, emit_uf, emit_ie,
       total_produtos, total_icms, total_pis, total_cofins, total_nota,
       alerts_count, has_credit_risk`,
    )
    .eq("organization_id", orgId)
    .order("data_emissao", { ascending: false })
    .limit(5000);

  const days = PERIODOS[periodoKey];
  if (days != null) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    query = query.gte("data_emissao", since.toISOString());
  }
  if (statusFilter && STATUSES.includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }
  if (onlyAlerts) {
    query = query.gt("alerts_count", 0);
  }
  if (busca) {
    if (/^[0-9]+$/.test(busca)) {
      query = query.or(`emit_cnpj.ilike.%${busca}%,chave_acesso.ilike.%${busca}%`);
    } else {
      query = query.ilike("emit_nome", `%${busca}%`);
    }
  }

  const { data, error } = await query.returns<Row[]>();
  if (error) {
    return new Response(`fetch_failed: ${error.message}`, { status: 500 });
  }

  const headers = [
    "chave_acesso",
    "serie",
    "numero",
    "ambiente",
    "status",
    "data_emissao",
    "natureza_operacao",
    "emit_cnpj",
    "emit_nome",
    "emit_uf",
    "emit_ie",
    "total_produtos",
    "total_icms",
    "total_pis",
    "total_cofins",
    "total_nota",
    "alerts_count",
    "has_credit_risk",
  ];

  const lines: string[] = [headers.join(";")];
  for (const r of data ?? []) {
    lines.push(
      [
        r.chave_acesso,
        r.serie,
        r.numero,
        r.ambiente === 1 ? "producao" : "homologacao",
        r.status,
        r.data_emissao,
        csvEscape(r.natureza_operacao),
        r.emit_cnpj,
        csvEscape(r.emit_nome),
        r.emit_uf,
        csvEscape(r.emit_ie ?? ""),
        fmtNum(r.total_produtos),
        fmtNum(r.total_icms),
        fmtNum(r.total_pis),
        fmtNum(r.total_cofins),
        fmtNum(r.total_nota),
        r.alerts_count,
        r.has_credit_risk ? "1" : "0",
      ].join(";"),
    );
  }

  const csv = "﻿" + lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="nfe-inbound-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function fmtNum(n: number | string): string {
  // Excel-pt usa vírgula como separador decimal.
  return String(Number(n).toFixed(2)).replace(".", ",");
}
