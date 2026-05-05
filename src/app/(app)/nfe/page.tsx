import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function NFeListPage() {
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
    .from("nfe_documents")
    .select(
      "id, numero, serie, ambiente, status, dest_nome, dest_cnpj_cpf, total_nota, data_emissao, motivo_rejeicao, chave_acesso, protocolo",
    )
    .eq("organization_id", orgId)
    .order("data_emissao", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">NF-e</p>
          <h1 className="text-2xl font-semibold tracking-tight">Notas fiscais</h1>
        </div>
        <Link href="/nfe/nova">
          <Button>+ Nova NF-e</Button>
        </Link>
      </div>

      <ul className="flex flex-col divide-y divide-zinc-900 border border-zinc-900 rounded">
        {docs?.length ? (
          docs.map((d) => (
            <li key={d.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium">
                  {d.serie}/{d.numero} · {d.dest_nome} · R$
                  {Number(d.total_nota).toFixed(2)}
                </span>
                <span className="text-xs text-zinc-500">
                  {d.ambiente === 1 ? "PROD" : "HOM"} · {d.status}
                  {d.protocolo ? ` · prot ${d.protocolo}` : ""}
                </span>
                {d.motivo_rejeicao ? (
                  <span className="text-xs text-red-500 mt-1">
                    {d.motivo_rejeicao}
                  </span>
                ) : null}
                {d.chave_acesso ? (
                  <span className="text-xs text-zinc-600 mt-1 font-mono">
                    {d.chave_acesso}
                  </span>
                ) : null}
              </div>
            </li>
          ))
        ) : (
          <li className="p-5 text-sm text-zinc-500">
            Nenhuma NF-e ainda. Comece emitindo a primeira em homologacao.
          </li>
        )}
      </ul>
    </div>
  );
}
