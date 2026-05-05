import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NFeDashboard() {
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

  const [{ data: stats }, { data: certs }] = await Promise.all([
    supabase
      .from("nfe_dashboard_stats")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("certificates_metadata")
      .select("razao_social_titular, valid_until, status")
      .eq("organization_id", orgId)
      .eq("status", "active"),
  ]);

  const today = new Date();
  const expiringSoon = (certs ?? []).filter((c) => {
    const dias = Math.floor(
      (new Date(c.valid_until).getTime() - today.getTime()) / 86400000,
    );
    return dias < 30;
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">NF-e</p>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      </div>

      {expiringSoon.length > 0 ? (
        <div className="border border-amber-700/40 bg-amber-950/40 rounded p-4 text-sm">
          <p className="font-medium text-amber-300">
            ⚠ {expiringSoon.length} certificado(s) expirando em &lt;30 dias
          </p>
          <ul className="mt-2 text-xs text-amber-200">
            {expiringSoon.map((c) => (
              <li key={c.razao_social_titular}>
                {c.razao_social_titular} — vence{" "}
                {new Date(c.valid_until).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(stats ?? []).map((s, i) => (
          <div
            key={i}
            className="border border-zinc-900 rounded p-5 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase text-zinc-500">
                Filial · {s.ambiente === 1 ? "PROD" : "HOM"}
              </span>
              <span className="text-xs text-zinc-600 font-mono">
                {String(s.branch_id).slice(0, 8)}
              </span>
            </div>
            <p className="text-3xl font-semibold">
              {s.autorizadas_hoje ?? 0}
              <span className="text-base text-zinc-500 font-normal"> hoje</span>
            </p>
            <p className="text-xs text-zinc-500">
              Total autorizadas: {s.autorizadas} · Rejeitadas: {s.rejeitadas} ·
              Canceladas: {s.canceladas}
            </p>
            {Number(s.taxa_rejeicao_pct) > 10 ? (
              <p className="text-xs text-red-400">
                Taxa de rejeicao: {s.taxa_rejeicao_pct}% (acima do limite)
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                Taxa de rejeicao: {s.taxa_rejeicao_pct}%
              </p>
            )}
          </div>
        ))}
        {(stats?.length ?? 0) === 0 ? (
          <p className="text-sm text-zinc-500">
            Sem NF-e emitidas ainda.
          </p>
        ) : null}
      </div>
    </div>
  );
}
