// Shared by direct publication and scheduler. No calls to Meta before the lock.
export const REEL_UNCERTAIN = "La publication de cette vidéo est déjà en cours ou son résultat est incertain. Vérifie Instagram avant toute nouvelle tentative ; aucun nouvel envoi automatique ne sera effectué.";

export function isDurableReelUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.search && !url.hash && !url.username && !url.password
      && url.origin === new URL(Deno.env.get("SUPABASE_URL")!).origin
      && /^\/storage\/v1\/object\/public\/calendar-media\/.+\.mp4$/i.test(url.pathname);
  } catch { return false; }
}

/** Preparation failures are retryable. Once media_publish may have run, only
 * a durable receipt can authorize a replay. A lost Meta response stays locked. */
export async function publishReelOnce(supabase: any, conn: any, caption: string, videoUrl: string,
  prepare: () => Promise<string>, publish: (container: string) => Promise<string>): Promise<string> {
  if (!isDurableReelUrl(videoUrl)) throw new Error("Monte et enregistre la vidéo MP4 avant de publier ce Reel.");
  if (!conn.user_id || !conn.platform_account_id) throw new Error("Connexion Instagram incomplète.");
  const key = JSON.stringify([conn.user_id, conn.workspace_id || null, conn.platform_account_id, videoUrl]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const table = () => supabase.from("reel_publication_receipts");
  const { error } = await table().insert({ id, user_id: conn.user_id, workspace_id: conn.workspace_id || null,
    account_id: conn.platform_account_id, video_url: videoUrl, caption });
  if (error) {
    if (error.code !== "23505") throw new Error("La réservation de publication n’a pas pu être confirmée. Réessaie pour vérifier son état.");
    const { data, error: readError } = await table().select("state, post_id, caption").eq("id", id).single();
    if (readError || !data) throw new Error(REEL_UNCERTAIN);
    if (data.caption !== caption) throw new Error("Cette vidéo a déjà une tentative avec une autre légende. Vérifie sa publication sur Instagram avant de créer un nouveau montage.");
    if (data.state === "published" && data.post_id) return data.post_id;
    throw new Error(REEL_UNCERTAIN);
  }
  let container: string;
  try { container = await prepare(); }
  catch (e) {
    // No public publish call has been made. A failed cleanup remains safely locked.
    await table().delete().eq("id", id).eq("state", "preparing");
    throw e;
  }
  const { data: locked, error: lockError } = await table().update({ state: "publishing" })
    .eq("id", id).eq("state", "preparing").select("id").single();
  if (lockError || !locked) throw new Error(REEL_UNCERTAIN);
  let postId: string;
  try { postId = await publish(container); }
  catch { throw new Error(REEL_UNCERTAIN); }
  const { data: receipt, error: saveError } = await table().update({ state: "published", post_id: postId })
    .eq("id", id).eq("state", "publishing").select("id").single();
  // Do not return an unrecorded success that could later be retried elsewhere.
  if (saveError || !receipt) throw new Error(REEL_UNCERTAIN);
  return postId;
}
