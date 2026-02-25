import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";

const SiteAuditPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-3xl mx-auto px-4 py-8 space-y-6">
        <SubPageHeader
          parentLabel="Mon Site Web"
          parentTo="/site"
          currentLabel="Audit de conversion"
        />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">🔍 Audit de conversion</h1>
          <p className="text-muted-foreground">
            Diagnostique ton site page par page ou en global, et découvre ce qui bloque tes visiteuses.
          </p>
        </div>
      </main>
    </div>
  );
};

export default SiteAuditPage;
