import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check for recovery event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Mot de passe mis à jour !", description: "Tu peux maintenant te connecter." });
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Erreur technique:", error);
      toast({ title: "Erreur", description: friendlyError(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold text-bordeaux">L'Assistant Com'</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">par Nowadays Agency</p>
        </div>
        <div className="rounded-2xl bg-card p-8 shadow-sm border border-border">
          <h2 className="font-display text-2xl font-semibold text-center mb-2">Nouveau mot de passe</h2>
          <p className="text-center text-muted-foreground text-sm mb-6">Choisis un nouveau mot de passe sécurisé.</p>
          {!ready ? (
            <p className="text-center text-sm text-muted-foreground">Chargement...</p>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <Input
                type="password"
                placeholder="Nouveau mot de passe (8 car. min.)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="rounded-[10px] border-border bg-background h-12"
              />
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux transition-colors text-base font-medium"
              >
                {loading ? "Un instant..." : "Mettre à jour"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
