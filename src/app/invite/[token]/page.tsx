import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptButton } from "./accept-button";

type InviteMetadata = {
  organization_id: string;
  organization_name: string;
  email: string;
  role: "admin" | "member" | "viewer";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function StateCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-md rounded-lg border p-6 shadow-sm">
      <h1 className="mb-2 text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("peek_invite", { p_token: token })
    .maybeSingle();

  if (error || !data) {
    return (
      <StateCard
        title="Convite invalido"
        description="O link nao corresponde a nenhum convite. Verifique se voce esta usando o ultimo email recebido."
      />
    );
  }

  const meta = data as InviteMetadata;

  if (meta.revoked_at) {
    return (
      <StateCard
        title="Convite revogado"
        description={`Este convite foi cancelado. Peça um novo a um administrador de ${meta.organization_name}.`}
      />
    );
  }

  if (meta.accepted_at) {
    return (
      <StateCard
        title="Convite ja utilizado"
        description={`Este convite ja foi aceito. Acesse ${meta.organization_name} pelo dashboard.`}
      />
    );
  }

  const expiresAt = new Date(meta.expires_at);
  const now = new Date();
  if (expiresAt <= now) {
    return (
      <StateCard
        title="Convite expirado"
        description={`Este convite expirou. Peça um novo a um administrador de ${meta.organization_name}.`}
      />
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent(`/invite/${token}`);
    const hint = encodeURIComponent(meta.email);
    redirect(`/login?next=${next}&email=${hint}`);
  }

  if (user.email?.toLowerCase() !== meta.email.toLowerCase()) {
    return (
      <StateCard
        title="Email diferente"
        description={`Este convite foi enviado para ${meta.email}. Voce esta logado como ${user.email}. Saia e entre com a conta correta para aceitar.`}
      />
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border p-6 shadow-sm">
      <h1 className="mb-2 text-xl font-semibold">
        Voce foi convidado para {meta.organization_name}
      </h1>
      <dl className="mb-4 space-y-1 text-sm text-muted-foreground">
        <div>
          <dt className="inline font-medium">Email: </dt>
          <dd className="inline">{meta.email}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Papel: </dt>
          <dd className="inline">{meta.role}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Expira em: </dt>
          <dd className="inline">
            {new Date(meta.expires_at).toLocaleString("pt-BR")}
          </dd>
        </div>
      </dl>
      <AcceptButton token={token} />
    </div>
  );
}
