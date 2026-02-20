import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { HelpCircle } from "lucide-react";

const PILIERS = [
  "Coulisses / fabrication", "Éducation / pédagogie", "Valeurs / engagements",
  "Témoignages clients", "Vie d'entrepreneuse", "Inspiration / tendances",
  "Conseils pratiques", "Storytelling personnel",
];

const TONS = ["Chaleureux", "Expert·e", "Drôle", "Engagé·e", "Poétique", "Direct", "Inspirant·e"];

const ACTIVITY_TYPES = [
  { id: "creatrice", label: "Créatrice / Artisane" },
  { id: "prestataire", label: "Prestataire de services" },
  { id: "accompagnante", label: "Accompagnante / Coach" },
  { id: "autre", label: "Autre" },
];

const STYLE_OPTIONS = [
  "Tutoiement", "Vouvoiement", "Familier", "Professionnel",
  "Oral assumé", "Écrit soigné", "Humour", "Sérieux",
];

const CANAUX_OPTIONS = [
  { id: "instagram", label: "📱 Instagram" },
  { id: "linkedin", label: "💼 LinkedIn" },
  { id: "newsletter", label: "📧 Newsletter" },
  { id: "pinterest", label: "📌 Pinterest" },
  { id: "blog", label: "✍️ Blog" },
];

type HelpKey = string | null;

function HelpToggle({ text, fieldKey, openHelp, setOpenHelp }: { text: string; fieldKey: string; openHelp: HelpKey; setOpenHelp: (k: HelpKey) => void }) {
  const isOpen = openHelp === fieldKey;
  return (
    <div className="mt-1">
      <button onClick={() => setOpenHelp(isOpen ? null : fieldKey)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
        <HelpCircle className="w-3.5 h-3.5" />
        <span className="font-mono-ui">Exemple</span>
      </button>
      {isOpen && (
        <p className="mt-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 italic animate-fade-in">{text}</p>
      )}
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"identite" | "marque">("identite");
  const [openHelp, setOpenHelp] = useState<HelpKey>(null);

  // Identité fields
  const [prenom, setPrenom] = useState("");
  const [activite, setActivite] = useState("");
  const [typeActivite, setTypeActivite] = useState("");
  const [cible, setCible] = useState("");
  const [probleme, setProbleme] = useState("");
  const [piliers, setPiliers] = useState<string[]>([]);
  const [tons, setTons] = useState<string[]>([]);

  // Ma marque fields
  const [mission, setMission] = useState("");
  const [offre, setOffre] = useState("");
  const [croyances, setCroyances] = useState("");
  const [verbatims, setVerbatims] = useState("");
  const [expressions, setExpressions] = useState("");
  const [ceQuonEvite, setCeQuonEvite] = useState("");
  const [styleCom, setStyleCom] = useState<string[]>([]);
  const [canaux, setCanaux] = useState<string[]>(["instagram"]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setPrenom(data.prenom);
          setActivite(data.activite);
          setTypeActivite(data.type_activite);
          setCible(data.cible);
          setProbleme(data.probleme_principal);
          setPiliers(data.piliers || []);
          setTons(data.tons || []);
          // Ma marque fields (cast to any for new columns not yet in types)
          const d = data as any;
          setMission(d.mission || "");
          setOffre(d.offre || "");
          setCroyances(d.croyances_limitantes || "");
          setVerbatims(d.verbatims || "");
          setExpressions(d.expressions_cles || "");
          setCeQuonEvite(d.ce_quon_evite || "");
          setStyleCom(d.style_communication || []);
          setCanaux(d.canaux || ["instagram"]);
        }
        setLoading(false);
      });
  }, [user]);

  const completionScore = useMemo(() => {
    const fields = [
      prenom, activite, typeActivite, cible, probleme,
      mission, offre, croyances, verbatims, expressions, ceQuonEvite,
    ];
    const filledText = fields.filter((f) => f.trim().length > 0).length;
    const filledArrays = [piliers, tons, styleCom, canaux].filter((a) => a.length > 0).length;
    const total = fields.length + 4; // 4 array fields
    return Math.round(((filledText + filledArrays) / total) * 100);
  }, [prenom, activite, typeActivite, cible, probleme, mission, offre, croyances, verbatims, expressions, ceQuonEvite, piliers, tons, styleCom, canaux]);

  const togglePilier = (p: string) =>
    setPiliers((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : prev.length < 4 ? [...prev, p] : prev);
  const toggleTon = (t: string) =>
    setTons((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  const toggleStyle = (s: string) =>
    setStyleCom((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  const toggleCanal = (c: string) =>
    setCanaux((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        prenom, activite, type_activite: typeActivite, cible, probleme_principal: probleme, piliers, tons,
        mission, offre, croyances_limitantes: croyances, verbatims, expressions_cles: expressions,
        ce_quon_evite: ceQuonEvite, style_communication: styleCom, canaux,
      } as any)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "C'est enregistré !" });
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        <h1 className="font-display text-3xl font-bold text-bordeaux mb-2">Mon profil</h1>
        <p className="text-sm text-muted-foreground mb-6">Plus ton profil est riche, plus L'Assistant Com' te propose des idées qui te ressemblent.</p>

        {/* Score de complétude */}
        <div className="rounded-2xl bg-rose-pale border border-border p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-xs font-semibold text-muted-foreground">Profil complet à</span>
            <span className="font-mono-ui text-sm font-bold text-primary">{completionScore}%</span>
          </div>
          <Progress value={completionScore} className="h-2" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-rose-pale rounded-xl p-1 mb-6">
          <button
            onClick={() => setActiveTab("identite")}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === "identite"
                ? "bg-card text-bordeaux font-semibold shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mon identité
          </button>
          <button
            onClick={() => setActiveTab("marque")}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === "marque"
                ? "bg-card text-bordeaux font-semibold shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Ma marque
          </button>
        </div>

        <div className="rounded-2xl bg-card p-6 border border-border space-y-5">
          {activeTab === "identite" ? (
            <>
              {/* Prénom */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Prénom</label>
                <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="rounded-[10px] h-12" />
              </div>

              {/* Activité */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Activité</label>
                <Input value={activite} onChange={(e) => setActivite(e.target.value)} className="rounded-[10px] h-12" placeholder="Ex : Céramiste, coach, photographe..." />
              </div>

              {/* Type d'activité */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Type d'activité</label>
                <div className="grid grid-cols-2 gap-3">
                  {ACTIVITY_TYPES.map((t) => (
                    <button key={t.id} onClick={() => setTypeActivite(t.id)}
                      className={`rounded-lg border-2 p-3 text-left text-sm font-medium transition-all ${typeActivite === t.id ? "border-primary bg-secondary" : "border-border hover:border-primary/40"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cible */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Ta cliente idéale</label>
                <Textarea value={cible} onChange={(e) => setCible(e.target.value)} className="rounded-[10px] min-h-[80px]" placeholder="Qui est-elle ? Quel âge, quel style de vie ?" />
                <HelpToggle fieldKey="cible" openHelp={openHelp} setOpenHelp={setOpenHelp} text="Ex : Femmes 30-45 ans, urbaines, sensibles à l'artisanat et au fait-main, qui cherchent des pièces uniques pour leur intérieur." />
              </div>

              {/* Problème */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Problème principal de ta cible</label>
                <Input value={probleme} onChange={(e) => setProbleme(e.target.value)} className="rounded-[10px] h-12" placeholder="Qu'est-ce qui la bloque ?" />
                <HelpToggle fieldKey="probleme" openHelp={openHelp} setOpenHelp={setOpenHelp} text="Ex : Elle crée des pièces magnifiques mais personne ne les voit sur Instagram." />
              </div>

              {/* Piliers */}
              <div>
                <label className="text-sm font-medium mb-2 block">Mes thématiques <span className="text-muted-foreground font-normal">(4 max)</span></label>
                <div className="flex flex-wrap gap-2">
                  {PILIERS.map((p) => (
                    <button key={p} onClick={() => togglePilier(p)}
                      className={`rounded-full px-4 py-2 text-sm font-medium border transition-all ${piliers.includes(p) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tons */}
              <div>
                <label className="text-sm font-medium mb-2 block">Ton</label>
                <div className="flex flex-wrap gap-2">
                  {TONS.map((t) => (
                    <button key={t} onClick={() => toggleTon(t)}
                      className={`rounded-full px-4 py-2 text-sm font-medium border transition-all ${tons.includes(t) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Mission */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Ta mission</label>
                <Textarea value={mission} onChange={(e) => setMission(e.target.value)} className="rounded-[10px] min-h-[80px]" placeholder="Pourquoi tu fais ce que tu fais ?" />
                <HelpToggle fieldKey="mission" openHelp={openHelp} setOpenHelp={setOpenHelp} text="Ex : Rendre la céramique artisanale accessible et désirable, pour que chaque objet du quotidien raconte une histoire." />
              </div>

              {/* Offre */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Ton offre (ce que tu vends)</label>
                <Textarea value={offre} onChange={(e) => setOffre(e.target.value)} className="rounded-[10px] min-h-[80px]" placeholder="Détaille tes produits ou services" />
                <HelpToggle fieldKey="offre" openHelp={openHelp} setOpenHelp={setOpenHelp} text="Ex : Pièces uniques en céramique (vaisselle, déco), ateliers découverte, cours en ligne pour débutant·es." />
              </div>

              {/* Croyances limitantes */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Croyances limitantes de ta cible</label>
                <Textarea value={croyances} onChange={(e) => setCroyances(e.target.value)} className="rounded-[10px] min-h-[100px]" placeholder="Les freins mentaux de tes clientes (une par ligne)" />
                <HelpToggle fieldKey="croyances" openHelp={openHelp} setOpenHelp={setOpenHelp} text={`Ex :\n"Si c'est bon, ça se vendra tout seul"\n"Vendre, c'est manipuler"\n"Instagram c'est superficiel"`} />
              </div>

              {/* Verbatims */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Verbatims (les mots de tes clientes)</label>
                <Textarea value={verbatims} onChange={(e) => setVerbatims(e.target.value)} className="rounded-[10px] min-h-[100px]" placeholder="Les phrases exactes que tes clientes utilisent" />
                <HelpToggle fieldKey="verbatims" openHelp={openHelp} setOpenHelp={setOpenHelp} text={`Ex : "J'ai l'impression de parler dans le vide", "Je sais pas quoi poster", "J'ai pas le temps de créer du contenu"`} />
              </div>

              {/* Style de communication */}
              <div>
                <label className="text-sm font-medium mb-2 block">Ton style de communication</label>
                <div className="flex flex-wrap gap-2">
                  {STYLE_OPTIONS.map((s) => (
                    <button key={s} onClick={() => toggleStyle(s)}
                      className={`rounded-full px-4 py-2 text-sm font-medium border transition-all ${styleCom.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Expressions clés */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Tes expressions clés</label>
                <Textarea value={expressions} onChange={(e) => setExpressions(e.target.value)} className="rounded-[10px] min-h-[80px]" placeholder="Les mots et tournures que tu utilises souvent" />
                <HelpToggle fieldKey="expressions" openHelp={openHelp} setOpenHelp={setOpenHelp} text={`Ex : "Franchement", "Le truc c'est que", "En vrai", "Et c'est ok"`} />
              </div>

              {/* Ce qu'on évite */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Ce qu'on évite dans ta com'</label>
                <Textarea value={ceQuonEvite} onChange={(e) => setCeQuonEvite(e.target.value)} className="rounded-[10px] min-h-[80px]" placeholder="Les mots, tons ou approches que tu refuses" />
                <HelpToggle fieldKey="evite" openHelp={openHelp} setOpenHelp={setOpenHelp} text="Ex : Jargon marketing (ROI, tunnel de vente), promesses chiffrées, ton corporate, emojis à outrance" />
              </div>

              {/* Canaux */}
              <div>
                <label className="text-sm font-medium mb-2 block">Tes canaux de communication</label>
                <div className="flex flex-wrap gap-2">
                  {CANAUX_OPTIONS.map((c) => (
                    <button key={c.id} onClick={() => toggleCanal(c.id)}
                      className={`rounded-full px-4 py-2 text-sm font-medium border transition-all ${canaux.includes(c.id) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full rounded-full bg-primary text-primary-foreground hover:bg-bordeaux h-12">
            {saving ? "Enregistrement..." : "Enregistrer les modifications"}
          </Button>
        </div>
      </main>
    </div>
  );
}
