import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import type { Rate } from "@/lib/pricing";
import { ReceiptForm } from "./ReceiptForm";

export default async function NewReceipt() {
  const me = await requireProfile();
  const supabase = await createClient();
  const [{ data: branches }, { data: categories }, { data: rates }] = await Promise.all([
    supabase.from("branches").select("id, code, name").eq("active", true).order("code"),
    supabase.from("cargo_categories").select("id, name").eq("active", true).order("name"),
    supabase.from("category_rates").select("*"),
  ]);

  if (!branches?.length || !categories?.length || !rates?.length) {
    return (
      <div className="max-w-xl">
        <PageHeader title="Receive LCL goods" />
        <div className="card p-6 text-sm">
          Before receiving goods you need at least one branch, one cargo category and a rate. <Link href="/settings" className="text-brand-600 underline">Go to Settings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      <PageHeader title="Receive LCL goods" subtitle="Charges are calculated from the category rate at the receiving branch" />
      <ReceiptForm
        branches={branches}
        categories={categories}
        rates={(rates ?? []) as Rate[]}
        heavyKgPerCbm={Number(me.company.heavy_kg_per_cbm)}
        defaultBranch={me.branch_id ?? undefined}
      />
    </div>
  );
}
