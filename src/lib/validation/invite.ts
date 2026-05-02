import { z } from "zod";

export const InviteRole = z.enum(["admin", "member", "viewer"]);
export type InviteRole = z.infer<typeof InviteRole>;

export const CreateInviteSchema = z.object({
  organization_id: z.string().uuid(),
  email: z.string().email().max(254).transform((v) => v.toLowerCase()),
  role: InviteRole,
  branch_scope: z.array(z.string().uuid()).min(1).optional().nullable(),
});

export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;

export const AcceptInviteSchema = z.object({
  token: z.string().min(32).max(128),
});

export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
