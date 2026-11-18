import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABEL } from "@/lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const STATUS_COLORS: Record<string, string> = {
  received: "bg-slate-100 text-slate-700",
  partially_loaded: "bg-amber-100 text-amber-800",
  loaded: "bg-sky-100 text-sky-800",
  stuffing: "bg-amber-100 text-amber-800",
  stuffed: "bg-sky-100 text-sky-800",
  in_transit: "bg-indigo-100 text-indigo-800",
  arrived: "bg-violet-100 text-violet-800",
  under_customs: "bg-orange-100 text-orange-800",
  cleared: "bg-teal-100 text-teal-800",
  offloaded: "bg-emerald-100 text-emerald-800",
  released: "bg-emerald-100 text-emerald-800",
  delivered: "bg-green-600 text-white",
  empty_returned: "bg-slate-600 text-white",
  ok: "bg-emerald-100 text-emerald-800",
  short: "bg-red-100 text-red-800",
  damaged: "bg-red-100 text-red-800",
  excess: "bg-amber-100 text-amber-800",
  pending: "bg-slate-100 text-slate-600",
  LCL: "bg-brand-100 text-brand-700",
  FCL: "bg-ink text-white",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[value] ?? "bg-slate-100 text-slate-700"}`}>
      {label ?? STATUS_LABEL[value] ?? value}
    </span>
  );
}

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      {error ?? ok}
    </div>
  );
}

export function Stat({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const body = (
    <div className="card p-4 transition hover:border-brand-500">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-8 text-center text-sm text-slate-500">{children}</div>;
}

export function CapacityBar({ used, max, unit }: { used: number; max: number; unit: string }) {
  const pct = max > 0 ? (used / max) * 100 : 0;
  const color = pct > 100 ? "bg-red-500" : pct > 90 ? "bg-amber-500" : "bg-brand-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span>
          {used.toLocaleString("en-US", { maximumFractionDigits: 2 })} / {max.toLocaleString("en-US")} {unit}
        </span>
        <span className={pct > 100 ? "font-semibold text-red-600" : ""}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}
