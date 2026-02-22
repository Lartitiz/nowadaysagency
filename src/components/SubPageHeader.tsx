import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  to: string;
}

interface SubPageHeaderProps {
  /** Simple mode: single parent */
  parentLabel?: string;
  parentTo?: string;
  currentLabel: string;
  /** Multi-level breadcrumb (overrides parentLabel/parentTo) */
  breadcrumbs?: BreadcrumbItem[];
  /** If true, reads ?from= search param as override for back target */
  useFromParam?: boolean;
}

export default function SubPageHeader({
  parentLabel,
  parentTo,
  currentLabel,
  breadcrumbs,
  useFromParam = false,
}: SubPageHeaderProps) {
  const [searchParams] = useSearchParams();
  const fromParam = useFromParam ? searchParams.get("from") : null;

  // Build the crumb chain
  let crumbs: BreadcrumbItem[] = [];
  if (breadcrumbs && breadcrumbs.length > 0) {
    crumbs = breadcrumbs;
  } else if (parentLabel && parentTo) {
    crumbs = [{ label: parentLabel, to: parentTo }];
  }

  // The back target: ?from= param → last crumb → parentTo → /dashboard
  const backTarget = fromParam || (crumbs.length > 0 ? crumbs[crumbs.length - 1].to : parentTo || "/dashboard");
  const backLabel = fromParam
    ? "Retour"
    : crumbs.length > 0
      ? `Retour à ${crumbs[crumbs.length - 1].label}`
      : "Retour";

  return (
    <div className="mb-6 space-y-2">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <Link to={crumb.to} className="hover:text-primary transition-colors">{crumb.label}</Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </span>
        ))}
        <span className="text-foreground font-medium">{currentLabel}</span>
      </nav>
      {/* Back button */}
      <Link
        to={backTarget}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>
    </div>
  );
}
