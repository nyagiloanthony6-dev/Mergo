import { createClient } from "@/lib/supabase/server";
import { DOC_TYPE_LABEL, dateTime } from "@/lib/format";
import { deleteDocument, uploadDocument } from "@/app/(app)/containers/actions";
import { Card } from "./ui";

export async function Documents({ containerId, blId, packingListHref }: { containerId?: string; blId?: string; packingListHref: string }) {
  const supabase = await createClient();
  let q = supabase.from("documents").select("*").order("uploaded_at");
  q = containerId ? q.eq("container_id", containerId) : q.eq("bl_id", blId!);
  const { data: docs } = await q;
  const signed = await Promise.all(
    (docs ?? []).map(async (d) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      return { ...d, url: data?.signedUrl };
    }),
  );
  const back = containerId ? `/containers/${containerId}` : `/bls/${blId}`;
  const has = (t: string) => signed.some((d) => d.doc_type === t);

  return (
    <Card title="Export documents">
      <ul className="mb-4 divide-y divide-slate-100 text-sm">
        <li className="flex items-center justify-between py-2">
          <span><span className="font-medium">Packing list</span> <span className="text-xs text-slate-500">(generated from loaded goods)</span></span>
          <a href={packingListHref} target="_blank" className="text-brand-600 hover:underline">Open / print</a>
        </li>
        {signed.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="font-medium">{DOC_TYPE_LABEL[d.doc_type]}</span>{" "}
              <a href={d.url} target="_blank" className="break-all text-brand-600 hover:underline">{d.file_name}</a>
              <span className="block text-xs text-slate-500">{dateTime(d.uploaded_at)}</span>
            </span>
            <form action={deleteDocument}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="back" value={back} />
              <button className="text-xs text-red-600 hover:underline">Remove</button>
            </form>
          </li>
        ))}
      </ul>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {["commercial_invoice", "bill_of_lading"].map((t) => (
          <span key={t} className={`rounded px-2 py-0.5 ${has(t) ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {DOC_TYPE_LABEL[t]}: {has(t) ? "attached" : "missing"}
          </span>
        ))}
      </div>
      <form action={uploadDocument} className="flex flex-wrap items-end gap-2">
        {containerId && <input type="hidden" name="container_id" value={containerId} />}
        {blId && <input type="hidden" name="bl_id" value={blId} />}
        <select name="doc_type" className="input max-w-48">
          <option value="commercial_invoice">Commercial invoice</option>
          <option value="bill_of_lading">Bill of lading</option>
          <option value="packing_list">Packing list (signed copy)</option>
          <option value="other">Other</option>
        </select>
        <input type="file" name="file" required className="text-sm" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" />
        <button className="btn-secondary">Upload</button>
      </form>
    </Card>
  );
}
