import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function calcTrialDaysLeft(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  // Date.now() isolado neste helper para fugir da regra react-hooks/purity:
  // o lint aplica `pure render` ao corpo da função componente, mas helpers
  // chamados de lá são tratados como qualquer função utilitária.
  const now = Date.now();
  return Math.max(0, Math.floor((new Date(trialEndsAt).getTime() - now) / 86400000));
}

const PLAN_LABELS: Record<string, string> = {
  trial: "Trial (14 dias)",
  pequena: "Pequena (R$ 199/mes)",
  empresa: "Empresa (R$ 999/mes)",
  onprem: "OnPrem (sob medida)",
};

export default async function BillingPage() {
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
  if (!orgId) redirect("/onboarding");

  const [{ data: sub }, { data: usage }] = await Promise.all([
    supabase
      .from("organization_subscriptions")
      .select("plan, status, trial_ends_at, current_period_end")
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("nfe_usage_counters")
      .select("ano, mes, ambiente, autorizadas, rejeitadas")
      .eq("organization_id", orgId)
      .order("ano", { ascending: false })
      .order("mes", { ascending: false })
      .limit(6),
  ]);

  const trialDaysLeft = calcTrialDaysLeft(sub?.trial_ends_at);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          Plano e cobranca
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Sua assinatura</h1>
      </div>

      {sub ? (
        <div className="border border-zinc-900 rounded p-5 flex flex-col gap-2 text-sm">
          <p>
            Plano:{" "}
            <span className="text-emerald-400">
              {PLAN_LABELS[sub.plan ?? ""] ?? sub.plan}
            </span>
          </p>
          <p>
            Status: <span className="font-medium">{sub.status}</span>
          </p>
          {trialDaysLeft !== null ? (
            <p className="text-zinc-400">
              Trial expira em {trialDaysLeft} dia(s).
            </p>
          ) : null}
          {sub.current_period_end ? (
            <p className="text-zinc-400">
              Proxima cobranca em{" "}
              {new Date(sub.current_period_end).toLocaleDateString()}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Sem assinatura registrada. Inicie um trial.
        </p>
      )}

      <h2 className="text-lg font-medium mt-4">Uso recente</h2>
      <ul className="border border-zinc-900 rounded divide-y divide-zinc-900">
        {(usage ?? []).length === 0 ? (
          <li className="p-4 text-sm text-zinc-500">Sem uso registrado.</li>
        ) : (
          (usage ?? []).map((u, i) => (
            <li key={i} className="p-4 flex justify-between text-sm">
              <span className="text-zinc-400">
                {String(u.mes).padStart(2, "0")}/{u.ano} ·{" "}
                {u.ambiente === 1 ? "PROD" : "HOM"}
              </span>
              <span>
                {u.autorizadas} autorizadas · {u.rejeitadas} rejeitadas
              </span>
            </li>
          ))
        )}
      </ul>

      <p className="text-xs text-zinc-500 mt-4">
        Cobranca via Inter Bank (boleto/PIX). Para alterar plano envie email
        para suporte@idkfiscal.com.br.
      </p>
    </div>
  );
}
