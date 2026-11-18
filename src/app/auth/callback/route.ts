import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Handles links from Supabase emails (sign-up confirmation, magic link, password reset).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/";
  const supabase = await createClient();

  let error: { message: string } | null = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  else error = { message: "Invalid confirmation link" };

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=" + encodeURIComponent("Link is invalid or has expired. Sign in, or ask for a new link."), url.origin),
    );
  }
  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin));
}
