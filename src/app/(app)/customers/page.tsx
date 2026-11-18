import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { safeQ, type SP } from "@/lib/flash";
import { date } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";

export default async function Customers({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? safeQ(sp.q) : "";
  const supabase = await createClient();
  let query = supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q.replace(/\D/g, "") || q}%`);
  const { data: rows } = await query;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Customers" subtitle="Customers are created automatically when goods are received or an FCL container is booked" />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Name or phone" className="input max-w-xs" />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Phone</th><th>Since</th></tr></thead>
          <tbody>
            {rows?.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/customers/${c.id}`} className="text-brand-600 hover:underline">{c.name}</Link></td>
                <td className="font-mono">{c.phone}</td>
                <td>{date(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows?.length && <Empty>No customers found</Empty>}
      </div>
    </div>
  );
}
