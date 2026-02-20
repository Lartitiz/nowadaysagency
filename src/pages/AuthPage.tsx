import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const { toast } = useToast();

  // If already logged in, redirect handled by AuthContext
  if (user) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        toast({
          title: "Compte créé !",
          description: "Vérifie tes emails pour confirmer ton inscription.",
        });
      } else {
        await signIn(email, password);
      }
    } catch (error: any) {
      toast({
        title: "Oups !",
        description: error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : error.message === "Email not confirmed"
          ? "Confirme ton email d'abord !"
          : error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-rose-pale px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold text-bordeaux">
            L'Assistant Com'
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">par Nowadays Agency</p>
          <span className="mt-2 inline-block rounded-pill bg-secondary px-3 py-1 text-xs font-medium text-primary">
            beta
          </span>
        </div>

        <div className="rounded-2xl bg-card p-8 shadow-sm border border-border">
          <h2 className="font-display text-2xl font-semibold text-center mb-2">
            {isSignUp ? "Crée ton compte" : "Bon retour !"}
          </h2>
          <p className="text-center text-muted-foreground text-sm mb-6">
            {isSignUp
              ? "Rejoins ton copilote de com'"
              : "Ton atelier t'attend"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="ton@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-[10px] border-border bg-background h-12"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="rounded-[10px] border-border bg-background h-12"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux transition-colors text-base font-medium"
            >
              {loading ? "Un instant..." : isSignUp ? "C'est parti !" : "Se connecter"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignUp ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary font-medium hover:underline"
            >
              {isSignUp ? "Se connecter" : "Créer un compte"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
