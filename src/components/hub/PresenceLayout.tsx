import { type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronDown, type LucideIcon } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspaceFilter, useWorkspaceReady } from "@/hooks/use-workspace-query";

/** Scope the whole visit, including coaching dialogs, before mounting data consumers. */
export function PresenceScope({ page: Page }: { page: ComponentType }) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const ready = useWorkspaceReady();
  if (!isDemoMode && (!ready || !user || !value)) return <p role="status" className="p-8">Chargement de l’espace…</p>;
  return <Page key={`${user?.id}:${isDemoMode}:${column}:${value}`} />;
}

export function PresenceLayout({ label, title, description, children }: {
  label: string; title: string; description: string; children: ReactNode;
}) {
  return <div className="min-h-screen bg-background [--primary:330_50%_20%] [--bordeaux:330_50%_20%] dark:[--primary:338_72%_83%]">
    <AppHeader />
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm text-bordeaux underline-offset-4 hover:underline dark:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à l’accueil
      </Link>
      <header className="mb-8 mt-5 max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[.15em] text-muted-foreground">{label}</p>
        <h1 className="font-display text-3xl leading-tight text-bordeaux sm:text-4xl dark:text-foreground">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>
      </header>
      {children}
    </main>
  </div>;
}

export function PresenceCreate({ channel, label, description }: { channel: string; label: string; description: string }) {
  return <div className="mb-9 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-rose-pale/40 p-5 sm:p-6">
    <div className="min-w-0">
      <p className="mb-3 text-sm text-muted-foreground">{description}</p>
      <Link to={`/creer?canal=${channel}`} className="inline-flex min-h-11 items-center gap-3 rounded-xl bg-bordeaux px-5 py-3 text-sm font-semibold text-white hover:bg-bordeaux/90">
        {label}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </Link>
    </div>
    <PresenceLink to={`/idees?canal=${channel}`}>Mes contenus enregistrés</PresenceLink>
  </div>;
}

export function PresenceLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-bordeaux underline decoration-border underline-offset-4 hover:decoration-current dark:text-foreground">
    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />{children}
  </Link>;
}

const tile = "block h-full rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-bordeaux/50 sm:p-6";
export function PresenceCard({ title, description, icon: Icon, to }: {
  title: string; description: string; icon: LucideIcon; to: string;
}) {
  return <Link to={to} className={tile}>
    <Icon className="mb-5 h-5 w-5 text-bordeaux dark:text-foreground" aria-hidden="true" strokeWidth={1.5} />
    <h2 className="flex items-center justify-between gap-3 text-base font-semibold text-foreground">{title}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></h2>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
  </Link>;
}

/** The grouped destinations stay native links; no replacement editor or hidden write. */
export function PresenceChoices({ title, description, icon: Icon, children }: {
  title: string; description: string; icon: LucideIcon; children: ReactNode;
}) {
  return <details className="self-start rounded-2xl border border-border bg-card p-5 open:border-bordeaux/40 sm:p-6">
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <Icon className="mb-5 h-5 w-5 text-bordeaux dark:text-foreground" aria-hidden="true" strokeWidth={1.5} />
      <h2 className="flex items-center justify-between gap-3 text-base font-semibold text-foreground">{title}<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /></h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </summary>
    <div className="mt-4 flex flex-col items-start border-t border-border pt-3">{children}</div>
  </details>;
}
