import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Lightbulb, CalendarDays, BookOpen, Instagram, Palette, PenTool, BarChart3 } from "lucide-react";

/* ─── Signup Form ─── */
function SignupForm() {
  const { toast } = useToast();
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [activite, setActivite] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prenom.trim() || !email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      localStorage.setItem("lac_prenom", prenom.trim());
      localStorage.setItem("lac_activite", activite.trim());

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;

      if (data.user) {
        await supabase.from("profiles").insert({
          user_id: data.user.id,
          prenom: prenom.trim(),
          activite: activite.trim(),
        });
      }

      setSuccess(true);
      toast({
        title: "Compte créé !",
        description: "Vérifie tes emails pour confirmer ton inscription.",
      });
    } catch (error: any) {
      const msg = error.message;
      if (msg === "User already registered") {
        toast({
          title: "Tu as déjà un compte !",
          description: (
            <span>
              Connecte-toi ici :{" "}
              <a href="/login" className="underline font-medium text-primary">page de connexion</a>
            </span>
          ) as any,
          variant: "destructive",
        });
      } else {
        toast({ title: "Oups !", description: msg, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-2xl bg-card border border-border p-6 text-center space-y-2">
        <p className="font-display text-lg font-bold text-foreground">Presque là !</p>
        <p className="text-sm text-muted-foreground">
          Un email de confirmation vient d'être envoyé à ton adresse. Clique sur le lien pour activer ton compte et accéder à ton atelier.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSignup} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Ton prénom" required className="rounded-[10px] h-12 bg-card border-border" />
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ton email" required className="rounded-[10px] h-12 bg-card border-border" />
        <Input value={activite} onChange={(e) => setActivite(e.target.value)} placeholder="Ex : céramiste, coach..." className="rounded-[10px] h-12 bg-card border-border" />
      </div>
      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe (6 caractères min.)" required minLength={6} className="rounded-[10px] h-12 bg-card border-border" />
      <Button type="submit" disabled={loading} className="w-full sm:w-auto h-12 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux px-10 text-base font-medium transition-all hover:shadow-lg hover:-translate-y-0.5">
        {loading ? "Un instant..." : "Accéder gratuitement"}
      </Button>
      <p className="text-xs text-muted-foreground">Gratuit. Sans carte bancaire. En 30 secondes.</p>
    </form>
  );
}

/* ─── Landing Page ─── */
export default function LandingPage() {
  const { user, loading } = useAuth();

  if (loading) {
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

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background font-body text-foreground overflow-x-hidden">
      {/* ─── NAV ─── */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-bold text-bordeaux">L'Assistant Com'</span>
            <span className="rounded-pill bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary">beta</span>
          </div>
          <Link to="/login" className="rounded-pill border border-border px-5 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors">
            Se connecter
          </Link>
        </div>
      </header>

      {/* ─── HERO ─── */}
      <section className="relative py-16 sm:py-24 px-4 overflow-hidden">
        <div className="absolute -top-20 -right-32 w-96 h-72 bg-rose-soft/40 rounded-[60%_40%_70%_30%/50%_60%_40%_50%] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -left-24 w-80 h-56 bg-yellow/20 rounded-[40%_60%_30%_70%/60%_30%_70%_40%] blur-3xl pointer-events-none" />

        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12 items-center">
          <div className="animate-fade-in">
            <h1 className="font-display text-[32px] sm:text-[42px] lg:text-[48px] font-bold leading-tight text-foreground">
              Ta com' te prend la tête ?{" "}
              <span className="text-primary">On a créé l'outil qu'il te fallait.</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Trouve des idées de contenu, définis ta marque, planifie ta communication. Tout au même endroit. Basé sur une vraie méthode, pas du bullshit marketing.
            </p>
            <div className="mt-8">
              <SignupForm />
            </div>
          </div>

          {/* App mockup */}
          <div className="hidden lg:block animate-fade-in" style={{ animationDelay: "0.15s" }}>
            <div className="relative">
              <div className="rounded-2xl bg-card border border-border shadow-xl p-5 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-3 w-3 rounded-sm bg-primary/60" />
                  <div className="h-2 w-24 rounded bg-muted" />
                  <div className="ml-auto h-6 w-20 rounded-pill bg-yellow" />
                </div>
                <div className="space-y-2 mb-4">
                  {["Storytelling", "Coup de gueule", "Conseil"].map((label) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="h-7 rounded-pill bg-secondary px-3 flex items-center text-xs font-medium text-secondary-foreground">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="h-8 w-40 rounded-pill bg-primary/90 flex items-center justify-center text-xs font-medium text-primary-foreground">Trouver des idées</div>
                <div className="mt-4 grid grid-cols-7 gap-1">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <div key={i} className={`h-6 rounded-sm border border-border ${i === 3 || i === 9 ? "bg-cal-ready" : i === 7 ? "bg-cal-drafting" : ""}`} />
                  ))}
                </div>
              </div>
              <div className="absolute -z-10 -bottom-6 -right-6 w-full h-full bg-rose-soft/50 rounded-[40%_60%_50%_50%/60%_40%_60%_40%]" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── LE PROBLÈME ─── */}
      <section className="bg-rose-pale py-16 sm:py-20 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-10">Si tu te reconnais là-dedans...</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            {[
              { icon: "😩", text: "Tu postes quand tu y penses, sans stratégie, et tu as l'impression que ça mène nulle part." },
              { icon: "📱", text: "Tu passes des heures à chercher quoi dire, tu ouvres Instagram et tu refermes sans rien publier." },
              { icon: "🤷", text: "Tu sais que ta com' est importante mais tu ne sais pas par où commencer, ni comment t'organiser." },
            ].map((card, i) => (
              <div key={i} className="rounded-2xl bg-card border border-border p-6 shadow-sm animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <span className="text-2xl mb-3 block">{card.icon}</span>
                <p className="text-sm leading-relaxed text-foreground">{card.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-base italic text-muted-foreground max-w-lg mx-auto">
            "Le problème, c'est pas toi. C'est qu'on ne t'a jamais donné les bons outils."
          </p>
        </div>
      </section>

      {/* ─── CE QUE TU PEUX FAIRE (Features détaillées) ─── */}
      <section className="py-16 sm:py-20 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-3">Tout ce dont tu as besoin, au même endroit</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-12 text-base leading-relaxed">
            Pas un énième outil compliqué. Un assistant qui te dit quoi faire, te propose des idées, et t'aide à rester régulière.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {[
              {
                icon: <Palette className="h-6 w-6 text-primary" />,
                title: "Définis ta marque",
                desc: "Mission, cible, ton, positionnement : pose les fondations de ta com' avec le module Branding auto-save.",
                tag: "Branding",
              },
              {
                icon: <Lightbulb className="h-6 w-6 text-primary" />,
                title: "Trouve des idées de contenu",
                desc: "13 formats, 10 angles, recommandations intelligentes selon ton objectif. Plus jamais de panne d'inspiration.",
                tag: "Atelier d'idées",
              },
              {
                icon: <PenTool className="h-6 w-6 text-primary" />,
                title: "Rédige avec un guide",
                desc: "Flow en 5 étapes : structure, accroches, premier jet, édition, checklist qualité. De l'idée au post publié.",
                tag: "Rédaction guidée",
              },
              {
                icon: <CalendarDays className="h-6 w-6 text-primary" />,
                title: "Planifie dans un calendrier",
                desc: "Calendrier éditorial visuel avec tags d'objectif colorés et jauge d'équilibre mensuel.",
                tag: "Calendrier",
              },
              {
                icon: <BarChart3 className="h-6 w-6 text-primary" />,
                title: "Équilibre ta stratégie",
                desc: "Visibilité, confiance, vente, crédibilité : visualise la répartition de ton contenu en un coup d'œil.",
                tag: "Objectifs",
              },
              {
                icon: <BookOpen className="h-6 w-6 text-primary" />,
                title: "Optimise ton Instagram",
                desc: "Bio, stories à la une, comptes inspirants, lancement : 6 sous-modules pour un profil qui convertit.",
                tag: "Instagram",
              },
            ].map((block, i) => (
              <div key={i} className="rounded-2xl bg-card border border-border p-5 shadow-sm hover:shadow-card-hover transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  {block.icon}
                  <span className="font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-pale text-bordeaux">{block.tag}</span>
                </div>
                <h3 className="font-display text-base font-bold mb-2">{block.title}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{block.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── POURQUOI C'EST DIFFÉRENT ─── */}
      <section className="bg-rose-pale py-16 sm:py-20 px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-5">Pas un outil IA de plus. Une vraie méthode dedans.</h2>
          <p className="text-[15px] text-muted-foreground leading-relaxed mb-12 max-w-xl mx-auto">
            L'Assistant Com' est construit sur la méthode Nowadays : 10 ans d'expérience en communication éthique, +50 créatrices accompagnées, des cours dans les plus grandes écoles (Arts Déco, Sup de Pub, ISCPA).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            {[
              { title: "Adapté à TON activité", desc: "Pas des conseils génériques. L'outil connaît ton projet, ta cible, ton ton." },
              { title: "Éthique par design", desc: "Zéro manipulation, zéro marketing d'urgence. De la com' humaine et sincère." },
              { title: "Créé par une experte", desc: "Derrière l'outil, il y a Laetitia, 10 ans de terrain, pas juste un algorithme." },
            ].map((item, i) => (
              <div key={i} className="rounded-2xl bg-card border border-border p-5 shadow-sm">
                <h3 className="font-display text-base font-bold mb-2 text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── POUR QUI ─── */}
      <section className="py-16 sm:py-20 px-4">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-8 text-center">C'est pour toi si...</h2>
          <ul className="space-y-4">
            {[
              "Tu es créatrice, artisane, coach, prestataire de services ou solopreneuse",
              "Tu veux te rendre visible sur les réseaux mais tu sais pas par où commencer",
              "Tu en as marre du marketing agressif et tu cherches une approche qui te ressemble",
              "Tu as besoin de structure sans te sentir enfermée dans un cadre rigide",
              "Tu veux un outil simple, pas une usine à gaz",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-[15px] text-foreground leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── ROADMAP (mise à jour) ─── */}
      <section className="bg-rose-pale py-16 sm:py-20 px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-12">Et ce n'est que le début.</h2>
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border sm:left-1/2 sm:-translate-x-px" />
            <div className="space-y-10 text-left">
              {[
                {
                  tag: "Disponible",
                  tagColor: "bg-cal-published text-foreground border-cal-published-border",
                  title: "Maintenant",
                  desc: "Branding complet • Atelier d'idées (13 formats) • Rédaction guidée en 5 étapes • Calendrier éditorial avec objectifs • Module Instagram (bio, highlights, inspiration, lancement)",
                },
                {
                  tag: "En cours",
                  tagColor: "bg-cal-drafting text-foreground border-cal-drafting-border",
                  title: "Bientôt",
                  desc: "LinkedIn et Blog dans l'atelier • Module SEO intégré • Templates de newsletters",
                },
                {
                  tag: "À venir",
                  tagColor: "bg-cal-idea text-foreground border-cal-idea-border",
                  title: "Prochainement",
                  desc: "Module Emailing • Site Web guidé • Presse & Influence • Analytics de contenu",
                },
              ].map((step, i) => (
                <div key={i} className="relative pl-14 sm:pl-0 sm:grid sm:grid-cols-2 sm:gap-8">
                  <div className="absolute left-4 top-1 h-5 w-5 rounded-sm bg-card border-2 border-primary sm:left-1/2 sm:-translate-x-1/2" />
                  <div className={`sm:text-right ${i % 2 === 1 ? "sm:col-start-2" : ""}`}>
                    <span className={`inline-block rounded-pill border px-3 py-0.5 text-xs font-semibold mb-2 ${step.tagColor}`}>{step.tag}</span>
                    <h3 className="font-display text-lg font-bold text-foreground">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-1">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── TÉMOIGNAGE ─── */}
      <section className="py-16 sm:py-20 px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-10">Elles parlent de Nowadays</h2>
          <blockquote className="rounded-2xl bg-card border border-border p-8 shadow-sm mb-8">
            <p className="text-base italic text-foreground leading-relaxed mb-4">
              "Laetitia a su comprendre notre projet et nos contraintes dès le départ. Elle est réactive, autonome, et surtout elle livre un travail qu'on n'a pas besoin de reprendre."
            </p>
            <cite className="text-sm font-medium text-muted-foreground not-italic">— La Coopérative Oasis</cite>
          </blockquote>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Enseignante à l'École des Arts Décoratifs (ENSAD-PSL), Sup de Pub, ISCPA.
            <br />
            Citée dans L'ADN, Capital, e-marketing.
          </p>
        </div>
      </section>

      {/* ─── CTA FINAL ─── */}
      <section className="relative py-16 sm:py-20 px-4 overflow-hidden" style={{ background: "linear-gradient(180deg, hsl(340 100% 97%) 0%, hsl(340 33% 99%) 100%)" }}>
        <div className="absolute -top-16 -left-24 w-72 h-56 bg-rose-soft/30 rounded-[60%_40%_70%_30%/50%_60%_40%_50%] blur-3xl pointer-events-none" />
        <div className="mx-auto max-w-2xl text-center relative">
          <h2 className="font-display text-2xl sm:text-[36px] font-bold mb-4">Ta com' mérite mieux que l'improvisation.</h2>
          <p className="text-muted-foreground mb-8 text-base">
            Rejoins L'Assistant Com' gratuitement et commence à structurer ta visibilité dès aujourd'hui.
          </p>
          <div className="text-left max-w-lg mx-auto">
            <SignupForm />
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-foreground text-background py-10 px-4">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <span className="font-display text-lg font-bold">L'Assistant Com'</span>
            <span className="block text-sm text-background/60 mt-0.5">par Nowadays Agency</span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link to="/" className="text-background/70 hover:text-background transition-colors">Accueil</Link>
            <Link to="/login" className="text-background/70 hover:text-background transition-colors">Se connecter</Link>
            <span className="text-background/40">Mentions légales</span>
          </nav>
          <div className="flex items-center gap-4">
            <a href="https://instagram.com/nowadaysagency" target="_blank" rel="noopener noreferrer" className="text-background/70 hover:text-background transition-colors">
              <Instagram className="h-5 w-5" />
            </a>
          </div>
        </div>
        <div className="mx-auto max-w-5xl mt-6 pt-6 border-t border-background/10 text-center text-xs text-background/40">
          © 2026 Nowadays Agency. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}
