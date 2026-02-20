import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Sparkles } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  Rocket,
  Target,
  Megaphone,
  ShoppingBag,
  ListChecks,
} from "lucide-react";

const STEPS = [
  { label: "Offre", icon: Target, emoji: "🎯" },
  { label: "Teasing", icon: Megaphone, emoji: "📣" },
  { label: "Vente", icon: ShoppingBag, emoji: "💰" },
  { label: "Contenus", icon: ListChecks, emoji: "📝" },
  { label: "Récap", icon: Rocket, emoji: "🚀" },
];

const CONTENT_IDEAS = [
  "Post storytelling : mon parcours",
  "Carrousel : 5 raisons de…",
  "Reel : avant / après",
  "Story : FAQ / objections",
  "Post : témoignage client",
  "Live : présentation de l'offre",
  "Story : compte à rebours",
  "Reel : behind the scenes",
  "Post : bonus early bird",
  "Story : dernière chance",
];

interface LaunchIdea {
  content_type: string;
  hook: string;
  cta: string;
  format: string;
}

interface LaunchData {
  id?: string;
  name: string;
  promise: string;
  objections: string;
  free_resource: string;
  teasing_start: string | null;
  teasing_end: string | null;
  sale_start: string | null;
  sale_end: string | null;
  selected_contents: string[];
  status: string;
}

const EMPTY_LAUNCH: LaunchData = {
  name: "",
  promise: "",
  objections: "",
  free_resource: "",
  teasing_start: null,
  teasing_end: null,
  sale_start: null,
  sale_end: null,
  selected_contents: [],
  status: "draft",
};

function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (d: string | null) => void }) {
  const date = value ? new Date(value) : undefined;
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "d MMM yyyy", { locale: fr }) : "Choisir une date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : null)}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function InstagramLaunch() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [launch, setLaunch] = useState<LaunchData>({ ...EMPTY_LAUNCH });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [generatingIdeas, setGeneratingIdeas] = useState(false);
  const [launchIdeas, setLaunchIdeas] = useState<LaunchIdea[]>([]);
  const [copiedIdeaIdx, setCopiedIdeaIdx] = useState<number | null>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("launches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const r = data[0];
          setLaunch({
            id: r.id,
            name: r.name,
            promise: r.promise ?? "",
            objections: r.objections ?? "",
            free_resource: r.free_resource ?? "",
            teasing_start: r.teasing_start,
            teasing_end: r.teasing_end,
            sale_start: r.sale_start,
            sale_end: r.sale_end,
            selected_contents: r.selected_contents ?? [],
            status: r.status,
          });
        }
        setLoaded(true);
      });
  }, [user]);

  // Fetch profile for AI prompts
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).single().then(({ data }) => {
      if (data) setProfile(data);
    });
  }, [user]);

  const update = (field: keyof LaunchData, value: any) => setLaunch((prev) => ({ ...prev, [field]: value }));

  const toggleContent = (c: string) => {
    setLaunch((prev) => {
      const has = prev.selected_contents.includes(c);
      return { ...prev, selected_contents: has ? prev.selected_contents.filter((x) => x !== c) : [...prev.selected_contents, c] };
    });
  };

  const generateLaunchIdeas = async () => {
    if (!user || !profile || launch.selected_contents.length === 0) return;
    setGeneratingIdeas(true);
    setLaunchIdeas([]);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "launch-ideas",
          profile: {
            activite: profile.activite,
            cible: profile.cible,
            tons: profile.tons,
            launch_name: launch.name,
            launch_promise: launch.promise,
            launch_objections: launch.objections,
            launch_teasing_start: launch.teasing_start,
            launch_teasing_end: launch.teasing_end,
            launch_sale_start: launch.sale_start,
            launch_sale_end: launch.sale_end,
            launch_selected_contents: launch.selected_contents,
          },
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: LaunchIdea[];
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }
      setLaunchIdeas(parsed);
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la génération");
    } finally {
      setGeneratingIdeas(false);
    }
  };

  const copyIdea = async (idea: LaunchIdea, idx: number) => {
    await navigator.clipboard.writeText(`${idea.content_type}\nAccroche : ${idea.hook}\nCTA : ${idea.cta}\nFormat : ${idea.format}`);
    setCopiedIdeaIdx(idx);
    setTimeout(() => setCopiedIdeaIdx(null), 1500);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: launch.name,
        promise: launch.promise,
        objections: launch.objections,
        free_resource: launch.free_resource,
        teasing_start: launch.teasing_start,
        teasing_end: launch.teasing_end,
        sale_start: launch.sale_start,
        sale_end: launch.sale_end,
        selected_contents: launch.selected_contents,
        status: launch.status,
      };
      if (launch.id) {
        await supabase.from("launches").update(payload).eq("id", launch.id);
      } else {
        const { data } = await supabase.from("launches").insert(payload).select().single();
        if (data) setLaunch((prev) => ({ ...prev, id: data.id }));
      }
      toast.success("Lancement sauvegardé !");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <h1 className="font-display text-[26px] font-bold text-foreground">🚀 Préparer un lancement</h1>
        <p className="mt-1 text-sm text-muted-foreground">Un plan structuré, étape par étape, pour lancer ton offre sur Instagram.</p>

        {/* Stepper */}
        <div className="mt-6 flex items-center gap-1 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const active = i === step;
            const done = i < step;
            return (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                )}
              >
                {done ? <Check className="h-3 w-3" /> : <span>{s.emoji}</span>}
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Step content */}
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              {STEPS[step].emoji} Étape {step + 1} – {STEPS[step].label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === 0 && (
              <>
                <div>
                  <Label>Nom de l'offre / du lancement</Label>
                  <Input className="mt-1" placeholder="ex: Formation Instagram Boost" value={launch.name} onChange={(e) => update("name", e.target.value)} />
                </div>
                <div>
                  <Label>Promesse principale</Label>
                  <Textarea className="mt-1" placeholder="Quelle transformation promets-tu à tes clients ?" value={launch.promise} onChange={(e) => update("promise", e.target.value)} />
                </div>
                <div>
                  <Label>Objections anticipées</Label>
                  <Textarea className="mt-1" placeholder="Quelles raisons pourraient empêcher l'achat ? (prix, temps, confiance…)" value={launch.objections} onChange={(e) => update("objections", e.target.value)} />
                </div>
                <div>
                  <Label>Ressource gratuite / lead magnet</Label>
                  <Input className="mt-1" placeholder="ex: Checklist PDF, mini-formation gratuite…" value={launch.free_resource} onChange={(e) => update("free_resource", e.target.value)} />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <p className="text-sm text-muted-foreground">
                  La phase de teasing crée l'anticipation avant l'ouverture des ventes. Idéalement 5 à 10 jours avant.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DateField label="Début du teasing" value={launch.teasing_start} onChange={(d) => update("teasing_start", d)} />
                  <DateField label="Fin du teasing" value={launch.teasing_end} onChange={(d) => update("teasing_end", d)} />
                </div>
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
                    <p className="font-medium text-foreground">💡 Idées de teasing :</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Partager ton histoire / pourquoi tu as créé cette offre</li>
                      <li>Poser des questions à ta communauté sur leur problème</li>
                      <li>Montrer les coulisses de la création</li>
                      <li>Publier des témoignages de bêta-testeurs</li>
                    </ul>
                  </CardContent>
                </Card>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-sm text-muted-foreground">
                  La phase de vente dure généralement 5 à 7 jours. C'est le moment de convaincre et convertir.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DateField label="Ouverture des ventes" value={launch.sale_start} onChange={(d) => update("sale_start", d)} />
                  <DateField label="Fermeture des ventes" value={launch.sale_end} onChange={(d) => update("sale_end", d)} />
                </div>
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
                    <p className="font-medium text-foreground">💡 Stratégies de vente :</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Jour 1 : Annonce officielle + présentation de l'offre</li>
                      <li>Jour 2-3 : Répondre aux objections en story</li>
                      <li>Jour 4 : Témoignages + résultats concrets</li>
                      <li>Dernier jour : Urgence + bonus dernière chance</li>
                    </ul>
                  </CardContent>
                </Card>
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Sélectionne les contenus que tu prévois de publier pendant ton lancement.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {CONTENT_IDEAS.map((c) => {
                    const checked = launch.selected_contents.includes(c);
                    return (
                      <label key={c} className={cn("flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors", checked ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40")}>
                        <Checkbox checked={checked} onCheckedChange={() => toggleContent(c)} />
                        <span className="text-sm">{c}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {launch.selected_contents.length} contenu{launch.selected_contents.length > 1 ? "s" : ""} sélectionné{launch.selected_contents.length > 1 ? "s" : ""}
                </p>

                {/* AI Generate button */}
                {launch.selected_contents.length > 0 && (
                  <Button
                    onClick={generateLaunchIdeas}
                    disabled={generatingIdeas}
                    className="mt-4 rounded-full gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    {generatingIdeas ? "Génération en cours..." : "✨ Générer des idées pour ces contenus"}
                  </Button>
                )}

                {/* Loading */}
                {generatingIdeas && (
                  <div className="flex items-center gap-3 py-8 justify-center animate-fade-in">
                    <div className="flex gap-1">
                      <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" />
                      <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.16s" }} />
                      <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.32s" }} />
                    </div>
                    <span className="text-sm italic text-muted-foreground">L'IA prépare tes idées de lancement...</span>
                  </div>
                )}

                {/* Generated ideas */}
                {launchIdeas.length > 0 && !generatingIdeas && (
                  <div className="space-y-3 mt-4 animate-fade-in">
                    <p className="text-sm font-medium text-foreground">💡 Idées générées par l'IA :</p>
                    {launchIdeas.map((idea, i) => (
                      <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-sm text-foreground">{idea.content_type}</p>
                          <Badge variant="secondary" className="text-xs shrink-0">{idea.format}</Badge>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Accroche</p>
                          <p className="text-sm text-foreground">{idea.hook}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">CTA</p>
                          <p className="text-sm text-foreground italic">{idea.cta}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => copyIdea(idea, i)} className="rounded-full gap-1.5 mt-1">
                          <Copy className="h-3.5 w-3.5" />
                          {copiedIdeaIdx === i ? "Copié !" : "Copier"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {step === 4 && (
              <>
                <p className="text-sm text-muted-foreground mb-4">Récapitulatif de ton plan de lancement :</p>
                <div className="space-y-4">
                  <RecapRow label="Offre" value={launch.name} />
                  <RecapRow label="Promesse" value={launch.promise} />
                  <RecapRow label="Objections" value={launch.objections} />
                  <RecapRow label="Lead magnet" value={launch.free_resource} />
                  <RecapRow
                    label="Teasing"
                    value={launch.teasing_start && launch.teasing_end ? `${formatDate(launch.teasing_start)} → ${formatDate(launch.teasing_end)}` : ""}
                  />
                  <RecapRow
                    label="Vente"
                    value={launch.sale_start && launch.sale_end ? `${formatDate(launch.sale_start)} → ${formatDate(launch.sale_end)}` : ""}
                  />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Contenus prévus</p>
                    {launch.selected_contents.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {launch.selected_contents.map((c) => (
                          <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Aucun contenu sélectionné</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between pb-12">
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Précédent
          </Button>
          <Button onClick={save} variant="secondary" disabled={saving}>
            {saving ? "Sauvegarde..." : "💾 Sauvegarder"}
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Suivant <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={() => { update("status", "active"); save(); }}>
              🚀 Lancer
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || <span className="italic text-muted-foreground">Non renseigné</span>}</p>
    </div>
  );
}

function formatDate(d: string) {
  return format(new Date(d), "d MMM yyyy", { locale: fr });
}
