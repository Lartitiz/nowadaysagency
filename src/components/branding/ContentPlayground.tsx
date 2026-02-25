import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { Button } from "@/components/ui/button";
import { Sparkles, Copy, RefreshCw, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

interface PlaygroundAction {
  label: string;
  prompt: string;
}

const PLAYGROUND_ACTIONS: Record<string, PlaygroundAction[]> = {
  story: [
    { label: "3 accroches basées sur mon histoire", prompt: "Génère 3 accroches de post Instagram basées sur mon histoire personnelle / storytelling. Courtes, percutantes, prêtes à copier. Numérote-les 1, 2, 3." },
    { label: "Un post storytelling complet", prompt: "Écris un post Instagram de storytelling complet à partir de mon parcours et mon histoire. Prêt à copier-coller, avec une accroche forte, un développement et un CTA." },
  ],
  persona: [
    { label: "Un post pour ma cliente idéale", prompt: "Écris un post Instagram qui parle directement à ma cliente idéale, en utilisant ses mots, ses frustrations et ses aspirations. Prêt à copier-coller." },
    { label: "3 questions que ma cible se pose", prompt: "Génère 3 questions que ma cliente idéale se pose, basées sur ses frustrations et ses désirs. Des questions qui pourraient devenir des accroches de post. Numérote-les 1, 2, 3." },
  ],
  value_proposition: [
    { label: "Une bio Instagram", prompt: "Génère une bio Instagram de maximum 150 caractères à partir de ma proposition de valeur. Format : 4 lignes max, claire, avec un CTA." },
    { label: "Un post 'ce que je fais et pourquoi'", prompt: "Écris un post Instagram qui explique clairement ce que je fais, pour qui, et pourquoi. Basé sur ma proposition de valeur. Prêt à copier-coller." },
  ],
  tone_style: [
    { label: "Reformule dans mon ton", prompt: "Prends ce texte générique et reformule-le dans mon ton et mon style : 'Découvrez nos services de qualité pour vous accompagner dans vos projets. Nous mettons notre expertise au service de votre réussite.' Propose 2 versions reformulées." },
    { label: "3 accroches dans mon style", prompt: "Génère 3 phrases d'accroche de post dans mon style et mon ton de voix. Elles doivent sonner comme moi. Numérote-les 1, 2, 3." },
  ],
  content_strategy: [
    { label: "5 idées de posts", prompt: "Génère 5 idées de posts basées sur mes piliers de contenu. Pour chaque idée, donne un titre + l'angle. Format : liste numérotée avec titre en gras et angle en dessous." },
    { label: "Planning de la semaine", prompt: "Propose un planning de contenu du lundi au vendredi basé sur mes piliers de contenu. Pour chaque jour : le pilier, le sujet et le format recommandé." },
  ],
};

interface Props {
  section: string;
}

export default function ContentPlayground({ section }: Props) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [activeAction, setActiveAction] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const actions = PLAYGROUND_ACTIONS[section];
  if (!actions) return null;

  const generate = async (idx: number) => {
    if (!user) return;
    setActiveAction(idx);
    setLoading(true);
    setResult(null);
    setCopied(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non connectée");

      const { data: profileData } = await (supabase
        .from("profiles") as any)
        .select("activite, prenom, cible, piliers, tons, mission, offre, probleme_principal, type_activite")
        .eq(column, value)
        .single();

      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "playground",
          playground_prompt: actions[idx].prompt,
          profile: profileData || {},
        },
      });

      if (res.error) throw res.error;
      const content = res.data?.content || res.data;
      setResult(typeof content === "string" ? content : JSON.stringify(content, null, 2));
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erreur lors de la génération");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("Copié !");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5 p-6 mt-8">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="text-xl">🎮</span>
        <h3 className="font-display text-base font-bold text-foreground">Teste ton branding en action</h3>
      </div>
      <p className="text-[13px] text-muted-foreground mb-4">
        L'IA génère du contenu avec ton branding. Essaie pour voir le résultat !
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {actions.map((action, idx) => (
          <Button
            key={idx}
            variant={activeAction === idx ? "default" : "outline"}
            size="sm"
            className="text-xs gap-1.5 rounded-pill"
            onClick={() => generate(idx)}
            disabled={loading}
          >
            {loading && activeAction === idx ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {action.label}
          </Button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Génération en cours...
        </div>
      )}

      {result && !loading && (
        <div className="space-y-3 animate-fade-in">
          <div className="rounded-xl bg-card border border-border p-5">
            <pre className="text-sm text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">{result}</pre>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copié !" : "Copier"}
            </Button>
            {activeAction !== null && (
              <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => generate(activeAction)} disabled={loading}>
                <RefreshCw className="h-3.5 w-3.5" />
                Régénérer
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
