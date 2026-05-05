export const metadata = { title: "Politica de Privacidade — IDK Fiscal" };

export const PRIVACY_VERSION = "v1-2026-05-02";

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-12 prose prose-invert">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        Versao {PRIVACY_VERSION}
      </p>
      <h1>Politica de Privacidade</h1>

      <h2>1. Dados que coletamos</h2>
      <ul>
        <li>
          <strong>Cadastrais</strong>: nome, email, CPF/CNPJ, regime
          tributario, IE, endereco fiscal.
        </li>
        <li>
          <strong>Operacionais</strong>: certificado A1 (cifrado em Vault)
          e XMLs de NF-e emitidos.
        </li>
        <li>
          <strong>Telemetria</strong>: IPs de acesso e logs de uso, retidos
          por 6 meses.
        </li>
      </ul>

      <h2>2. Finalidade</h2>
      <p>
        Operar a emissao de documentos fiscais; cumprir obrigacoes legais
        (retencao de documentos por 5 anos); melhorar a plataforma sem
        compartilhar dados pessoais com terceiros.
      </p>

      <h2>3. Sub-processadores</h2>
      <ul>
        <li>Supabase (hospedagem de DB, Auth, Storage, Vault).</li>
        <li>Vercel (hospedagem de frontend).</li>
        <li>SEFAZ (transmissao de documentos).</li>
      </ul>

      <h2>4. Direitos LGPD</h2>
      <p>
        Acesso, retificacao, eliminacao, portabilidade e revogacao do
        consentimento podem ser exercidos via email para
        <a href="mailto:dpo@idkfiscal.com.br"> dpo@idkfiscal.com.br</a>.
      </p>

      <h2>5. DPO</h2>
      <p>Encarregado: Tassio Carielo. dpo@idkfiscal.com.br.</p>

      <h2>6. Retencao</h2>
      <p>
        Dados fiscais por 5 anos (exigencia legal). Telemetria por 6 meses.
        Dados pessoais de cliente em soft-delete sao anonimizados apos
        prazo legal.
      </p>
    </article>
  );
}
