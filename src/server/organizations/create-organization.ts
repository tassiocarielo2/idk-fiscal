"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  CreateOrganizationSchema,
  type CreateOrganizationInput,
} from "@/lib/validation/organization";

export type CreateOrganizationResult =
  | { ok: true; organizationId: string }
  | { ok: false; error: string };

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<CreateOrganizationResult> {
  const parsed = CreateOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Dados invalidos" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Sessao expirada. Faca login novamente." };
  }

  const { data: organizationId, error: rpcError } = await supabase.rpc(
    "create_organization_with_owner",
    {
      p_cnpj: parsed.data.cnpj,
      p_razao_social: parsed.data.razao_social,
      p_nome_fantasia: parsed.data.nome_fantasia ?? null,
      p_regime_tributario: parsed.data.regime_tributario,
      p_uf: parsed.data.uf,
      p_inscricao_estadual: parsed.data.inscricao_estadual ?? null,
      p_inscricao_municipal: parsed.data.inscricao_municipal ?? null,
    },
  );

  if (rpcError || !organizationId) {
    console.error("[createOrganization] rpc failed:", rpcError);
    return {
      ok: false,
      error: rpcError?.message ?? "Falha ao criar organizacao.",
    };
  }

  // Inicia trial 14 dias (idempotente).
  await supabase.rpc("register_subscription_trial", {
    p_organization_id: organizationId as string,
  });

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");

  return { ok: true, organizationId: organizationId as string };
}
