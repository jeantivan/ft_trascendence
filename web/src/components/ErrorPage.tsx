import type { ReactNode } from "react";

const tones = {
  volt: {
    badge: "border-volt bg-volt/10 text-volt",
    number: "text-volt [text-shadow:0_0_32px_rgba(204,255,0,0.35)]",
  },
  amber: {
    badge: "border-volume-alert bg-volume-alert/10 text-volume-alert",
    number: "text-volume-alert [text-shadow:0_0_32px_rgba(255,184,0,0.35)]",
  },
  red: {
    badge: "border-rpe-max bg-rpe-max/10 text-rpe-max",
    number: "text-rpe-max [text-shadow:0_0_32px_rgba(239,68,68,0.35)]",
  },
};

type ErrorPageProps = {
  code: string;
  label: string;
  title: string;
  description: string;
  tone: keyof typeof tones;
  children?: ReactNode;
};

export function ErrorPage({ code, label, title, description, tone, children }: ErrorPageProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <span className={`rounded-full border px-3.5 py-1 font-heading text-xs font-bold tracking-widest uppercase ${tones[tone].badge}`}>
        Error {code} • {label}
      </span>
      <h1 className={`mt-4 font-heading text-8xl font-bold tracking-tighter md:text-[140px] md:leading-35 ${tones[tone].number}`}>{code}</h1>
      <h2 className="mt-6 max-w-2xl font-heading text-3xl font-bold text-text-primary">{title}</h2>
      <p className="mt-3 max-w-2xl text-lg text-text-secondary">{description}</p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">{children}</div>
    </main>
  );
}
