import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface TestResult {
  label: string;
  status: "pending" | "running" | "ok" | "error";
  message?: string;
}

export default function AiDebugPanel() {
  const { user } = useAuth();
  const [tests, setTests] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [userPlan, setUserPlan] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "non défini";

  const runTests = async () => {
    setRunning(true);
    const results: TestResult[] = [
      { label: "Connexion Supabase", status: "pending" },
      { label: "Edge function accessible", status: "pending" },
      { label: "Génération de contenu", status: "pending" },
    ];
    setTests([...results]);

    // Fetch plan
    if (user) {
      try {
        const { data } = await (supabase.from("subscriptions" as any) as any)
          .select("plan")
          .eq("user_id", user.id)
          .maybeSingle();
        setUserPlan(data?.plan || "aucun");
      } catch {
        setUserPlan("erreur");
      }
    }

    // Test 1: Supabase connection
    results[0].status = "running";
    setTests([...results]);
    try {
      const { error } = await (supabase.from("profiles" as any) as any).select("id").limit(1);
      if (error) {
        results[0] = { label: results[0].label, status: "error", message: JSON.stringify(error, null, 2) };
      } else {
        results[0] = { label: results[0].label, status: "ok", message: "Connexion OK" };
      }
    } catch (e: any) {
      results[0] = { label: results[0].label, status: "error", message: e.message };
    }
    setTests([...results]);

    // Test 2: Edge function branding-coaching
    results[1].status = "running";
    setTests([...results]);
    try {
      const { data, error } = await invokeWithTimeout("branding-coaching", {
        body: { user_id: "test", section: "story", messages: [], context: {}, covered_topics: [] },
      }, 120000);
      if (error) {
        results[1] = {
          label: results[1].label,
          status: "error",
          message: JSON.stringify({
            message: error.message,
            context: (error as any).context,
            name: (error as any).name,
            full: String(error),
          }, null, 2),
        };
      } else {
        results[1] = { label: results[1].label, status: "ok", message: `Réponse reçue : ${JSON.stringify(data).slice(0, 200)}` };
      }
    } catch (e: any) {
      results[1] = { label: results[1].label, status: "error", message: e.message };
    }
    setTests([...results]);

    // Test 3: generate-content
    results[2].status = "running";
    setTests([...results]);
    try {
      const { data, error } = await invokeWithTimeout("generate-content", {
        body: { type: "caption", theme: "test de connexion", objectif: "visibilite" },
      });
      if (error) {
        results[2] = {
          label: results[2].label,
          status: "error",
          message: JSON.stringify({
            message: error.message,
            context: (error as any).context,
            name: (error as any).name,
            full: String(error),
          }, null, 2),
        };
      } else {
        results[2] = { label: results[2].label, status: "ok", message: `Réponse reçue : ${JSON.stringify(data).slice(0, 200)}` };
      }
    } catch (e: any) {
      results[2] = { label: results[2].label, status: "error", message: e.message };
    }
    setTests([...results]);

    setRunning(false);
  };

  const statusIcon = (s: TestResult["status"]) => {
    switch (s) {
      case "ok": return "✅";
      case "error": return "❌";
      case "running": return "⏳";
      default: return "⬜";
    }
  };

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono text-muted-foreground space-y-1">
        <div>Supabase URL : {supabaseUrl}</div>
        <div>User ID : {user?.id || "non connecté"}</div>
        <div>Email : {user?.email || "—"}</div>
        <div>Plan : {userPlan ?? "non chargé"}</div>
      </div>

      <Button onClick={runTests} disabled={running} className="gap-2">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "🔧"}
        {running ? "Tests en cours…" : "Tester l'IA"}
      </Button>

      {tests.map((t, i) => (
        <div
          key={i}
          className={`rounded-xl border p-4 ${
            t.status === "ok"
              ? "border-green-500/30 bg-green-500/5"
              : t.status === "error"
              ? "border-destructive/30 bg-destructive/5"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-center gap-2 font-medium text-sm text-foreground">
            <span>{statusIcon(t.status)}</span>
            <span>Test {i + 1} : {t.label}</span>
          </div>
          {t.message && (
            <pre className="mt-2 text-xs font-mono bg-muted/60 rounded-lg p-3 whitespace-pre-wrap break-all text-muted-foreground overflow-x-auto max-h-64 overflow-y-auto">
              {t.message}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
