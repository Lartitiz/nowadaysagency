import { useState, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

// ── Types ──

export type ElementStatus = "ok" | "improve" | "critical";

export interface BioLine {
  texte: string;
  status: ElementStatus;
  commentaire: string;
}

export interface AuditElement {
  element: string;
  label: string;
  status: ElementStatus;
  current: string;
  verdict: string;
  conseil?: string | null;
  proposition?: string | null;
  lignes?: BioLine[];
  link_to?: string;
  link_label?: string;
}

export interface AuditPriority {
  element: string;
  message: string;
}

export interface AuditVisualData {
  score_global: number;
  elements: AuditElement[];
  priorite_1?: AuditPriority;
  resume: {
    ok_count: number;
    improve_count: number;
    critical_count: number;
  };
}

export interface AuditEvolution {
  previous_score: number;
  previous_date: string;
  improved: { label: string; from: string; to: string }[];
  unchanged: { label: string; status: string }[];
}

interface AuditVisualResultProps {
  data: AuditVisualData;
  evolution?: AuditEvolution | null;
  onRegenerate?: () => void;
}

// ── Helpers ──

const STATUS_CONFIG: Record<ElementStatus, { border: string; bg: string; badge: string; badgeBg: string; badgeText: string }> = {
  ok: {
    border: "border-l-green-500",
    bg: "bg-green-50 dark:bg-green-950/20",
    badge: "OK ✓",
    badgeBg: "bg-green-100 dark:bg-green-900/40",
    badgeText: "text-green-700 dark:text-green-400",
  },
  improve: {
    border: "border-l-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    badge: "À améliorer",
    badgeBg: "bg-amber-100 dark:bg-amber-900/40",
    badgeText: "text-amber-700 dark:text-amber-400",
  },
  critical: {
    border: "border-l-red-500",
    bg: "bg-red-50 dark:bg-red-950/20",
    badge: "Critique",
    badgeBg: "bg-red-100 dark:bg-red-900/40",
    badgeText: "text-red-700 dark:text-red-400",
  },
};

const STATUS_DOT: Record<ElementStatus, string> = {
  ok: "🟢",
  improve: "🟡",
  critical: "🔴",
};

const LINE_STATUS_STYLE: Record<ElementStatus, string> = {
  ok: "border-l-green-400 bg-green-50/60 dark:bg-green-950/10",
  improve: "border-l-amber-400 bg-amber-50/60 dark:bg-amber-950/10",
  critical: "border-l-red-400 bg-red-50/60 dark:bg-red-950/10",
};

function CopyButton({ text }: { text: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copié !" });
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="rounded-pill gap-1.5">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copié !" : "Copier"}
    </Button>
  );
}

// ── Summary Grid ──

function SummaryGrid({ elements, priority, onScrollTo }: { elements: AuditElement[]; priority?: AuditPriority; onScrollTo: (el: string) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {elements.map((el) => (
          <button
            key={el.element}
            onClick={() => onScrollTo(el.element)}
            className="flex items-center gap-2 text-left text-sm text-foreground hover:text-primary transition-colors p-2 rounded-lg hover:bg-muted/50"
          >
            <span>{STATUS_DOT[el.status]}</span>
            <span className="truncate">{el.label}</span>
          </button>
        ))}
      </div>
      {priority && (
        <div className="border-t border-border pt-3 mt-1">
          <p className="text-sm text-foreground">
            👉 <strong>Priorité n°1 :</strong> {priority.message}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Element Card ──

function ElementCard({ el, refCallback }: { el: AuditElement; refCallback: (node: HTMLElement | null) => void }) {
  const cfg = STATUS_CONFIG[el.status];

  return (
    <div
      ref={refCallback}
      className={`rounded-2xl border-l-[4px] ${cfg.border} ${cfg.bg} p-5 space-y-4 transition-all`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-foreground">
          {STATUS_DOT[el.status]} {el.label}
        </h3>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-pill ${cfg.badgeBg} ${cfg.badgeText}`}>
          {cfg.badge}
        </span>
      </div>

      {/* Current content */}
      {el.current && !el.lignes && (
        <div className="rounded-xl bg-muted/50 border border-border p-4">
          <p className="text-sm text-foreground whitespace-pre-line">{el.current}</p>
        </div>
      )}

      {/* Bio line-by-line annotations */}
      {el.lignes && el.lignes.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            Ta bio actuelle (avec annotations) :
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            {el.lignes.map((line, i) => (
              <div
                key={i}
                className={`border-l-[3px] ${LINE_STATUS_STYLE[line.status]} px-4 py-3 ${i > 0 ? "border-t border-border/50" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">{STATUS_DOT[line.status]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {line.texte === "(absent)" ? <em className="text-muted-foreground">(absent)</em> : `"${line.texte}"`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">→ {line.commentaire}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verdict */}
      <p className="text-sm text-foreground leading-relaxed">
        {el.status === "ok" ? "✅" : el.status === "improve" ? "⚠️" : "🔴"} {el.verdict}
      </p>

      {/* Conseil */}
      {el.conseil && (
        <div className="rounded-lg bg-card border border-border px-4 py-3">
          <p className="text-sm text-foreground leading-relaxed">💡 {el.conseil}</p>
        </div>
      )}

      {/* Proposition */}
      {el.proposition && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">💡 Proposition :</p>
          <div className="rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50/60 dark:bg-green-950/20 p-4">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{el.proposition}</p>
          </div>
          <CopyButton text={el.proposition} />
        </div>
      )}

      {/* Link action */}
      {el.link_to && (
        <Link to={el.link_to}>
          <Button variant="outline" size="sm" className="rounded-pill gap-1.5 mt-1">
            <ExternalLink className="h-3.5 w-3.5" />
            {el.link_label || "Voir"}
          </Button>
        </Link>
      )}
    </div>
  );
}

// ── Evolution ──

function EvolutionBlock({ evolution }: { evolution: AuditEvolution }) {
  const daysDiff = Math.round((Date.now() - new Date(evolution.previous_date).getTime()) / (1000 * 60 * 60 * 24));
  const timeLabel = daysDiff <= 7 ? "il y a quelques jours" : daysDiff <= 30 ? `il y a ${Math.round(daysDiff / 7)} semaines` : `il y a ${Math.round(daysDiff / 30)} mois`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 mb-6">
      <h3 className="text-sm font-bold text-foreground mb-3">
        📈 Évolution depuis ton dernier audit ({timeLabel})
      </h3>
      <p className="text-sm text-foreground mb-3">
        Score : <strong>{evolution.previous_score}/100</strong> → <strong className="text-primary">{/* current shown elsewhere */}</strong>
      </p>
      {evolution.improved.length > 0 && (
        <p className="text-sm text-foreground">
          ✅ Amélioré : {evolution.improved.map((e) => `${e.label} (${e.from}→${e.to})`).join(", ")}
        </p>
      )}
      {evolution.unchanged.length > 0 && (
        <p className="text-sm text-muted-foreground">
          ⏳ En cours : {evolution.unchanged.map((e) => `${e.label} (${e.status})`).join(", ")}
        </p>
      )}
    </div>
  );
}

// ── Main Component ──

export default function AuditVisualResult({ data, evolution, onRegenerate }: AuditVisualResultProps) {
  const elementRefs = useRef<Record<string, HTMLElement | null>>({});

  const handleScrollTo = (elementKey: string) => {
    const node = elementRefs.current[elementKey];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.classList.add("ring-2", "ring-primary", "ring-offset-2");
      setTimeout(() => node.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2000);
    }
  };

  const scoreColor = data.score_global >= 70 ? "text-green-600" : data.score_global >= 40 ? "text-amber-600" : "text-red-600";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── Score Header ─── */}
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <h2 className="font-display text-lg font-bold text-foreground mb-2">
          🔍 Audit de ton profil Instagram
        </h2>
        <p className={`text-4xl font-display font-bold ${scoreColor}`}>
          {data.score_global}<span className="text-xl text-muted-foreground">/100</span>
        </p>
        <Progress value={data.score_global} className="h-3 mt-4 mb-3 max-w-md mx-auto" />
        <div className="flex items-center justify-center gap-4 text-sm">
          <span className="text-green-600 font-medium">🟢 {data.resume.ok_count} OK</span>
          <span className="text-amber-600 font-medium">🟡 {data.resume.improve_count} à améliorer</span>
          <span className="text-red-600 font-medium">🔴 {data.resume.critical_count} critique{data.resume.critical_count > 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* ─── Evolution ─── */}
      {evolution && <EvolutionBlock evolution={evolution} />}

      {/* ─── Summary Grid ─── */}
      <SummaryGrid
        elements={data.elements}
        priority={data.priorite_1}
        onScrollTo={handleScrollTo}
      />

      {/* ─── Element Cards ─── */}
      <div className="space-y-4">
        {data.elements.map((el) => (
          <ElementCard
            key={el.element}
            el={el}
            refCallback={(node) => { elementRefs.current[el.element] = node; }}
          />
        ))}
      </div>

      {/* ─── Actions ─── */}
      {onRegenerate && (
        <div className="flex flex-wrap gap-3 pt-2">
          <Button variant="outline" onClick={onRegenerate} className="rounded-pill gap-2">
            🔄 Refaire l'audit
          </Button>
        </div>
      )}
    </div>
  );
}
