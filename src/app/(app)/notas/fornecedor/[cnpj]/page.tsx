import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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

const ALERT_LABEL: Record<string, string> = {
  pis_cofins_sem_credito: "PIS/COFINS sem crédito",
  cfop_sem_credito: "CFOP sem crédito",
  cst_icms_bloqueador: "CST ICMS bloqueador",
  ncm_monofasico: "NCM monofásico",
  cfop_devolucao_entrada: "Devolução de venda",
  fornecedor_inativo: "Fornecedor inativo",
  duplicidade_chave: "Chave duplicada",
};

type SupplierTotals = {
  emit_cnpj: string;
  emit_nome: string;
  emit_uf: string;
  notas: number;
  total_compras: number | string;
  total_pis: number | string;
  total_cofins: number | string;
  ultima_emissao: string;
  notas_em_risco: number;
};

type DocRow = {
  id: string;
  serie: number;
  numero: number;
  status: string;
  ambiente: number;
  total_nota: number | string;
  total_pis: number | string;
  total_cofins: number | string;
  data_emissao: string;
  alerts_count: number;
  has_credit_risk: boolean;
};

type AlertSummaryRow = {
  kind: string;
  severity: string;
  total: number;
};

export default async function FornecedorPage({
  params,
}: {
  params: Promise<{ cnpj: string }>;
}) {
  const { cnpj: cnpjRaw } = await params;
  const cnpj = cnpjRaw.replace(/\D/g, "");
  if (cnpj.length !== 14) notFound();

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

  const [totalsRes, docsRes] = await Promise.all([
    supabase
      .from("nfe_inbound_supplier_totals")
      .select(
        "emit_cnpj, emit_nome, emit_uf, notas, total_compras, total_pis, total_cofins, ultima_emissao, notas_em_risco",
      )
      .eq("organization_id", orgId)
      .eq("emit_cnpj", cnpj)
      .maybeSingle()
      .returns<SupplierTotals>(),
    supabase
      .from("nfe_inbound_documents")
      .select(
        `id, serie, numero, status, ambiente, total_nota, total_pis,
         total_cofins, data_emissao, alerts_count, has_credit_risk`,
      )
      .eq("organization_id", orgId)
      .eq("emit_cnpj", cnpj)
      .order("data_emissao", { ascending: false })
      .limit(50)
      .returns<DocRow[]>(),
  ]);

  const totals = totalsRes.data;
  if (!totals) notFound();
  const docs = docsRes.data ?? [];

  const docIds = docs.map((d) => d.id);
  const { data: alertRows } = docIds.length
    ? await supabase
        .from("nfe_inbound_alerts")
        .select("kind, severity")
        .in("inbound_document_id", docIds)
        .returns<Array<{ kind: string; severity: string }>>()
    : { data: [] as Array<{ kind: string; severity: string }> };

  const alertCountByKind = new Map<string, AlertSummaryRow>();
  for (const a of alertRows ?? []) {
    const key = `${a.kind}-${a.severity}`;
    const cur = alertCountByKind.get(key);
    if (cur) cur.total += 1;
    else
      alertCountByKind.set(key, {
        kind: a.kind,
        severity: a.severity,
        total: 1,
      });
  }
  const alertSummary = [...alertCountByKind.values()].sort(
    (a, b) => b.total - a.total,
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            <Link href="/notas" className="hover:text-zinc-300">
              Notas recebidas
            </Link>{" "}
            · Fornecedor
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {totals.emit_nome}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            CNPJ {fmtCnpj(totals.emit_cnpj)} · {totals.emit_uf}
          </p>
        </div>
        <Link
          href={`/notas?busca=${totals.emit_cnpj}`}
          className="text-xs px-3 py-1.5 rounded border border-zinc-800 hover:bg-zinc-900 hover:text-white text-zinc-300"
        >
          Ver na listagem geral
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Notas" value={fmtInt(Number(totals.notas))} />
        <Stat
          label="Total comprado"
          value={fmtMoney(Number(totals.total_compras))}
        />
        <Stat
          label="PIS+COFINS"
          value={fmtMoney(
            Number(totals.total_pis) + Number(totals.total_cofins),
          )}
        />
        <Stat
          label="Notas em risco"
          value={fmtInt(Number(totals.notas_em_risco))}
          tone={Number(totals.notas_em_risco) > 0 ? "warn" : "neutral"}
        />
      </div>

      <Section title="Alertas históricos por tipo">
        {alertSummary.length === 0 ? (
          <Empty>Nenhum alerta detectado para este fornecedor.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {alertSummary.map((a) => (
              <li
                key={`${a.kind}-${a.severity}`}
                className="py-2 flex items-center gap-3"
              >
                <span
                  className={`text-[10px] px-2 py-0.5 rounded ${
                    SEVERITY_BADGE[a.severity] ?? SEVERITY_BADGE.info
                  }`}
                >
                  {a.severity}
                </span>
                <span className="text-sm flex-1">
                  {ALERT_LABEL[a.kind] ?? a.kind}
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {fmtInt(a.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`Últimas ${docs.length} nota(s)`}
        subtitle={`Última emissão: ${
          totals.ultima_emissao
            ? new Date(totals.ultima_emissao).toLocaleDateString("pt-BR")
            : "—"
        }`}
      >
        {docs.length === 0 ? (
          <Empty>Nenhuma nota deste fornecedor.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {docs.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/notas/${d.id}`}
                  className="py-3 flex items-center gap-3 hover:bg-zinc-950 px-2 -mx-2 rounded"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {d.serie}/{d.numero}{" "}
                      <span className="text-zinc-500 text-xs ml-2">
                        {STATUS_LABEL[d.status] ?? d.status}
                        {d.ambiente === 2 ? " · HOM" : ""}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {new Date(d.data_emissao).toLocaleDateString("pt-BR")} ·{" "}
                      {d.alerts_count > 0
                        ? `${d.alerts_count} alerta(s)`
                        : "sem alertas"}
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    {fmtMoney(Number(d.total_nota))}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Stat({
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
      className={`rounded p-4 border ${
        tone === "warn"
          ? "border-amber-900 bg-amber-950/30"
          : "border-zinc-900"
      }`}
    >
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className="text-xl font-semibold mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-zinc-900 rounded p-5">
      <header className="mb-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500 py-3">{children}</p>;
}

function fmtCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}
