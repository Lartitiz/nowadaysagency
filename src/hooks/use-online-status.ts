import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

/**
 * Détecte la perte de connexion et affiche un toast.
 * À utiliser une seule fois dans un composant racine (App ou AnimatedRoutes).
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { toast } = useToast();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({ title: "Connexion rétablie ✨", description: "Tu es de retour en ligne." });
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "Connexion perdue",
        description: "Vérifie ta connexion internet. Tes modifications ne seront pas sauvegardées.",
        variant: "destructive",
        duration: 10000,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [toast]);

  return isOnline;
}
