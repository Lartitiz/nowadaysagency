import { renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Photos jointes à la création des stories : avant le 13/11/2026 elles ne
   vivaient que dans le navigateur (calendrier, Mes idées, autre appareil :
   stories sans photo). Elles sont maintenant envoyées une fois et écrites dans
   visual.photo_url. */

const m = vi.hoisted(() => ({ uploads: [] as string[], fail: false, user: { id: "u1" } as { id: string } | null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: m.user } }) },
    storage: {
      from: () => ({
        upload: async (path: string) => { m.uploads.push(path); return { error: m.fail ? { message: "refus" } : null }; },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  },
}));

import { useBakeAttachedPhotos, withBakedPhotos } from "@/components/stories/use-bake-attached-photos";
import { attachedPhotoSlots } from "@/lib/story-attached-photos";

const photo = (n: number) => ({ base64: btoa(`photo-${n}`), mimeType: "image/jpeg" });
const story = (extra: any = {}) => ({ text: "t", visual: { gabarit: "photo_pills", background: "photo", ...extra } });

function setup(stories: any[], photos: any[]) {
  const onStoriesUpdate = vi.fn();
  const automaticChange = { current: false };
  const hook = renderHook(() => {
    const [list, setList] = useState(stories);
    const slots = attachedPhotoSlots(list, photos);
    useBakeAttachedPhotos({ stories: list, slots, photos, setStories: setList, onStoriesUpdate, automaticChange });
    return list;
  });
  return { hook, onStoriesUpdate, automaticChange };
}

describe("photos jointes aux stories, enregistrées", () => {
  beforeEach(() => { m.uploads = []; m.fail = false; m.user = { id: "u1" }; });

  it("2 photos réparties : chacune envoyée une fois, adresse écrite sur sa story, hors « Annuler »", async () => {
    const { hook, onStoriesUpdate, automaticChange } = setup(
      [story(), story({ background: "color" }), story(), story({ photo_url: "https://deja/la.jpg" })],
      [photo(1), photo(2)],
    );
    await waitFor(() => expect(onStoriesUpdate).toHaveBeenCalledTimes(1));
    const list = hook.result.current;
    expect(m.uploads).toHaveLength(2);
    expect(m.uploads.every((p) => p.startsWith("u1/stories/"))).toBe(true);
    expect(list[0].visual.photo_url).toMatch(/^https:\/\/cdn\.test\/u1\/stories\//);
    expect(list[2].visual.photo_url).toMatch(/^https:\/\/cdn\.test\/u1\/stories\//);
    expect(list[0].visual.photo_url).not.toBe(list[2].visual.photo_url);
    expect(list[1].visual.photo_url).toBeUndefined();
    expect(list[3].visual.photo_url).toBe("https://deja/la.jpg");
    expect(automaticChange.current).toBe(true);
    expect(onStoriesUpdate.mock.calls[0][0]).toEqual(list);
  });

  it("1 photo = fil de toute la séquence : un seul envoi, même adresse partout", async () => {
    const { hook, onStoriesUpdate } = setup([story(), story(), story({ background: "color" })], [photo(7)]);
    await waitFor(() => expect(onStoriesUpdate).toHaveBeenCalled());
    const [a, b, c] = hook.result.current;
    expect(new Set(m.uploads).size).toBe(1);
    expect(a.visual.photo_url).toBe(b.visual.photo_url);
    expect(c.visual.photo_url).toBeUndefined();
  });

  it("un envoi refusé : rien n'est écrit (tout ou rien)", async () => {
    m.fail = true;
    const { hook, onStoriesUpdate } = setup([story(), story()], [photo(11), photo(12)]);
    await waitFor(() => expect(m.uploads.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 30));
    expect(onStoriesUpdate).not.toHaveBeenCalled();
    expect(hook.result.current.every((s: any) => !s.visual.photo_url)).toBe(true);
  });

  it("sans photo jointe ou sans compte : rien n'est envoyé", async () => {
    setup([story()], []);
    m.user = null;
    setup([story()], [photo(21)]);
    await new Promise((r) => setTimeout(r, 30));
    expect(m.uploads).toHaveLength(0);
  });
});

describe("withBakedPhotos", () => {
  it("ne remplace ni une photo choisie, ni une photo de bibliothèque, et retire le numéro épinglé", () => {
    const slots = new Map([[0, 0], [1, 0], [2, 1]]);
    const urls = new Map([[0, "https://a"], [1, "https://b"]]);
    const out = withBakedPhotos([story({ attached_slot: 0 }), story({ photo_id: "lib" }), story()], slots, urls);
    expect(out[0].visual).toMatchObject({ photo_url: "https://a" });
    expect(out[0].visual.attached_slot).toBeUndefined();
    expect(out[1].visual.photo_url).toBeUndefined();
    expect(out[2].visual.photo_url).toBe("https://b");
  });
});
