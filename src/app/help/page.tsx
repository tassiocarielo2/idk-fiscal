export const metadata = { title: "Ajuda — IDK Fiscal" };

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: "Minha NF-e foi rejeitada com cStat 215. O que fazer?",
    a: (
      <p>
        cStat 215 = falha de schema. Verifique se NCM tem 8 digitos e CFOP
        tem 4. Re-emita com os campos corrigidos. Caso persista, abra
        ticket com o XML rejeitado em anexo.
      </p>
    ),
  },
  {
    q: "Como cancelar uma nota?",
    a: (
      <p>
        Em /nfe, abra a nota autorizada e clique &ldquo;Cancelar&rdquo;.
        Janela legal: 24 horas apos autorizacao. Justificativa de pelo
        menos 15 caracteres e obrigatoria. Apos a janela, emita uma nota
        de devolucao em vez de cancelamento.
      </p>
    ),
  },
  {
    q: "Como subir um certificado A1?",
    a: (
      <p>
        Em /admin/certificates clique &ldquo;Subir A1&rdquo;, escolha a
        filial, selecione o .pfx e digite a senha. O certificado e
        validado em memoria, a senha vai para o Vault e o blob para um
        bucket privado. Senha nunca e logada.
      </p>
    ),
  },
  {
    q: "Como funciona o trial?",
    a: (
      <p>
        14 dias com acesso completo a homologacao SEFAZ-ES e ate 50 NF-e
        em homologacao. Sem cartao. Apos o trial, a org fica em modo
        somente-leitura por 7 dias e depois e soft-deletada.
      </p>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Ajuda</p>
        <h1 className="text-2xl font-semibold tracking-tight">FAQ</h1>
      </div>
      <ul className="flex flex-col divide-y divide-zinc-900 border border-zinc-900 rounded">
        {FAQ.map((item) => (
          <li key={item.q} className="p-5">
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                {item.q}
              </summary>
              <div className="mt-3 text-sm text-zinc-400">{item.a}</div>
            </details>
          </li>
        ))}
      </ul>
      <div className="border border-zinc-900 rounded p-5 text-sm text-zinc-400">
        <p>
          Nao encontrou? Email: <strong>suporte@idkfiscal.com.br</strong>.
          Tempo de resposta: 24h uteis (Pequena), 8h uteis (Empresa).
        </p>
      </div>
    </div>
  );
}
