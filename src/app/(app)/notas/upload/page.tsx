import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "./upload-form";

export default async function NotasUploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, branch_scope")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .limit(1);

  const orgId = memberships?.[0]?.organization_id;
  if (!orgId) redirect("/onboarding");

  const { data: branches } = await supabase
    .from("organization_branches")
    .select("id, cnpj, razao_social, is_headquarters")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("is_headquarters", { ascending: false });

  if (!branches?.length) redirect("/onboarding");

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          Upload
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Subir XMLs de NF-e recebidas
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          Selecione um ou mais arquivos .xml de NF-e (modelo 55). Notas
          duplicadas são ignoradas. Limite: 50 arquivos por upload, 5 MB por
          arquivo.
        </p>
      </div>

      <UploadForm
        organizationId={orgId}
        branches={branches.map((b) => ({
          id: b.id,
          cnpj: b.cnpj,
          razaoSocial: b.razao_social,
          isHeadquarters: b.is_headquarters,
        }))}
      />
    </div>
  );
}
