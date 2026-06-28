import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AiDebugPanel from "@/components/admin/AiDebugPanel";
import { useAuth } from "@/contexts/AuthContext";

export default function AiDebugShortcut() {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Réservé aux admins : aucun listener n'est attaché pour les autres utilisatrices.
    if (!isAdmin) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">🧪 Diagnostic IA</DialogTitle>
        </DialogHeader>
        <AiDebugPanel />
      </DialogContent>
    </Dialog>
  );
}
