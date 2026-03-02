import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarDays, Lightbulb, ClipboardList } from "lucide-react";

const CalendarPage = lazy(() => import("./Calendar"));
const IdeasPage = lazy(() => import("./IdeasPage"));
const CommPlanPage = lazy(() => import("./CommPlanPage"));

const LOADER = (
  <div className="flex items-center justify-center py-20">
    <div className="flex gap-1">
      <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
      <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
      <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
    </div>
  </div>
);

const TAB_MAP: Record<string, string> = {
  calendrier: "calendrier",
  idees: "idees",
  strategie: "strategie",
};

export default function OrganizationHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") || "calendrier";
  const activeTab = TAB_MAP[rawTab] || "calendrier";

  const handleTabChange = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "calendrier") {
      next.delete("tab");
    } else {
      next.set("tab", tab);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1400px] px-6 py-8 max-md:px-4">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6 bg-card border border-border rounded-full p-1 h-auto gap-1">
            <TabsTrigger
              value="calendrier"
              className="rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5"
            >
              <CalendarDays className="h-4 w-4" />
              Calendrier
            </TabsTrigger>
            <TabsTrigger
              value="idees"
              className="rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5"
            >
              <Lightbulb className="h-4 w-4" />
              Mes idées
            </TabsTrigger>
            <TabsTrigger
              value="strategie"
              className="rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5"
            >
              <ClipboardList className="h-4 w-4" />
              Ma stratégie
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendrier" className="mt-0">
            <Suspense fallback={LOADER}>
              <CalendarPage embedded />
            </Suspense>
          </TabsContent>

          <TabsContent value="idees" className="mt-0">
            <Suspense fallback={LOADER}>
              <IdeasPage embedded />
            </Suspense>
          </TabsContent>

          <TabsContent value="strategie" className="mt-0">
            <Suspense fallback={LOADER}>
              <CommPlanPage embedded />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
