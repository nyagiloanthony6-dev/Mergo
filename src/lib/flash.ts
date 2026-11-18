import { redirect } from "next/navigation";
import { errMsg } from "@/lib/format";

/** Redirect back with an error / success message shown by <Flash>. */
export function fail(path: string, e: unknown): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(errMsg(e))}`);
}
export function done(path: string, msg: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}ok=${encodeURIComponent(msg)}`);
}

export type SP = Promise<{ [k: string]: string | string[] | undefined }>;
export async function flashParams(sp: SP) {
  const p = await sp;
  return {
    error: typeof p.error === "string" ? p.error : undefined,
    ok: typeof p.ok === "string" ? p.ok : undefined,
    params: p,
  };
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const numOrNull = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === "" ? null : Number(v);
};

/** Strip characters that would break a PostgREST or() filter. */
export const safeQ = (q: string) => q.replace(/[,()%*\\]/g, " ").trim();
