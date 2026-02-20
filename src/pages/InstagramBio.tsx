import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import SubPageHeader from "@/components/SubPageHeader";

interface BioVersion {
  nom_profil: string;
  ligne1: string;
  ligne2: string;
  ligne3: string;
}

interface BioResult {
  structured: BioVersion;
  creative: BioVersion;
}

interface UserProfile {
  prenom: string;
  activite: string;
  type_activite: string;
  cible: string;
  probleme_principal: string;
  piliers: string[];
  tons: string[];
}

export default function InstagramBio() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [generating, setGenerating] = useState(false);
  const [bioResult, setBioResult] = useState<BioResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"guide" | "generator">("guide");
  const [guideOption, setGuideOption] = useState<"structured" | "creative">("structured");

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("prenom, activite, type_activite, cible, probleme_principal, piliers, tons")
        .eq("user_id", user.id)
        .single();
      if (data) setProfile(data as UserProfile);
    };
    fetchProfile();
  }, [user]);

  const handleGenerate = async () => {
    if (!profile) return;
    setGenerating(true);
    setBioResult(null);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: { type: "bio", profile },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: BioResult;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }
      setBioResult(parsed);
      setActiveTab("generator");
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyBio = async (version: BioVersion, label: string) => {
    const text = `${version.nom_profil}\n${version.ligne1}\n${version.ligne2}\n${version.ligne3}`;
    await navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Instagram" parentTo="/instagram" currentLabel="Optimiser ma bio" />

        <h1 className="font-display text-[26px] font-bold text-foreground">✍️ Optimiser ma bio</h1>
        <p className="mt-2 text-sm text-muted-foreground mb-8">
          Ta bio, c'est ta première impression. Elle doit montrer en quelques mots : à qui tu t'adresses, ce que tu proposes, ce qui te rend unique, et où cliquer.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 rounded-pill bg-rose-pale p-1 mb-8 w-fit">
          <button
            onClick={() => setActiveTab("guide")}
            className={`rounded-pill px-5 py-2 text-sm font-medium transition-all ${
              activeTab === "guide" ? "bg-card text-foreground shadow-sm" : "text-foreground hover:bg-secondary"
            }`}
          >
            Le guide
          </button>
          <button
            onClick={() => setActiveTab("generator")}
            className={`rounded-pill px-5 py-2 text-sm font-medium transition-all ${
              activeTab === "generator" ? "bg-card text-foreground shadow-sm" : "text-foreground hover:bg-secondary"
            }`}
          >
            Le générateur
          </button>
        </div>

        {/* GUIDE TAB */}
        {activeTab === "guide" && (
          <div className="space-y-6 animate-fade-in">
            {/* Option selector */}
            <div className="flex gap-3">
              <button
                onClick={() => setGuideOption("structured")}
                className={`flex-1 rounded-2xl border p-5 text-left transition-all ${
                  guideOption === "structured"
                    ? "border-primary bg-rose-pale shadow-sm"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <h3 className="font-display text-lg font-bold text-foreground">Bio structurée & claire</h3>
                <p className="text-sm text-muted-foreground mt-1">Un format ligne par ligne, efficace et lisible.</p>
              </button>
              <button
                onClick={() => setGuideOption("creative")}
                className={`flex-1 rounded-2xl border p-5 text-left transition-all ${
                  guideOption === "creative"
                    ? "border-primary bg-rose-pale shadow-sm"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <h3 className="font-display text-lg font-bold text-foreground">Bio créative & incarnée</h3>
                <p className="text-sm text-muted-foreground mt-1">Un ton plus libre, poétique, avec de la personnalité.</p>
              </button>
            </div>

            {/* Guide content */}
            {guideOption === "structured" ? (
              <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                <h3 className="font-display text-xl font-bold">Le format structuré</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  C'est le format le plus courant et le plus efficace. Chaque ligne a un rôle précis. L'objectif : que ta visiteuse comprenne en 3 secondes ce que tu fais et pour qui.
                </p>

                <div className="space-y-4">
                  <BioGuideLine
                    label="Nom du profil"
                    explanation="Ajoute un mot-clé à côté de ton prénom pour être trouvée en recherche."
                    example='Lucie | Céramique slow & solaire'
                  />
                  <BioGuideLine
                    label="Ligne 1 : Ce que tu proposes"
                    explanation="Décris ton offre ou ta mission principale. Commence par un emoji."
                    example='🌿 Objets du quotidien en céramique artisanale'
                  />
                  <BioGuideLine
                    label="Ligne 2 : Ce qui te rend unique"
                    explanation="Ton positionnement, tes valeurs, ta différence."
                    example='🌞 Faits main en Bourgogne, pièces uniques & durables'
                  />
                  <BioGuideLine
                    label="Ligne 3 : Appel à l'action"
                    explanation="Dis à ta visiteuse quoi faire : cliquer, s'inscrire, découvrir."
                    example='📦 Nouvelle collection en ligne ⤵️'
                  />
                </div>

                {/* Visual preview */}
                <div className="mt-6">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Aperçu visuel</p>
                  <BioPreview
                    nom="Lucie | Céramique slow & solaire"
                    lines={[
                      "🌿 Objets du quotidien en céramique artisanale",
                      "🌞 Faits main en Bourgogne, pièces uniques & durables",
                      "📦 Nouvelle collection en ligne ⤵️",
                    ]}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                <h3 className="font-display text-xl font-bold">Le format créatif</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Même structure de fond, mais avec un ton plus personnel. Idéal si tu veux te démarquer avec de l'humour, de la poésie, ou une vibe très "toi".
                </p>

                <div className="space-y-4">
                  <BioGuideLine
                    label="Nom du profil"
                    explanation="Joue avec les mots ou utilise un titre décalé."
                    example='Lucie 🌻 celle qui fait parler la terre'
                  />
                  <BioGuideLine
                    label="Ligne 1 : Ta promesse poétique"
                    explanation="Décris ce que tu fais avec tes mots à toi, pas un pitch corporate."
                    example='Je transforme la terre en petits bonheurs du matin'
                  />
                  <BioGuideLine
                    label="Ligne 2 : Ta touche perso"
                    explanation="Un détail qui montre qui tu es : humour, valeur, anecdote."
                    example='Accro au café, allergique au plastique'
                  />
                  <BioGuideLine
                    label="Ligne 3 : Invitation douce"
                    explanation="Un appel à l'action qui donne envie sans forcer."
                    example={"✨ Rejoins la liste d\u2019attente ⤵️"}
                  />
                </div>

                <div className="mt-6">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Aperçu visuel</p>
                  <BioPreview
                    nom="Lucie 🌻 celle qui fait parler la terre"
                    lines={[
                      "Je transforme la terre en petits bonheurs du matin",
                      "Accro au café, allergique au plastique",
                      "✨ Rejoins la liste d&apos;attente ⤵️",
                    ]}
                  />
                </div>
              </div>
            )}

            {/* CTA to generator */}
            <div className="rounded-2xl border-l-4 border-l-primary bg-rose-pale p-5 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium text-foreground">Envie qu'on t'écrive ta bio ?</p>
                <p className="text-xs text-muted-foreground mt-0.5">Le générateur utilise ton profil pour créer 2 versions personnalisées.</p>
              </div>
              <Button onClick={handleGenerate} disabled={generating} className="rounded-pill gap-2 shrink-0">
                <Sparkles className="h-4 w-4" />
                {generating ? "Génération..." : "Générer ma bio"}
              </Button>
            </div>
          </div>
        )}

        {/* GENERATOR TAB */}
        {activeTab === "generator" && (
          <div className="space-y-6 animate-fade-in">
            {!bioResult && !generating && (
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-foreground font-medium">Génère ta bio personnalisée</p>
                <p className="text-sm text-muted-foreground mt-1 mb-5">
                  On utilise ton profil (activité, cible, ton) pour créer 2 versions sur mesure.
                </p>
                <Button onClick={handleGenerate} disabled={generating} className="rounded-pill gap-2">
                  <Sparkles className="h-4 w-4" />
                  Générer ma bio avec l'IA
                </Button>
              </div>
            )}

            {generating && (
              <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center justify-center">
                <div className="flex gap-1 mb-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" />
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
                </div>
                <p className="text-sm italic text-muted-foreground">Je rédige ta bio...</p>
              </div>
            )}

            {bioResult && !generating && (
              <div className="space-y-6">
                {/* Structured version */}
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-lg font-bold">Version structurée</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyBio(bioResult.structured, "structured")}
                      className="rounded-pill gap-1.5"
                    >
                      {copiedField === "structured" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedField === "structured" ? "Copié !" : "Copier"}
                    </Button>
                  </div>
                  <BioPreview
                    nom={bioResult.structured.nom_profil}
                    lines={[bioResult.structured.ligne1, bioResult.structured.ligne2, bioResult.structured.ligne3]}
                  />
                </div>

                {/* Creative version */}
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-lg font-bold">Version créative</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyBio(bioResult.creative, "creative")}
                      className="rounded-pill gap-1.5"
                    >
                      {copiedField === "creative" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedField === "creative" ? "Copié !" : "Copier"}
                    </Button>
                  </div>
                  <BioPreview
                    nom={bioResult.creative.nom_profil}
                    lines={[bioResult.creative.ligne1, bioResult.creative.ligne2, bioResult.creative.ligne3]}
                  />
                </div>

                {/* Regenerate */}
                <Button
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full rounded-pill gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Regénérer 2 nouvelles versions
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function BioGuideLine({ label, explanation, example }: { label: string; explanation: string; example: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-4">
      <p className="text-sm font-bold text-foreground">{label}</p>
      <p className="text-sm text-muted-foreground mt-1">{explanation}</p>
      <p className="text-sm text-foreground mt-2 font-medium bg-card rounded-lg px-3 py-2 border border-border">
        {example}
      </p>
    </div>
  );
}

function BioPreview({ nom, lines }: { nom: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 max-w-sm mx-auto">
      {/* Fake profile header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-rose-medium flex items-center justify-center text-primary-foreground text-xl font-bold">
          {nom.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{nom}</p>
        </div>
      </div>
      {/* Bio lines */}
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <p key={i} className="text-sm text-foreground leading-snug">{line}</p>
        ))}
      </div>
      {/* Fake link */}
      <p className="text-sm text-primary font-medium mt-2">monsite.fr</p>
    </div>
  );
}
