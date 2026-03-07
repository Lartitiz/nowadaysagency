import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordStrengthIndicator from "@/components/ui/PasswordStrengthIndicator";
import { CheckCircle2 } from "lucide-react";

const signupSchema = z.object({
  prenom: z.string().trim().min(2, "Ton prénom doit faire au moins 2 caractères").max(50),
  email: z.string().trim().email("Entre une adresse email valide"),
  password: z.string().min(8, "Ton mot de passe doit faire au moins 8 caractères"),
  activite: z.string().optional(),
});
type SignupValues = z.infer<typeof signupSchema>;

export default function SignupForm({ compact = false }: { compact?: boolean }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { prenom: "", email: "", password: "", activite: "" },
  });

  const onSubmit = async (values: SignupValues) => {
    setLoading(true);
    try {
      localStorage.setItem("lac_prenom", values.prenom);
      localStorage.setItem("lac_activite", values.activite?.trim() || "");
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data.user) {
        await supabase.from("profiles").insert({
          user_id: data.user.id,
          prenom: values.prenom,
          activite: values.activite?.trim() || "",
        });
      }
      setSuccess(true);
      toast({ title: "Compte créé !", description: "Vérifie tes emails pour confirmer ton inscription." });
    } catch (error: any) {
      const msg = error.message;
      if (msg === "User already registered") {
        toast({
          title: "Tu as déjà un compte !",
          description: (<span>Connecte-toi ici : <a href="/login" className="underline font-medium text-primary">page de connexion</a></span>) as any,
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
      <div className="rounded-2xl bg-card border border-border p-6 text-center space-y-2 animate-reveal-scale">
        <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
        <p className="font-display text-lg font-bold text-foreground">Presque là !</p>
        <p className="text-sm text-muted-foreground">Un email de confirmation vient d'être envoyé. Clique sur le lien pour activer ton compte.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" aria-label="Formulaire d'inscription">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="signup-prenom" className="sr-only">Prénom</label>
          <Input id="signup-prenom" {...register("prenom")} placeholder="Ton prénom" aria-required="true" className="rounded-xl h-12 bg-card border-border" />
          {errors.prenom && <p className="text-destructive text-xs mt-1" role="alert">{errors.prenom.message}</p>}
        </div>
        <div>
          <label htmlFor="signup-email" className="sr-only">Email</label>
          <Input id="signup-email" type="email" {...register("email")} placeholder="Ton email" aria-required="true" className="rounded-xl h-12 bg-card border-border" />
          {errors.email && <p className="text-destructive text-xs mt-1" role="alert">{errors.email.message}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="signup-activite" className="sr-only">Activité</label>
          <Input id="signup-activite" {...register("activite")} placeholder="Ex : photographe, coach, artisane..." className="rounded-xl h-12 bg-card border-border" />
        </div>
        <div>
          <label htmlFor="signup-password" className="sr-only">Mot de passe</label>
          <Input id="signup-password" type="password" {...register("password")} placeholder="Mot de passe (8 car. min.)" aria-required="true" className="rounded-xl h-12 bg-card border-border" />
          {errors.password && <p className="text-destructive text-xs mt-1" role="alert">{errors.password.message}</p>}
          <PasswordStrengthIndicator password={watch("password") || ""} />
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" required className="mt-0.5 accent-primary" />
        <span>
          J'accepte les{" "}
          <a href="/cgu-cgv" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">CGU / CGV</a>
          {" "}et la{" "}
          <a href="/confidentialite" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">politique de confidentialité</a>.
        </span>
      </label>
      <Button type="submit" disabled={loading} className="w-full sm:w-auto h-12 rounded-pill px-10 text-base font-medium">
        {loading ? "Un instant..." : "🚀 Commencer gratuitement"}
      </Button>
      <p className="text-xs text-muted-foreground">Gratuit. Sans carte bancaire. En 30 secondes.</p>
    </form>
  );
}
