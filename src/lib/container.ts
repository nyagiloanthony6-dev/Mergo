/**
 * ISO 6346 container number check: 4 letters (owner + category) + 6 digits + check digit.
 * Returns null when valid, otherwise an error message.
 */
export function validateContainerNo(raw: string): string | null {
  const no = raw.replace(/\s|-/g, "").toUpperCase();
  if (!/^[A-Z]{4}\d{7}$/.test(no)) return "Container number must be 4 letters + 7 digits, e.g. CSQU3054383";

  const letterValue = (ch: string) => {
    // A=10, skipping multiples of 11 (11, 22, 33)
    let v = 10;
    for (let c = 65; c < ch.charCodeAt(0); c++) {
      v++;
      if (v % 11 === 0) v++;
    }
    return v;
  };

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = no[i];
    const v = i < 4 ? letterValue(ch) : Number(ch);
    sum += v * 2 ** i;
  }
  const check = (sum % 11) % 10;
  if (check !== Number(no[10])) return `Check digit mismatch for ${no} (expected ${check}). Please re-check the number.`;
  return null;
}

export const cleanContainerNo = (raw: string) => raw.replace(/\s|-/g, "").toUpperCase();
