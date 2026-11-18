import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "origin" | "documentation" | "warehouse" | "finance";

export type Profile = {
  id: string;
  company_id: string;
  full_name: string | null;
  role: Role;
  branch_id: string | null;
  company: { id: string; name: string; heavy_kg_per_cbm: number };
};

/** Signed-in staff profile, or redirect to login / onboarding. Cached per request. */
export const requireProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("id, company_id, full_name, role, branch_id, company:companies(id, name, heavy_kg_per_cbm)")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) redirect("/onboarding");
  return data as unknown as Profile;
});

export async function requireAdmin() {
  const p = await requireProfile();
  if (p.role !== "admin") redirect("/?error=" + encodeURIComponent("Only admins can change settings"));
  return p;
}
