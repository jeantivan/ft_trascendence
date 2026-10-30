import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const linkClass = "underline hover:text-text-primary";

export function MarkdownDocument({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mb-6 font-heading text-3xl font-semibold">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-3 mt-10 font-heading text-xl font-semibold">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-6 font-heading text-lg font-semibold">
            {children}
          </h3>
        ),
        p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="mb-4 list-disc pl-6">{children}</ul>,
        ol: ({ children }) => (
          <ol className="mb-4 list-decimal pl-6">{children}</ol>
        ),
        li: ({ children }) => <li className="mb-1">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="mb-4 border-l-2 border-border-subtle pl-4">
            {children}
          </blockquote>
        ),
        th: ({ children }) => (
          <th className="border-b border-border-subtle px-3 py-2 font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-border-subtle px-3 py-2 align-top">
            {children}
          </td>
        ),
        a: ({ href, children }) =>
          href === "privacy-policy.md" ? (
            <Link href="/privacy" className={linkClass}>
              {children}
            </Link>
          ) : (
            <a href={href} className={linkClass}>
              {children}
            </a>
          ),
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">{children}</table>
          </div>
        ),
      }}
    >
      {children}
    </Markdown>
  );
}
