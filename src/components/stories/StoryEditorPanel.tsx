// Stories comme le carrousel (12/11/2026) : panneau de réglages à droite de
// la story, rangé comme celui du carrousel (« Touche un texte… », puis Mise en
// page, Texte, Photo). Les cases et les boutons sont ceux d'avant, déplacés
// ici depuis StoryResult : mêmes noms, mêmes effets.
// Panneau à onglets (26/11/2026, maquette du même jour), comme celui du carrousel : une
// colonne d'icônes (Texte, Photo), un sujet affiché à la fois, et sur ordinateur « Demander
// un changement à l'IA » collé en bas. Les deux onglets restent montés : le choix des photos
// (StoryPhotoSuggestions) pose la photo d'office même quand on regarde « Texte ».
// Téléphone (27/11/2026) : ouvrir un onglet ou toucher une case ouvre le même « volet » que le
// carrousel (use-phone-sheet.ts) : la story passe en petit en haut, « Terminé » lui rend sa taille.
import { useState, type ReactNode } from "react";
import { ImageIcon, RotateCcw, Sparkles, Type } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import StoryTextSizeControl from "@/components/stories/StoryTextSizeControl";
import { resolveStoryViewport, type StoryTextSize } from "@/lib/story-visual";
import type { PhoneSheet } from "@/hooks/use-phone-sheet";
import { PANEL_TABLIST, panelBody, panelBodyFocus, panelFrame, PanelSheetHeader, PanelTabButton } from "@/components/creer/EditorPanelShell";

type Pill = "title_pill" | "body_pill" | "quote";
type Tab = "texte" | "photo" | "ia";

export interface StoryEditorPanelProps {
  story: any;
  index: number;
  narration: string;
  displayedBody: string;
  /** Une photo est réellement derrière la story (recadrage et zoom possibles). */
  photoEnabled: boolean;
  setNarration: (value: string) => void;
  setPill: (field: Pill, value: string) => void;
  setListItem: (itemIndex: number, value: string) => void;
  setSticker: (optionIndex: number | null, value: string) => void;
  setTextPosition: (position: "top" | "middle" | "bottom") => void;
  setTextSize: (size: StoryTextSize) => void;
  setBackground: (background: "photo" | "fond_couleur") => void;
  setPhotoZoom: (zoom: number) => void;
  resetViewport: (mode: "text" | "photo") => void;
  /** Crédit de la photo et choix des photos (StoryPhotoSuggestions). */
  photoTools: ReactNode;
  /** « Refaire cette story » : collé en bas du panneau sur ordinateur ; sur téléphone, c'est l'onglet « Demander à l'IA » (comme le carrousel). */
  ask?: ReactNode;
  /** Volet de réglages du téléphone (use-phone-sheet.ts). Absent : le panneau reste sous la story. */
  sheet?: PhoneSheet;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

const small = "h-7 px-2.5 text-xs";

export default function StoryEditorPanel(p: StoryEditorPanelProps) {
  const { story, index: i } = p;
  const visual = story.visual;
  const position = !Number.isFinite(visual?.text_position_y) ? (visual?.text_position || "middle") : null;
  const zoom = resolveStoryViewport(visual).photoZoom;
  const [tab, setTab] = useState<Tab>("texte");
  const askTab = !!p.sheet?.phone && !!p.ask;
  const shown: Tab = tab === "ia" ? (askTab ? "ia" : "texte") : visual ? tab : "texte";
  const open = !!p.sheet?.open;
  // Le cadre (onglet, ligne « Terminé », zone qui défile) est commun avec le carrousel : EditorPanelShell.tsx.
  const tabButton = (id: Tab, label: string, Icon: typeof Type, tone = "", short = "") => (
    <PanelTabButton key={id} id={`story-${i}-tab-${id}`} controls={`story-${i}-pane-${id}`} selected={shown === id} label={label} short={short} icon={Icon} extra={tone}
      onClick={() => { setTab(id); if (p.sheet?.phone) p.sheet.set(true); }} />
  );
  return (
    <div className={`min-w-0 ${panelFrame(open)}`} data-story-panel={i + 1}>
      {open && <PanelSheetHeader onDone={() => p.sheet?.set(false)}>Story {i + 1} : tes réglages s’appliquent en direct.</PanelSheetHeader>}
      <div role="tablist" aria-label={`Réglages de la story ${i + 1}`} className={PANEL_TABLIST}>
        {tabButton("texte", "Texte", Type)}
        {visual && tabButton("photo", "Photo", ImageIcon)}
        {askTab && tabButton("ia", "Demander à l’IA", Sparkles, "text-primary")}
      </div>
      <div className={panelBody(open)} onFocusCapture={panelBodyFocus(p.sheet)}>
      <div id={`story-${i}-pane-texte`} role="tabpanel" aria-labelledby={`story-${i}-tab-texte`} hidden={shown !== "texte"} className={shown === "texte" ? "min-w-0 space-y-4 pt-3 md:p-3" : "hidden"}>
      <p className="text-xs text-muted-foreground">Touche un texte sur la story pour l'écrire directement dessus.</p>
      {visual && (
        <Section title="Mise en page">
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Emplacement du texte">
            <span className="text-xs text-muted-foreground">Texte :</span>
            {([["top", "Haut"], ["middle", "Milieu"], ["bottom", "Bas"]] as const).map(([value, label]) => (
              <Button key={value} type="button" size="sm" variant={position === value ? "secondary" : "ghost"}
                className={small} aria-pressed={position === value} onClick={() => p.setTextPosition(value)}>{label}</Button>
            ))}
          </div>
          <StoryTextSizeControl value={visual.text_size} onChange={p.setTextSize} />
          {visual.face_avoidance_applied && (
            <p className="text-2xs text-muted-foreground">
              Le fond semble montrer une personne : le texte a été placé en bas pour dégager le visage. Tu peux le déplacer sur la story.
            </p>
          )}
        </Section>
      )}

      <Section title="Texte">
        <div className="space-y-1">
          <label htmlFor={`story-${i}-full-text`} className="text-xs font-medium text-muted-foreground">Texte de la story</label>
          <Textarea id={`story-${i}-full-text`} aria-label={`Texte complet de la story ${i + 1}`} value={p.narration}
            onChange={(e) => p.setNarration(e.target.value)} className="min-h-[96px] resize-y text-sm leading-relaxed"
            placeholder="Écris ici tout ce que tu veux dire dans cette story" />
        </div>
        {visual?.gabarit === "citation" ? (
          <>
            <Field id={`story-${i}-quote`} label="Citation mise en avant" value={visual.quote ?? ""} placeholder="La citation exacte"
              onChange={(v) => p.setPill("quote", v)} />
            <Field id={`story-${i}-citation-footer`} label="Petit texte sous la citation (optionnel)" aria="Petit texte sous la citation"
              value={visual.body_pill ?? ""} placeholder="Ex. Avis laissé par Camille" onChange={(v) => p.setPill("body_pill", v)} />
          </>
        ) : visual?.gabarit === "liste" ? (
          <>
            {typeof visual.title_pill === "string" && (
              <Field id={`story-${i}-list-title`} label="Titre" aria="Titre de la liste" value={visual.title_pill} onChange={(v) => p.setPill("title_pill", v)} />
            )}
            {Array.isArray(visual.list_pills) && visual.list_pills.map((item: string, itemIndex: number) => (
              <Field key={itemIndex} id={`story-${i}-list-item-${itemIndex}`} label={`Élément ${itemIndex + 1}`}
                aria={`Élément ${itemIndex + 1} de la liste`} value={item} onChange={(v) => p.setListItem(itemIndex, v)} />
            ))}
          </>
        ) : visual ? (
          <>
            {typeof visual.title_pill === "string" && (
              <Field id={`story-${i}-title-pill`} label="Titre" aria="Titre affiché" value={visual.title_pill} placeholder="Titre"
                onChange={(v) => p.setPill("title_pill", v)} />
            )}
            {typeof visual.body_pill === "string" && visual.body_pill_edited && p.displayedBody !== p.narration && (
              <div className="space-y-1">
                <label htmlFor={`story-${i}-body-pill`} className="text-xs text-muted-foreground">Texte affiché</label>
                <Textarea id={`story-${i}-body-pill`} value={p.displayedBody} onChange={(e) => p.setPill("body_pill", e.target.value)}
                  className="min-h-[64px] resize-y text-xs" aria-label="Texte affiché" placeholder="Texte affiché sur la story" />
              </div>
            )}
          </>
        ) : null}
        {story.sticker && (
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2">
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-2xs">{story.sticker.type || "Sticker"}</Badge>
              <span className="text-2xs text-muted-foreground">à poser dans Instagram</span>
            </div>
            {Array.isArray(story.sticker.options) && story.sticker.options.length > 0 ? (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {story.sticker.options.map((option: string, optionIndex: number) => (
                  <Field key={optionIndex} id={`story-${i}-sticker-option-${optionIndex}`} label={`Option ${optionIndex + 1}`}
                    aria={`Option ${optionIndex + 1} du sticker de la story ${i + 1}`} value={option} onChange={(v) => p.setSticker(optionIndex, v)} />
                ))}
              </div>
            ) : (
              <Field id={`story-${i}-sticker-label`} label="Texte du sticker" aria={`Texte du sticker de la story ${i + 1}`}
                value={story.sticker.label || ""} placeholder="Texte du sticker" onChange={(v) => p.setSticker(null, v)} />
            )}
          </div>
        )}
      </Section>
      </div>

      {visual && (
        <div id={`story-${i}-pane-photo`} role="tabpanel" aria-labelledby={`story-${i}-tab-photo`} hidden={shown !== "photo"} className={shown === "photo" ? "min-w-0 space-y-4 pt-3 md:p-3" : "hidden"}>
        <Section title="Photo">
          <div className="flex items-center gap-1.5" role="group" aria-label="Fond de la story">
            <span className="text-xs text-muted-foreground">Fond :</span>
            {([["photo", "📷 Photo"], ["fond_couleur", "Couleur"]] as const).map(([value, label]) => {
              const active = (visual.background || "fond_couleur") === value;
              return (
                <Button key={value} type="button" variant={active ? "secondary" : "ghost"} size="sm" className={small}
                  aria-pressed={active} data-story-background={value} onClick={() => p.setBackground(value)}>{label}</Button>
              );
            })}
          </div>
          {p.photoEnabled && (
            <div className="space-y-1">
              <label htmlFor={`story-${i}-photo-zoom`} className="flex justify-between text-xs text-muted-foreground">
                <span>Zoom de la photo</span><span>{Math.round(zoom * 100)} %</span>
              </label>
              <input id={`story-${i}-photo-zoom`} aria-label={`Zoom de la photo de la story ${i + 1}`} type="range" min="100" max="200" step="5"
                value={Math.round(zoom * 100)} onChange={(e) => p.setPhotoZoom(Number(e.target.value) / 100)} className="w-full accent-primary" />
              <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1 text-2xs text-muted-foreground" onClick={() => p.resetViewport("photo")}>
                <RotateCcw className="h-3 w-3" /> Recentrer la photo
              </Button>
            </div>
          )}
          {p.photoTools}
        </Section>
        </div>
      )}
      {askTab && (
        <div id={`story-${i}-pane-ia`} role="tabpanel" aria-labelledby={`story-${i}-tab-ia`} hidden={shown !== "ia"} className={shown === "ia" ? "min-w-0 space-y-1.5 pt-3" : "hidden"}>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles size={14} aria-hidden="true" /> Demander un changement à l'IA</p>
          {p.ask}
        </div>
      )}
      {p.ask && !askTab && (
        <div className="mt-auto space-y-1.5 border-t border-primary/25 bg-primary/[0.03] p-2.5 max-md:hidden">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles size={14} aria-hidden="true" /> Demander un changement à l'IA</p>
          {p.ask}
        </div>
      )}
      </div>
    </div>
  );
}

function Field({ id, label, aria, value, placeholder, onChange }: {
  id: string; label: string; aria?: string; value: string; placeholder?: string; onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" aria-label={aria ?? label} placeholder={placeholder} />
    </div>
  );
}
