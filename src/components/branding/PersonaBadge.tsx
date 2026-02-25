import { usePersonas } from "@/hooks/use-personas";
import { Crown } from "lucide-react";

interface PersonaBadgeProps {
  channel?: string;
  className?: string;
}

/**
 * Displays a small badge showing which persona is active for a given channel.
 * Shows nothing if there's only one persona or none.
 */
export default function PersonaBadge({ channel, className }: PersonaBadgeProps) {
  const { personas, getPersonaForChannel } = usePersonas();

  // Don't show if only one or no persona
  if (personas.length <= 1) return null;

  const persona = channel ? getPersonaForChannel(channel) : personas.find((p) => p.is_primary) || null;
  if (!persona) return null;

  const label = persona.label || persona.portrait_prenom || "Persona principal";

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground ${className || ""}`}>
      🎯 Persona : <span className="font-medium text-foreground">{label}</span>
      {persona.is_primary && <Crown className="h-2.5 w-2.5 text-primary" />}
    </span>
  );
}
