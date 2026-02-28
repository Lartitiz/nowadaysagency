import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import AdminResetTool from "@/components/admin/AdminResetTool";

export default function AdminToolsPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container max-w-3xl mx-auto px-4 py-8">
        <SubPageHeader parentLabel="Admin" parentTo="/admin/coaching" currentLabel="🔧 Outils admin" />
        <div className="mt-6 bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Reset compte test</h2>
          <AdminResetTool />
        </div>
      </div>
    </div>
  );
}
