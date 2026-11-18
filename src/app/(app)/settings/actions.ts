"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { done, fail, numOrNull, optStr, str } from "@/lib/flash";

const P = "/settings";

export async function updateCompany(fd: FormData) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ name: str(fd, "name"), heavy_kg_per_cbm: Number(str(fd, "heavy_kg_per_cbm")) })
    .eq("id", me.company_id);
  if (error) fail(P, error);
  revalidatePath("/", "layout");
  done(P, "Company settings saved");
}

export async function addBranch(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    country: str(fd, "country"),
  });
  if (error) fail(P + "#branches", error);
  done(P + "#branches", "Branch added");
}

export async function toggleBranch(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("branches").update({ active: str(fd, "active") === "true" }).eq("id", str(fd, "id"));
  if (error) fail(P, error);
  revalidatePath(P);
}

export async function addCategory(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("cargo_categories").insert({
    name: str(fd, "name"),
    heavy_kg_per_cbm: numOrNull(fd, "heavy_kg_per_cbm"),
  });
  if (error) fail(P + "#categories", error);
  done(P + "#categories", "Category added");
}

export async function addRate(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("category_rates").insert({
    category_id: str(fd, "category_id"),
    branch_id: str(fd, "branch_id"),
    default_basis: str(fd, "default_basis"),
    rate_cbm: numOrNull(fd, "rate_cbm"),
    rate_kg: numOrNull(fd, "rate_kg"),
    rate_pcs: numOrNull(fd, "rate_pcs"),
    min_charge: numOrNull(fd, "min_charge") ?? 0,
    effective_from: str(fd, "effective_from") || undefined,
  });
  if (error) fail(P + "#rates", error.message.includes("check") ? "Enter a rate for the default charge basis" : error);
  done(P + "#rates", "Rate saved");
}

export async function addFx(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("fx_rates").insert({ rate: Number(str(fd, "rate")) });
  if (error) fail(P + "#fx", error);
  done(P + "#fx", "Exchange rate updated");
}

export async function addStaff(fd: FormData) {
  const me = await requireAdmin();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) fail(P + "#staff", "SUPABASE_SERVICE_ROLE_KEY is not configured");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: str(fd, "email"),
    password: str(fd, "password"),
    email_confirm: true,
  });
  if (error) fail(P + "#staff", error);
  const { error: e2 } = await admin.from("profiles").insert({
    id: data.user!.id,
    company_id: me.company_id,
    full_name: str(fd, "full_name"),
    role: str(fd, "role"),
    branch_id: optStr(fd, "branch_id"),
  });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user!.id);
    fail(P + "#staff", e2);
  }
  done(P + "#staff", "Staff account created — share the email and password with them");
}

export async function updateStaff(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: str(fd, "role"), branch_id: optStr(fd, "branch_id") })
    .eq("id", str(fd, "id"));
  if (error) fail(P + "#staff", error);
  done(P + "#staff", "Staff updated");
}
