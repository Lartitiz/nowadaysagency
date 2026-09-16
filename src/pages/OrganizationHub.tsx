import { lazy, Suspense } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import AppHeader from "@/components/AppHeader";

const CalendarPage = lazy(() => import("./Calendar"));

const LOADER = (
  <div className="flex items-center justify-center py-20">
    <div className="flex gap-1">
      <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
      <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
      <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
    </div>
  </div>
);

export default function OrganizationHub() {
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");

  // « Mes idées » a sa propre page depuis la refonte : les anciens liens
  // /calendrier?tab=idees (raccourcis, favoris, e-mails) y sont renvoyés.
  // L'onglet « Ma stratégie » a été supprimé : tout paramètre de tab
  // retombe sur le calendrier.
  if (rawTab === "idees") {
    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    const qs = next.toString();
    return <Navigate to={`/idees${qs ? `?${qs}` : ""}`} replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main id="main-content" className="mx-auto max-w-[1600px] px-6 py-8 max-md:px-4 [--primary:330_55%_20%] [--ring:330_55%_20%] dark:[--primary:338_96%_61%] dark:[--ring:338_96%_61%]">
        <Suspense fallback={LOADER}>
          <CalendarPage embedded />
        </Suspense>
      </main>
    </div>
  );
}
