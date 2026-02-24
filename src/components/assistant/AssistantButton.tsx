import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import AssistantPanel from "./AssistantPanel";
import { useSession } from "@/contexts/SessionContext";

export default function AssistantButton() {
  const { isActive: sessionActive } = useSession();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (sessionActive) return null;
  if (!user) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed z-50 rounded-full w-14 h-14 flex items-center justify-center",
            "bg-primary text-primary-foreground shadow-lg",
            "hover:scale-105 transition-transform duration-200",
            "bottom-5 right-5 md:bottom-6 md:right-6",
            // Above mobile tab bar
            "max-md:bottom-20"
          )}
          aria-label="Ouvrir l'assistant"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  );
}
