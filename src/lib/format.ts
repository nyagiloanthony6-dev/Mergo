export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Mergo";

export const usd = (n: number | string | null | undefined) =>
  "$" + Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const tzs = (n: number | string | null | undefined) =>
  "TSh " + Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const num = (n: number | string | null | undefined, digits = 2) =>
  Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: digits });

export const date = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const dateTime = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

/** Normalise Tanzanian phone numbers to 2557XXXXXXXX; others are kept as digits. */
export function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("255") && d.length === 12) return d;
  if (d.startsWith("0") && d.length === 10) return "255" + d.slice(1);
  if (d.length === 9) return "255" + d;
  return d;
}

export const CONTAINER_STATUSES = [
  "stuffing", "stuffed", "in_transit", "arrived", "under_customs",
  "cleared", "offloaded", "delivered", "empty_returned",
] as const;
export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  stuffing: "Stuffing",
  stuffed: "Stuffed",
  in_transit: "In transit",
  arrived: "Arrived Dar",
  under_customs: "Under customs",
  cleared: "Cleared",
  offloaded: "Offloaded",
  delivered: "Delivered",
  empty_returned: "Empty returned",
  received: "Received",
  partially_loaded: "Partly loaded",
  loaded: "Loaded",
  released: "Released",
};

/** Status flow per mode, with the timestamp column each step sets. */
export const STATUS_FLOW: Record<"LCL" | "FCL", { status: ContainerStatus; column: string | null }[]> = {
  LCL: [
    { status: "stuffing", column: null },
    { status: "stuffed", column: "stuffed_at" },
    { status: "in_transit", column: "departed_at" },
    { status: "arrived", column: "arrived_at" },
    { status: "under_customs", column: "customs_at" },
    { status: "cleared", column: "cleared_at" },
    { status: "offloaded", column: "offloaded_at" },
  ],
  FCL: [
    { status: "stuffing", column: null },
    { status: "stuffed", column: "stuffed_at" },
    { status: "in_transit", column: "departed_at" },
    { status: "arrived", column: "arrived_at" },
    { status: "under_customs", column: "customs_at" },
    { status: "cleared", column: "cleared_at" },
    { status: "delivered", column: "delivered_at" },
    { status: "empty_returned", column: "empty_returned_at" },
  ],
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  packing_list: "Packing list",
  commercial_invoice: "Commercial invoice",
  bill_of_lading: "Bill of lading",
  other: "Other",
};

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return String(e);
}
