import { APP_NAME } from "@/lib/format";
import { flashParams, type SP } from "@/lib/flash";
import { Flash } from "@/components/ui";
import { signIn, signUp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const { error, ok, params } = await flashParams(searchParams);
  const mode = params.mode === "signup" ? "signup" : "signin";
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-tight">{APP_NAME}</div>
          <div className="text-sm text-slate-500">LCL consolidation &amp; FCL shipping</div>
        </div>
        <Flash error={error} ok={ok} />
        <form action={mode === "signup" ? signUp : signIn} className="card space-y-4 p-6">
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" required className="input" autoComplete="email" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input name="password" type="password" required minLength={8} className="input" />
          </label>
          <button className="btn w-full">{mode === "signup" ? "Create account" : "Sign in"}</button>
          <p className="text-center text-xs text-slate-500">
            {mode === "signup" ? (
              <a href="/login" className="text-brand-600 hover:underline">Already have an account? Sign in</a>
            ) : (
              <a href="/login?mode=signup" className="text-brand-600 hover:underline">New company? Create an account</a>
            )}
          </p>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          Customer? <a href="/track" className="text-brand-600 hover:underline">Track your cargo</a>
        </p>
      </div>
    </main>
  );
}
