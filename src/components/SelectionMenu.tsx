import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Copy, Replace, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";

const SELECTION_ACTIONS = [
  { id: "rewrite", icon: "✨", label: "Reformuler", prompt: "Reformule ce texte en gardant le même sens mais avec des mots différents. Garde le même ton et la même longueur." },
  { id: "expand", icon: "📝", label: "Développer", prompt: "Développe ce texte en ajoutant plus de détails, des exemples concrets ou des arguments. Double la longueur environ." },
  { id: "shorten", icon: "✂️", label: "Raccourcir", prompt: "Raccourcis ce texte en gardant l'essentiel. Divise la longueur par 2 environ." },
  { id: "add_cta", icon: "🎯", label: "Ajouter un CTA", prompt: "Ajoute un appel à l'action naturel et engageant à la fin de ce texte. Le CTA doit être cohérent avec le contenu." },
  { id: "punchier", icon: "🔥", label: "Rendre plus percutant", prompt: "Réécris ce texte pour qu'il soit plus percutant, plus direct, plus accrocheur. Utilise des phrases courtes qui claquent. Garde le même message." },
  { id: "hook", icon: "🪝", label: "Transformer en hook", prompt: "Transforme ce texte en accroche captivante pour les premières secondes d'un Reel ou le début d'un post. Max 2 phrases." },
  { id: "custom", icon: "💬", label: "Demander autre chose...", prompt: null },
] as const;

interface SelectionMenuProps {
  selectedText: string;
  position: { top: number; left: number };
  isVisible: boolean;
  onAction: (text: string, prompt: string) => Promise<string>;
  onClose: () => void;
}

export default function SelectionMenu({ selectedText, position, isVisible, onAction, onClose }: SelectionMenuProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const isMobile = useIsMobile();

  if (!isVisible) return null;

  const reset = () => {
    setShowCustom(false);
    setCustomPrompt("");
    setIsLoading(false);
    setResult(null);
  };

  const handleAction = async (actionId: string) => {
    if (actionId === "custom") {
      setShowCustom(true);
      return;
    }
    const action = SELECTION_ACTIONS.find((a) => a.id === actionId);
    if (!action?.prompt) return;
    setIsLoading(true);
    try {
      const res = await onAction(selectedText, action.prompt);
      setResult(res);
    } catch {
      toast.error("Erreur lors du traitement IA");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomSubmit = async () => {
    if (!customPrompt.trim()) return;
    setIsLoading(true);
    try {
      const res = await onAction(selectedText, customPrompt);
      setResult(res);
    } catch {
      toast.error("Erreur lors du traitement IA");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      toast.success("Copié !");
    }
  };

  const handleDismiss = () => {
    reset();
    onClose();
  };

  // Mobile: bottom sheet
  if (isMobile) {
    return createPortal(
      <AnimatePresence>
        {isVisible && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground"
              style={{ zIndex: 9999 }}
              onClick={handleDismiss}
            />
            <motion.div
              data-selection-menu
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-card rounded-t-2xl border-t border-border max-h-[50vh] overflow-y-auto"
              style={{ zIndex: 9999 }}
            >
              <div className="w-12 h-1 bg-muted-foreground/20 rounded-full mx-auto mt-3 mb-2" />
              {renderContent()}
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
    );
  }

  // Desktop: floating menu
  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div
          data-selection-menu
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="fixed"
          style={{
            zIndex: 9999,
            top: `${position.top - 8}px`,
            left: `${position.left}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="relative">
            <div className="bg-card rounded-xl shadow-lg border border-border overflow-hidden">
              {renderContent()}
            </div>
            {/* Triangle pointer */}
            <div className="absolute left-1/2 -bottom-[6px] -translate-x-1/2 w-3 h-3 rotate-45 bg-card border-r border-b border-border" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );

  function renderContent() {
    if (result) {
      return (
        <div className="p-4 max-w-sm">
          <p className="text-sm text-foreground leading-relaxed mb-3 whitespace-pre-wrap">{result}</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(result);
                toast.success("Copié ! Colle-le où tu veux 😊");
                handleDismiss();
              }}
              className="bg-primary text-primary-foreground text-xs rounded-lg px-3 py-1.5 flex items-center gap-1"
            >
              <Copy className="h-3 w-3" /> Copier
            </button>
            <button onClick={() => setResult(null)} className="text-muted-foreground text-xs px-2 py-1.5">
              ← Retour
            </button>
            <button onClick={handleDismiss} className="text-muted-foreground text-xs px-2 py-1.5 ml-auto">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          L'IA réfléchit...
        </div>
      );
    }

    if (showCustom) {
      return (
        <div className="p-3 w-72">
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Dis-moi ce que tu veux faire avec ce texte..."
            className="w-full text-sm border border-input rounded-lg p-2 resize-none h-20 bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-ring/20"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setShowCustom(false)} className="text-xs text-muted-foreground px-3 py-1.5">
              Annuler
            </button>
            <button
              onClick={handleCustomSubmit}
              disabled={!customPrompt.trim()}
              className="bg-primary text-primary-foreground text-xs rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              Envoyer →
            </button>
          </div>
        </div>
      );
    }

    // Action list
    return (
      <div className="py-1">
        {SELECTION_ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => handleAction(action.id)}
            className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors flex items-center gap-2.5"
          >
            <span className="text-base">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    );
  }
}
