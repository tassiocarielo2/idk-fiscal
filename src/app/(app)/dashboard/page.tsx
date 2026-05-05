import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organizations(id, razao_social, nome_fantasia, regime_tributario, uf)")
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

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 flex flex-col gap-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          Organizacao ativa
        </p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">
          {org?.nome_fantasia ?? org?.razao_social ?? "—"}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {org?.razao_social} · {org?.regime_tributario} · {org?.uf}
        </p>
      </div>
      <div className="border border-zinc-900 rounded p-6 text-sm text-zinc-400 flex flex-col gap-3">
        <span>
          Voce esta como{" "}
          <span className="text-zinc-200 font-medium">{membership.role}</span>.
        </span>
        {membership.role === "owner" || membership.role === "admin" ? (
          <div className="flex gap-3 flex-wrap">
            <a
              href="/admin/branches"
              className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
            >
              Gerir filiais
            </a>
            <a
              href="/admin/invites"
              className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
            >
              Convites
            </a>
            <a
              href="/admin/certificates"
              className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
            >
              Certificados A1
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
