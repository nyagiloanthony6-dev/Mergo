import { requireProfile } from "@/lib/auth";
import { APP_NAME } from "@/lib/format";
import { Nav } from "@/components/Nav";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print bg-ink p-3 text-white md:sticky md:top-0 md:flex md:h-screen md:w-56 md:flex-col md:p-4">
        <div className="mb-3 px-3 md:mb-6">
          <div className="font-semibold tracking-tight">{APP_NAME}</div>
          <div className="truncate text-xs text-slate-400">{profile.company.name}</div>
        </div>
        <Nav />
        <div className="mt-3 hidden border-t border-white/10 px-3 pt-3 text-xs text-slate-400 md:mt-auto md:block">
          <div className="truncate text-slate-200">{profile.full_name}</div>
          <div className="capitalize">{profile.role}</div>
          <form action={signOut}>
            <button className="mt-2 text-slate-300 hover:text-white">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
