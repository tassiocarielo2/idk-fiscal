import { z } from "zod";

export const UploadInboundMetaSchema = z.object({
  organization_id: z.string().uuid(),
  branch_id: z.string().uuid(),
});

export type UploadInboundMeta = z.infer<typeof UploadInboundMetaSchema>;
