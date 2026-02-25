import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useUserPlan } from "@/hooks/use-user-plan";

export default function StudioWidget() {
  const { isStudio } = useUserPlan();
  if (!isStudio) return null;

  return (
    <div
      className="rounded-2xl border border-border bg-card p-5"
      style={{ background: "linear-gradient(180deg, hsl(48 100% 95%) 0%, hsl(0 0% 100%) 40%)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🌟</span>
        <h3 className="font-display text-lg font-bold text-foreground">Mon accompagnement</h3>
      </div>

      <div className="mb-3">
        <Progress value={50} className="h-2" />
        <p className="text-xs text-muted-foreground mt-1">Progression dans le programme</p>
      </div>

      <Link
        to="/studio"
        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Accéder à mon espace Studio <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
