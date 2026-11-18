"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/receiving", label: "LCL receiving" },
  { href: "/containers", label: "Containers" },
  { href: "/bls", label: "Bills of lading" },
  { href: "/warehouse", label: "Dar warehouse" },
  { href: "/payments", label: "Payments" },
  { href: "/customers", label: "Customers" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${active ? "bg-brand-600 text-white" : "text-slate-200 hover:bg-white/10"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
