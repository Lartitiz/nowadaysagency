import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

interface ChecklistItem {
  id: string;
  label: string;
  tip: string;
}

interface DailyChecklistProps {
  date: string;
  isLaunching: boolean;
  items: ChecklistItem[];
  checked: string[];
  onToggle: (id: string) => void;
  threshold: number;
}

const CRUISE_ITEMS: ChecklistItem[] = [
  { id: "reply_comments", label: "Répondre à tous mes commentaires du jour", tip: "Les réponses dans l'heure boostent ta visibilité" },
  { id: "reply_dm", label: "Répondre à tous mes DM", tip: "Les DM sont le signal n°1 pour l'algorithme" },
  { id: "comment_others", label: "Commenter 5-10 comptes de ma liste stratégique", tip: "Des commentaires de +4 mots, pas juste des emojis" },
  { id: "story_interactive", label: "Publier 1 story interactive (sondage, question, quiz)", tip: "Les stickers interactifs boostent tes vues de 15-25%" },
  { id: "dm_outreach", label: "Envoyer 2-3 DM à des personnes qui ont interagi", tip: "\"J'ai vu que tu avais répondu à mon sondage, merci !\"" },
];

const LAUNCH_ITEMS: ChecklistItem[] = [
  { id: "reply_dm_urgent", label: "Répondre à TOUS les DM (dans l'heure si possible)", tip: "40-60% des ventes passent par les DM pendant un lancement" },
  { id: "reply_comments", label: "Répondre à tous les commentaires", tip: "Chaque commentaire booste la portée de ton post" },
  { id: "publish_stories", label: "Publier ma séquence de stories du jour", tip: "Les stories sont le format n°1 de conversion" },
  { id: "dm_prospects", label: "Envoyer 5-10 DM personnalisés aux personnes intéressées", tip: "Celles qui votent \"oui\" à tes sondages sont chaudes" },
  { id: "story_interactive", label: "1 story interactive (sondage ou question)", tip: "\"Tu veux que je t'envoie les détails en DM ?\"" },
  { id: "check_stats", label: "Checker les stats du post du jour (10 min)", tip: "Note le reach et les saves, compare avec hier" },
];

export function getDefaultItems(isLaunching: boolean): ChecklistItem[] {
  return isLaunching ? LAUNCH_ITEMS : CRUISE_ITEMS;
}

export default function DailyChecklist({ date, isLaunching, items, checked, onToggle, threshold }: DailyChecklistProps) {
  const checkedCount = checked.length;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">
          ✅ Ma routine engagement
        </h2>
        {isLaunching && (
          <span className="text-[10px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">🚀 Lancement</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{date}</span>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <label key={item.id} className="flex gap-3 cursor-pointer group">
            <Checkbox
              checked={checked.includes(item.id)}
              onCheckedChange={() => onToggle(item.id)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className={`text-sm font-medium transition-colors ${checked.includes(item.id) ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {item.label}
              </p>
              <p className="text-[11px] text-muted-foreground italic mt-0.5">💡 {item.tip}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="pt-2 border-t border-border flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-foreground">{checkedCount}/{items.length}</span> — {threshold} minimum pour maintenir ton streak 🔥
        </p>
        {checkedCount >= threshold && (
          <span className="text-xs font-bold text-primary">✅ Streak maintenu !</span>
        )}
      </div>
    </div>
  );
}
