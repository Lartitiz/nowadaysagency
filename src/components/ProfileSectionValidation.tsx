import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

type ProfileSection = "nom" | "bio" | "stories" | "epingles" | "feed" | "edito";

/**
 * Carte « Marquer comme optimisé » d'un élément de profil.
 *
 * La table `audit_validations` est clé (user_id, section), RLS owner-only et
 * SANS colonne workspace_id : on lit/écrit donc par user_id (auth.uid()), jamais
 * par le filtre workspace (cf. badges.ts et le schéma de la table). C'est ce qui
 * alimente la barre « X/N optimisés » du profil — voir InstagramProfile.tsx.
 */
export default function ProfileSectionValidation({ section }: { section: ProfileSection }) {
  const { user } = useAuth();
  const [validated, setValidated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (supabase.from("audit_validations") as any)
      .select("status")
      .eq("user_id", user.id)
      .eq("section", section)
      .maybeSingle()
      .then(({ data }: any) => {
        if (active) {
          setValidated(data?.status === "validated");
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [user?.id, section]);

  const setStatus = async (next: boolean) => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("audit_validations").upsert({
        user_id: user.id,
        section,
        status: next ? "validated" : "pending",
        validated_at: next ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id,section" });
      if (error) throw error;
      setValidated(next);
      toast.success(next ? "✅ Élément marqué comme optimisé" : "Marquage retiré");
    } catch (e) {
      console.error("audit_validations upsert:", e);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className={`mt-8 rounded-2xl border p-5 flex items-center justify-between gap-4 flex-wrap ${validated ? "border-success bg-success-bg/40" : "border-border bg-card"}`}>
      <div>
        <p className="text-sm font-bold text-foreground">
          {validated ? "✅ Élément optimisé" : "Tu as optimisé cet élément ?"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {validated
            ? "Il est compté dans ta progression de profil. Tu peux revenir le peaufiner quand tu veux."
            : "Marque-le comme optimisé pour le compter dans la barre « optimisés » de ton profil."}
        </p>
      </div>
      {validated ? (
        <Button variant="outline" size="sm" className="rounded-pill shrink-0" disabled={saving} onClick={() => setStatus(false)}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Retirer"}
        </Button>
      ) : (
        <Button size="sm" className="rounded-pill gap-1.5 shrink-0" disabled={saving} onClick={() => setStatus(true)}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Marquer comme optimisé
        </Button>
      )}
    </div>
  );
}
