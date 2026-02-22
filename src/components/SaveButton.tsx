import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SaveButtonProps {
  hasChanges: boolean;
  saving: boolean;
  onSave: () => Promise<void> | void;
  className?: string;
}

export default function SaveButton({ hasChanges, saving, onSave, className }: SaveButtonProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [wasSaving, setWasSaving] = useState(false);

  // Detect transition from saving → not saving = success
  useEffect(() => {
    if (wasSaving && !saving) {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 2000);
      return () => clearTimeout(t);
    }
    setWasSaving(saving);
  }, [saving, wasSaving]);

  const isInactive = !hasChanges && !saving && !showSuccess;

  return (
    <Button
      onClick={onSave}
      disabled={isInactive || saving}
      className={cn(
        "rounded-pill h-12 w-full text-[15px] font-semibold transition-all duration-300",
        saving && "opacity-70",
        isInactive && "bg-muted text-muted-foreground cursor-not-allowed hover:bg-muted",
        hasChanges && !saving && !showSuccess && "animate-pulse-subtle",
        className
      )}
    >
      {saving ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Enregistrement...
        </>
      ) : showSuccess ? (
        <>
          <Check className="h-4 w-4 mr-2" />
          ✅ Enregistré
        </>
      ) : (
        "Sauvegarder"
      )}
    </Button>
  );
}
