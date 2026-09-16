import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { useWorkspaceFilter, useWorkspaceId, useWorkspaceReady } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowRight, Plus, Sparkles, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDemoContext } from "@/contexts/DemoContext";

import CoachingFlow from "@/components/CoachingFlow";
import OffersSynthesisView from "@/components/branding/OffersSynthesisView";

const TYPE_CONFIG = {
  paid: { label: "Offre payante", detail: "Produit, programme ou prestation." },
  free: { label: "Ressource gratuite", detail: "Guide, atelier gratuit ou contenu à télécharger." },
  service: { label: "Service ponctuel", detail: "Intervention ou prestation à la demande." },
};

function OffersLoading() {
  return (
    <div role="status" aria-label="Chargement des offres" className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex gap-1">
        <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
        <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
        <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
      </div>
    </div>
  );
}

export default function OffersPage() {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const ready = useWorkspaceReady();

  if (!isDemoMode && (!ready || !user?.id || !value)) return <OffersLoading />;

  // Remonter tout le contenu (y compris coaching et actions) à chaque contexte.
  // Une réponse de l’ancien espace ne peut plus remplacer la liste courante.
  return <ScopedOffersPage key={`${user?.id}:${isDemoMode}:${column}:${value}`}
    userId={user?.id} isDemoMode={isDemoMode} demoData={demoData}
    column={column} value={value} workspaceId={workspaceId} />;
}

function ScopedOffersPage({ userId, isDemoMode, demoData, column, value, workspaceId }: {
  userId?: string; isDemoMode: boolean; demoData: unknown; column: string; value: string; workspaceId: string;
}) {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [coachingOpen, setCoachingOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState("liste");
  const mounted = useRef(true);
  const readVersion = useRef(0);
  const creating = useRef(false);

  const reloadOffers = useCallback(async () => {
    if (!mounted.current) return;
    const version = ++readVersion.current;
    setLoading(true);
    setLoadError(false);
    if (isDemoMode && demoData) {
      setOffers((demoData as any).offers.map((o: any, i: number) => ({
        id: `demo-offer-${i}`, offer_type: "paid", name: o.name,
        price_text: o.price, description: o.description,
        promise: "Accompagnement sur-mesure pour développer ta marque",
        target_ideal: "Entrepreneures créatives", completed: true, completion_pct: 100,
      })));
      setLoading(false);
      return;
    }
    try {
      let query = (supabase.from("offers") as any).select("*").eq(column, value);
      if (column === "user_id") query = query.is("workspace_id", null);
      const { data, error } = await query.order("created_at", { ascending: true });
      if (!mounted.current || version !== readVersion.current) return;
      if (error) throw error;
      setOffers(data || []);
    } catch {
      if (!mounted.current || version !== readVersion.current) return;
      setOffers([]);
      setLoadError(true);
    } finally {
      if (mounted.current && version === readVersion.current) setLoading(false);
    }
  }, [column, value, isDemoMode, demoData]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    void reloadOffers();
    return () => { readVersion.current++; };
  }, [reloadOffers]);

  const createOffer = async (type: string) => {
    if (!userId || !mounted.current || creating.current || loading || loadError) return;
    creating.current = true;
    setIsCreating(true);
    try {
      const { data, error } = await supabase.from("offers")
        .insert({ user_id: userId, offer_type: type, name: "", workspace_id: workspaceId !== userId ? workspaceId : null } as any)
        .select().single();
      if (!mounted.current) return;
      if (error || !data) { toast.error("Erreur lors de la création"); return; }
      navigate(`/branding/offres/${data.id}`);
    } catch {
      if (mounted.current) toast.error("Erreur lors de la création");
    } finally {
      creating.current = false;
      if (mounted.current) setIsCreating(false);
    }
  };

  const visibleOffers = offers.filter(o => (typeFilter === "all" || o.offer_type === typeFilter) &&
    [o.name, o.promise, o.description_short, o.description, o.price_text].filter(Boolean).join(" ").toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")));

  if (loading) return <OffersLoading />;
  if (loadError) return (
    <div className="min-h-screen bg-background [--primary:330_50%_20%] dark:[--primary:338_72%_83%]">
      <AppHeader />
      <main className="mx-auto max-w-[1120px] px-6 py-8">
        <Link to="/branding">Mon activité</Link>
        <div role="alert" className="my-6">Impossible de charger tes offres. Vérifie ta connexion et réessaie.</div>
        <Button onClick={() => void reloadOffers()}>Réessayer</Button>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background [--primary:330_50%_20%] dark:[--primary:338_72%_83%]">
      <AppHeader />
      <main className="mx-auto max-w-[1120px] px-6 py-8 max-md:px-4">
        <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Mon activité
        </Link>

        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="font-display text-3xl sm:text-4xl">Mes offres</h1><p className="mt-3 text-sm text-muted-foreground">Mes produits, services et ressources, prêts à présenter dans mes contenus.</p></div>
          <Button onClick={() => setAddOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Ajouter une offre</Button>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6"><TabsTrigger value="liste">Mes fiches ({offers.length})</TabsTrigger><TabsTrigger value="synthese">Vue d’ensemble</TabsTrigger></TabsList>
          <TabsContent value="liste">
            {offers.length > 0 && <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1 basis-64"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input aria-label="Rechercher une offre" placeholder="Rechercher une offre…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
              <select aria-label="Type d’offre" className="h-10 max-w-full rounded-md border border-input bg-background px-3 text-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="all">Tous les types</option>{Object.entries(TYPE_CONFIG).map(([key, config]) => <option key={key} value={key}>{config.label}</option>)}</select>
            </div>}
            {offers.length === 0 ? <div className="rounded-2xl border border-border bg-card p-6 sm:p-8"><h2 className="font-display text-2xl">Présenter ce que je propose</h2><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">Une fiche par produit, service ou ressource. Tu peux commencer par son nom et préciser les détails ensuite.</p><Button className="mt-5" onClick={() => setAddOpen(true)}>Créer ma première offre</Button></div>
              : visibleOffers.length === 0 ? <div className="rounded-xl border border-border p-6 text-center"><p>Aucune offre ne correspond à cette recherche.</p><Button variant="link" onClick={() => { setSearch(""); setTypeFilter("all"); }}>Effacer les filtres</Button></div>
              : <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{visibleOffers.map(offer => {
                const complete = offer.completed || offer.completion_pct === 100;
                const config = TYPE_CONFIG[offer.offer_type as keyof typeof TYPE_CONFIG];
                return <li key={offer.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div className="min-w-0"><p className="mb-2 text-xs text-muted-foreground">{config?.label || "Offre"} · {complete ? "Fiche complétée" : "En cours"}</p><h2 className="break-words text-lg font-medium">{offer.name || "Offre sans nom"}</h2>{(offer.description_short || offer.promise || offer.description) && <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground">{offer.description_short || offer.promise || offer.description}</p>}{offer.price_text && <p className="mt-2 break-words text-sm font-medium">{offer.price_text}</p>}</div>
                  <Button variant="outline" asChild className="shrink-0 self-start sm:self-auto"><Link to={`/branding/offres/${offer.id}${complete ? "?tab=synthese" : ""}`} aria-label={`${complete ? "Voir" : "Continuer"} ${offer.name || "l’offre sans nom"}`}>{complete ? "Voir la fiche" : "Continuer"}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                </li>;
              })}</ul>}
            <Button onClick={() => setCoachingOpen(true)} variant="ghost" className="mt-6 h-auto whitespace-normal gap-2 text-left"><Sparkles className="h-4 w-4 shrink-0" /> Besoin d’aide pour formuler mes offres</Button>
          </TabsContent>

          <TabsContent value="synthese">
            <OffersSynthesisView
              offers={offers}
              onNavigateToOffer={(id) => navigate(`/branding/offres/${id}?tab=synthese`)}
              onNavigateToWorkshop={(id) => navigate(`/branding/offres/${id}`)}
            />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Ajouter une offre</DialogTitle><DialogDescription>Choisis ce que tu veux présenter. Tu pourras ensuite remplir sa fiche.</DialogDescription></DialogHeader><div className="space-y-3">{Object.entries(TYPE_CONFIG).map(([key, config]) => <Button key={key} variant="outline" disabled={isCreating} className="h-auto w-full justify-between gap-3 whitespace-normal p-4 text-left" onClick={() => void createOffer(key)}><span><span className="block font-medium">{config.label}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{config.detail}</span></span><ArrowRight className="h-4 w-4 shrink-0" /></Button>)}</div>{isCreating && <p role="status" className="text-sm text-muted-foreground">Création de la fiche…</p>}</DialogContent></Dialog>
      <Dialog open={coachingOpen} onOpenChange={setCoachingOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>M’aider à formuler mes offres</DialogTitle><DialogDescription>Préciser ce que je propose, pour qui et avec quel bénéfice.</DialogDescription></DialogHeader><CoachingFlow module="offers" onComplete={async () => { setCoachingOpen(false); await reloadOffers(); }} onSkip={() => setCoachingOpen(false)} /></DialogContent></Dialog>
    </div>
  );
}
