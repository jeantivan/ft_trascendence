import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { MarkdownDocument } from "@/components/MarkdownDocument";

export async function LegalDraftPage({ file }: { file: string }) {
  // Server-only variable (no NEXT_PUBLIC_ prefix): the browser never sees it.
  if (process.env.LEGAL_DRAFTS_ENABLED !== "true") notFound();

  const filePath = path.join(process.cwd(), "content", "legal", file);
  const markdown = await readFile(filePath, "utf-8");

  return (
    <main className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <p className="mb-6 rounded-lg border border-border-subtle p-3 text-sm">
        Borrador interno para validar la maquetación. No es un texto legal
        aprobado.
      </p>
      <MarkdownDocument>{markdown}</MarkdownDocument>
    </main>
  );
}
