import { useState, useEffect } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "ai_disclaimer_seen";

export default function AiDisclaimerBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  };

  return (
    <div className="mx-4 mt-4 rounded-xl bg-[hsl(260,60%,97%)] border-l-[3px] border-[hsl(263,70%,58%)] px-5 py-4 flex items-start gap-3 animate-fade-in">
      <span className="text-lg mt-0.5">🤖</span>
      <div className="flex-1 text-sm text-foreground leading-relaxed">
        Cet outil utilise l'intelligence artificielle pour t'aider à structurer ta communication.{" "}
        <strong>L'IA propose, toi tu décides.</strong> Chaque contenu généré est une base de travail à personnaliser avec ta voix et ton expérience.
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
      >
        OK 👍
      </button>
    </div>
  );
}
