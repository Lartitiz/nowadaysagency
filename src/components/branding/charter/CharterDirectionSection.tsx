import { Textarea } from "@/components/ui/textarea";

export type VisualDirection = {
  composition?: string;
  light?: string;
  framing?: string;
  retouch?: string;
  video_motion?: string;
};

const fields: { key: keyof VisualDirection; label: string; help: string; example: string }[] = [
  { key: "composition", label: "Composition et formes", help: "Place du sujet, espace pour le texte, lignes, formes ou mise en page récurrente.", example: "Ex. : sujet à droite, titre libre à gauche ; beaucoup d'espace" },
  { key: "light", label: "Lumière", help: "Ce que l'on doit retrouver dans tes photos ou plans vidéo.", example: "Ex. : lumière de fenêtre douce, ombres visibles" },
  { key: "framing", label: "Cadrage", help: "Distance, angle et place laissée autour du sujet.", example: "Ex. : détails des mains et plans larges de l'atelier" },
  { key: "retouch", label: "Retouche et rendu", help: "Grain, contraste, saturation ou traitements à éviter.", example: "Ex. : couleurs fidèles, grain discret, peau non lissée" },
  { key: "video_motion", label: "Vidéo et mouvement", help: "Rythme, mouvement de caméra et transitions souhaités.", example: "Ex. : plans calmes, caméra fixe, coupes simples" },
];

export default function CharterDirectionSection({ value, onChange }: {
  value: VisualDirection;
  onChange: (value: VisualDirection) => void;
}) {
  return <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="visual-direction-title">
    <h2 id="visual-direction-title" className="font-body text-base font-bold text-foreground">Ma direction photo et vidéo</h2>
    <p className="mt-1 mb-4 text-sm text-muted-foreground">Décris seulement les choix qui comptent pour ta marque. Tu peux les ajuster après chaque création.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(({ key, label, help, example }) => <div key={key} className={key === "video_motion" ? "sm:col-span-2" : ""}>
        <label htmlFor={`direction-${key}`} className="block text-sm font-medium text-foreground">{label}</label>
        <p className="mb-2 text-xs text-muted-foreground">{help}</p>
        <Textarea id={`direction-${key}`} value={value[key] || ""} onChange={e => onChange({ ...value, [key]: e.target.value })}
          placeholder={example} maxLength={500} rows={2} className="text-sm" />
      </div>)}
    </div>
    <p className="mt-4 text-xs text-muted-foreground">Le Studio photo reçoit tes indications photo. Pour un clip, tu peux reprendre le style vidéo dans sa consigne et le corriger avant le devis. Le résultat reste à vérifier.</p>
  </section>;
}
