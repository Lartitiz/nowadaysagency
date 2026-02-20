import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";

interface SubPageHeaderProps {
  parentLabel: string;
  parentTo: string;
  currentLabel: string;
}

export default function SubPageHeader({ parentLabel, parentTo, currentLabel }: SubPageHeaderProps) {
  return (
    <div className="mb-6 space-y-2">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to={parentTo} className="hover:text-primary transition-colors">{parentLabel}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{currentLabel}</span>
      </nav>
      {/* Back button */}
      <Link
        to={parentTo}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à {parentLabel}
      </Link>
    </div>
  );
}
