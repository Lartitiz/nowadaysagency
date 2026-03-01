import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { getBrandingCompletion } from "@/lib/branding-completion";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { ArrowRight } from "lucide-react";

interface Props {
  /** Which section to check: 'global' | 'tone' | 'proposition' | 'strategie' */
  section?: "global" | "tone" | "proposition" | "strategie";
  /** Custom message override */
  message?: string;
  /** Link text */
  linkText?: string;
  /** Link destination */
  linkTo?: string;
}

export default function BrandingPrompt({ section = "global", message, linkText, linkTo }: Props) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    getBrandingCompletion({ column, value }).then(({ percent, toneComplete }) => {
      if (section === "global" && percent < 50) setShow(true);
      else if (section === "tone" && !toneComplete) setShow(true);
      // proposition and strategie always show (not yet available)
      else if (section === "proposition") setShow(true);
      else if (section === "strategie") setShow(true);
    });
  }, [user, section]);

  if (!show) return null;

  const defaults: Record<string, { msg: string; link: string; to: string }> = {
    global: {
      msg: "💡 Tes idées seront encore plus pertinentes si tu complètes ton Branding.",
      link: "Aller au Branding →",
      to: "/branding",
    },
    tone: {
      msg: "✨ L'IA peut écrire dans ton style exact si tu remplis la section 'Mon ton & style'.",
      link: "Définir mon style →",
      to: "/branding/section?section=tone_style",
    },
    proposition: {
      msg: "❤️ Ta bio sera plus percutante avec ta proposition de valeur.",
      link: "La définir →",
      to: "/branding",
    },
    strategie: {
      msg: "🍒 L'équilibre recommandé sera personnalisé quand tu auras posé ta stratégie de contenu.",
      link: "Poser ma stratégie →",
      to: "/branding/section?section=content_strategy",
    },
  };

  const d = defaults[section];

  return (
    <div className="rounded-xl border border-accent bg-accent/20 px-4 py-3 mb-6 flex items-center justify-between gap-3 animate-fade-in">
      <p className="text-[13px] text-foreground">{message || d.msg}</p>
      <Link
        to={linkTo || d.to}
        className="shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
      >
        {linkText || d.link}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
