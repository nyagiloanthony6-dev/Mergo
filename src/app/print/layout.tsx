import { requireProfile } from "@/lib/auth";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireProfile();
  return (
    <div className="min-h-screen bg-white">
      <div className="no-print flex justify-end gap-2 border-b border-slate-200 p-3">
        <span className="mr-auto text-sm text-slate-500">Print preview — use your browser&apos;s print (Ctrl/Cmd + P) to print or save as PDF</span>
      </div>
      <div className="mx-auto max-w-[1100px] p-8 text-[13px]">{children}</div>
    </div>
  );
}
