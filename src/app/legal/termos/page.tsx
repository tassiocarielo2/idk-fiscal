export const metadata = { title: "Termos de Uso — IDK Fiscal" };

export const TERMS_VERSION = "v1-2026-05-02";

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-12 prose prose-invert">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        Versao {TERMS_VERSION}
      </p>
      <h1>Termos de Uso</h1>

      <p>
        Estes Termos regem o uso da plataforma IDK Fiscal pela organizacao
        contratante (&ldquo;Cliente&rdquo;) e seus usuarios.
      </p>

      <h2>1. Servico</h2>
      <p>
        A IDK Fiscal e uma plataforma de inteligencia fiscal que oferece
        emissao, consulta e custodia de documentos fiscais eletronicos
        (NF-e, NFS-e e similares) por meio do cadastro do certificado A1
        do Cliente.
      </p>

      <h2>2. Limitacao de responsabilidade</h2>
      <p>
        A IDK Fiscal nao garante uptime contratual no plano Pequena. Falhas
        de SEFAZ ou de operadora de telecomunicacoes nao sao de
        responsabilidade da plataforma. O Cliente reconhece que a
        emissao de documentos fiscais depende de sistemas governamentais
        externos.
      </p>

      <h2>3. Custodia de certificado A1</h2>
      <p>
        O Cliente concorda em armazenar o certificado A1 em modelo Vault +
        Storage privado da Supabase, com acesso restrito a chave master da
        plataforma. Para clientes de regime regulado especial, oferecemos
        o plano OnPrem com custodia em KMS dedicado.
      </p>

      <h2>4. Suporte</h2>
      <p>
        Conforme plano contratado: 24h uteis (Pequena), 8h uteis (Empresa),
        4h uteis (OnPrem). Sem SLA de uptime no v1.
      </p>

      <h2>5. Rescisao</h2>
      <p>
        O Cliente pode rescindir a qualquer momento. A IDK Fiscal mantem
        os documentos fiscais por 5 anos conforme legislacao. Export
        completo disponivel via /api/data-export apos solicitacao.
      </p>

      <h2>6. Foro</h2>
      <p>Foro de Vitoria-ES, com renuncia a qualquer outro.</p>
    </article>
  );
}
