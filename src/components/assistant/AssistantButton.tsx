import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useSession } from "@/contexts/SessionContext";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AssistantButton() {
  const { isActive: sessionActive } = useSession();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (sessionActive) return null;
  if (!user) return null;

  // Hide FAB on the chat page itself
  const isDashboard = location.pathname === "/dashboard" || location.pathname === "/dashboard/guide";
  if (isDashboard) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => navigate("/dashboard")}
          className={cn(
            "fixed z-50 flex items-center justify-center",
            "bg-primary text-primary-foreground shadow-lg",
            "hover:scale-105 transition-transform duration-200",
            "w-12 h-12 rounded-2xl",
            "bottom-4 right-4 md:bottom-6 md:right-6",
            // Above mobile tab bar
            "max-md:bottom-20 max-md:w-11 max-md:h-11"
          )}
          aria-label="Parler à mon assistant"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        Parler à mon assistant
      </TooltipContent>
    </Tooltip>
  );
}
