import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import Confetti from "@/components/Confetti";

const ACTIVITY_TYPES = [
  { id: "creatrice", label: "Créatrice / Artisane", desc: "Tu fabriques des produits" },
  { id: "prestataire", label: "Prestataire de services", desc: "Tu vends ton expertise" },
  { id: "accompagnante", label: "Accompagnante / Coach", desc: "Tu guides des personnes" },
  { id: "autre", label: "Autre", desc: "Aucune case ne te va" },
];

const PILIERS = [
  "Coulisses / fabrication",
  "Éducation / pédagogie",
  "Valeurs / engagements",
  "Témoignages clients",
  "Vie d'entrepreneuse",
  "Inspiration / tendances",
  "Conseils pratiques",
  "Storytelling personnel",
];

const TONS = [
  "Chaleureux", "Expert·e", "Drôle", "Engagé·e", "Poétique", "Direct", "Inspirant·e",
];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [showConfetti, setShowConfetti] = useState(false);
  const [saving, setSaving] = useState(false);

  const [prenom, setPrenom] = useState("");
  const [activite, setActivite] = useState("");
  const [typeActivite, setTypeActivite] = useState("");
  const [cible, setCible] = useState("");
  const [probleme, setProbleme] = useState("");
  const [piliers, setPiliers] = useState<string[]>([]);
  const [tons, setTons] = useState<string[]>([]);

  const togglePilier = (p: string) =>
    setPiliers((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : prev.length < 4 ? [...prev, p] : prev);

  const toggleTon = (t: string) =>
    setTons((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const canNext = () => {
    if (step === 1) return prenom.trim() && activite.trim() && typeActivite;
    if (step === 2) return cible.trim() && probleme.trim();
    if (step === 3) return piliers.length >= 3 && tons.length >= 1;
    return true;
  };

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").insert({
        user_id: user.id,
        prenom,
        activite,
        type_activite: typeActivite,
        cible,
        probleme_principal: probleme,
        piliers,
        tons,
        onboarding_completed: true,
      });
      if (error) throw error;

      setShowConfetti(true);
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-rose-pale flex items-center justify-center px-4 py-8">
      {showConfetti && <Confetti />}
      <div className="w-full max-w-lg animate-fade-in">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-3 w-3 rounded-full transition-all ${
                s <= step ? "bg-primary scale-110" : "bg-secondary"
              }`}
            />
          ))}
        </div>

        <div className="rounded-2xl bg-card p-8 shadow-sm border border-border">
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="font-display text-2xl font-bold">Dis-moi qui tu es</h2>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Prénom</label>
                <Input
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  placeholder="Comment tu t'appelles ?"
                  className="rounded-[10px] h-12"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Ton activité en une phrase</label>
                <Input
                  value={activite}
                  onChange={(e) => setActivite(e.target.value)}
                  placeholder="Ex : Je crée des bijoux en céramique faits main"
                  className="rounded-[10px] h-12"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Type d'activité</label>
                <div className="grid grid-cols-2 gap-3">
                  {ACTIVITY_TYPES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTypeActivite(t.id)}
                      className={`rounded-lg border-2 p-4 text-left transition-all ${
                        typeActivite === t.id
                          ? "border-primary bg-secondary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span className="block text-sm font-semibold">{t.label}</span>
                      <span className="block text-xs text-muted-foreground mt-1">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="font-display text-2xl font-bold">Ta cliente idéale</h2>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Elle ressemble à quoi, ta cliente ?</label>
                <Textarea
                  value={cible}
                  onChange={(e) => setCible(e.target.value)}
                  placeholder="Ex : Des femmes de 30-45 ans qui veulent consommer mieux..."
                  className="rounded-[10px] min-h-[100px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Son problème principal (celui que tu résous)</label>
                <Input
                  value={probleme}
                  onChange={(e) => setProbleme(e.target.value)}
                  placeholder="Ex : Elle ne sait pas comment s'habiller éthique sans se ruiner"
                  className="rounded-[10px] h-12"
                />
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="font-display text-2xl font-bold">Tes piliers de contenu</h2>
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Sélectionne 3-4 piliers
                </label>
                <div className="flex flex-wrap gap-2">
                  {PILIERS.map((p) => (
                    <button
                      key={p}
                      onClick={() => togglePilier(p)}
                      className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                        piliers.includes(p)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border hover:border-primary/40"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Ton ton sur les réseaux
                </label>
                <div className="flex flex-wrap gap-2">
                  {TONS.map((t) => (
                    <button
                      key={t}
                      onClick={() => toggleTon(t)}
                      className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                        tons.includes(t)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border hover:border-primary/40"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="font-display text-2xl font-bold">Tout est bon !</h2>
              <div className="rounded-xl bg-rose-pale p-5 space-y-2">
                <p className="text-sm"><strong>Prénom :</strong> {prenom}</p>
                <p className="text-sm"><strong>Activité :</strong> {activite}</p>
                <p className="text-sm"><strong>Type :</strong> {ACTIVITY_TYPES.find(t => t.id === typeActivite)?.label}</p>
                <p className="text-sm"><strong>Cible :</strong> {cible}</p>
                <p className="text-sm"><strong>Problème :</strong> {probleme}</p>
                <p className="text-sm"><strong>Piliers :</strong> {piliers.join(", ")}</p>
                <p className="text-sm"><strong>Ton :</strong> {tons.join(", ")}</p>
              </div>
              <div className="rounded-xl border-2 border-yellow bg-accent/20 p-5">
                <p className="text-sm font-medium">
                  Now Pilot va utiliser ces infos pour te générer du contenu Instagram
                  personnalisé, adapté à ta cible et à ton ton. Prête ?
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            {step > 1 ? (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="rounded-pill"
              >
                Retour
              </Button>
            ) : <div />}
            {step < 4 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className="rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux"
              >
                Continuer
              </Button>
            ) : (
              <Button
                onClick={handleFinish}
                disabled={saving}
                className="rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux"
              >
                {saving ? "Un instant..." : "Accéder à mon atelier ✨"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
