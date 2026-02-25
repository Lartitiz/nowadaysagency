import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPlan } from "@/hooks/use-user-plan";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import FirstTimeTooltip from "@/components/FirstTimeTooltip";
import { Progress } from "@/components/ui/progress";
import {
  Star, CalendarDays, CheckCircle, Clock, Square,
  MessageCircle, Users, Video, ExternalLink, Loader2,
} from "lucide-react";

const CALENDLY_URL = "https://calendly.com/laetitia-mattioli/appel-decouverte";
const WHATSAPP_URL = "https://wa.me/33614133921";

interface Coaching {
  id: string;
  scheduled_at: string | null;
  status: string;
  notes: string | null;
  calendly_link: string | null;
}

interface Deliverable {
  id: string;
  deliverable_type: string;
  label: string | null;
  status: string;
  validated_at: string | null;
  feedback: string | null;
}

const DELIVERABLE_LABELS: Record<string, string> = {
  bio: "Bio Instagram",
  branding: "Branding complet",
  calendar: "Calendrier éditorial",
  sales_page: "Page de vente",
  storytelling: "Storytelling",
  proposition: "Proposition de valeur",
};

const statusIcon = (status: string) => {
  switch (status) {
    case "validated": return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "submitted": return <Clock className="h-4 w-4 text-amber-500" />;
    case "in_progress": return <Clock className="h-4 w-4 text-blue-500" />;
    default: return <Square className="h-4 w-4 text-muted-foreground" />;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case "validated": return "Validé";
    case "submitted": return "En attente de validation";
    case "in_progress": return "En cours";
    default: return "Pas encore soumis";
  }
};

export default function StudioDashboard() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { isStudio, loading: planLoading } = useUserPlan();
  const navigate = useNavigate();
  const [coachings, setCoachings] = useState<Coaching[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [subInfo, setSubInfo] = useState<{ studio_start_date?: string; studio_end_date?: string; studio_months_paid?: number } | null>(null);

  useEffect(() => {
    if (!planLoading && !isStudio) {
      navigate("/studio/discover", { replace: true });
    }
  }, [planLoading, isStudio, navigate]);

  useEffect(() => {
    if (!user || !isStudio) return;
    loadData();
  }, [user, isStudio]);

  const loadData = async () => {
    setLoading(true);
    const [coachRes, delivRes, subRes] = await Promise.all([
      (supabase.from("studio_coachings") as any).select("*").eq(column, value).order("scheduled_at", { ascending: false }),
      (supabase.from("studio_deliverables") as any).select("*").eq(column, value).order("created_at"),
      supabase.from("subscriptions").select("studio_start_date, studio_end_date, studio_months_paid").eq("user_id", user!.id).single(),
    ]);
    if (coachRes.data) setCoachings(coachRes.data as Coaching[]);
    if (delivRes.data) setDeliverables(delivRes.data as Deliverable[]);
    if (subRes.data) setSubInfo(subRes.data as any);
    setLoading(false);
  };

  if (planLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isStudio) return null;

  // Calculate progress
  const monthsPaid = subInfo?.studio_months_paid || 0;
  const progressPct = Math.min(100, Math.round((monthsPaid / 6) * 100));

  const upcomingCoachings = coachings.filter((c) => c.status === "scheduled");
  const pastCoachings = coachings.filter((c) => c.status === "done");

  const validatedCount = deliverables.filter((d) => d.status === "validated").length;
  const totalDeliverables = deliverables.length || 1;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-rose-pale flex items-center justify-center">
            <Star className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Mon accompagnement</h1>
            <p className="text-sm text-muted-foreground">
              Mois {monthsPaid}/6 · {progressPct}% du parcours
            </p>
          </div>
        </div>

        <Progress value={progressPct} className="h-2 mb-8" />

        {/* ─── Coachings ─── */}
        <Section icon={<CalendarDays className="h-4 w-4" />} title="Mes coachings">
          {upcomingCoachings.length > 0 ? (
            upcomingCoachings.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-accent/50 mb-2">
                <div>
                  <p className="text-sm font-medium">
                    Prochain : {c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "À planifier"}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="rounded-full gap-1" asChild>
                  <a href={c.calendly_link || CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                    Rejoindre <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            ))
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-2">Aucun coaching planifié.</p>
              <Button size="sm" className="rounded-full gap-1" asChild>
                <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                  Planifier un coaching <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>
          )}

          {pastCoachings.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Passés</p>
              {pastCoachings.map((c) => (
                <div key={c.id} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">
                      {c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}
                    </span>
                    {c.notes && <p className="text-muted-foreground text-xs mt-0.5">{c.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ─── Livrables ─── */}
        <Section icon={<CheckCircle className="h-4 w-4" />} title={`Mes livrables (${validatedCount}/${deliverables.length} validés)`}>
          {deliverables.length > 0 ? (
            <div className="space-y-2">
              {deliverables.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                  <div className="flex items-center gap-2">
                    {statusIcon(d.status)}
                    <span className="text-sm font-medium">
                      {d.label || DELIVERABLE_LABELS[d.deliverable_type] || d.deliverable_type}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {d.status === "validated" && d.validated_at
                      ? `Validé le ${new Date(d.validated_at).toLocaleDateString("fr-FR")}`
                      : statusLabel(d.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Tes livrables apparaîtront ici au fur et à mesure de ton parcours.
            </p>
          )}
        </Section>

        {/* ─── Canal direct ─── */}
        <FirstTimeTooltip id="coaching-whatsapp" text="Écris à Laetitia. Réponse sous 24-48h les jours ouvrés.">
          <Section icon={<MessageCircle className="h-4 w-4" />} title="Canal direct">
            <Button variant="outline" className="rounded-full gap-2 w-full sm:w-auto" asChild>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                💬 Envoyer un message à Laetitia
              </a>
            </Button>
          </Section>
        </FirstTimeTooltip>

        {/* ─── Lives exclusifs ─── */}
        <Section icon={<Video className="h-4 w-4" />} title="Lives exclusifs Studio">
          <p className="text-sm text-muted-foreground">
            Les lives et replays exclusifs Studio seront bientôt disponibles ici.
          </p>
        </Section>
      </main>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-6 mb-4">
      <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">{icon} {title}</h2>
      {children}
    </div>
  );
}
