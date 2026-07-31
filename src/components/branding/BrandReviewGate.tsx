import { useNavigate } from "react-router-dom";
import { IdCard, ArrowRight } from "lucide-react";

/* ── Écran d'attente : la fiche de marque avant le premier contenu ─────────
   Tant que la fiche captée à l'inscription n'est pas validée, la marque n'est
   pas encore écrite dans les tables lues par la génération : le contenu créé
   serait générique. La prochaine action n'est donc pas « créer », c'est
   « valider sa fiche » — et c'est ce que dit cet écran.
   ── */

export default function BrandReviewGate() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-card rounded-[20px] shadow-card border border-border p-6 sm:p-9 text-center">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-rose-pale mb-4">
          <IdCard className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl text-foreground mb-3" style={{ fontWeight: 400 }}>
          Ta fiche de marque t'attend
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto mb-6">
          C'est elle que j'utilise pour écrire à ta place : ton histoire, ta cible, ton ton, tes offres.
          Relis-la une fois — ça prend une minute — et tes contenus parleront vraiment de toi.
          Sinon, j'écris à l'aveugle.
        </p>
        <button
          onClick={() => navigate("/branding?from=onboarding&next=creer")}
          className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-6 py-3 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg"
        >
          Valider ma fiche de marque <ArrowRight className="h-4 w-4" />
        </button>
        <p className="text-xs text-muted-foreground mt-4">
          Tu pourras tout modifier ensuite depuis ton Branding.
        </p>
      </div>
    </div>
  );
}
