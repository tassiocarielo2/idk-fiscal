export const dynamic = "force-dynamic";
export const metadata = { title: "Status — IDK Fiscal" };

/**
 * Status page MVP. v1: estaticamente reflete o status da app.
 * Wave 2.1: integrar com pings periodicos de SEFAZ + uptime check.
 */
export default function StatusPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Status</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Servicos
        </h1>
      </div>
      <ul className="border border-zinc-900 rounded divide-y divide-zinc-900">
        <Item label="Aplicacao IDK Fiscal" status="ok" />
        <Item label="Supabase (DB + Auth + Storage + Vault)" status="ok" />
        <Item label="SEFAZ-ES (homologacao)" status="ok" />
        <Item label="SEFAZ-ES (producao)" status="ok" />
      </ul>
      <p className="text-xs text-zinc-500">
        Status v1 estatico. Pings ao vivo de SEFAZ chegarao em Wave 2.1.
        Para incidentes em tempo real, acompanhe @idkfiscal no X.
      </p>
    </div>
  );
}

function Item({ label, status }: { label: string; status: "ok" | "down" | "degraded" }) {
  const color =
    status === "ok"
      ? "text-emerald-400"
      : status === "degraded"
        ? "text-amber-400"
        : "text-red-500";
  const dot =
    status === "ok"
      ? "bg-emerald-500"
      : status === "degraded"
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <li className="p-4 flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <span className={`flex items-center gap-2 text-sm ${color}`}>
        <span className={`w-2 h-2 rounded-full ${dot}`}></span>
        {status === "ok" ? "operacional" : status === "degraded" ? "degradado" : "fora"}
      </span>
    </li>
  );
}
