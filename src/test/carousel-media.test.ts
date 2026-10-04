import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { externalizeCarouselMedia, withCarouselMedia } from "@/lib/carousel-media";

const big = (seed: string, type = "jpeg") => `data:image/${type};base64,${btoa(seed.repeat(20_000))}`;
function client(fail: (path: string) => unknown = () => null) {
  const uploads: string[] = [];
  const bucket = {
    upload: vi.fn(async (path: string) => { uploads.push(path); return { error: fail(path) }; }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/calendar-visuals/${path}` } }),
  };
  return { uploads, bucket, storage: { from: vi.fn(() => bucket) } as any };
}

describe("externalizeCarouselMedia", () => {
  it("stores each photo once, by content, and keeps only its link everywhere (slides and history)", async () => {
    const c = client(); const photo = big("a");
    const raw = {
      visual_html: [{ html: `<img src="${photo}">` }, { html: `<div style="background-image:url('${photo}')"></div>` }],
      _carousel_cloud: { history: [{ raw: { visual_html: [{ html: `<img src="${photo}">` }] } }] },
    };
    const out = await externalizeCarouselMedia(raw, "user-1", c);
    expect(c.uploads).toHaveLength(1);
    expect(c.uploads[0]).toMatch(/^user-1\/carousel-media\/[0-9a-f]{64}\.jpg$/);
    expect(JSON.stringify(out)).not.toContain("data:image");
    expect(out.visual_html[0].html).toContain(`/calendar-visuals/${c.uploads[0]}`);
    expect(out._carousel_cloud.history[0].raw.visual_html[0].html).toBe(out.visual_html[0].html);
    expect(raw.visual_html[0].html).toContain("data:image"); // l'objet d'origine n'est pas modifié
  });

  it("does not resend an already stored photo on the next autosave", async () => {
    const c = client(); const photo = big("b", "png");
    await externalizeCarouselMedia({ html: photo }, "user-2", c);
    await externalizeCarouselMedia({ html: `<img src="${photo}">` }, "user-2", c);
    expect(c.uploads).toHaveLength(1);
    expect(c.uploads[0]).toMatch(/\.png$/);
  });

  it("keeps small inline images (icons, textures) untouched", async () => {
    const c = client(); const icon = `data:image/png;base64,${btoa("i".repeat(100))}`;
    const raw = { html: `<img src="${icon}">` };
    expect(await externalizeCarouselMedia(raw, "user-3", c)).toBe(raw);
    expect(c.uploads).toHaveLength(0);
  });

  it("treats an existing file with the same content as stored", async () => {
    const c = client(() => ({ message: "The resource already exists", statusCode: "409" }));
    const out = await externalizeCarouselMedia({ html: big("c") }, "user-4", c);
    expect(out.html).toMatch(/^https:\/\/.*\/carousel-media\/[0-9a-f]{64}\.jpg$/);
  });

  it("never blocks a save: a photo that cannot be stored stays in the content, and is retried next time", async () => {
    let offline = true;
    const c = client(() => offline ? { message: "Failed to fetch" } : null);
    const photo = big("d");
    const first = await externalizeCarouselMedia({ html: photo }, "user-5", c);
    expect(first.html).toBe(photo);
    offline = false;
    const second = await externalizeCarouselMedia({ html: photo }, "user-5", c);
    expect(second.html).toMatch(/carousel-media/);
    expect(c.uploads).toHaveLength(2);
  });
});

describe("withCarouselMedia", () => {
  it("writes drafts with links instead of photos, on insert and update", async () => {
    const c = client(); const photo = big("e");
    const store = { read: vi.fn(), insert: vi.fn(async (_id, raw) => ({ id: "1", updated_at: "t", content_data: raw })), update: vi.fn(async (_id, _t, raw) => ({ id: "1", updated_at: "t2", content_data: raw })) };
    const wrapped = withCarouselMedia(store, "user-6", c);
    await wrapped.insert("1", { visual_html: [{ html: `<img src="${photo}">` }] });
    await wrapped.update("1", "t", { visual_html: [{ html: `<img src="${photo}">` }] });
    expect(JSON.stringify(store.insert.mock.calls[0][1])).not.toContain("data:image");
    expect(JSON.stringify(store.update.mock.calls[0][2])).not.toContain("data:image");
    expect(store.update.mock.calls[0][1]).toBe("t");
    expect(c.uploads).toHaveLength(1);
  });
});
