export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_BUCKET = "pet-documents";
export const SIGNED_URL_SECONDS = 60;
export const documentTypes = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type DocumentMime = keyof typeof documentTypes;
export type DocumentView = { id: string; petId: string; petName: string; name: string; mimeType: string; sizeBytes: number | null; createdAt: string };
export function sniffDocument(bytes: Uint8Array): DocumentMime | null {
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (starts([0x25,0x50,0x44,0x46,0x2d])) return "application/pdf";
  if (starts([0xff,0xd8,0xff])) return "image/jpeg";
  if (starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) return "image/png";
  if (starts([0x52,0x49,0x46,0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}
export function validateDocument(name: string, claimedType: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Choose a nonempty file up to 10 MB.");
  const mimeType = sniffDocument(bytes);
  if (!mimeType || mimeType !== claimedType) throw new Error("File content must match its PDF, JPG, PNG, or WebP type.");
  const cleanName = name.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim();
  if (!cleanName || cleanName.length > 160) throw new Error("Use a filename between 1 and 160 characters.");
  return { name: cleanName, mimeType, extension: documentTypes[mimeType] };
}
