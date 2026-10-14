// A download error carries no readable code: storage-js (2.95.3) reads the body
// only for JSON calls, so a missing object arrives as StorageUnknownError with
// message "{}" and the raw Response (Supabase: HTTP 400 + statusCode "404",
// or HTTP 404). Read that response instead of the empty error fields.
export async function missingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const known = error as { statusCode?: unknown; message?: unknown; originalError?: unknown };
  if (String(known.statusCode) === "404" || known.message === "Object not found") return true;
  if (!(known.originalError instanceof Response)) return false;
  if (known.originalError.status === 404) return true;
  const body = await known.originalError.clone().json().catch(() => null);
  return String(body?.statusCode) === "404" || body?.message === "Object not found";
}
