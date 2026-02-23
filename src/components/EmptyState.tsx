import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: string;
  title: string;
  body: string;
  cta?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, body, cta, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <span className="text-5xl mb-4">{icon}</span>}
      <h3 className="font-heading text-xl font-bold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-sm mb-6">{body}</p>
      {cta && onAction && (
        <Button onClick={onAction}>{cta}</Button>
      )}
    </div>
  );
}
