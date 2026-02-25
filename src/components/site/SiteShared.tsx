import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface HomepageData {
  hook_title: string;
  hook_subtitle: string;
  hook_image_done: boolean;
  problem_block: string;
  benefits_block: string;
  offer_block: string;
  presentation_block: string;
  social_proof_done: boolean;
  faq: { question: string; reponse: string }[];
  cta_primary: string;
  cta_secondary: string;
  cta_objective: string;
  cta_micro_copy: string;
  layout_notes: string;
  layout_done: boolean;
  current_step: number;
  completed: boolean;
  framework: string;
  plan_steps: { number: number; title: string; description: string }[];
  guarantee_type: string;
  guarantee_text: string;
  failure_block: string;
  storybrand_data: any;
  page_type: string;
  offer_name: string;
  offer_price: string;
  offer_included: string;
  offer_payment: string;
  offer_comparison: string;
  for_who_ideal: string;
  for_who_not: string;
  seo_title: string;
  seo_meta: string;
  seo_h1: string;
  checklist_data: any;
}

export interface StepProps {
  data: HomepageData;
  save: (u: Partial<HomepageData>) => void;
  callAI: (action: string, params?: any) => Promise<any>;
  aiLoading: string | null;
  aiResults: Record<string, any>;
  copyText: (t: string) => void;
}

export function AISuggestions({ items, onSelect }: { items: string[]; onSelect: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {items.map((item, i) => (
        <button key={i} onClick={() => onSelect(item)} className="text-left text-[13px] px-3 py-2 rounded-xl border border-border bg-card hover:border-primary hover:bg-rose-pale transition-all">
          {item}
        </button>
      ))}
    </div>
  );
}

export function HelpBlock({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline mb-2">
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export const EMPTY: HomepageData = {
  hook_title: "", hook_subtitle: "", hook_image_done: false,
  problem_block: "", benefits_block: "", offer_block: "",
  presentation_block: "", social_proof_done: false,
  faq: [], cta_primary: "", cta_secondary: "", cta_objective: "", cta_micro_copy: "",
  layout_notes: "", layout_done: false, current_step: 1, completed: false,
  framework: "emotional", plan_steps: [], guarantee_type: "", guarantee_text: "",
  failure_block: "", storybrand_data: null,
  page_type: "home", offer_name: "", offer_price: "", offer_included: "",
  offer_payment: "", offer_comparison: "", for_who_ideal: "", for_who_not: "",
  seo_title: "", seo_meta: "", seo_h1: "", checklist_data: null,
};

export const STEPS = [
  { icon: "🎯", label: "Ton hook" },
  { icon: "😩", label: "Problème" },
  { icon: "✨", label: "Transformation" },
  { icon: "🗺️", label: "Le plan" },
  { icon: "💰", label: "Offre/Prix" },
  { icon: "🎯", label: "Pour qui" },
  { icon: "👋", label: "Qui tu es" },
  { icon: "🛡️", label: "Garantie" },
  { icon: "🦋", label: "FAQ + CTA" },
  { icon: "🔍", label: "SEO + Récap" },
];

export const FRAMEWORKS = [
  { value: "emotional", emoji: "💛", label: "Séquence émotionnelle", desc: "Empathie → Espoir → Confiance → Action. Le plus polyvalent.", recommended: true },
  { value: "storybrand", emoji: "📖", label: "StoryBrand (narratif)", desc: "Ta cliente est l'héroïne. Toi, tu es le guide. Idéal pour raconter une histoire." },
  { value: "pas", emoji: "⚡", label: "PAS (Problème · Agitation · Solution)", desc: "Direct et efficace. Pour les offres simples ou les pages de capture premium." },
];

export const PAGE_TYPES = [
  { value: "home", emoji: "🏠", label: "Page d'accueil", desc: "Le hub de ton site : positionnement, offres, preuves. 6-8 sections courtes." },
  { value: "sales", emoji: "💰", label: "Page de vente", desc: "Vendre ton offre : coaching, service, produit, programme. 10-12 sections (long-form)." },
  { value: "services", emoji: "🏛️", label: "Page de services", desc: "Présenter tes services B2B, CTA = appel découverte. 6-8 sections." },
  { value: "capture", emoji: "🎁", label: "Page de capture", desc: "Récolter des emails avec un lead magnet. 3-4 éléments.", isLink: true, to: "/site/capture" },
  { value: "about", emoji: "👤", label: "Page à propos", desc: "Raconter ton histoire, créer la confiance. 4-5 sections.", isLink: true, to: "/site/a-propos" },
];

export const CTA_OBJECTIVES = [
  { value: "buy", label: "Acheter en ligne" },
  { value: "boutique", label: "Venir en boutique" },
  { value: "devis", label: "Demander un devis" },
  { value: "call", label: "Réserver un appel" },
  { value: "inscription", label: "S'inscrire" },
];

export const GUARANTEE_TYPES = [
  { value: "refund", emoji: "💸", label: "Satisfaite ou remboursée" },
  { value: "call", emoji: "📞", label: "Appel découverte gratuit" },
  { value: "trial", emoji: "🔄", label: "Période d'essai" },
  { value: "none", emoji: "❌", label: "Pas de garantie" },
];

export const OFFER_TYPES = [
  { value: "formation", label: "🎓 Formation/Accompagnement" },
  { value: "services", label: "🏛️ Services/Agency" },
  { value: "leadmagnet", label: "🎁 Lead magnet" },
  { value: "autre", label: "Autre" },
];
