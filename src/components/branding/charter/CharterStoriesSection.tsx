import { useMemo } from "react";
import { STORY_ASSEMBLAGES, DEFAULT_STORY_ASSEMBLAGE, resolveStoryStyle, type StoryAssemblageKey } from "@/lib/story-styles";
import { buildStoryFrameHtml, type StoryFrameBranding, type StoryFrameStory } from "@/lib/story-visual";
import StoryFramePreview from "@/components/stories/StoryFramePreview";
import storyPhoto from "@/assets/story-exemple.jpg";

/**
 * Section « Mes stories Instagram » de la charte : l'utilisatrice choisit son
 * style SUR DES EXEMPLES rendus avec ses couleurs (décision 07/09/2026), pas
 * sur une liste de noms de polices. Un assemblage par marque, 3 réglages,
 * aperçu en direct. Les stories déjà créées ne bougent pas.
 */

interface CharterStoriesData {
  color_primary: string | null;
  color_secondary: string | null;
  color_background: string | null;
  color_text: string | null;
  story_assemblage: string | null;
  story_pill_color: string | null;
  story_corners: string | null;
  story_align: string | null;
  [key: string]: any;
}

interface Props {
  data: CharterStoriesData;
  onDataChange: (updates: Partial<CharterStoriesData>) => void;
}

// Exemples « classiques » : une story photo, une liste, une citation. Texte
// volontairement générique (l'utilisatrice verra ses vrais textes ensuite).
const EXAMPLE_PHOTO: StoryFrameStory = {
  visual: {
    gabarit: "photo_pills",
    background: "photo",
    title_pill: "Ce que j'aurais aimé savoir",
    body_pill: "Pendant longtemps je faisais tout dans le mauvais ordre. Résultat : deux fois plus de temps.",
  },
};
const EXAMPLE_LISTE: StoryFrameStory = {
  visual: {
    gabarit: "liste",
    background: "fond_couleur",
    title_pill: "Mes 3 rituels du matin",
    list_pills: ["Un thé avant d'ouvrir l'ordi", "La même heure tous les jours", "Une photo de ce que je fais"],
  },
};
const EXAMPLE_CITATION: StoryFrameStory = {
  visual: {
    gabarit: "citation",
    background: "fond_couleur",
    quote: "Je n'avais jamais vu quelqu'un en parler comme ça.",
    body_pill: "Marion, cliente depuis juin",
  },
};

const PILL_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "primary", label: "Couleur principale" },
  { value: "secondary", label: "Couleur secondaire" },
  { value: "ink", label: "Encre" },
];
const CORNER_OPTIONS: { value: string; label: string }[] = [
  { value: "courts", label: "Courts (Instagram)" },
  { value: "droits", label: "Droits" },
];
const ALIGN_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "centre", label: "Toujours centré" },
  { value: "gauche", label: "Toujours à gauche" },
];

function OptionRow({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                active ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-foreground hover:bg-muted/40"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CharterStoriesSection({ data, onDataChange }: Props) {
  const resolved = resolveStoryStyle(data);

  const brandingFor = (assemblage: StoryAssemblageKey): StoryFrameBranding => ({
    color_primary: data.color_primary,
    color_secondary: data.color_secondary,
    color_background: data.color_background,
    color_text: data.color_text,
    story_assemblage: assemblage,
    story_pill_color: resolved.pillColor,
    story_corners: resolved.corners,
    story_align: resolved.align,
  });

  // Cartes : 2 mini-stories par assemblage, rendues avec les couleurs de la marque.
  const cards = useMemo(
    () =>
      STORY_ASSEMBLAGES.map((a) => {
        const b = brandingFor(a.key);
        return {
          asm: a,
          photo: buildStoryFrameHtml(EXAMPLE_PHOTO, b, { photoUrl: storyPhoto, preview: false }) || "",
          liste: buildStoryFrameHtml(EXAMPLE_LISTE, b, { preview: false }) || "",
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.color_primary, data.color_secondary, data.color_background, data.color_text, resolved.pillColor, resolved.corners, resolved.align],
  );

  const big = useMemo(() => {
    const b = brandingFor(resolved.assemblage);
    return [
      { key: "photo", html: buildStoryFrameHtml(EXAMPLE_PHOTO, b, { photoUrl: storyPhoto, preview: false }) || "" },
      { key: "liste", html: buildStoryFrameHtml(EXAMPLE_LISTE, b, { preview: false }) || "" },
      { key: "citation", html: buildStoryFrameHtml(EXAMPLE_CITATION, b, { preview: false }) || "" },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.color_primary, data.color_secondary, data.color_background, data.color_text, resolved.assemblage, resolved.pillColor, resolved.corners, resolved.align]);

  return (
    <section className="rounded-2xl border border-border bg-card p-5" data-charter-stories>
      <h2 className="font-body text-base font-bold text-foreground mb-1">📱 Mes stories Instagram</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-prose">
        Choisis sur des exemples. Le style s'applique à toutes tes prochaines stories, avec tes couleurs.
        Tu peux le changer quand tu veux, ça ne touche pas aux stories déjà créées.
      </p>

      <p className="text-xs font-medium text-muted-foreground mb-2">L'assemblage</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Assemblage">
        {cards.map(({ asm, photo, liste }) => {
          const active = asm.key === resolved.assemblage;
          return (
            <button
              key={asm.key}
              type="button"
              role="radio"
              aria-checked={active}
              data-story-assemblage={asm.key}
              onClick={() => onDataChange({ story_assemblage: asm.key })}
              className={`relative min-w-0 text-left rounded-xl border p-3 transition-all hover:border-primary/40 hover:bg-muted/30 ${
                active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-xs font-medium text-foreground">
                  {asm.key} · {asm.name}
                </span>
                {asm.key === DEFAULT_STORY_ASSEMBLAGE && (
                  <span className="text-2xs font-medium uppercase tracking-wide text-primary bg-primary/10 rounded-full px-2 py-0.5">
                    Recommandé
                  </span>
                )}
                {active && asm.key !== DEFAULT_STORY_ASSEMBLAGE && (
                  <span className="text-2xs text-primary font-medium">Sélectionné</span>
                )}
              </div>
              <div className="flex gap-2 min-w-0">
                <StoryFramePreview html={photo} title={`${asm.name}, story photo`} fluid />
                <StoryFramePreview html={liste} title={`${asm.name}, story liste`} fluid />
              </div>
              <p className="text-2xs text-muted-foreground/80 leading-snug mt-2.5">{asm.description}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 pt-5 border-t border-border grid gap-4 sm:grid-cols-3">
        <OptionRow
          label="Couleur des pastilles"
          options={PILL_COLOR_OPTIONS}
          value={resolved.pillColor}
          onChange={(v) => onDataChange({ story_pill_color: v })}
        />
        <OptionRow
          label="Coins"
          options={CORNER_OPTIONS}
          value={resolved.corners}
          onChange={(v) => onDataChange({ story_corners: v })}
        />
        <OptionRow
          label="Alignement"
          options={ALIGN_OPTIONS}
          value={resolved.align}
          onChange={(v) => onDataChange({ story_align: v })}
        />
      </div>

      <div className="mt-6 pt-5 border-t border-border">
        <p className="text-xs font-medium text-muted-foreground mb-2">Aperçu sur trois stories classiques</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-[560px]" data-charter-stories-preview>
          {big.map((s) => (
            <StoryFramePreview key={s.key} html={s.html} title={`Aperçu ${s.key}`} fluid />
          ))}
        </div>
        <p className="text-2xs text-muted-foreground/80 mt-2">
          Ce sont des exemples : le texte et les photos viendront de tes vraies stories.
        </p>
      </div>
    </section>
  );
}
