import { describe, it, expect } from "vitest";
import {
  findPublishableImageUrl,
  extractInstagramCaption,
  extractLinkedInText,
  instagramPublishDisabledReason,
  isInstagramPublishTarget,
  linkedInPublishDisabledReason,
  REASON_IMAGE_MANQUANTE,
  canAutoPublishSchedule,
  buildScheduledPublishUpdate,
  checkScheduleGuards,
  tokenExpiresBeforeSchedule,
} from "@/features/creer/publish-guards";

describe("isInstagramPublishTarget (affichage du bouton Publier sur Instagram)", () => {
  it("vrai pour les formats du canal Instagram", () => {
    for (const f of ["carousel", "post", "story", "reel"]) {
      expect(isInstagramPublishTarget({ selectedFormat: f })).toBe(true);
    }
  });

  it("faux pour les autres canaux : le bouton ne doit pas s'afficher du tout", () => {
    for (const f of ["linkedin", "newsletter", "pinterest", "pinterest_visual", "pinterest_photo", "pinterest_inspiration"]) {
      expect(isInstagramPublishTarget({ selectedFormat: f })).toBe(false);
    }
    expect(isInstagramPublishTarget({ selectedFormat: null })).toBe(false);
  });

  it("carrousel LinkedIn : selectedFormat vaut carousel mais le canal est LinkedIn", () => {
    expect(isInstagramPublishTarget({ selectedFormat: "carousel", isLinkedInCarousel: true })).toBe(false);
    expect(isInstagramPublishTarget({ selectedFormat: "carousel", isLinkedInCarousel: false })).toBe(true);
  });
});

describe("findPublishableImageUrl", () => {
  it("retourne null sans résultat", () => {
    expect(findPublishableImageUrl(null)).toBeNull();
    expect(findPublishableImageUrl({})).toBeNull();
  });

  it("prend la première URL https valide dans l'ordre des candidats", () => {
    expect(findPublishableImageUrl({ image_url: "https://a.com/x.jpg", cover_url: "https://b.com/y.jpg" }))
      .toBe("https://a.com/x.jpg");
    expect(findPublishableImageUrl({ photo: { url: "https://p.com/p.jpg" } })).toBe("https://p.com/p.jpg");
    expect(findPublishableImageUrl({ slides: [{ image_url: "https://s.com/s1.jpg" }] })).toBe("https://s.com/s1.jpg");
  });

  it("refuse blob:, data: et http non sécurisé", () => {
    expect(findPublishableImageUrl({ image_url: "blob:https://x" })).toBeNull();
    expect(findPublishableImageUrl({ image_url: "data:image/png;base64,xxx" })).toBeNull();
    expect(findPublishableImageUrl({ image_url: "http://insecure.com/a.jpg" })).toBeNull();
  });

  it("retombe sur la preview de photo uploadée si elle est https", () => {
    expect(findPublishableImageUrl({}, "https://cdn.com/up.jpg")).toBe("https://cdn.com/up.jpg");
    expect(findPublishableImageUrl({}, "blob:local")).toBeNull();
  });
});

describe("extractInstagramCaption / extractLinkedInText", () => {
  it("priorise edited_text puis full_text puis content", () => {
    expect(extractInstagramCaption({ edited_text: "E", full_text: "F" })).toBe("E");
    expect(extractLinkedInText({ full_text: "F", content: "C" })).toBe("F");
  });

  it("Instagram lit le champ caption (string ou objet), LinkedIn non (chaîne historique)", () => {
    expect(extractInstagramCaption({ caption: "Cap" })).toBe("Cap");
    expect(extractInstagramCaption({ caption: { text: "CapText" } })).toBe("CapText");
    expect(extractLinkedInText({ caption: "Cap", hook: "H" })).toBe("H");
  });

  it("assemble hook/body/cta en dernier recours", () => {
    expect(extractInstagramCaption({ hook: "H", body: "B", cta: "C" })).toBe("H\n\nB\n\nC");
    expect(extractLinkedInText({ hook: "H", cta: "C" })).toBe("H\n\nC");
    expect(extractInstagramCaption({})).toBe("");
  });

  it("caption structurée {hook, body, cta} du carrousel : assemble le texte", () => {
    // Avant : caption objet sans text/full → "" (légende jamais publiée).
    expect(extractInstagramCaption({ caption: { hook: "H", body: "B", cta: "C" } })).toBe("H\n\nB\n\nC");
  });

  it("caption structurée : les hashtags édités partent bien dans la légende publiée", () => {
    expect(
      extractInstagramCaption({ caption: { hook: "H", body: "B", cta: "C", hashtags: ["artisanat", "#savonnerie", "made in france"] } }),
    ).toBe("H\n\nB\n\nC\n\n#artisanat #savonnerie #madeinfrance");
    // Hashtags seuls (hook/body/cta vides) : la ligne de hashtags reste publiable.
    expect(extractInstagramCaption({ caption: { hashtags: ["a", "b"] } })).toBe("#a #b");
  });

  it("caption structurée : text/full historique gardent la priorité", () => {
    expect(extractInstagramCaption({ caption: { text: "T", hook: "H", hashtags: ["x"] } })).toBe("T");
  });
});

describe("instagramPublishDisabledReason", () => {
  const base = { selectedFormat: "post", isCarousel: false, visualSlidesCount: 0, publishableImageUrl: "https://a.com/i.jpg" };

  it("bloque les formats non-Instagram", () => {
    for (const f of ["pinterest_epingle", "linkedin", "newsletter"]) {
      expect(instagramPublishDisabledReason({ ...base, selectedFormat: f })).toMatch(/formats Instagram/);
    }
  });

  it("carrousel LinkedIn : bloqué même avec des visuels prêts (trou historique)", () => {
    expect(
      instagramPublishDisabledReason({ ...base, selectedFormat: "carousel", isCarousel: true, visualSlidesCount: 5, isLinkedInCarousel: true }),
    ).toMatch(/formats Instagram/);
  });

  it("story : bloqué même avec une image publiable (l'edge ne fait pas media_type=STORIES)", () => {
    expect(instagramPublishDisabledReason({ ...base, selectedFormat: "story" })).toMatch(/stories arrive bientôt/);
    expect(instagramPublishDisabledReason({ ...base, selectedFormat: "story", publishableImageUrl: null })).toMatch(/stories arrive bientôt/);
  });

  it("carrousel : exige au moins 2 visuels", () => {
    expect(instagramPublishDisabledReason({ ...base, isCarousel: true, visualSlidesCount: 1 })).toMatch(/visuels du carrousel/);
    expect(instagramPublishDisabledReason({ ...base, isCarousel: true, visualSlidesCount: 2 })).toBeNull();
  });

  it("image simple : exige une image, avec un message en langage courant (REASON_IMAGE_MANQUANTE)", () => {
    expect(instagramPublishDisabledReason({ ...base, publishableImageUrl: null })).toBe(REASON_IMAGE_MANQUANTE);
    expect(instagramPublishDisabledReason(base)).toBeNull();
  });
});

describe("linkedInPublishDisabledReason", () => {
  it("null quand le bouton n'est pas affiché (pas un post texte LinkedIn)", () => {
    expect(linkedInPublishDisabledReason({ isLinkedInTextPost: false, raw: {} })).toBeNull();
  });

  it("exige un texte généré", () => {
    expect(linkedInPublishDisabledReason({ isLinkedInTextPost: true, raw: {} })).toMatch(/Génère ton post/);
    expect(linkedInPublishDisabledReason({ isLinkedInTextPost: true, raw: { content: "Un post" } })).toBeNull();
  });
});

describe("canAutoPublishSchedule (garde média pour la programmation)", () => {
  it("Instagram : bloque sans média joignable", () => {
    expect(canAutoPublishSchedule({ canal: "instagram", attachedMedia: null })).toBe(false);
    expect(canAutoPublishSchedule({ canal: "instagram", attachedMedia: [] })).toBe(false);
  });

  it("Instagram : autorise dès qu'un média est joint", () => {
    expect(canAutoPublishSchedule({ canal: "instagram", attachedMedia: ["https://x.com/a.jpg"] })).toBe(true);
  });

  it("LinkedIn (texte) : pas de contrainte média", () => {
    expect(canAutoPublishSchedule({ canal: "linkedin", attachedMedia: null })).toBe(true);
  });
});

describe("buildScheduledPublishUpdate", () => {
  it("pose scheduled_publish_at, auto_publish et publish_status=scheduled", () => {
    const scheduleAt = new Date("2026-09-01T10:00:00.000Z");
    const now = new Date("2026-08-17T08:00:00.000Z");
    expect(buildScheduledPublishUpdate(scheduleAt, now)).toEqual({
      scheduled_publish_at: "2026-09-01T10:00:00.000Z",
      auto_publish: true,
      publish_status: "scheduled",
      publish_error: null,
      updated_at: "2026-08-17T08:00:00.000Z",
    });
  });
});

// `input` reproduit un <input type="datetime-local"> : sans fuseau, `new Date(input)`
// le lit en HEURE LOCALE. On formate donc depuis les getters locaux (pas .toISOString(),
// qui est en UTC) pour que le test reste correct quel que soit le fuseau de la machine CI.
function toDatetimeLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

describe("checkScheduleGuards (fenêtre Publier ou programmer)", () => {
  const NOW = new Date("2026-08-17T12:00:00.000Z").getTime();
  const FUTURE = toDatetimeLocalInput(new Date(NOW + 15 * 24 * 60 * 60 * 1000));

  it("aucun canal de publication : bloque silencieusement (pas de toast)", () => {
    expect(checkScheduleGuards({ publishChannel: null, isChannelConnected: false, input: FUTURE, now: NOW }))
      .toEqual({ blocked: true, reason: "no_channel" });
  });

  it("bouton désactivé (ex: pas de texte LinkedIn généré) : bloque avec le message de la raison", () => {
    expect(
      checkScheduleGuards({
        publishChannel: "linkedin",
        disabledReason: "Génère ton post LinkedIn pour pouvoir le publier.",
        isChannelConnected: true,
        input: FUTURE,
        now: NOW,
      }),
    ).toEqual({ blocked: true, reason: "disabled", message: "Génère ton post LinkedIn pour pouvoir le publier." });
  });

  it("aucun canal connecté : bloque proprement avec message + description dédiés, sans planter", () => {
    const result = checkScheduleGuards({
      publishChannel: "instagram",
      isChannelConnected: false,
      input: FUTURE,
      now: NOW,
    });
    expect(result).toEqual({
      blocked: true,
      reason: "not_connected",
      message: "Compte Instagram non connecté",
      description: "Connecte-le pour que ce contenu parte tout seul à l'heure prévue.",
    });
  });

  it("aucun canal connecté (LinkedIn) : message adapté au réseau", () => {
    const result = checkScheduleGuards({ publishChannel: "linkedin", isChannelConnected: false, input: FUTURE, now: NOW });
    expect(result).toMatchObject({ reason: "not_connected", message: "Compte LinkedIn non connecté" });
  });

  it("date/heure vide ou invalide : bloque", () => {
    expect(
      checkScheduleGuards({ publishChannel: "instagram", isChannelConnected: true, input: "", now: NOW }),
    ).toEqual({ blocked: true, reason: "invalid_date", message: "Choisis une date et une heure." });
    expect(
      checkScheduleGuards({ publishChannel: "instagram", isChannelConnected: true, input: "pas-une-date", now: NOW }),
    ).toEqual({ blocked: true, reason: "invalid_date", message: "Choisis une date et une heure." });
  });

  it("date dans le passé (ou moins d'1 minute dans le futur) : bloque", () => {
    const almostNow = toDatetimeLocalInput(new Date(NOW + 30000));
    expect(
      checkScheduleGuards({ publishChannel: "instagram", isChannelConnected: true, input: almostNow, now: NOW }),
    ).toEqual({ blocked: true, reason: "past_date", message: "Choisis une date/heure dans le futur." });
  });

  it("tout est en ordre : ne bloque pas, la programmation peut être déléguée à handleConfirmCalendar", () => {
    expect(
      checkScheduleGuards({ publishChannel: "instagram", isChannelConnected: true, input: FUTURE, now: NOW }),
    ).toEqual({ blocked: false });
  });
});

describe("tokenExpiresBeforeSchedule", () => {
  it("faux sans date d'expiration connue", () => {
    expect(tokenExpiresBeforeSchedule(null, new Date("2026-09-01"))).toBe(false);
    expect(tokenExpiresBeforeSchedule(undefined, new Date("2026-09-01"))).toBe(false);
  });

  it("vrai si la programmation tombe après l'expiration du jeton", () => {
    expect(tokenExpiresBeforeSchedule("2026-08-20T00:00:00.000Z", new Date("2026-09-01T00:00:00.000Z"))).toBe(true);
  });

  it("faux si la programmation tombe avant l'expiration du jeton", () => {
    expect(tokenExpiresBeforeSchedule("2026-09-10T00:00:00.000Z", new Date("2026-09-01T00:00:00.000Z"))).toBe(false);
  });
});
