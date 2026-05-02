const CNPJ_DIGITS = 14;

export function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatCnpj(value: string): string {
  const normalized = normalizeCnpj(value);
  if (normalized.length !== CNPJ_DIGITS) return value;
  return `${normalized.slice(0, 2)}.${normalized.slice(2, 5)}.${normalized.slice(5, 8)}/${normalized.slice(8, 12)}-${normalized.slice(12, 14)}`;
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== CNPJ_DIGITS) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (slice: string, weights: ReadonlyArray<number>): number => {
    const sum = weights.reduce((acc, w, i) => acc + Number(slice.charAt(i)) * w, 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

  const d1 = calcDigit(cnpj.slice(0, 12), w1);
  if (d1 !== Number(cnpj.charAt(12))) return false;

  const d2 = calcDigit(cnpj.slice(0, 13), w2);
  return d2 === Number(cnpj.charAt(13));
}
