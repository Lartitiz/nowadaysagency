// Vidéo LinkedIn (28/11/2026) : le parcours du reel ouvert au canal LinkedIn.
import { describe, expect, it } from "vitest";
import { isLinkedInSharedFormat, isLinkedInVideo } from "@/features/creer/linkedin-shared-format";
import { applyLinkedInVideoCaption, hasLinkedInVideoCaption, linkedInVideoPublishText, linkedInVideoRawForCalendar, videoScriptSummary, LINKEDIN_VIDEO_CAPTION_MISSING } from "@/features/creer/linkedin-video-caption";
import { extractLinkedInText, isInstagramPublishTarget, linkedInPublishDisabledReason, LINKEDIN_VIDEO_REQUIRED } from "@/features/creer/publish-guards";
import { calendarEntryFormat } from "@/features/creer/calendar-entry-canal";
import { buildCalendarContent } from "@/features/creer/build-calendar-content";
import { calendarPublishCaption } from "../../supabase/functions/_shared/calendar-caption";

const INSTA = {
  sections: [{ section: "hook", timing: "0-3s", texte_parle: "J'ai failli tout arrêter." }, { section: "body", timing: "3-20s", texte_parle: "Puis une cliente m'a écrit." }],
  caption: { text: "Légende Instagram ✨", cta: "Enregistre ce reel" },
  hashtags: ["#insta", "#reel"],
  amplification_stories: [{ text: "Story de relance" }],
};
const MP4 = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/calendar-media/u/reel.mp4`;

describe("vidéo LinkedIn — canal porté par le drapeau", () => {
  it("carrousel et vidéo sont les deux formats partagés ; un post ou Instagram ne le sont pas", () => {
    expect(isLinkedInSharedFormat("linkedin", "reel")).toBe(true);
    expect(isLinkedInSharedFormat("linkedin", "carousel")).toBe(true);
    expect(isLinkedInSharedFormat("linkedin", "linkedin")).toBe(false);
    expect(isLinkedInSharedFormat("instagram", "reel")).toBe(false);
    expect(isLinkedInVideo("reel", true)).toBe(true);
    expect(isLinkedInVideo("reel", false)).toBe(false);
    expect(isLinkedInVideo("carousel", true)).toBe(false);
  });
  it("un reel du calendrier au canal LinkedIn rouvre la vidéo LinkedIn", () => {
    expect(calendarEntryFormat("reel", "linkedin")).toEqual({ fmt: "reel", linkedinCarousel: true });
    expect(calendarEntryFormat("reel", "instagram")).toEqual({ fmt: "reel", linkedinCarousel: false });
  });
  it("une vidéo LinkedIn n'affiche jamais « Publier sur Instagram »", () => {
    expect(isInstagramPublishTarget({ selectedFormat: "reel", isLinkedInCarousel: true })).toBe(false);
    expect(isInstagramPublishTarget({ selectedFormat: "reel", isLinkedInCarousel: false })).toBe(true);
  });
});

describe("vidéo LinkedIn — légende", () => {
  it("le script envoyé à la consigne est le texte dit à l'oral", () => {
    expect(videoScriptSummary(INSTA)).toBe("J'ai failli tout arrêter.\nPuis une cliente m'a écrit.");
    expect(videoScriptSummary(null)).toBe("");
  });
  it("la légende d'origine (Instagram) ne compte pas comme légende LinkedIn", () => {
    expect(hasLinkedInVideoCaption(INSTA)).toBe(false);
    expect(linkedInVideoPublishText(INSTA)).toBe("");
    expect(extractLinkedInText(INSTA)).toBe("");
  });
  it("la réponse LinkedIn remplace la légende, borne les hashtags à 2 et pose la marque", () => {
    const next = applyLinkedInVideoCaption(INSTA, { hook: "« Arrête tout. »", body: "Voilà ce qui s'est passé ensuite.", cta: "Et vous ?", hashtags: ["artisanat", "#metier", "trois"] })!;
    expect(next.caption).toEqual({ text: "« Arrête tout. »\n\nVoilà ce qui s'est passé ensuite.", cta: "Et vous ?" });
    expect(next.hashtags).toEqual(["#artisanat", "#metier"]);
    expect(hasLinkedInVideoCaption(next)).toBe(true);
    expect(extractLinkedInText(next)).toBe("« Arrête tout. »\n\nVoilà ce qui s'est passé ensuite.\n\nEt vous ?\n\n#artisanat #metier");
    expect(next.sections).toBe(INSTA.sections);
  });
  it("une réponse vide ne remplace rien", () => {
    expect(applyLinkedInVideoCaption(INSTA, { hook: " ", body: "" })).toBeNull();
  });
});

describe("vidéo LinkedIn — publication et calendrier", () => {
  const ready = applyLinkedInVideoCaption(INSTA, { hook: "Accroche", body: "Corps", cta: "", hashtags: [] })!;
  it("publier demande la vidéo rangée chez nous, puis la légende LinkedIn", () => {
    expect(linkedInPublishDisabledReason({ isLinkedInTextPost: false, isLinkedInVideo: true, raw: ready, reelMp4Url: null })).toBe(LINKEDIN_VIDEO_REQUIRED);
    expect(linkedInPublishDisabledReason({ isLinkedInTextPost: false, isLinkedInVideo: true, raw: INSTA, reelMp4Url: MP4 })).toBe(LINKEDIN_VIDEO_CAPTION_MISSING);
    expect(linkedInPublishDisabledReason({ isLinkedInTextPost: false, isLinkedInVideo: true, raw: ready, reelMp4Url: MP4 })).toBeNull();
  });
  it("au calendrier : jamais la légende Instagram ni les stories de relance", () => {
    const sansLegende = buildCalendarContent("reel", linkedInVideoRawForCalendar(INSTA));
    expect(sansLegende.storyDetail.amplification_stories).toEqual([]);
    expect(calendarPublishCaption(sansLegende.contentDraft, sansLegende.storyDetail)).toBe("");
    const avec = buildCalendarContent("reel", linkedInVideoRawForCalendar(ready));
    expect(calendarPublishCaption(avec.contentDraft, avec.storyDetail)).toBe("Accroche\n\nCorps");
    expect(avec.storyDetail.caption_channel).toBe("linkedin");
  });
});
