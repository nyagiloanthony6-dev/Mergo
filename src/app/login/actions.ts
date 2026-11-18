"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fail, str } from "@/lib/flash";

export async function signIn(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: str(fd, "email"), password: str(fd, "password") });
  if (error) fail("/login", error);
  redirect("/");
}

export async function signUp(fd: FormData) {
  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { data, error } = await supabase.auth.signUp({
    email: str(fd, "email"),
    password: str(fd, "password"),
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) fail("/login?mode=signup", error);
  if (!data.session) redirect("/login?ok=" + encodeURIComponent("Check your email to confirm your account, then sign in."));
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
