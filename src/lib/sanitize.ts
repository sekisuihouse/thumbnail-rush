export function sanitizeName(value: string): string {
  return value.normalize("NFKC").replace(/[<>\u0000-\u001F]/g, "").trim().slice(0, 20);
}

export function sanitizeAnswer(value: string): string {
  return value.normalize("NFKC").replace(/[\u0000-\u001F]/g, " ").trim().slice(0, 200);
}
