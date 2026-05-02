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

  const { data: org, error: insertOrgError } = await supabase
    .from("organizations")
    .insert({ ...parsed.data, created_by: user.id })
    .select("id")
    .single();

  if (insertOrgError || !org) {
    return {
      ok: false,
      error: insertOrgError?.message ?? "Falha ao criar organizacao.",
    };
  }

  const { error: insertMemberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: org.id,
      user_id: user.id,
      role: "owner",
      accepted_at: new Date().toISOString(),
    });

  if (insertMemberError) {
    // TODO Wave 1.2: substituir por RPC create_organization_with_owner para
    // garantir atomicidade real. Hoje fazemos rollback explicito best-effort.
    await supabase.from("organizations").delete().eq("id", org.id);
    return {
      ok: false,
      error: insertMemberError.message,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");

  return { ok: true, organizationId: org.id };
}
