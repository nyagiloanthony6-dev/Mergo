import { createClient } from "@/lib/supabase/server";
import { APP_NAME, date, num, STATUS_LABEL } from "@/lib/format";
import type { SP } from "@/lib/flash";

const STEPS = ["received", "loaded", "in_transit", "arrived", "under_customs", "cleared", "offloaded", "released", "delivered"];

export default async function Track({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const receipt = typeof sp.receipt === "string" ? sp.receipt : "";
  const phone = typeof sp.phone === "string" ? sp.phone : "";
  let result: any = null;
  if (receipt && phone) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("track_receipt", { p_receipt_no: receipt, p_phone: phone });
    result = data?.[0] ?? null;
  }
  const stage = result?.stage === "partially_loaded" ? "received" : result?.stage;
  const at = STEPS.indexOf(stage);

  return (
    <main className="mx-auto max-w-lg p-4 py-12">
      <h1 className="mb-1 text-2xl font-semibold">Track your cargo</h1>
      <p className="mb-6 text-sm text-slate-500">Enter your receipt number and the phone number used when your goods were received.</p>
      <form className="card mb-6 space-y-3 p-4">
        <input name="receipt" defaultValue={receipt} placeholder="Receipt number e.g. GZ-2600123" className="input font-mono uppercase" required />
        <input name="phone" defaultValue={phone} placeholder="Phone number" className="input" required />
        <button className="btn w-full">Track</button>
      </form>
      {receipt && phone && !result && <div className="card p-4 text-sm text-red-700">No shipment found. Check the receipt number and phone.</div>}
      {result && (
        <div className="card p-4">
          <div className="mb-4">
            <div className="text-xs text-slate-500">{result.company_name}</div>
            <div className="font-mono text-lg font-semibold">{result.receipt_no}</div>
            <div className="text-sm">{result.customer_name} · {result.branch_name} · received {date(result.received_at)}</div>
            <div className="text-sm text-slate-600">{result.total_packages} packages · {num(result.total_cbm, 3)} CBM{result.container_no && <> · container {result.container_no}</>}{result.eta && <> · ETA {date(result.eta)}</>}</div>
            {result.stage === "partially_loaded" && <div className="mt-1 text-xs text-amber-700">Part of your goods has been loaded; the rest is waiting for the next container.</div>}
          </div>
          <ol className="space-y-2">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span className={`h-3 w-3 rounded-full ${i <= at ? "bg-brand-600" : "bg-slate-200"}`} />
                <span className={i === at ? "font-semibold" : i < at ? "" : "text-slate-400"}>{STATUS_LABEL[s]}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="mt-8 text-center text-xs text-slate-400">{APP_NAME}</p>
    </main>
  );
}
