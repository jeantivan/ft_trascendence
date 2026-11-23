import { readFile } from "node:fs/promises";
import path from "node:path";
import { MarkdownDocument } from "@/components/MarkdownDocument";

export async function LegalPage({ file }: { file: string }) {
  const filePath = path.join(process.cwd(), "content", "legal", file);
  const markdown = await readFile(filePath, "utf-8");

  return (
    <main className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <MarkdownDocument>{markdown}</MarkdownDocument>
    </main>
  );
}
