import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { flashParams, fail, str, type SP } from "@/lib/flash";
import { Flash } from "@/components/ui";

async function createCompany(fd: FormData) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_company", {
    p_company_name: str(fd, "company"),
    p_full_name: str(fd, "full_name"),
  });
  if (error) fail("/onboarding", error);
  redirect("/settings?ok=" + encodeURIComponent("Company created. Add your branches, categories and rates to start."));
}

export default async function Onboarding({ searchParams }: { searchParams: SP }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (profile) redirect("/");
  const { error } = await flashParams(searchParams);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={createCompany} className="card w-full max-w-md space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Set up your company</h1>
          <p className="text-sm text-slate-500">You will be the admin. Staff accounts are added later under Settings.</p>
        </div>
        <Flash error={error} />
        <label className="block">
          <span className="label">Company name</span>
          <input name="company" required className="input" />
        </label>
        <label className="block">
          <span className="label">Your name</span>
          <input name="full_name" required className="input" />
        </label>
        <button className="btn w-full">Create company</button>
      </form>
    </main>
  );
}
