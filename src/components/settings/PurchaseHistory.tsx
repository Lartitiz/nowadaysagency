import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Purchase {
  id: string;
  product_type: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

const PRODUCT_LABELS: Record<string, string> = {
  coaching: "Coaching individuel",
  audit_perso: "Audit personnalisé",
  weekend: "Weekend Bourgogne",
  studio_once: "Accompagnement Binôme (paiement unique)",
  unknown: "Achat",
};

export default function PurchaseHistory() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (supabase.from("purchases") as any)
      .select("*")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setPurchases(data as Purchase[]);
        setLoading(false);
      });
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Aucun achat pour le moment.</p>
    );
  }

  return (
    <div className="space-y-2">
      {purchases.map((p) => (
        <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
          <div>
            <p className="text-sm font-medium">{PRODUCT_LABELS[p.product_type] || p.product_type}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(p.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{p.amount}€</span>
            <Badge variant={p.status === "paid" ? "default" : "secondary"} className="text-xs">
              {p.status === "paid" ? "Payé" : p.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
