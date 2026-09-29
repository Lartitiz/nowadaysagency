import type { StudioBrandContext } from "./api";

const fields = [
  ["charter", "Charte visuelle", [
    ["photo_style", "Style photo"], ["mood_keywords", "Ambiance"],
    ["visual_donts", "À éviter"], ["moodboard_description", "Univers"],
    ["color_primary", "Couleur principale"],
    ["color_secondary", "Couleur secondaire"],
    ["color_accent", "Accent"],
    ["color_background", "Fond"], ["color_text", "Texte"],
    ["font_title", "Police des titres"], ["font_body", "Police du texte"],
  ]],
  ["identity", "Identité", [
    ["mission", "Mission"], ["offer", "Offre"],
    ["target_description", "Public"], ["voice_description", "Voix"],
    ["things_to_avoid", "À éviter"],
  ]],
  ["proposition", "Positionnement", [
    ["version_final", "Proposition"], ["version_one_liner", "En une phrase"],
  ]],
  ["strategy", "Direction", [
    ["creative_concept", "Concept"], ["pillar_major", "Pilier principal"],
    ["pillar_minor_1", "Pilier secondaire 1"], ["pillar_minor_2", "Pilier secondaire 2"],
  ]],
] as const;

function readable(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const values = value.filter((part): part is string => typeof part === "string" && !!part.trim());
    return values.length ? values.join(" · ") : null;
  }
  return null;
}

export function StudioBrandContext({ context }: { context: StudioBrandContext }) {
  const date = new Date(context.captured_at);
  const captured = Number.isNaN(date.valueOf()) ? "lors de la demande" : date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  return (
    <details className="rounded-lg border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Marque transmise au Studio · {captured}</summary>
      <p className="mt-2 text-muted-foreground">Ce contexte a servi à préparer la demande. Il ne garantit pas chaque détail du résultat. Une nouvelle demande utilise ta marque actuelle.</p>
      {fields.map(([key, title, entries]) => {
        const section = context[key];
        const present = entries.map(([field, label]) => [label, readable(section?.[field])] as const).filter(([, value]) => !!value);
        return present.length ? (
          <div key={key} className="mt-3">
            <h3 className="font-medium">{title}</h3>
            <dl className="mt-1 space-y-1">
              {present.map(([label, value]) => (
                <div key={`${key}-${label}`}><dt className="inline text-muted-foreground">{label} : </dt><dd className="inline whitespace-pre-wrap">{value}</dd></div>
              ))}
            </dl>
          </div>
        ) : null;
      })}
      {context.charter?.visual_direction && typeof context.charter.visual_direction === "object" && !Array.isArray(context.charter.visual_direction) && <div className="mt-3">
        <h3 className="font-medium">Direction photo transmise</h3>
        <dl className="mt-1 space-y-1">
          {([ ["composition", "Composition"], ["light", "Lumière"], ["framing", "Cadrage"], ["retouch", "Retouche"] ] as const).map(([field, label]) => {
            const value = readable((context.charter!.visual_direction as Record<string, unknown>)[field]);
            return value ? <div key={field}><dt className="inline text-muted-foreground">{label} : </dt><dd className="inline whitespace-pre-wrap">{value}</dd></div> : null;
          })}
        </dl>
      </div>}
      {!!context.memory?.length && (
        <div className="mt-3">
          <h3 className="font-medium">Mémoire disponible</h3>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            {context.memory.map((item) => <li key={item.id}>{item.name}{item.note ? ` · ${item.note}` : ""}</li>)}
          </ul>
        </div>
      )}
    </details>
  );
}
