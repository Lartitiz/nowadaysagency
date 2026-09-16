import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowRight, ChevronDown, FileText, Palette, PenLine, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { identityPresentation, type IdentityOverview } from "@/lib/identity-overview";

interface Props {
  data: IdentityOverview;
  onImport: () => void;
  onReanalyze?: () => void;
  onShowSynthesis: () => void;
  pendingReview?: boolean;
  onReview: () => void;
  auditSuggestions: Record<string, string>;
  onApplySuggestion: (section: string, suggestion: string) => Promise<void>;
  onDismissSuggestion: (section: string) => void;
}
const AREAS = [
  { key: "about", title: "Me présenter", detail: "Activité et public", icon: UserRound },
  { key: "writing", title: "Ma façon d’écrire", detail: "Ton et expressions", icon: PenLine },
  { key: "visual", title: "Mon univers visuel", detail: "Couleurs et images", icon: Palette },
];
const section = (name: string) => `/branding/section?section=${name}&tab=fiche`;
function DetailLink({ to, title, children }: { to: string; title: string; children: React.ReactNode }) {
  return <Link to={to} className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-0 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
    <span className="min-w-0"><strong className="block text-sm font-medium">{title}</strong><span className="mt-1 block text-sm text-muted-foreground">{children}</span></span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
  </Link>;
}
function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><dt className="mb-2 text-sm font-medium text-muted-foreground">{title}</dt><dd className="whitespace-pre-wrap break-words text-base leading-relaxed">{children}</dd></div>;
}
function More({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="group mt-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">{title}<ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" aria-hidden="true" /></summary><div className="border-t border-border">{children}</div></details>;
}

export default function BrandingIdentityCard({ data, onImport, onReanalyze, onShowSynthesis, pendingReview, onReview, auditSuggestions, onApplySuggestion, onDismissSuggestion }: Props) {
  const [applying, setApplying] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const area = AREAS.some(a => a.key === params.get("rubrique")) ? params.get("rubrique") : "about";
  const basics = identityPresentation(data);
  const writing = data.brandProfile;
  const charter = data.charter;
  const hasBasics = !!(basics.activity || basics.audience || basics.difference || data.publics.length);
  const selectArea = (key: string) => { const next = new URLSearchParams(params); next.set("rubrique", key); setParams(next); };
  return <div>
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">Mon espace <span aria-hidden="true">/</span> Mon activité</p>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="gap-2">Autres actions <ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onImport}>Importer mes informations</DropdownMenuItem>
          {onReanalyze && <DropdownMenuItem onSelect={onReanalyze}>Actualiser depuis mes sources</DropdownMenuItem>}
          <DropdownMenuItem onSelect={onShowSynthesis}>Résumer mon activité</DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/branding/audit">Vérifier ma communication</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="grid gap-7 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
      <nav aria-label="Rubriques de mon activité" className="flex flex-col gap-1 md:sticky md:top-24 md:self-start">
        {AREAS.map(({ key, title, detail, icon: Icon }) => <button key={key} type="button" onClick={() => selectArea(key)} aria-current={area === key ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${area === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /><span><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></span>
        </button>)}
        <Link to="/branding/offres" className="mt-3 flex items-center justify-between border-t border-border px-4 py-4 text-sm font-medium hover:text-primary">Mes offres <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </nav>
      <section className="min-w-0" aria-labelledby="identity-area-title">
        <header className="mb-6"><h1 id="identity-area-title" className="font-display text-3xl sm:text-4xl">{AREAS.find(a => a.key === area)?.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{area === "about" ? "Les informations de base pour parler de mon activité." : area === "writing" ? "Le ton et les mots que je veux retrouver dans mes contenus." : "Les couleurs et les images qui rendent mes contenus reconnaissables."}</p>
        </header>
        {pendingReview && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm">Des propositions importées sont à relire.</p><Button variant="outline" onClick={onReview}>Les ouvrir</Button></div>}
        {area === "about" && <>
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
            {hasBasics ? <dl className="space-y-6">
              <Fact title="Ce que je fais">{basics.activity || "À préciser quand tu le souhaites."}</Fact>
              <Fact title="À qui je m’adresse">{basics.needsPublicChoice ? `${data.publics.length} publics enregistrés. Ouvre leurs fiches pour les consulter ou choisir le principal.` : basics.audience || "À préciser quand tu le souhaites."}
                {data.publics.length > 0 && <Link to={section("persona")} className="mt-2 block text-sm text-primary underline underline-offset-4">Voir mes publics ({data.publics.length})</Link>}
              </Fact>
              <Fact title="Ce qui me distingue">{basics.difference || "À préciser quand tu le souhaites."}</Fact>
            </dl> : <div><h2 className="font-display text-2xl">Quelques mots pour commencer.</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Ce que tu fais, pour qui, et ce qui rend ton approche particulière. Tu pourras préciser la suite quand tu en auras besoin.</p></div>}
            <Button asChild className="mt-7 h-auto min-h-10 whitespace-normal"><Link to="/branding/proposition/recap">{hasBasics ? "Modifier ma présentation" : "Décrire mon activité"}<ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Link></Button>
          </div>
          <More title="Mes publics, mes histoires et les autres détails">
            <DetailLink to={section("persona")} title="Mes publics">Préciser mes publics et leurs canaux.</DetailLink>
            <DetailLink to={section("story")} title="Mes histoires">Mon parcours et mes expériences{data.storytellingList?.length ? ` · ${data.storytellingList.length} fiche(s)` : ""}.</DetailLink>
            <DetailLink to={section("tone_style")} title="Mes convictions">Ce que je défends et ce que je refuse.</DetailLink>
            <DetailLink to="/branding/proposition/recap" title="Mes formulations">Ma référence, ma bio et mes autres versions.</DetailLink>
            <DetailLink to={section("content_strategy")} title="Mes sujets et mes séries">Mes thèmes et mes rendez-vous de contenu.</DetailLink>
          </More>
        </>}
        {area === "writing" && <>
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7"><dl className="space-y-6">
            <Fact title="Mon ton">{writing?.voice_description || [writing?.tone_register, writing?.tone_style, writing?.tone_humor].filter(Boolean).join(" · ") || "Décris la façon dont tu aimes t’exprimer."}</Fact>
            <Fact title="Mes expressions">{writing?.key_expressions || "Tu pourras ajouter tes expressions habituelles."}</Fact>
            <Fact title="Ce que je veux éviter">{writing?.things_to_avoid || "Des mots ou des tournures qui ne te ressemblent pas."}</Fact>
          </dl><Button asChild className="mt-7 h-auto min-h-10 whitespace-normal"><Link to={section("tone_style")}>Modifier mes préférences</Link></Button></div>
          <More title="Mes textes et mon guide d’écriture">
            <DetailLink to={section("tone_style")} title="Mes habitudes d’écriture">Mes expressions, les mots de mon public et mes préférences.</DetailLink>
            <DetailLink to="/branding/voice-guide" title="Mon guide d’écriture">Consulter ou actualiser le document qui rassemble mes repères.</DetailLink>
          </More>
        </>}
        {area === "visual" && <>
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
            <h2 className="text-sm font-medium">Mes couleurs</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{[["Principale", charter?.color_primary], ["Secondaire", charter?.color_secondary], ["Accent", charter?.color_accent], ["Fond", charter?.color_background]].map(([label, color]) => <div key={label}>
              <div className="h-16 rounded-xl border border-border bg-muted" style={color ? { backgroundColor: color } : undefined} aria-hidden="true" />
              <p className="mt-2 text-xs font-medium">{label}</p><p className="mt-1 break-all text-xs text-muted-foreground">{color || "À choisir"}</p>
            </div>)}</div>
            <h2 className="mt-7 text-sm font-medium">Mes typographies</h2><dl className="mt-4 grid grid-cols-2 gap-4"><div><dt className="text-xs text-muted-foreground">Titres</dt><dd className="mt-2 break-words">{charter?.font_title || "À choisir"}</dd></div><div><dt className="text-xs text-muted-foreground">Textes</dt><dd className="mt-2 break-words">{charter?.font_body || "À choisir"}</dd></div></dl>
            <Button asChild className="mt-7 h-auto min-h-10 whitespace-normal"><Link to="/branding/charter">Personnaliser mon univers</Link></Button>
          </div>
          <More title="Mes logos, références et modèles"><DetailLink to="/branding/charter" title="Mes fichiers et réglages visuels">Logos, inspirations, modèles, fonds et placement du logo.</DetailLink></More>
        </>}
        {Object.keys(auditSuggestions).length > 0 && <More title="Les suggestions de mon dernier diagnostic">
          {Object.entries(auditSuggestions).map(([key, text]) => <div key={key} className="border-b border-border py-4">
            <h2 className="mb-2 text-sm font-medium">{{ proposition: "Ma présentation", persona: "Mon public", tone: "Mon ton", offers: "La description générale de mes offres", storytelling: "Mon histoire", strategy: "Mes sujets" }[key] || key}</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
            <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!!applying} onClick={async () => { setApplying(key); try { await onApplySuggestion(key, text); } finally { setApplying(null); } }}>{applying === key ? "Enregistrement…" : "Appliquer cette suggestion"}</Button><Button variant="ghost" size="sm" disabled={!!applying} onClick={() => onDismissSuggestion(key)}>Ignorer</Button></div>
          </div>)}
        </More>}
        <p className="mt-8 text-sm text-muted-foreground"><Link className="inline-flex items-center gap-2 underline underline-offset-4 hover:text-foreground" to="/creer"><FileText className="h-4 w-4" /> Passer à la création</Link></p>
      </section>
    </div>
  </div>;
}
