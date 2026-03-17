import { useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";

const SECTION_LABELS: Record<string, string> = {
  storytelling: "ton histoire",
  persona: "ta cible",
  proposition: "ta proposition de valeur",
  tone: "ton ton & tes combats",
  strategy: "ta ligne éditoriale",
  offers: "tes offres",
};

export default function BrandingStatusBanner() {
  const [dismissed, setDismissed] = useState(false);
  const filter = useWorkspaceFilter();

  const { data: completion } = useQuery({
    queryKey: ["branding-completion-banner", filter.column, filter.value],
    queryFn: async () => {
      const raw = await fetchBrandingData(filter);
      return calculateBrandingCompletion(raw);
    },
    staleTime: 5 * 60 * 1000,
  });

  if (dismissed || !completion) return null;

  const missing = (["storytelling", "persona", "proposition", "tone", "strategy", "offers"] as const)
    .filter((k) => completion[k] < 50)
    .map((k) => SECTION_LABELS[k]);

  const total = completion.total;

  if (total >= 80) {
    return (
      <Banner onDismiss={() => setDismissed(true)}>
        ✨ Ton identité de marque est bien remplie : l'IA va personnaliser ce contenu avec ton ton, ta cible et tes valeurs.
      </Banner>
    );
  }

  if (total >= 40) {
    return (
      <Banner onDismiss={() => setDismissed(true)}>
        💡 Ton contenu sera plus pertinent si tu complètes ton identité de marque.
        {missing.length > 0 && <> Il te manque : {missing.join(", ")}. </>}
        <Link to="/branding" className="text-[#FB3D80] hover:underline font-medium ml-1">
          Compléter →
        </Link>
      </Banner>
    );
  }

  return (
    <Banner onDismiss={() => setDismissed(true)}>
      🎯 Pour que l'IA génère du contenu qui te ressemble, commence par remplir ton identité de marque.{" "}
      <Link to="/branding" className="text-[#FB3D80] hover:underline font-medium">
        Commencer →
      </Link>
    </Banner>
  );
}

function Banner({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div className="bg-[#FFF4F8] border border-[#FFD6E8] rounded-2xl px-4 py-3 flex items-start gap-3 font-sans text-sm text-foreground">
      <div className="flex-1">{children}</div>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5">
        <X size={14} />
      </button>
    </div>
  );
}
