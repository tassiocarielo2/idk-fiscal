import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-2xl w-full flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            IDK Fiscal
          </p>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-50">
            Compliance fiscal automatizado para PMEs.
          </h1>
          <p className="text-lg text-zinc-400 max-w-xl">
            Simples Nacional, Lucro Presumido, Lucro Real. Ingestao,
            classificacao e alertas em um lugar so.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/login" className={buttonVariants()}>
            Entrar
          </Link>
          <Link href="/sign-up" className={buttonVariants({ variant: "outline" })}>
            Criar conta
          </Link>
        </div>
      </div>
    </main>
  );
}
