import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReprocessButton from "./reprocess-button";

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

const PERIODOS: Record<string, number | null> = {
  "30d": 30,
  "90d": 90,
  "12m": 365,
  todos: null,
};

const STATUSES = ["autorizada", "cancelada", "denegada", "desconhecida"] as const;

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

type SearchParams = {
  periodo?: string;
  status?: string;
  alertas?: string;
  busca?: string;
};

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const periodoKey = sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "90d";
  const statusFilter =
    sp.status && (STATUSES as readonly string[]).includes(sp.status)
      ? sp.status
      : null;
  const onlyAlerts = sp.alertas === "1";
  const busca = (sp.busca ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .limit(1);

  const orgId = memberships?.[0]?.organization_id;
  const role = memberships?.[0]?.role;
  if (!orgId) redirect("/onboarding");
  const canReprocess = role === "owner" || role === "admin";

  let query = supabase
    .from("nfe_inbound_documents")
    .select(
      `id, chave_acesso, numero, serie, ambiente, status, emit_cnpj, emit_nome,
       emit_uf, total_nota, total_pis, total_cofins, data_emissao, alerts_count,
       has_credit_risk,
       nfe_inbound_alerts ( id, kind, severity, titulo )`,
    )
    .eq("organization_id", orgId)
    .order("data_emissao", { ascending: false })
    .limit(100);

  const periodoDays = PERIODOS[periodoKey];
  if (periodoDays != null) {
    const since = new Date();
    since.setDate(since.getDate() - periodoDays);
    query = query.gte("data_emissao", since.toISOString());
  }
  if (statusFilter) {
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

  const { data: docs } = await query.returns<DocRow[]>();
  const rows = docs ?? [];

  const totalNotas = rows.length;
  const totalAlertas = rows.reduce((acc, d) => acc + (d.alerts_count || 0), 0);
  const totalCreditoRisco = rows
    .filter((d) => d.has_credit_risk)
    .reduce((acc, d) => acc + Number(d.total_pis) + Number(d.total_cofins), 0);

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
        <div className="flex flex-col items-end gap-2">
          <Link
            href="/notas/upload"
            className="inline-flex items-center gap-2 rounded bg-zinc-100 text-zinc-900 px-3 py-2 text-sm font-medium hover:bg-white"
          >
            + Subir XMLs
          </Link>
          {canReprocess ? <ReprocessButton organizationId={orgId} /> : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card label="Notas no filtro" value={String(totalNotas)} />
        <Card label="Alertas" value={String(totalAlertas)} />
        <Card
          label="PIS/COFINS em risco"
          value={`R$ ${totalCreditoRisco.toFixed(2)}`}
          tone={totalCreditoRisco > 0 ? "warn" : "neutral"}
        />
      </div>

      <form
        method="get"
        className="border border-zinc-900 rounded p-3 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Período
          </label>
          <select
            name="periodo"
            defaultValue={periodoKey}
            className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm"
          >
            <option value="30d">30 dias</option>
            <option value="90d">90 dias</option>
            <option value="12m">12 meses</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Status
          </label>
          <select
            name="status"
            defaultValue={statusFilter ?? ""}
            className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Buscar (nome, CNPJ ou chave)
          </label>
          <input
            type="text"
            name="busca"
            defaultValue={busca}
            placeholder="Nome do fornecedor, CNPJ ou chave"
            className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="alertas"
            value="1"
            defaultChecked={onlyAlerts}
            className="accent-emerald-500"
          />
          Só com alerta
        </label>
        <button
          type="submit"
          className="text-sm rounded bg-zinc-100 text-zinc-900 px-3 py-1.5 font-medium hover:bg-white"
        >
          Aplicar
        </button>
        {(statusFilter || onlyAlerts || busca || periodoKey !== "90d") && (
          <Link
            href="/notas"
            className="text-xs text-zinc-500 hover:text-zinc-300 underline"
          >
            limpar
          </Link>
        )}
      </form>

      <ul className="flex flex-col divide-y divide-zinc-900 border border-zinc-900 rounded">
        {rows.length ? (
          rows.map((d) => (
            <li key={d.id}>
              <Link
                href={`/notas/${d.id}`}
                className="p-4 flex flex-col gap-2 hover:bg-zinc-950"
              >
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
              </Link>
            </li>
          ))
        ) : (
          <li className="p-5 text-sm text-zinc-500">
            Nenhuma nota no filtro atual.{" "}
            <Link href="/notas" className="underline">
              Limpar filtros
            </Link>{" "}
            ou{" "}
            <Link href="/notas/upload" className="underline">
              subir um XML
            </Link>
            .
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
