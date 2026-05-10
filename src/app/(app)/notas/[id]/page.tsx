import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUS_LABEL: Record<string, string> = {
  autorizada: "Autorizada",
  cancelada: "Cancelada",
  denegada: "Denegada",
  desconhecida: "Status desconhecido",
};

const ALERT_LABEL: Record<string, string> = {
  pis_cofins_sem_credito: "PIS/COFINS sem crédito",
  cfop_sem_credito: "CFOP sem crédito",
  cst_icms_bloqueador: "CST ICMS bloqueador",
  fornecedor_inativo: "Fornecedor inativo",
  duplicidade_chave: "Chave duplicada",
};

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-zinc-800 text-zinc-300",
  warn: "bg-amber-950 text-amber-300 border border-amber-900",
  critical: "bg-red-950 text-red-300 border border-red-900",
};

type AlertDetalhe = {
  itens?: Array<{
    numero: number;
    codigo: string;
    descricao: string;
    ncm: string;
    cfop: string;
    cst_pis?: string | null;
    cst_cofins?: string | null;
    valor_total: number;
  }>;
  cfops?: string[];
  valor_pis?: number;
  valor_cofins?: number;
};

export default async function NotaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: doc, error } = await supabase
    .from("nfe_inbound_documents")
    .select(
      `id, organization_id, branch_id, chave_acesso, modelo, serie, numero,
       ambiente, status, protocolo, natureza_operacao, data_emissao, data_recebimento,
       emit_cnpj, emit_nome, emit_uf, emit_ie,
       dest_cnpj_cpf, dest_nome,
       total_produtos, total_descontos, total_frete, total_icms, total_pis,
       total_cofins, total_nota, alerts_count, has_credit_risk, xml_path,
       nfe_inbound_items (
         id, numero_item, codigo, descricao, ncm, cfop, unidade,
         quantidade, valor_unitario, valor_total, desconto,
         cst_csosn, icms_aliquota, icms_valor,
         pis_cst, pis_aliquota, pis_valor,
         cofins_cst, cofins_aliquota, cofins_valor
       ),
       nfe_inbound_alerts ( id, kind, severity, titulo, detalhe, created_at )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !doc) notFound();

  // Signed URL para download do XML (válida por 5 minutos).
  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from("nfe")
    .createSignedUrl(doc.xml_path, 60 * 5);

  const items =
    (doc.nfe_inbound_items as Array<{
      id: string;
      numero_item: number;
      codigo: string;
      descricao: string;
      ncm: string;
      cfop: string;
      unidade: string;
      quantidade: number | string;
      valor_unitario: number | string;
      valor_total: number | string;
      cst_csosn: string | null;
      pis_cst: string | null;
      pis_valor: number | string;
      cofins_cst: string | null;
      cofins_valor: number | string;
    }> | null) ?? [];

  const alerts =
    (doc.nfe_inbound_alerts as Array<{
      id: string;
      kind: string;
      severity: string;
      titulo: string;
      detalhe: AlertDetalhe;
    }> | null) ?? [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            <Link href="/notas" className="hover:text-zinc-300">
              Notas recebidas
            </Link>{" "}
            ·{" "}
            <span className="font-mono">
              {doc.serie}/{doc.numero}
            </span>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {doc.emit_nome}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            CNPJ {doc.emit_cnpj} · {doc.emit_uf}
            {doc.emit_ie ? ` · IE ${doc.emit_ie}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`text-xs px-2 py-1 rounded ${
              doc.status === "autorizada"
                ? "bg-emerald-950 text-emerald-300 border border-emerald-900"
                : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {STATUS_LABEL[doc.status] ?? doc.status}
            {doc.ambiente === 2 ? " · HOM" : ""}
          </span>
          {signed?.signedUrl ? (
            <a
              href={signed.signedUrl}
              className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
            >
              Baixar XML
            </a>
          ) : null}
        </div>
      </div>

      <section className="border border-zinc-900 rounded p-4 grid sm:grid-cols-2 gap-4">
        <Field label="Chave de acesso" mono>
          {doc.chave_acesso}
        </Field>
        <Field label="Natureza da operação">{doc.natureza_operacao}</Field>
        <Field label="Emissão">
          {new Date(doc.data_emissao).toLocaleString("pt-BR")}
        </Field>
        <Field label="Recebimento">
          {new Date(doc.data_recebimento).toLocaleString("pt-BR")}
        </Field>
        {doc.protocolo ? (
          <Field label="Protocolo" mono>
            {doc.protocolo}
          </Field>
        ) : null}
        <Field label="Destinatário">
          {doc.dest_nome} · {doc.dest_cnpj_cpf}
        </Field>
      </section>

      {alerts.length > 0 ? (
        <section className="border border-amber-900 bg-amber-950/20 rounded p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            {alerts.length} alerta{alerts.length === 1 ? "" : "s"}
          </h2>
          <ul className="flex flex-col gap-3">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="rounded p-3 bg-zinc-950 border border-zinc-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{a.titulo}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      SEVERITY_BADGE[a.severity] ?? SEVERITY_BADGE.info
                    }`}
                  >
                    {ALERT_LABEL[a.kind] ?? a.kind}
                  </span>
                </div>
                <AlertDetail detalhe={a.detalhe} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border border-zinc-900 rounded">
        <header className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">
            Itens ({items.length})
          </h2>
          <span className="text-xs text-zinc-500">
            Total da nota: {fmtMoney(Number(doc.total_nota))}
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-zinc-500">
              <tr className="border-b border-zinc-900">
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Descrição</th>
                <th className="text-left px-3 py-2">NCM</th>
                <th className="text-left px-3 py-2">CFOP</th>
                <th className="text-right px-3 py-2">Qtd</th>
                <th className="text-right px-3 py-2">Vlr</th>
                <th className="text-left px-3 py-2">CST PIS/COF</th>
                <th className="text-right px-3 py-2">PIS</th>
                <th className="text-right px-3 py-2">COFINS</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-zinc-900/50">
                  <td className="px-3 py-2 text-zinc-500">{it.numero_item}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{it.descricao}</div>
                    <div className="text-zinc-500">{it.codigo}</div>
                  </td>
                  <td className="px-3 py-2 font-mono">{it.ncm}</td>
                  <td className="px-3 py-2 font-mono">{it.cfop}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(it.quantidade).toFixed(2)} {it.unidade}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(Number(it.valor_total))}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {it.pis_cst ?? "—"} / {it.cofins_cst ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(Number(it.pis_valor))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(Number(it.cofins_valor))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-zinc-300">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right">
                  Totais:
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {fmtMoney(Number(doc.total_produtos))}
                </td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMoney(Number(doc.total_pis))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMoney(Number(doc.total_cofins))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className={`text-sm mt-0.5 ${mono ? "font-mono break-all" : ""}`}>
        {children}
      </p>
    </div>
  );
}

function AlertDetail({ detalhe }: { detalhe: AlertDetalhe }) {
  if (!detalhe?.itens?.length && !detalhe?.cfops?.length) return null;
  return (
    <div className="mt-2 text-xs text-zinc-400">
      {detalhe.cfops?.length ? (
        <p>
          CFOPs envolvidos:{" "}
          <span className="font-mono text-zinc-200">
            {detalhe.cfops.join(", ")}
          </span>
        </p>
      ) : null}
      {detalhe.valor_pis != null && detalhe.valor_cofins != null ? (
        <p>
          Valor em risco: PIS {fmtMoney(detalhe.valor_pis)} · COFINS{" "}
          {fmtMoney(detalhe.valor_cofins)}
        </p>
      ) : null}
      {detalhe.itens?.length ? (
        <p>
          {detalhe.itens.length} item(ns):{" "}
          {detalhe.itens
            .slice(0, 3)
            .map((i) => `#${i.numero} ${i.codigo}`)
            .join(", ")}
          {detalhe.itens.length > 3 ? ` +${detalhe.itens.length - 3}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
