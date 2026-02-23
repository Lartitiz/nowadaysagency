import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import IntakeQuestionnaire from "@/components/coaching/IntakeQuestionnaire";

export default function IntakePage() {
  const [searchParams] = useSearchParams();
  const programId = searchParams.get("program") || "demo";

  return (
    <ProtectedRoute>
      <IntakeQuestionnaire programId={programId} />
    </ProtectedRoute>
  );
}
