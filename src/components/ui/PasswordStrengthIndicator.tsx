import { useMemo } from "react";

interface Props {
  password: string;
}

export default function PasswordStrengthIndicator({ password }: Props) {
  const { level, label, color, width } = useMemo(() => {
    if (password.length < 8)
      return { level: 0, label: "Trop court", color: "bg-red-500", width: "w-1/4" };
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    if (hasUpper && hasDigit)
      return { level: 3, label: "Fort", color: "bg-green-500", width: "w-full" };
    if (hasUpper || hasDigit)
      return { level: 2, label: "Moyen", color: "bg-yellow-500", width: "w-3/4" };
    return { level: 1, label: "Faible", color: "bg-orange-500", width: "w-1/2" };
  }, [password]);

  if (!password) return null;

  return (
    <div className="flex items-center gap-2 h-5">
      <div className="h-1.5 flex-1 rounded-[10px] bg-muted overflow-hidden">
        <div className={`h-full ${color} ${width} transition-all duration-300 rounded-[10px]`} />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
    </div>
  );
}
