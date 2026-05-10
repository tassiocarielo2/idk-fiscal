import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  autorizada: "Autorizada",
  cancelada: "Cancelada",
  denegada: "Denegada",
  desconhecida: "Status desconhecido",
};

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-zinc-800 text-zinc-300",
  warn: "bg-amber-950 text-amber-300 border border-amber-900",
  critical: "bg-red-950 text-red-300 border border-red-900",
};

type AlertRow = {
  id: string;
  kind: string;
  severity: string;
  titulo: string;
};

type DocRow = {
  id: string;
  chave_acesso: string;
  numero: number;
  serie: number;
  ambiente: number;
  status: string;
  emit_cnpj: string;
  emit_nome: string;
  emit_uf: string;
  total_nota: number | string;
  total_pis: number | string;
  total_cofins: number | string;
  data_emissao: string;
  alerts_count: number;
  has_credit_risk: boolean;
  nfe_inbound_alerts: AlertRow[];
};

export default async function NotasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .limit(1);

  const orgId = memberships?.[0]?.organization_id;
  if (!orgId) redirect("/onboarding");

  const { data: docs } = await supabase
    .from("nfe_inbound_documents")
    .select(
      `id, chave_acesso, numero, serie, ambiente, status, emit_cnpj, emit_nome,
       emit_uf, total_nota, total_pis, total_cofins, data_emissao, alerts_count,
       has_credit_risk,
       nfe_inbound_alerts ( id, kind, severity, titulo )`,
    )
    .eq("organization_id", orgId)
    .order("data_emissao", { ascending: false })
    .limit(100)
    .returns<DocRow[]>();

  const totalNotas = docs?.length ?? 0;
  const totalAlertas = docs?.reduce((acc, d) => acc + (d.alerts_count || 0), 0) ?? 0;
  const totalCreditoRisco =
    docs
      ?.filter((d) => d.has_credit_risk)
      .reduce((acc, d) => acc + Number(d.total_pis) + Number(d.total_cofins), 0) ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Notas recebidas
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            NF-e de compras
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Faça upload de XMLs de notas recebidas. Detectamos riscos de crédito
            de PIS/COFINS automaticamente.
          </p>
        </div>
        <Link
          href="/notas/upload"
          className="inline-flex items-center gap-2 rounded bg-zinc-100 text-zinc-900 px-3 py-2 text-sm font-medium hover:bg-white"
        >
          + Subir XMLs
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card label="Notas" value={String(totalNotas)} />
        <Card label="Alertas" value={String(totalAlertas)} />
        <Card
          label="PIS/COFINS em risco"
          value={`R$ ${totalCreditoRisco.toFixed(2)}`}
          tone={totalCreditoRisco > 0 ? "warn" : "neutral"}
        />
      </div>

      <ul className="flex flex-col divide-y divide-zinc-900 border border-zinc-900 rounded">
        {docs?.length ? (
          docs.map((d) => (
            <li key={d.id} className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium">
                    {d.serie}/{d.numero} · {d.emit_nome}
                  </span>
                  <span className="text-xs text-zinc-500">
                    CNPJ {d.emit_cnpj} · {d.emit_uf} ·{" "}
                    {new Date(d.data_emissao).toLocaleDateString("pt-BR")} ·{" "}
                    {STATUS_LABEL[d.status] ?? d.status}
                    {d.ambiente === 2 ? " · HOM" : ""}
                  </span>
                  <span className="text-xs text-zinc-600 mt-1 font-mono">
                    {d.chave_acesso}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">
                    R$ {Number(d.total_nota).toFixed(2)}
                  </div>
                  <div className="text-xs text-zinc-500">
                    PIS R$ {Number(d.total_pis).toFixed(2)} · COFINS R${" "}
                    {Number(d.total_cofins).toFixed(2)}
                  </div>
                </div>
              </div>
              {d.nfe_inbound_alerts?.length ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {d.nfe_inbound_alerts.map((a) => (
                    <span
                      key={a.id}
                      className={`text-xs px-2 py-1 rounded ${
                        SEVERITY_BADGE[a.severity] ?? SEVERITY_BADGE.info
                      }`}
                      title={a.kind}
                    >
                      {a.titulo}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))
        ) : (
          <li className="p-5 text-sm text-zinc-500">
            Nenhuma nota recebida ainda. Comece subindo o XML de uma NF-e de
            compra.
          </li>
        )}
      </ul>
    </div>
  );
}

function Card({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warn";
}) {
  return (
    <div
      className={`border rounded p-4 ${
        tone === "warn" ? "border-amber-900 bg-amber-950/30" : "border-zinc-900"
      }`}
    >
      <p className="text-xs uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}
