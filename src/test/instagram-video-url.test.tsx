import { describe, it, expect } from "vitest";
import { isPublicImageUrl, isPublicVideoUrl } from "@/lib/instagram-publish";

// Un reel monté est rangé dans media_urls exactement comme une image. Sans un
// tri explicite il partait en `image_url` et Instagram refusait le média :
// c'est le tri qui décide entre un post image et un REELS.
describe("instagram-publish — vidéo vs image dans media_urls", () => {
  const mp4 = "https://xyz.supabase.co/storage/v1/object/public/calendar-media/reels-montes/u/a.mp4";
  const jpg = "https://xyz.supabase.co/storage/v1/object/public/calendar-media/photos/u/a.jpg";

  it("reconnaît un MP4 public comme vidéo", () => {
    expect(isPublicVideoUrl(mp4)).toBe(true);
    expect(isPublicVideoUrl(`${mp4}?token=abc`)).toBe(true);
  });

  it("n'accepte PAS un MP4 comme image (sinon il part en image_url)", () => {
    expect(isPublicImageUrl(mp4)).toBe(false);
    expect(isPublicImageUrl(`${mp4}?token=abc`)).toBe(false);
  });

  it("laisse passer les images normalement", () => {
    expect(isPublicImageUrl(jpg)).toBe(true);
    expect(isPublicVideoUrl(jpg)).toBe(false);
  });

  it("rejette blob:, data: et http non sécurisé", () => {
    expect(isPublicVideoUrl("blob:http://x/y.mp4")).toBe(false);
    expect(isPublicImageUrl("data:image/png;base64,xx")).toBe(false);
    expect(isPublicVideoUrl("http://x/y.mp4")).toBe(false);
  });
});
