/**
 * Turn an arbitrary string into a valid C-style identifier.
 * Used for C++ source-file names, executable names and callback names so the
 * generated package always compiles regardless of what the user typed.
 */
export function sanitizeIdentifier(name: string, fallback = "node"): string {
  let cleaned = name.trim().replace(/[^0-9a-zA-Z_]/g, "_");
  cleaned = cleaned.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned) {
    cleaned = fallback;
  }
  if (/^[0-9]/.test(cleaned)) {
    cleaned = `n_${cleaned}`;
  }
  return cleaned;
}
