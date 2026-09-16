import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId, useWorkspaceReady } from "@/hooks/use-workspace-query";
import CoachingShell from "@/components/coaching/CoachingShell";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { ArrowRight, RefreshCw, Bookmark, BookmarkCheck, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { nextMarronniers } from "@/lib/marronniers";
import { normalizeFormat } from "@/lib/format-normalizer";
import { ideaToEditorialBrief, parseDeepIdea, type DeepIdea, type IdeaSource } from "../../../supabase/functions/_shared/ideas/contract";

export interface CoachingSelection { subject: string; format: string; objective: string; canal?: string; carouselSubMode?: "text" | "photo" | "mix" | "pure_photo"; editorialAngle?: string }
interface Props { open: boolean; onOpenChange: (open: boolean) => void; onSelect?: (data: CoachingSelection) => void; onNewsjackingRedirect?: () => void; initialChannel?: string | null; initialFormat?: string | null }
interface Preferences { objectif: string; sujet: string; canal: string; format: string; activity: string; carouselSubMode: "text" | "photo" | "mix" | "pure_photo" }
interface Card { id: string; idea: DeepIdea; saved?: boolean }
interface Selection { cards: Card[]; preferences: Preferences; history: Array<{ subject: string; insight: string; feedback?: string }>; research_status?: string; needs_activity?: boolean }
const CHANNELS = [{ id: "instagram", label: "Instagram" }, { id: "linkedin", label: "LinkedIn" }, { id: "pinterest", label: "Pinterest" }, { id: "newsletter", label: "Newsletter" }];
const FORMATS: Record<string, Array<{ id: string; label: string }>> = {
  instagram: [{ id: "post", label: "Post" }, { id: "carousel", label: "Carrousel" }, { id: "reel", label: "Reel" }, { id: "story", label: "Story" }],
  linkedin: [{ id: "linkedin", label: "Post" }, { id: "carousel", label: "Carrousel" }],
  pinterest: [{ id: "pinterest", label: "Épingle texte" }, { id: "pinterest_visual", label: "Épingle visuelle" }],
  newsletter: [{ id: "newsletter", label: "Newsletter" }],
};
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const OBJECTIVES = [{ id: "auto", label: "Selon l'idée" }, { id: "inspirer", label: "Inspirer" }, { id: "eduquer", label: "Éduquer" }, { id: "vendre", label: "Vendre" }, { id: "creer_du_lien", label: "Créer du lien" }];

export default function ContentCoachingDialog(props: Props) {
  const { user } = useAuth();
  const workspace = useWorkspaceId();
  const ready = useWorkspaceReady();
  // Remount local fields on every account/workspace transition. Results
  // live in a scoped query cache; switching A → B → A never accepts B's callback.
  if (!user || !ready) return null;
  return <ScopedCoach key={`${user.id}:${workspace}`} {...props} userId={user.id} workspace={workspace} />;
}

function ScopedCoach({ open, onOpenChange, onSelect, initialChannel, initialFormat, userId, workspace }: Props & { userId: string; workspace: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const queryKey = ["direct-content-ideas-v2", userId, workspace];
  const storageKey = queryKey.join(":");
  const cached = queryClient.getQueryData<Selection>(queryKey) || (() => {
    try { const entry = JSON.parse(sessionStorage.getItem(storageKey) || "null"); return entry?.expires > Date.now() && Array.isArray(entry.data?.cards) ? entry.data as Selection : undefined; } catch { return undefined; }
  })();
  const [preferences, setPreferences] = useState<Preferences>(cached?.preferences || { objectif: "auto", sujet: "", canal: initialChannel || "auto", format: normalizeFormat(initialFormat) || "auto", activity: "", carouselSubMode: "text" });
  useEffect(() => {
    if (open && initialChannel) setPreferences(p => ({ ...p, canal: initialChannel, format: normalizeFormat(initialFormat) || (p.canal === initialChannel ? p.format : "auto") }));
  }, [open, initialChannel, initialFormat]);
  const [refining, setRefining] = useState<string | null>(null);
  const [precision, setPrecision] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [saving, setSaving] = useState<string | null>(null);
  const savingRef = useRef(new Set<string>());
  const [failure, setFailure] = useState<string | null>(null);
  const alive = useRef(true), visible = useRef(open);
  visible.current = open;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const request = async (prefs: Preferences, previous?: Selection, card?: Card): Promise<Selection> => {
    const history = previous?.history || [];
    const { data, error } = await invokeWithTimeout("content-coaching", { body: {
      answers: { ...prefs, ton_envie: "auto", content_type: "auto" },
      workspace_id: workspace !== userId ? workspace : undefined,
      upcoming_marronniers: nextMarronniers(new Date(), 3).map(o => ({ label: o.marronnier.label, date: o.date.toISOString().slice(0, 10) })),
      previous_ideas: history.slice(-24), deepen_idea: card?.idea, refinement: card ? precision : undefined,
    } }, 220000); // preparation60 + research25 + selection120, with transport margin
    if (error) throw new Error(error.message);
    if (data?.needs_activity) return { cards: [], preferences: prefs, history, needs_activity: true };
    if (data?.version !== 2 || !Array.isArray(data.ideas)) throw new Error("La nouvelle sélection n'est pas disponible. Réessaie dans un instant.");
    const cards: Card[] = data.ideas.map((raw: DeepIdea) => {
      const idea = parseDeepIdea(raw, raw.sources as IdeaSource[]);
      if (!idea) throw new Error("Une idée reçue est incomplète. Réessaie.");
      return { id: crypto.randomUUID(), idea };
    });
    if (cards.length !== (card ? 1 : 4)) throw new Error("La sélection reçue est incomplète. Tes idées précédentes sont conservées.");
    return { cards: card ? previous!.cards.map(c => c.id === card.id ? cards[0] : c) : cards, preferences: prefs,
      history: [...history, ...cards.map(c => ({ subject: c.idea.subject, insight: c.idea.insight }))].slice(-24), research_status: data.research_status };
  };
  const query = useQuery({ queryKey, queryFn: () => request(preferences), initialData: cached, enabled: open, staleTime: Infinity, gcTime: 60 * 60 * 1000,
    retry: false, retryOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false });
  const selection = query.data;
  useEffect(() => {
    if (!selection) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ expires: Date.now() + 24 * 60 * 60 * 1000, data: selection })); } catch { /* Session cache is optional; query data remains available. */ }
  }, [selection, storageKey]);
  const loading = query.isFetching || !!busy;
  const generate = async (card?: Card) => {
    if (busyRef.current || query.isFetching) return;
    busyRef.current = true; setBusy(card?.id || "all"); setFailure(null);
    try {
      const next = await request(preferences, selection, card);
      queryClient.setQueryData(queryKey, next);
      if (alive.current) { setRefining(null); setPrecision(""); }
    } catch (e) { if (alive.current) setFailure(e instanceof Error ? e.message : "Impossible de préparer les idées. Réessaie."); }
    finally { busyRef.current = false; if (alive.current) setBusy(null); }
  };
  const save = async (card: Card) => {
    if (card.saved || savingRef.current.has(card.id)) return;
    savingRef.current.add(card.id); setSaving(card.id);
    const payload = { id: card.id, user_id: userId, workspace_id: workspace !== userId ? workspace : null, titre: card.idea.subject,
      angle: ideaToEditorialBrief(card.idea), format: normalizeFormat(preferences.format), canal: preferences.canal === "auto" ? null : preferences.canal,
      objectif: card.idea.objective_tag, type: "idea", status: "to_explore", notes: card.idea.mechanism,
      personal_elements: JSON.parse(JSON.stringify({ editorial_brief: card.idea, carousel_sub_mode: preferences.carouselSubMode })), source_module: "content_coaching" };
    try {
      const { data, error } = await supabase.from("saved_ideas").insert(payload).select("id").single();
      if (error) {
        // Lost acknowledgement: reconcile the same UUID before any retry. Never
        // replace an existing row or create a new UUID for the same saved card.
        const receipt = await supabase.from("saved_ideas").select("id,user_id,workspace_id,titre,angle,format,canal,objectif,notes,personal_elements").eq("id", card.id).maybeSingle();
        if (receipt.error || !receipt.data || receipt.data.user_id !== userId || receipt.data.workspace_id !== payload.workspace_id || receipt.data.titre !== payload.titre || receipt.data.angle !== payload.angle || receipt.data.format !== payload.format || receipt.data.canal !== payload.canal || receipt.data.objectif !== payload.objectif || receipt.data.notes !== payload.notes || stableJson(receipt.data.personal_elements) !== stableJson(payload.personal_elements)) throw error;
      } else if (data?.id !== card.id) throw new Error("Sauvegarde non confirmée");
      queryClient.setQueryData<Selection>(queryKey, prev => prev ? { ...prev, cards: prev.cards.map(c => c.id === card.id ? { ...c, saved: true } : c) } : prev);
      queryClient.invalidateQueries({ queryKey: ["saved-ideas"] });
      if (alive.current && visible.current) toast.success("Idée et analyse gardées dans Mes idées.");
    } catch { if (alive.current && visible.current) toast.error("La sauvegarde n'a pas été confirmée. Tu peux réessayer sans créer de doublon."); }
    finally { savingRef.current.delete(card.id); if (alive.current) setSaving(null); }
  };
  const create = (card: Card) => {
    const format = normalizeFormat(preferences.format) || "";
    const data: CoachingSelection = { subject: card.idea.subject, format, objective: card.idea.objective_tag,
      canal: preferences.canal === "auto" ? undefined : preferences.canal,
      carouselSubMode: format === "carousel" ? preferences.carouselSubMode : undefined, editorialAngle: ideaToEditorialBrief(card.idea) };
    if (onSelect) onSelect(data);
    else { const params = new URLSearchParams({ sujet: data.subject, format, objectif: data.objective, angle: data.editorialAngle!, ...(data.canal ? { canal: data.canal } : {}) }); navigate(`/creer?${params}`); }
    onOpenChange(false);
  };
  const error = failure || (query.error instanceof Error ? query.error.message : null);
  const controlClass = "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm";
  return <CoachingShell open={open} onOpenChange={onOpenChange} title="Trouver une idée" description="Des pistes pensées pour ton activité, avec de quoi les développer." emoji="💡">
    <div className="space-y-5">
      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Une envie précise ? <span className="text-muted-foreground font-normal">Facultatif</span></summary>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">Un sujet, une offre ou une contrainte
            <Textarea value={preferences.sujet} onChange={e => setPreferences(p => ({ ...p, sujet: e.target.value }))} maxLength={1500} rows={2} placeholder="Tu peux laisser ce champ vide." />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">Objectif<select className={controlClass} value={preferences.objectif} onChange={e => setPreferences(p => ({ ...p, objectif: e.target.value }))}>{OBJECTIVES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            <label className="text-sm">Canal<select className={controlClass} value={preferences.canal} onChange={e => setPreferences(p => ({ ...p, canal: e.target.value, format: "auto" }))}><option value="auto">À choisir ensuite</option>{CHANNELS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            {preferences.canal !== "auto" && <label className="text-sm">Format<select className={controlClass} value={preferences.format} onChange={e => setPreferences(p => ({ ...p, format: e.target.value }))}><option value="auto">À choisir ensuite</option>{FORMATS[preferences.canal]?.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>}
            {preferences.format === "carousel" && <label className="text-sm">Type de carrousel<select className={controlClass} value={preferences.carouselSubMode} onChange={e => setPreferences(p => ({ ...p, carouselSubMode: e.target.value as Preferences["carouselSubMode"] }))}><option value="text">Texte</option><option value="photo">Photos avec texte</option><option value="mix">Texte et photos</option><option value="pure_photo">Photos seules</option></select></label>}
          </div>
          <Button variant="outline" disabled={loading} onClick={() => generate()}>Proposer avec ces préférences</Button>
        </div>
      </details>
      {selection?.needs_activity && <div className="space-y-3"><p className="text-sm">Pour te proposer des idées adaptées, décris simplement ton activité et à qui tu t'adresses.</p><label className="block text-sm">Ton activité<Textarea value={preferences.activity} onChange={e => setPreferences(p => ({ ...p, activity: e.target.value }))} maxLength={500} rows={3} /></label><Button disabled={loading || !preferences.activity.trim()} onClick={() => generate()}>Trouver mes idées</Button></div>}
      {loading && <div role="status" className="rounded-xl bg-muted/40 p-4 flex gap-3 items-start"><Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" /><div><p className="text-sm font-medium">{busy && busy !== "all" ? "L'analyse de cette idée est en cours…" : "La sélection de tes idées est en cours…"}</p><p className="text-xs text-muted-foreground mt-1">L'explication, les exemples et les nuances prennent un peu de temps. Tu peux refermer cette fenêtre et revenir.</p></div></div>}
      {error && <div role="alert" className="rounded-xl border border-destructive/30 p-4 space-y-2"><p className="text-sm">{error}</p><Button variant="outline" disabled={loading} onClick={() => generate()}>Réessayer</Button></div>}
      {!!selection?.cards.length && <>
        <p className="text-sm text-muted-foreground">{selection.cards.length} idées pour commencer. Le format se choisit ensuite.</p>
        {selection.research_status === "unavailable" && <p className="text-xs text-muted-foreground">La recherche externe n'a pas abouti. Les propositions s'appuient sur ton activité ; les points à vérifier sont indiqués.</p>}
        <div className="space-y-4">{selection.cards.map(card => <article key={card.id} className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-lg leading-snug text-foreground break-words">{card.idea.subject}</h3>
          <p className="text-sm leading-relaxed">{card.idea.insight}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{card.idea.reader_benefit}</p>
          <details className="text-sm"><summary className="cursor-pointer font-medium text-primary">Voir l'analyse et le développement</summary><div className="mt-3 space-y-3 leading-relaxed">
            <p>{card.idea.mechanism}</p><ol className="list-decimal pl-5 space-y-1">{card.idea.outline.map((line, i) => <li key={i}>{line}</li>)}</ol>
            <p><strong>Pour l'illustrer : </strong>{card.idea.example}</p><p><strong>La nuance : </strong>{card.idea.nuance}</p>
            {card.idea.analogy && <p><strong>Le rapprochement : </strong>{card.idea.analogy.mapping}<br /><strong>Sa limite : </strong>{card.idea.analogy.limit}</p>}
            <p className="text-muted-foreground">{card.idea.grounding}</p>
            {card.idea.sources.map(s => <p key={s.id} className="text-xs break-words"><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.title}</a> — {s.claim}<br />Consultée le {s.accessed_at}</p>)}
            {!!card.idea.to_verify.length && <div><strong>À confirmer avant publication</strong><ul className="list-disc pl-5">{card.idea.to_verify.map((v, i) => <li key={i}>{v}</li>)}</ul></div>}
          </div></details>
          <div className="flex flex-wrap gap-2 pt-1"><Button disabled={loading} onClick={() => create(card)} className="gap-2">Créer <ArrowRight className="h-4 w-4" /></Button>
            <Button variant="outline" disabled={card.saved || saving === card.id} onClick={() => save(card)} className="gap-1.5">{saving === card.id ? <Loader2 className="h-4 w-4 animate-spin" /> : card.saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}{card.saved ? "Gardée" : "Garder"}</Button>
            <Button variant="ghost" disabled={loading} onClick={() => { setRefining(refining === card.id ? null : card.id); setPrecision(""); }}>Creuser</Button></div>
          {refining === card.id && <div className="space-y-2 border-t pt-3"><label className="block text-sm">Une précision à ajouter ? (facultatif)<Textarea value={precision} onChange={e => setPrecision(e.target.value)} maxLength={1000} rows={2} placeholder="Par exemple : montrer ce que cela change dans la pratique." /></label><Button variant="outline" disabled={loading} onClick={() => generate(card)}>Approfondir cette idée</Button></div>}
        </article>)}</div>
        <Button variant="outline" disabled={loading} onClick={() => generate()} className="w-full gap-2"><RefreshCw className="h-4 w-4" /> D'autres idées</Button>
        <p className="text-xs text-muted-foreground">Une nouvelle sélection ou un approfondissement utilise 1 crédit. Rouvrir ces idées et les garder ne consomme pas de crédit.</p>
      </>}
    </div>
  </CoachingShell>;
}
