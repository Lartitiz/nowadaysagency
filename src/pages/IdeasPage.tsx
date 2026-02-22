import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Lightbulb, PenLine, CalendarDays, Trash2, Copy, ChevronDown, X, ExternalLink } from "lucide-react";
import { ContentPreview, RevertToOriginalButton } from "@/components/ContentPreview";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format as fnsFormat } from "date-fns";
import { fr } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

/* ─── Types ─── */
interface SavedIdea {
  id: string;
  titre: string;
  angle: string;
  format: string;
  canal: string;
  objectif: string | null;
  type: string | null;
  status: string | null;
  content_draft: string | null;
  content_data: any | null;
  source_module: string | null;
  personal_elements: any | null;
  accroche_short: string | null;
  accroche_long: string | null;
  format_technique: string | null;
  notes: string | null;
  planned_date: string | null;
  calendar_post_id: string | null;
  created_at: string;
  updated_at: string | null;
}

/* ─── Constants ─── */
const STATUS_OPTIONS = [
  { id: "to_explore", label: "💭 À creuser", bg: "bg-[#F0E4EC]", text: "text-[#6B5E7B]" },
  { id: "drafting", label: "✏️ En rédaction", bg: "bg-accent", text: "text-accent-foreground" },
  { id: "ready", label: "✅ Prête", bg: "bg-primary", text: "text-primary-foreground" },
  { id: "planned", label: "📅 Planifiée", bg: "bg-cal-published", text: "text-[#2E7D32]" },
  { id: "published", label: "✔️ Publiée", bg: "bg-foreground", text: "text-background" },
];

const OBJECTIF_OPTIONS = [
  { id: "visibilite", label: "🔍 Visibilité", bg: "bg-[#EDE9FE]", text: "text-[#7C3AED]" },
  { id: "confiance", label: "💛 Confiance", bg: "bg-[#FFF9DB]", text: "text-[#92400E]" },
  { id: "vente", label: "🛒 Vente", bg: "bg-rose-pale", text: "text-primary" },
  { id: "credibilite", label: "🎓 Crédibilité", bg: "bg-[#F0E4EC]", text: "text-[#6B5E7B]" },
];

const CANAL_OPTIONS = [
  { id: "instagram", label: "📱 Instagram", enabled: true },
  { id: "linkedin", label: "LinkedIn", enabled: false },
  { id: "newsletter", label: "Newsletter", enabled: false },
];

const TYPE_OPTIONS = [
  { id: "idea", label: "💡 Idée" },
  { id: "draft", label: "✏️ Brouillon" },
  { id: "hook", label: "🎣 Accroche" },
];

const SORT_OPTIONS = [
  { id: "newest", label: "Plus récentes" },
  { id: "oldest", label: "Plus anciennes" },
  { id: "by_objectif", label: "Par objectif" },
  { id: "by_status", label: "Par statut" },
];

export default function IdeasPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [objectifFilter, setObjectifFilter] = useState("all");
  const [canalFilter, setCanalFilter] = useState(searchParams.get("canal") || "all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("newest");

  // Detail panel
  const [selectedIdea, setSelectedIdea] = useState<SavedIdea | null>(null);
  const [detailNotes, setDetailNotes] = useState("");

  useEffect(() => {
    if (!user) return;
    fetchIdeas();
  }, [user]);

  const fetchIdeas = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("saved_ideas")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (!error && data) setIdeas(data as unknown as SavedIdea[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = [...ideas];
    if (statusFilter !== "all") result = result.filter((i) => (i.status || "to_explore") === statusFilter);
    if (objectifFilter !== "all") result = result.filter((i) => i.objectif === objectifFilter);
    if (canalFilter !== "all") result = result.filter((i) => i.canal === canalFilter);
    if (typeFilter !== "all") result = result.filter((i) => (i.type || "idea") === typeFilter);

    switch (sort) {
      case "oldest": result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
      case "by_objectif": result.sort((a, b) => (a.objectif || "").localeCompare(b.objectif || "")); break;
      case "by_status": result.sort((a, b) => (a.status || "").localeCompare(b.status || "")); break;
      default: result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return result;
  }, [ideas, statusFilter, objectifFilter, canalFilter, typeFilter, sort]);

  const handleDelete = async (id: string) => {
    await supabase.from("saved_ideas").delete().eq("id", id);
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    if (selectedIdea?.id === id) setSelectedIdea(null);
    toast({ title: "Idée supprimée" });
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from("saved_ideas").update({ status: newStatus } as any).eq("id", id);
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)));
    if (selectedIdea?.id === id) setSelectedIdea((prev) => prev ? { ...prev, status: newStatus } : null);
  };

  const handlePlan = async (idea: SavedIdea, date: Date) => {
    if (!user) return;
    const dateStr = fnsFormat(date, "yyyy-MM-dd");
    const { data: calPost, error } = await supabase
      .from("calendar_posts")
      .insert({
        user_id: user.id,
        theme: idea.titre,
        angle: idea.angle,
        canal: idea.canal || "instagram",
        objectif: idea.objectif,
        date: dateStr,
        status: "idea",
      })
      .select("id")
      .single();
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    await supabase.from("saved_ideas").update({ status: "planned", planned_date: dateStr, calendar_post_id: calPost.id } as any).eq("id", idea.id);
    setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, status: "planned", planned_date: dateStr, calendar_post_id: calPost.id } : i)));
    toast({ title: `Planifiée le ${fnsFormat(date, "d MMM yyyy", { locale: fr })}` });
  };

  const handleRediger = (idea: SavedIdea) => {
    // Navigate to atelier/rediger — the RedactionPage will pick up via query params
    const params = new URLSearchParams({ titre: idea.titre, angle: idea.angle, format: idea.format, canal: idea.canal, objectif: idea.objectif || "", idea_id: idea.id });
    navigate(`/atelier/rediger?${params.toString()}`);
  };

  const handleSaveNotes = async (id: string, notes: string) => {
    await supabase.from("saved_ideas").update({ notes } as any).eq("id", id);
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, notes } : i)));
    toast({ title: "Notes sauvegardées" });
  };

  const getStatusBadge = (status: string | null) => {
    const s = STATUS_OPTIONS.find((o) => o.id === (status || "to_explore"));
    if (!s) return null;
    return s;
  };

  const getObjectifBadge = (objectif: string | null) => {
    if (!objectif) return null;
    return OBJECTIF_OPTIONS.find((o) => o.id === objectif);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[900px] px-6 py-8 max-md:px-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="font-display text-[26px] font-bold text-foreground">Ma boîte à idées</h1>
            <p className="text-[15px] text-muted-foreground mt-1">Tout ce que tu as généré, sauvegardé, commencé. Rien ne se perd.</p>
          </div>
          <Link to="/atelier">
            <Button className="rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux shrink-0">
              💡 Nouvelle idée
            </Button>
          </Link>
        </div>
        <p className="font-mono-ui text-[12px] text-muted-foreground mb-4">{filtered.length} idée{filtered.length !== 1 ? "s" : ""}{statusFilter !== "all" || objectifFilter !== "all" || canalFilter !== "all" || typeFilter !== "all" ? " filtrées" : " au total"}</p>

        {/* Filters */}
        <div className="sticky top-14 z-30 bg-background py-3 -mx-6 px-6 max-md:-mx-4 max-md:px-4 border-b border-border mb-4 space-y-2">
          {/* Status */}
          <div className="flex gap-1.5 flex-wrap">
            <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>Tout</FilterChip>
            {STATUS_OPTIONS.map((s) => (
              <FilterChip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>{s.label}</FilterChip>
            ))}
          </div>
          {/* Objectif + Canal + Type + Sort */}
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[11px] text-muted-foreground font-mono-ui mr-1">Objectif:</span>
            <FilterChip active={objectifFilter === "all"} onClick={() => setObjectifFilter("all")}>Tout</FilterChip>
            {OBJECTIF_OPTIONS.map((o) => (
              <FilterChip key={o.id} active={objectifFilter === o.id} onClick={() => setObjectifFilter(o.id)}>{o.label}</FilterChip>
            ))}
            <span className="w-px h-4 bg-border mx-1" />
            <span className="text-[11px] text-muted-foreground font-mono-ui mr-1">Canal:</span>
            <FilterChip active={canalFilter === "all"} onClick={() => setCanalFilter("all")}>Tout</FilterChip>
            {CANAL_OPTIONS.map((c) => (
              <FilterChip key={c.id} active={canalFilter === c.id} onClick={() => c.enabled && setCanalFilter(c.id)} disabled={!c.enabled}>
                {c.label}{!c.enabled && " (V2)"}
              </FilterChip>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[11px] text-muted-foreground font-mono-ui mr-1">Type:</span>
            <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>Tout</FilterChip>
            {TYPE_OPTIONS.map((t) => (
              <FilterChip key={t.id} active={typeFilter === t.id} onClick={() => setTypeFilter(t.id)}>{t.label}</FilterChip>
            ))}
            <span className="w-px h-4 bg-border mx-1" />
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="text-[11px] font-mono-ui bg-card border border-border rounded-lg px-2 py-1 text-muted-foreground">
              {SORT_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Ideas list */}
        {loading ? (
          <div className="flex justify-center py-16"><p className="text-muted-foreground">Chargement...</p></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <Lightbulb className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h2 className="font-display text-lg font-bold text-foreground mb-1">
              {ideas.length === 0 ? "Ta boîte à idées est vide" : "Aucune idée ne correspond"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {ideas.length === 0 ? "Commence par générer des idées dans l'atelier. Elles atterriront ici automatiquement." : "Essaie de modifier tes filtres."}
            </p>
            {ideas.length === 0 && (
              <Link to="/atelier">
                <Button className="rounded-pill">💡 Aller à l'atelier →</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((idea, idx) => {
              const statusBadge = getStatusBadge(idea.status);
              const objBadge = getObjectifBadge(idea.objectif);
              return (
                <div
                  key={idea.id}
                  className="rounded-xl border border-[#F0E4EC] bg-card p-4 hover:shadow-md hover:border-rose-medium transition-all cursor-pointer animate-fade-in"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                  onClick={() => { setSelectedIdea(idea); setDetailNotes(idea.notes || ""); }}
                >
                  {/* Badges */}
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {statusBadge && (
                      <StatusDropdown ideaId={idea.id} current={idea.status || "to_explore"} onSelect={handleStatusChange}>
                        <span className={`font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill cursor-pointer ${statusBadge.bg} ${statusBadge.text}`}>
                          {statusBadge.label}
                        </span>
                      </StatusDropdown>
                    )}
                    {objBadge && (
                      <span className={`font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill ${objBadge.bg} ${objBadge.text}`}>
                        {objBadge.label}
                      </span>
                    )}
                    <span className="font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-primary text-primary-foreground">
                      📱 {idea.canal || "Instagram"}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-display text-base font-bold text-foreground mb-1">{idea.titre}</h3>
                  <p className="text-[13px] text-muted-foreground">Angle : {idea.angle}</p>
                  <p className="text-[13px] text-muted-foreground">Format : {idea.format}</p>

                  {/* Preview */}
                  {idea.content_data ? (
                    <div className="mt-2">
                      <ContentPreview contentData={idea.content_data} contentType={idea.format === "reel" ? "reel" : idea.format === "story_serie" ? "stories" : undefined} compact />
                    </div>
                  ) : idea.content_draft ? (
                    <div className="mt-2">
                      <ContentPreview contentData={null} contentDraft={idea.content_draft} contentType={idea.format === "reel" ? "reel" : idea.format === "story_serie" ? "stories" : undefined} compact />
                    </div>
                  ) : idea.accroche_short ? (
                    <p className="text-[13px] text-foreground/70 mt-2 line-clamp-1 italic">🎣 {idea.accroche_short}</p>
                  ) : null}

                  {/* Date + planned */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="font-mono-ui text-[11px] text-muted-foreground">
                      Créée le {fnsFormat(new Date(idea.created_at), "d MMM yyyy", { locale: fr })}
                    </span>
                    {idea.planned_date && (
                      <span className="font-mono-ui text-[11px] text-[#2E7D32]">
                        📅 {fnsFormat(new Date(idea.planned_date), "d MMM yyyy", { locale: fr })}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" className="rounded-pill text-xs gap-1" onClick={() => handleRediger(idea)}>
                      <PenLine className="h-3 w-3" /> Rédiger
                    </Button>
                    <PlanifierPopover idea={idea} onPlan={handlePlan} />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="rounded-pill text-xs gap-1 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" /> Supprimer
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cette idée ?</AlertDialogTitle>
                          <AlertDialogDescription>Tu veux vraiment supprimer cette idée ? Cette action est irréversible.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(idea.id)}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detail Sheet */}
        <Sheet open={!!selectedIdea} onOpenChange={(open) => { if (!open) setSelectedIdea(null); }}>
          <SheetContent className="w-full sm:max-w-[420px] overflow-y-auto">
            {selectedIdea && (
              <div className="py-4">
                <SheetHeader>
                  <SheetTitle className="font-display text-xl text-left">{selectedIdea.titre}</SheetTitle>
                </SheetHeader>

                <div className="flex gap-1.5 flex-wrap mt-3 mb-4">
                  {getStatusBadge(selectedIdea.status) && (() => {
                    const sb = getStatusBadge(selectedIdea.status)!;
                    return (
                      <StatusDropdown ideaId={selectedIdea.id} current={selectedIdea.status || "to_explore"} onSelect={(id, s) => { handleStatusChange(id, s); setSelectedIdea((prev) => prev ? { ...prev, status: s } : null); }}>
                        <span className={`font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill cursor-pointer ${sb.bg} ${sb.text}`}>{sb.label}</span>
                      </StatusDropdown>
                    );
                  })()}
                  {getObjectifBadge(selectedIdea.objectif) && (() => {
                    const ob = getObjectifBadge(selectedIdea.objectif)!;
                    return <span className={`font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill ${ob.bg} ${ob.text}`}>{ob.label}</span>;
                  })()}
                  <span className="font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-primary text-primary-foreground">📱 {selectedIdea.canal}</span>
                  <span className="font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-rose-pale text-foreground">{(selectedIdea.type || "idea") === "idea" ? "💡 Idée" : (selectedIdea.type || "idea") === "draft" ? "✏️ Brouillon" : "🎣 Accroche"}</span>
                </div>

                <div className="space-y-3 text-sm">
                  <div><span className="font-medium text-foreground">Angle :</span> <span className="text-muted-foreground">{selectedIdea.angle}</span></div>
                  <div><span className="font-medium text-foreground">Format :</span> <span className="text-muted-foreground">{selectedIdea.format}</span></div>
                  {selectedIdea.format_technique && <div><span className="font-medium text-foreground">Format technique :</span> <span className="text-muted-foreground">{selectedIdea.format_technique}</span></div>}
                </div>

                {/* Accroche */}
                {(selectedIdea.accroche_short || selectedIdea.accroche_long) && (
                  <div className="mt-4">
                    <p className="text-xs font-mono-ui font-semibold text-muted-foreground mb-1">ACCROCHE</p>
                    {selectedIdea.accroche_short && <p className="text-sm text-foreground font-semibold mb-1">{selectedIdea.accroche_short}</p>}
                    {selectedIdea.accroche_long && <p className="text-sm text-foreground/80 italic">{selectedIdea.accroche_long}</p>}
                  </div>
                )}

                {/* Draft / Content */}
                {(selectedIdea.content_data || selectedIdea.content_draft) && (
                  <div className="mt-4">
                    <p className="text-xs font-mono-ui font-semibold text-muted-foreground mb-1">CONTENU</p>
                    <div className="rounded-xl bg-rose-pale p-3 max-h-[400px] overflow-y-auto">
                      <ContentPreview
                        contentData={selectedIdea.content_data}
                        contentDraft={selectedIdea.content_draft}
                        contentType={selectedIdea.format === "reel" ? "reel" : selectedIdea.format === "story_serie" ? "stories" : undefined}
                        editable
                        onContentChange={async (updatedData) => {
                          // Save to content_data or content_draft depending on type
                          const isJson = typeof updatedData === "object";
                          const updatePayload = isJson
                            ? { content_data: updatedData, updated_at: new Date().toISOString() }
                            : { content_draft: updatedData, updated_at: new Date().toISOString() };
                          await supabase.from("saved_ideas").update(updatePayload as any).eq("id", selectedIdea.id);
                          setIdeas((prev) => prev.map((i) => i.id === selectedIdea.id ? { ...i, ...(isJson ? { content_data: updatedData } : { content_draft: updatedData }) } : i));
                          setSelectedIdea((prev) => prev ? { ...prev, ...(isJson ? { content_data: updatedData } : { content_draft: updatedData }) } : null);
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Dates */}
                <div className="mt-4 text-xs text-muted-foreground space-y-1">
                  <p>Créée le {fnsFormat(new Date(selectedIdea.created_at), "d MMMM yyyy", { locale: fr })}</p>
                  {selectedIdea.updated_at && <p>Modifiée le {fnsFormat(new Date(selectedIdea.updated_at), "d MMMM yyyy", { locale: fr })}</p>}
                  {selectedIdea.planned_date && <p className="text-[#2E7D32]">📅 Planifiée le {fnsFormat(new Date(selectedIdea.planned_date), "d MMMM yyyy", { locale: fr })}</p>}
                </div>

                {/* Notes */}
                <div className="mt-4">
                  <p className="text-xs font-mono-ui font-semibold text-muted-foreground mb-1">MES NOTES</p>
                  <Textarea
                    value={detailNotes}
                    onChange={(e) => setDetailNotes(e.target.value)}
                    placeholder="Ajoute tes notes personnelles ici..."
                    className="rounded-xl text-sm min-h-[100px]"
                  />
                  <Button variant="outline" size="sm" className="rounded-pill text-xs mt-2"
                    onClick={() => handleSaveNotes(selectedIdea.id, detailNotes)}>
                    Sauvegarder les notes
                  </Button>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 mt-6">
                  <Button onClick={() => handleRediger(selectedIdea)} className="rounded-pill gap-2 w-full">
                    <PenLine className="h-4 w-4" /> Continuer la rédaction
                  </Button>
                  <PlanifierPopover idea={selectedIdea} onPlan={handlePlan} fullWidth />
                  {(selectedIdea.content_draft || selectedIdea.content_data) && !selectedIdea.content_data?.script && (
                    <Button variant="outline" className="rounded-pill gap-2 w-full" onClick={async () => {
                      const text = selectedIdea.content_draft && !selectedIdea.content_draft.startsWith("{")
                        ? selectedIdea.content_draft
                        : "Contenu copié depuis le composant de prévisualisation.";
                      await navigator.clipboard.writeText(text);
                      toast({ title: "Copié !" });
                    }}>
                      <Copy className="h-4 w-4" /> Copier le contenu
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="rounded-pill gap-2 w-full text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" /> Supprimer
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cette idée ?</AlertDialogTitle>
                        <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(selectedIdea.id)}>Supprimer</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </main>
    </div>
  );
}

/* ─── Filter Chip ─── */
function FilterChip({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-mono-ui text-[11px] font-semibold px-2.5 py-1 rounded-pill transition-all whitespace-nowrap ${
        active
          ? "bg-primary text-primary-foreground"
          : disabled
            ? "bg-muted text-muted-foreground/50 cursor-not-allowed"
            : "bg-card border border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Status Dropdown ─── */
function StatusDropdown({ ideaId, current, onSelect, children }: { ideaId: string; current: string; onSelect: (id: string, status: string) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span onClick={(e) => { e.stopPropagation(); }}>{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start" onClick={(e) => e.stopPropagation()}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => { onSelect(ideaId, s.id); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors ${current === s.id ? "font-semibold text-primary" : "text-foreground"}`}
          >
            {s.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ─── Planifier Popover ─── */
function PlanifierPopover({ idea, onPlan, fullWidth }: { idea: SavedIdea; onPlan: (idea: SavedIdea, date: Date) => void; fullWidth?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`rounded-pill text-xs gap-1 ${fullWidth ? "w-full" : ""}`} onClick={(e) => e.stopPropagation()}>
          <CalendarDays className="h-3 w-3" /> Planifier
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Calendar
          mode="single"
          onSelect={(date) => { if (date) { onPlan(idea, date); setOpen(false); } }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
