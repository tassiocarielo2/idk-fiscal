import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ALERT_LABEL: Record<string, string> = {
  pis_cofins_sem_credito: "PIS/COFINS sem crédito",
  cfop_sem_credito: "CFOP sem crédito",
  cst_icms_bloqueador: "CST ICMS bloqueador",
  fornecedor_inativo: "Fornecedor inativo",
  duplicidade_chave: "Chave duplicada",
};

const SEVERITY_DOT: Record<string, string> = {
  info: "bg-zinc-500",
  warn: "bg-amber-400",
  critical: "bg-red-400",
};

type MonthlyRow = {
  mes: string;
  notas: number;
  total_compras: number | string;
  total_pis: number | string;
  total_cofins: number | string;
  notas_em_risco: number;
};

type SupplierRow = {
  emit_cnpj: string;
  emit_nome: string;
  emit_uf: string;
  notas: number;
  total_compras: number | string;
  total_pis: number | string;
  total_cofins: number | string;
  notas_em_risco: number;
};

type NcmRow = {
  ncm: string;
  notas: number;
  itens: number;
  valor_total: number | string;
  pis_valor: number | string;
  cofins_valor: number | string;
};

type AlertSummaryRow = {
  kind: string;
  severity: string;
  total: number;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select(
      "role, organizations(id, razao_social, nome_fantasia, regime_tributario, uf)",
    )
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .limit(1);

  const membership = memberships?.[0];
  if (!membership) redirect("/onboarding");

  const org = membership.organizations as unknown as {
    id: string;
    razao_social: string;
    nome_fantasia: string | null;
    regime_tributario: string;
    uf: string;
  } | null;
  const orgId = org?.id;
  if (!orgId) redirect("/onboarding");

  const since = new Date();
  since.setMonth(since.getMonth() - 11);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [monthlyRes, suppliersRes, ncmsRes, alertsRes] = await Promise.all([
    supabase
      .from("nfe_inbound_monthly")
      .select(
        "mes, notas, total_compras, total_pis, total_cofins, notas_em_risco",
      )
      .eq("organization_id", orgId)
      .gte("mes", since.toISOString())
      .order("mes", { ascending: true })
      .returns<MonthlyRow[]>(),
    supabase
      .from("nfe_inbound_supplier_totals")
      .select(
        "emit_cnpj, emit_nome, emit_uf, notas, total_compras, total_pis, total_cofins, notas_em_risco",
      )
      .eq("organization_id", orgId)
      .order("total_compras", { ascending: false })
      .limit(10)
      .returns<SupplierRow[]>(),
    supabase
      .from("nfe_inbound_ncm_totals")
      .select("ncm, notas, itens, valor_total, pis_valor, cofins_valor")
      .eq("organization_id", orgId)
      .order("valor_total", { ascending: false })
      .limit(10)
      .returns<NcmRow[]>(),
    supabase
      .from("nfe_inbound_alert_summary")
      .select("kind, severity, total")
      .eq("organization_id", orgId)
      .order("total", { ascending: false })
      .returns<AlertSummaryRow[]>(),
  ]);

  const monthly = monthlyRes.data ?? [];
  const suppliers = suppliersRes.data ?? [];
  const ncms = ncmsRes.data ?? [];
  const alertSummary = alertsRes.data ?? [];

  const monthlySeries = build12MonthSeries(monthly, since);
  const totalNotas = monthly.reduce((acc, m) => acc + Number(m.notas), 0);
  const totalCompras = monthly.reduce(
    (acc, m) => acc + Number(m.total_compras),
    0,
  );
  const totalPisCofinsRisco = suppliers.reduce(
    (acc, s) =>
      acc +
      (Number(s.notas_em_risco) > 0
        ? Number(s.total_pis) + Number(s.total_cofins)
        : 0),
    0,
  );
  const totalAlertas = alertSummary.reduce((acc, a) => acc + Number(a.total), 0);

  const maxMensal = Math.max(
    1,
    ...monthlySeries.map((m) => Number(m.total_compras)),
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Organização ativa
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {org?.nome_fantasia ?? org?.razao_social ?? "—"}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {org?.razao_social} · {org?.regime_tributario} · {org?.uf} ·{" "}
            <span className="text-zinc-300">{membership.role}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <NavLink href="/notas">Notas recebidas</NavLink>
          <NavLink href="/nfe">NF-e (emissão)</NavLink>
          <NavLink href="/billing">Plano</NavLink>
          {membership.role === "owner" || membership.role === "admin" ? (
            <>
              <NavLink href="/admin/branches">Filiais</NavLink>
              <NavLink href="/admin/invites">Convites</NavLink>
              <NavLink href="/admin/certificates">Certificados</NavLink>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Notas (12m)" value={fmtInt(totalNotas)} />
        <Stat label="Compras (12m)" value={fmtMoney(totalCompras)} />
        <Stat
          label="Alertas ativos"
          value={fmtInt(totalAlertas)}
          tone={totalAlertas > 0 ? "warn" : "neutral"}
        />
        <Stat
          label="PIS/COFINS em risco"
          value={fmtMoney(totalPisCofinsRisco)}
          tone={totalPisCofinsRisco > 0 ? "warn" : "neutral"}
        />
      </div>

      <Section
        title="Compras por mês"
        subtitle="Soma de NF-e recebidas. Últimos 12 meses."
      >
        {totalNotas === 0 ? (
          <Empty>
            Sem notas recebidas ainda. Suba os primeiros XMLs em{" "}
            <Link href="/notas/upload" className="text-emerald-400 underline">
              /notas/upload
            </Link>
            .
          </Empty>
        ) : (
          <div className="flex items-end gap-2 h-44 mt-2">
            {monthlySeries.map((m) => {
              const v = Number(m.total_compras);
              const h = Math.max(2, Math.round((v / maxMensal) * 160));
              return (
                <div
                  key={m.mes}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${m.label}: ${fmtMoney(v)} (${m.notas} notas)`}
                >
                  <div
                    className={`w-full rounded-t ${
                      Number(m.notas_em_risco) > 0
                        ? "bg-amber-500/70"
                        : "bg-emerald-500/70"
                    }`}
                    style={{ height: `${h}px` }}
                  />
                  <span className="text-[10px] text-zinc-500">{m.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <div className="grid md:grid-cols-2 gap-6">
        <Section
          title="Top fornecedores"
          subtitle="Ordenado por valor comprado (12m)."
        >
          {suppliers.length === 0 ? (
            <Empty>Sem dados ainda.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {suppliers.map((s) => (
                <li key={s.emit_cnpj} className="py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" title={s.emit_nome}>
                      {s.emit_nome}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {s.emit_cnpj} · {s.emit_uf} · {s.notas} notas
                      {Number(s.notas_em_risco) > 0 ? (
                        <span className="ml-2 text-amber-400">
                          · {s.notas_em_risco} c/ alerta
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    {fmtMoney(Number(s.total_compras))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Top NCMs" subtitle="Por valor de itens (12m).">
          {ncms.length === 0 ? (
            <Empty>Sem dados ainda.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {ncms.map((n) => (
                <li key={n.ncm} className="py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono">{n.ncm}</p>
                    <p className="text-xs text-zinc-500">
                      {n.notas} notas · {n.itens} itens
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    {fmtMoney(Number(n.valor_total))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        title="Alertas por tipo"
        subtitle="Cumulativo desde o início. Atue revisando as notas correspondentes."
      >
        {alertSummary.length === 0 ? (
          <Empty>Nenhum alerta detectado.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {alertSummary.map((a) => (
              <li
                key={`${a.kind}-${a.severity}`}
                className="py-2 flex items-center gap-3"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    SEVERITY_DOT[a.severity] ?? SEVERITY_DOT.info
                  }`}
                />
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
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-xs px-3 py-1.5 rounded border border-zinc-800 hover:bg-zinc-900 hover:text-white text-zinc-300"
    >
      {children}
    </Link>
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
  return <p className="text-sm text-zinc-500 py-4">{children}</p>;
}

function build12MonthSeries(rows: MonthlyRow[], since: Date) {
  const byKey = new Map<string, MonthlyRow>();
  for (const r of rows) {
    const d = new Date(r.mes);
    byKey.set(monthKey(d), r);
  }

  const series: Array<{
    mes: string;
    label: string;
    notas: number;
    total_compras: number;
    notas_em_risco: number;
  }> = [];

  const cursor = new Date(since);
  for (let i = 0; i < 12; i++) {
    const key = monthKey(cursor);
    const row = byKey.get(key);
    series.push({
      mes: key,
      label: monthLabel(cursor),
      notas: row ? Number(row.notas) : 0,
      total_compras: row ? Number(row.total_compras) : 0,
      notas_em_risco: row ? Number(row.notas_em_risco) : 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return series;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}
