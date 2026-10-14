// Séquence de lancement : attente « chapitre N/5 » puis un onglet par chapitre.
// Sorti à l'identique de CreerUnifie.tsx (lot E, docs/robustesse/gros-fichiers.md,
// fiche 1). Affichage pur : la séquence vit dans use-launch-sequence.ts, les
// actions (Modifier, Repartir de zéro, Régénérer, Copier) restent dans la page.
import { lazy } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";

const CreerStepResult = lazy(() => import("@/components/creer/CreerStepResult"));

type Props = {
  launchGenerating: boolean;
  launchIndex: number;
  launchResults: any[];
  setLaunchResults: (update: (prev: any[]) => any[]) => void;
  selectedFormat: string | null;
  onEdit: () => void;
  onReset: () => void;
  onRegenerate: () => void;
  onCopy: (text: string) => void;
  photos: any[] | undefined;
  ideaText: string;
  objective: string | null;
  editorialAngle: string | null;
};

export default function LaunchSequenceResults({
  launchGenerating, launchIndex, launchResults, setLaunchResults, selectedFormat,
  onEdit, onReset, onRegenerate, onCopy, photos, ideaText, objective, editorialAngle,
}: Props) {
  return (
    <div className="space-y-4 animate-fade-in">
      {launchGenerating ? (
        <div className="py-12 text-center space-y-3">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-sm font-medium text-foreground">
            Génération du chapitre {launchIndex + 1}/5…
          </p>
          <p className="text-xs text-muted-foreground">
            Ce format génère une séquence de 5 posts (un par chapitre).
          </p>
        </div>
      ) : (
        <Tabs defaultValue="0">
          <TabsList className="w-full flex-wrap h-auto gap-1">
            {launchResults.map((_, i) => (
              <TabsTrigger key={i} value={String(i)} className="text-xs">
                Chapitre {i + 1}
              </TabsTrigger>
            ))}
          </TabsList>
          {launchResults.map((res, i) => (
            <TabsContent key={i} value={String(i)}>
              <CreerStepResult
                result={res?.raw || res}
                format={selectedFormat || "post"}
                generating={false}
                onEdit={onEdit}
                onResultTextChange={(text) => setLaunchResults((prev) => prev.map((chapter, index) => index !== i ? chapter : chapter?.raw ? { ...chapter, raw: { ...chapter.raw, edited_text: text, content: text } } : { ...chapter, edited_text: text, content: text }))}
                onReset={onReset}
                onRegenerate={onRegenerate}
                onCopy={onCopy}
                usedPhotoCount={photos ? photos.length : undefined}
                photos={photos}
                sourceIdea={ideaText}
                sourceObjective={objective}
                sourceAngle={editorialAngle}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
