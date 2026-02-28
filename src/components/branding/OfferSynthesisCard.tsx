import { Copy, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: "💎 Payante", className: "bg-violet-50 text-violet-700" },
  free: { label: "🎁 Gratuite", className: "bg-emerald-50 text-emerald-700" },
  service: { label: "🎤 Service", className: "bg-amber-50 text-amber-700" },
};

function SynthCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-card shadow-sm p-5 sm:p-6 ${className}`}>{children}</div>;
}

function SectionLabel({ emoji, title }: { emoji: string; title: string }) {
  return (
    <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground flex items-center gap-1.5">
      <span>{emoji}</span> {title}
    </p>
  );
}

function HeroQuote({ text, onCopy }: { text: string; onCopy?: () => void }) {
  return (
    <div className="rounded-xl p-5 sm:p-6 bg-[#FFF4F8] border border-[#ffa7c6]/30">
      <p className="font-display text-base sm:text-lg font-bold text-foreground italic text-center leading-relaxed">"{text}"</p>
      {onCopy && (
        <div className="flex justify-end mt-3">
          <button onClick={onCopy} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-70 transition-opacity">
            <Copy className="h-3 w-3" /> Copier
          </button>
        </div>
      )}
    </div>
  );
}

interface OfferData {
  id: string;
  name: string;
  offer_type: string;
  price_text?: string;
  description_short?: string;
  promise?: string;
  promise_long?: string;
  sales_line?: string;
  problem_surface?: string;
  problem_deep?: string;
  target_ideal?: string;
  target_not_for?: string;
  trigger_situation?: string;
  emotional_before?: string;
  emotional_after?: string;
  feelings_after?: string[];
  features?: Array<{ feature: string; benefit?: string }> | string[];
  benefits?: string[];
  features_to_benefits?: Array<{ feature: string; benefit: string }>;
  objections?: Array<{ objection: string; response: string; emoji?: string }>;
  testimonials?: Array<{ name: string; sector: string; result: string; quote: string }>;
  completed?: boolean;
  completion_pct?: number;
}

interface OfferSynthesisCardProps {
  offer: OfferData;
  onEdit?: () => void;
}

export default function OfferSynthesisCard({ offer, onEdit }: OfferSynthesisCardProps) {
  const badge = TYPE_BADGE[offer.offer_type] || TYPE_BADGE.paid;
  const copyText = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copié !"); };

  const hasTransformation = offer.emotional_before || offer.emotional_after;
  const hasProblem = offer.problem_deep || offer.problem_surface;
  const hasPromise = offer.promise || offer.promise_long;
  const hasTarget = offer.target_ideal;
  const ftb = offer.features_to_benefits?.filter(f => f.feature);
  const objections = offer.objections?.filter(o => o.objection);
  const testimonials = offer.testimonials?.filter(t => t.quote);

  return (
    <div className="space-y-4">
      {/* Bloc 1: Header */}
      <SynthCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-display text-xl font-bold text-foreground">{offer.name}</h3>
            {offer.description_short && <p className="text-sm text-muted-foreground">{offer.description_short}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.className}`}>{badge.label}</span>
            {offer.price_text && <span className="text-primary font-semibold text-sm">{offer.price_text}</span>}
          </div>
        </div>
      </SynthCard>

      {/* Bloc 2: Sales line */}
      {offer.sales_line && (
        <HeroQuote text={offer.sales_line} onCopy={() => copyText(offer.sales_line!)} />
      )}

      {/* Bloc 3: Transformation */}
      {hasTransformation && (
        <SynthCard>
          <SectionLabel emoji="🔀" title="La transformation" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {offer.emotional_before && (
              <div className="rounded-lg p-4 bg-muted/30">
                <p className="font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Avant</p>
                <p className="text-sm text-foreground italic">{offer.emotional_before}</p>
              </div>
            )}
            {offer.emotional_after && (
              <div className="rounded-lg p-4 bg-[#FFF4F8]">
                <p className="font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Après</p>
                <p className="text-sm text-foreground italic">{offer.emotional_after}</p>
              </div>
            )}
          </div>
          {offer.feelings_after && offer.feelings_after.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {offer.feelings_after.map((f, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-[#FFF4F8] text-primary font-medium">{f}</span>
              ))}
            </div>
          )}
        </SynthCard>
      )}

      {/* Bloc 4: Problem */}
      {hasProblem && (
        <SynthCard>
          <SectionLabel emoji="🎯" title="Le problème profond" />
          <p className="text-sm text-foreground italic">{offer.problem_deep || offer.problem_surface}</p>
        </SynthCard>
      )}

      {/* Bloc 5: Promise */}
      {hasPromise && (
        <SynthCard>
          <SectionLabel emoji="✨" title="La promesse" />
          <p className="text-sm text-foreground font-bold">{offer.promise}</p>
          {offer.promise_long && offer.promise_long !== offer.promise && (
            <p className="text-sm text-foreground mt-2">{offer.promise_long}</p>
          )}
        </SynthCard>
      )}

      {/* Bloc 6: Target */}
      {hasTarget && (
        <SynthCard>
          <SectionLabel emoji="👤" title="Pour qui" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg p-4 bg-emerald-50/50">
              <p className="font-mono-ui text-[10px] uppercase tracking-wider text-emerald-600 mb-2">✅ C'est pour elle si…</p>
              <p className="text-sm text-foreground">{offer.target_ideal}</p>
            </div>
            {offer.target_not_for && (
              <div className="rounded-lg p-4 bg-red-50/50">
                <p className="font-mono-ui text-[10px] uppercase tracking-wider text-red-500 mb-2">🚫 C'est pas pour elle si…</p>
                <p className="text-sm text-foreground">{offer.target_not_for}</p>
              </div>
            )}
          </div>
          {offer.trigger_situation && (
            <div className="rounded-lg p-4 bg-amber-50/50 mt-3">
              <p className="font-mono-ui text-[10px] uppercase tracking-wider text-amber-600 mb-2">💡 Le déclic</p>
              <p className="text-sm text-foreground">{offer.trigger_situation}</p>
            </div>
          )}
        </SynthCard>
      )}

      {/* Bloc 7: Features → Benefits */}
      {ftb && ftb.length > 0 && (
        <SynthCard>
          <SectionLabel emoji="🔗" title="Ce que tu offres → Ce qu'elle entend" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left p-2.5 font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground">Feature</th>
                  <th className="text-left p-2.5 font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground">Bénéfice</th>
                </tr>
              </thead>
              <tbody>
                {ftb.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2.5 text-foreground">{row.feature}</td>
                    <td className="p-2.5 text-foreground">{row.benefit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SynthCard>
      )}

      {/* Bloc 8: Objections */}
      {objections && objections.length > 0 && (
        <SynthCard>
          <SectionLabel emoji="🤔" title="Objections anticipées" />
          <div className="space-y-2.5">
            {objections.map((obj, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <p className="text-sm font-bold text-foreground">{obj.emoji && `${obj.emoji} `}"{obj.objection}"</p>
                <p className="text-sm text-muted-foreground mt-1">→ {obj.response}</p>
              </div>
            ))}
          </div>
        </SynthCard>
      )}

      {/* Bloc 9: Testimonials */}
      {testimonials && testimonials.length > 0 && (
        <SynthCard>
          <SectionLabel emoji="💬" title="Témoignages" />
          <div className="space-y-3">
            {testimonials.map((t, i) => (
              <div key={i} className="rounded-lg bg-muted/20 p-4">
                <p className="text-sm italic text-foreground">"{t.quote}"</p>
                <p className="text-xs text-muted-foreground mt-2">— {t.name}{t.sector && `, ${t.sector}`}{t.result && ` · ${t.result}`}</p>
              </div>
            ))}
          </div>
        </SynthCard>
      )}

      {/* Footer */}
      <div className="flex flex-col items-center gap-3 pt-2">
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
            <Pencil className="h-3.5 w-3.5" /> Modifier cette offre
          </Button>
        )}
        <p className="font-mono-ui text-[10px] text-muted-foreground">L'Assistant Com' × Nowadays Agency</p>
      </div>
    </div>
  );
}
