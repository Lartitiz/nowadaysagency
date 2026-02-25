import { cn } from "@/lib/utils";

interface CharacterCounterProps {
  text: string;
  maxLength: number;
  label?: string;
}

export default function CharacterCounter({ text, maxLength, label }: CharacterCounterProps) {
  const count = text.length;
  const isOver = count > maxLength;
  const isClose = count > maxLength * 0.9;

  return (
    <div className={cn(
      "text-xs font-medium tabular-nums transition-colors",
      isOver ? "text-destructive" : isClose ? "text-amber-500" : "text-muted-foreground"
    )}>
      {count}/{maxLength} {label || "caractères"}
      {isOver && <span className="ml-1">⚠️ Trop long !</span>}
    </div>
  );
}
