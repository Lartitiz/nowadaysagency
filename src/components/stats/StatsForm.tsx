import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Upload, Settings } from "lucide-react";
import { fmtPct, fmtEur, safeDivPct, safeDiv } from "@/lib/stats-helpers";
import {
  type StatsRow, type StatsConfig,
  ALL_BUSINESS_METRICS, ALL_TRAFFIC_SOURCES, ALL_LAUNCH_METRICS,
  getPlatformLabel,
} from "./stats-types";

interface StatsFormProps {
  selectedMonth: string;
  onMonthChange: (v: string) => void;
  monthOptions: { value: string; label: string }[];
  formData: StatsRow;
  onFieldChange: (field: string, value: string, isText?: boolean) => void;
  onFormDataUpdate: (updater: (prev: StatsRow) => StatsRow) => void;
  onSave: () => void;
  saving: boolean;
  onImportClick: () => void;
  onConfigClick: (step: number) => void;
  activeConfig: StatsConfig;
}

export default function StatsForm({
  selectedMonth, onMonthChange, monthOptions,
  formData, onFieldChange, onFormDataUpdate,
  onSave, saving, onImportClick, onConfigClick, activeConfig,
}: StatsFormProps) {
  const engagementRate = safeDivPct(formData.interactions, formData.reach);
  const followersEngagedPct = safeDivPct(formData.followers_engaged, formData.followers);
  const profileConversionRate = safeDivPct(formData.followers_gained, formData.profile_visits);
  const totalPageViews = (formData.page_views_plan || 0) + (formData.page_views_academy || 0) + (formData.page_views_agency || 0);
  const avgBasket = safeDiv(formData.revenue, formData.clients_signed);
  const cac = safeDiv(formData.ad_budget, formData.clients_signed);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-sm font-medium">Mois :</Label>
        <Select value={selectedMonth} onValueChange={onMonthChange}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1.5 ml-auto" onClick={onImportClick}>
          <Upload className="h-3.5 w-3.5" /> Importer (Excel)
        </Button>
      </div>

      <Accordion type="multiple" defaultValue={["instagram"]} className="space-y-2">
        {/* Instagram */}
        <AccordionItem value="instagram" className="border rounded-xl px-4">
          <AccordionTrigger className="font-display text-sm font-bold">📸 Instagram</AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextInput label="Objectif du mois" value={formData.objective} onChange={v => onFieldChange("objective", v, true)} />
              <TextInput label="Contenu partagé" value={formData.content_published} onChange={v => onFieldChange("content_published", v, true)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumInput label="Comptes touchés (portée)" value={formData.reach} onChange={v => onFieldChange("reach", v)} />
              <NumInput label="Couverture stories" value={formData.stories_coverage} onChange={v => onFieldChange("stories_coverage", v)} />
              <NumInput label="Nb de vues" value={formData.views} onChange={v => onFieldChange("views", v)} />
              <NumInput label="Visites du profil" value={formData.profile_visits} onChange={v => onFieldChange("profile_visits", v)} />
              <NumInput label="Clics site web" value={formData.website_clicks} onChange={v => onFieldChange("website_clicks", v)} />
              <NumInput label="Interactions" value={formData.interactions} onChange={v => onFieldChange("interactions", v)} />
              <NumInput label="Comptes qui ont interagi" value={formData.accounts_engaged} onChange={v => onFieldChange("accounts_engaged", v)} />
              <NumInput label="Followers qui ont interagi" value={formData.followers_engaged} onChange={v => onFieldChange("followers_engaged", v)} />
              <NumInput label="Nb de followers" value={formData.followers} onChange={v => onFieldChange("followers", v)} />
              <NumInput label="Followers en +" value={formData.followers_gained} onChange={v => onFieldChange("followers_gained", v)} />
              <NumInput label="Followers en -" value={formData.followers_lost} onChange={v => onFieldChange("followers_lost", v)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ComputedField label="Taux d'engagement" value={fmtPct(engagementRate)} />
              <ComputedField label="% followers interagi" value={fmtPct(followersEngagedPct)} />
              <ComputedField label="Conversion profil" value={fmtPct(profileConversionRate)} />
            </div>
            <p className="text-xs text-muted-foreground italic">
              💡 Tu trouves ces chiffres dans Instagram → Insights → Vue d'ensemble → 30 derniers jours
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* Emailing */}
        <AccordionItem value="emailing" className="border rounded-xl px-4">
          <AccordionTrigger className="font-display text-sm font-bold">📧 Emailing</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumInput label="Inscrits emailing en +" value={formData.email_signups} onChange={v => onFieldChange("email_signups", v)} />
              <NumInput label="Abonnés newsletter total" value={formData.newsletter_subscribers} onChange={v => onFieldChange("newsletter_subscribers", v)} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Site web */}
        <AccordionItem value="website" className="border rounded-xl px-4">
          <AccordionTrigger className="font-display text-sm font-bold">
            🌐 Site web {activeConfig.website_platform ? `(${getPlatformLabel(activeConfig)})` : ""}
          </AccordionTrigger>
          <AccordionContent className="pb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumInput label={`Visiteurs uniques${activeConfig.uses_ga4 ? " (GA4)" : ""}`}
                value={formData.website_visitors} onChange={v => onFieldChange("website_visitors", v)} />
              {activeConfig.uses_ga4 && (
                <NumInput label="Utilisateurs actifs (GA4)" value={formData.ga4_users} onChange={v => onFieldChange("ga4_users", v)} />
              )}
            </div>
            {(activeConfig.traffic_sources || []).length > 0 && (
              <>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-2">Sources de trafic</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(activeConfig.traffic_sources || []).map(src => {
                    const label = ALL_TRAFFIC_SOURCES.find(s => s.id === src)?.label || src;
                    return <NumInput key={src} label={label} value={formData[`traffic_${src}`]} onChange={v => onFieldChange(`traffic_${src}`, v)} />;
                  })}
                </div>
              </>
            )}
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => onConfigClick(1)}>
              <Settings className="h-3.5 w-3.5" /> Modifier la configuration
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* Pages de vente */}
        <AccordionItem value="sales_pages" className="border rounded-xl px-4">
          <AccordionTrigger className="font-display text-sm font-bold">📄 Mes pages de vente</AccordionTrigger>
          <AccordionContent className="pb-4 space-y-4">
            {(activeConfig.sales_pages || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune page configurée.
                <Button variant="link" size="sm" className="ml-1 p-0 h-auto" onClick={() => onConfigClick(2)}>
                  Configurer
                </Button>
              </p>
            ) : (
              (activeConfig.sales_pages || []).map((page, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-foreground mb-1">"{page.name}"</p>
                  <NumInput label="Visiteurs uniques"
                    value={(formData.sales_pages_data as any)?.[page.name] ?? formData[`page_views_${i}`]}
                    onChange={v => {
                      const spd = { ...(formData.sales_pages_data || {}) as any, [page.name]: v === "" ? null : Number(v) };
                      onFormDataUpdate(prev => ({ ...prev, sales_pages_data: spd }));
                    }} />
                </div>
              ))
            )}
            {(activeConfig.sales_pages || []).length === 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <NumInput label="Visiteurs plan com'" value={formData.page_views_plan} onChange={v => onFieldChange("page_views_plan", v)} />
                <NumInput label="Visiteurs Now Studio" value={formData.page_views_academy} onChange={v => onFieldChange("page_views_academy", v)} />
                <NumInput label="Visiteurs Agency" value={formData.page_views_agency} onChange={v => onFieldChange("page_views_agency", v)} />
              </div>
            )}
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => onConfigClick(2)}>
              <Settings className="h-3.5 w-3.5" /> Modifier
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* Business */}
        <AccordionItem value="business" className="border rounded-xl px-4">
          <AccordionTrigger className="font-display text-sm font-bold">
            💰 Business {activeConfig.business_type ? `(${activeConfig.business_type})` : ""}
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(activeConfig.business_metrics || ["discovery_calls", "clients_signed", "revenue", "ad_budget"]).map(metricId => {
                const meta = ALL_BUSINESS_METRICS[metricId];
                if (!meta) return null;
                if (meta.type === "text") {
                  return <TextInput key={metricId} label={meta.label}
                    value={(formData.business_data as any)?.[metricId] ?? formData[metricId]}
                    onChange={v => {
                      const bd = { ...(formData.business_data || {}) as any, [metricId]: v };
                      onFormDataUpdate(prev => ({ ...prev, business_data: bd }));
                    }} />;
                }
                const existingCols = ["discovery_calls", "clients_signed", "revenue", "ad_budget"];
                if (existingCols.includes(metricId)) {
                  return <NumInput key={metricId} label={meta.label + (meta.type === "euro" ? " (€)" : "")}
                    value={formData[metricId]} onChange={v => onFieldChange(metricId, v)} />;
                }
                return <NumInput key={metricId} label={meta.label + (meta.type === "euro" ? " (€)" : "")}
                  value={(formData.business_data as any)?.[metricId]}
                  onChange={v => {
                    const bd = { ...(formData.business_data || {}) as any, [metricId]: v === "" ? null : Number(v) };
                    onFormDataUpdate(prev => ({ ...prev, business_data: bd }));
                  }} />;
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ComputedField label="Panier moyen" value={fmtEur(avgBasket)} />
              <ComputedField label="CAC" value={fmtEur(cac)} />
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => onConfigClick(3)}>
              <Settings className="h-3.5 w-3.5" /> Modifier
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* Lancement */}
        <AccordionItem value="launch" className="border rounded-xl px-4">
          <AccordionTrigger className="font-display text-sm font-bold">🚀 Lancement (optionnel)</AccordionTrigger>
          <AccordionContent className="space-y-3 pb-4">
            <div className="flex items-center gap-2">
              <Switch checked={!!formData.has_launch}
                onCheckedChange={v => onFormDataUpdate(prev => ({ ...prev, has_launch: v }))} />
              <Label className="text-sm">J'ai un lancement ce mois</Label>
            </div>
            {formData.has_launch && (
              <>
                <TextInput label="Nom du lancement" value={formData.launch_name}
                  onChange={v => onFieldChange("launch_name", v, true)} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(activeConfig.launch_metrics || ["signups", "launch_dms", "link_clicks", "story_views", "conversions"]).map(metricId => {
                    const label = ALL_LAUNCH_METRICS.find(m => m.id === metricId)?.label || metricId;
                    const existingCols: Record<string, string> = {
                      signups: "launch_signups", launch_dms: "launch_dms",
                      link_clicks: "launch_link_clicks", story_views: "launch_story_views",
                      conversions: "launch_conversions",
                    };
                    if (existingCols[metricId]) {
                      return <NumInput key={metricId} label={label} value={formData[existingCols[metricId]]}
                        onChange={v => onFieldChange(existingCols[metricId], v)} />;
                    }
                    return <NumInput key={metricId} label={label}
                      value={(formData.launch_data as any)?.[metricId]}
                      onChange={v => {
                        const ld = { ...(formData.launch_data || {}) as any, [metricId]: v === "" ? null : Number(v) };
                        onFormDataUpdate(prev => ({ ...prev, launch_data: ld }));
                      }} />;
                  })}
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button onClick={onSave} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? "Sauvegarde..." : "💾 Sauvegarder"}
      </Button>
    </div>
  );
}

/* ── Atomic inputs ── */

function NumInput({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground shrink-0 w-48 sm:w-56">{label}</label>
      <Input type="number" value={value ?? ""} onChange={e => onChange(e.target.value)} className="max-w-[120px]" placeholder="–" />
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1 sm:col-span-2">
      <label className="text-sm text-muted-foreground">{label}</label>
      <Input type="text" value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder="..." />
    </div>
  );
}

function ComputedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground shrink-0">{label}</label>
      <span className="text-sm font-semibold text-foreground bg-muted px-3 py-1.5 rounded-lg">{value}</span>
    </div>
  );
}
