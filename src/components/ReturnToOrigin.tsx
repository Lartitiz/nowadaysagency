import { useSearchParams, useLocation, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function ReturnToOrigin({ fallbackTo = "/creer", fallbackLabel = "Créer" }: { fallbackTo?: string; fallbackLabel?: string }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const calendarData = location.state as any;
  const from = searchParams.get("from");
  const fromCalendar = calendarData?.fromCalendar === true;

  let to = fallbackTo;
  let label = fallbackLabel;

  if (fromCalendar) {
    to = "/calendrier";
    label = "Calendrier";
  } else if (from) {
    to = from;
    label = from === "/creer" ? "Créer" : from === "/atelier" ? "Atelier" : "Retour";
  }

  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-4"
    >
      <ArrowLeft className="h-4 w-4" />
      Retour à {label}
    </Link>
  );
}
