import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("accepted_at", "is", null);

  if ((count ?? 0) > 0) redirect("/dashboard");

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Cadastrar sua organizacao
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Informe os dados da empresa que sera o tenant raiz.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
