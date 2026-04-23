import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useSeries, type SerieSummary } from "@/hooks/use-series";
import EditableField from "@/components/branding/EditableField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  MoreVertical,
  Pencil,
  Pause,
  Play,
  Archive,
  Trash2,
  Sparkles,
  ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";

const CADENCE_LABELS: Record<string, string> = {
  weekly: "Hebdo",
  biweekly: "Tous les 15 jours",
  monthly: "Mensuel",
  irregular: "Irrégulier",
};

const CHANNEL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  newsletter: "Newsletter",
  website: "Site web",
};

const PILLAR_KEYS: Array<SerieSummary["pillar_key"]> = [
  "pillar_major",
  "pillar_minor_1",
  "pillar_minor_2",
  "pillar_minor_3",
];

interface SeriesFicheCardsProps {
  onLaunchCoaching: () => void;
  hasRecap: boolean;
}

export default function SeriesFicheCards({ onLaunchCoaching, hasRecap }: SeriesFicheCardsProps) {
  const { activeSeries, archivedSeries, series, loading, refetch, updateStatus, deleteSerie } = useSeries();
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [pillarLabels, setPillarLabels] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Fetch pillar labels from brand_strategy
  useEffect(() => {
    if (!user || !value) return;
    const loadPillars = async () => {
      const { data } = await (supabase.from("brand_strategy" as any) as any)
        .select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3")
        .eq(column, value)
        .maybeSingle();
      if (data) {
        setPillarLabels({
          pillar_major: data.pillar_major || "",
          pillar_minor_1: data.pillar_minor_1 || "",
          pillar_minor_2: data.pillar_minor_2 || "",
          pillar_minor_3: data.pillar_minor_3 || "",
        });
      }
    };
    loadPillars();
  }, [user?.id, column, value]);

  const inactive = series.filter((s) => s.status === "paused");
  const visibleSeries = [...activeSeries, ...inactive];

  // ─── CASE A — No editorial pillars yet ───
  if (!hasRecap) {
    return (
      <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-8 text-center space-y-4 max-w-2xl mx-auto">
        <div className="text-4xl">📺</div>
        <h3 className="font-display text-xl font-bold text-foreground">
          Tu n'as pas encore défini tes piliers éditoriaux.
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
          Pas de souci : le coaching séries peut poser tes piliers et tes séries dans la même session.
          On commence par les piliers, puis on les incarne en séries signatures.
        </p>
        <Button onClick={onLaunchCoaching} className="rounded-full gap-2">
          <Sparkles className="h-4 w-4" />
          Lancer le coaching séries
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground mb-1">
            📺 Mes séries signatures
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Les rendez-vous éditoriaux qui structurent ta communication dans la durée.
          </p>
        </div>
        {!loading && activeSeries.length >= 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onLaunchCoaching}
            className="rounded-full gap-2 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Affiner mes séries
          </Button>
        )}
      </div>

      {/* CASE B — Loading */}
      {loading && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-muted/40 animate-pulse h-44"
            />
          ))}
        </div>
      )}

      {/* CASE C — Empty (recap OK, 0 series) */}
      {!loading && series.length === 0 && (
        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-8 text-center space-y-4 max-w-2xl mx-auto">
          <div className="text-4xl">✨</div>
          <h3 className="font-display text-xl font-bold text-foreground">
            Tu n'as pas encore défini de série.
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
            Une série = un rendez-vous éditorial récurrent : même promesse, même format, même cadence.
            Exemple : « Le cas client du vendredi » — chaque vendredi, un carrousel qui décortique une situation client.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
            L'IA part de tes piliers éditoriaux pour te proposer 1 à 3 séries signatures
            qui vont structurer ta communication dans la durée.
          </p>
          <Button onClick={onLaunchCoaching} className="rounded-full gap-2">
            <Sparkles className="h-4 w-4" />
            Lancer le coaching séries
          </Button>
        </div>
      )}

      {/* CASE D — Active + paused list */}
      {!loading && visibleSeries.length > 0 && (
        <div className="space-y-4">
          {visibleSeries.map((serie) => (
            <SerieCard
              key={serie.id}
              serie={serie}
              pillarLabels={pillarLabels}
              isEditing={editingId === serie.id}
              onStartEdit={() => setEditingId(serie.id)}
              onStopEdit={() => setEditingId(null)}
              onUpdated={refetch}
              onUpdateStatus={updateStatus}
              onRequestDelete={() => setConfirmDeleteId(serie.id)}
              column={column}
              value={value}
            />
          ))}
        </div>
      )}

      {/* Archived accordion */}
      {!loading && archivedSeries.length > 0 && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="archived" className="border-none">
            <AccordionTrigger className="text-sm text-muted-foreground hover:no-underline">
              📦 Séries archivées ({archivedSeries.length})
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2">
                {archivedSeries.map((serie) => (
                  <SerieCard
                    key={serie.id}
                    serie={serie}
                    pillarLabels={pillarLabels}
                    isArchived
                    isEditing={false}
                    onStartEdit={() => {}}
                    onStopEdit={() => {}}
                    onUpdated={refetch}
                    onUpdateStatus={updateStatus}
                    onRequestDelete={() => setConfirmDeleteId(serie.id)}
                    column={column}
                    value={value}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette série ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive. Les posts du calendrier liés à cette série
              ne seront pas supprimés mais perdront leur lien.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (confirmDeleteId) {
                  await deleteSerie(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Single serie card ───────────────────────────────────

interface SerieCardProps {
  serie: SerieSummary;
  pillarLabels: Record<string, string>;
  isEditing?: boolean;
  isArchived?: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdated: () => Promise<void>;
  onUpdateStatus: (id: string, status: SerieSummary["status"]) => Promise<void>;
  onRequestDelete: () => void;
  column: string;
  value: string;
}

function SerieCard({
  serie,
  pillarLabels,
  isEditing = false,
  isArchived = false,
  onStartEdit,
  onStopEdit,
  onUpdated,
  onUpdateStatus,
  onRequestDelete,
  column,
  value,
}: SerieCardProps) {
  const isPaused = serie.status === "paused";
  const pillarLabel = serie.pillar_key
    ? pillarLabels[serie.pillar_key] || "Pilier"
    : "Transversale";

  const handleSelectChange = useCallback(
    async (field: keyof SerieSummary, newValue: any) => {
      const { error } = await (supabase.from("series" as any) as any)
        .update({ [field]: newValue })
        .eq("id", serie.id);
      if (error) {
        toast.error("Erreur de sauvegarde");
        return;
      }
      toast.success("C'est noté !");
      await onUpdated();
    },
    [serie.id, onUpdated]
  );

  const toggleChannel = useCallback(
    async (channelId: string, checked: boolean) => {
      const current = serie.channels || [];
      const next = checked
        ? Array.from(new Set([...current, channelId]))
        : current.filter((c) => c !== channelId);
      await handleSelectChange("channels", next);
    },
    [serie.channels, handleSelectChange]
  );

  return (
    <div
      className={`rounded-2xl border border-border bg-card p-5 transition-opacity ${
        isArchived ? "opacity-50" : isPaused ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-lg font-bold text-foreground">{serie.name}</h3>
            {isPaused && (
              <Badge variant="secondary" className="text-xs">En pause</Badge>
            )}
            {isArchived && (
              <Badge variant="outline" className="text-xs">Archivée</Badge>
            )}
          </div>
          {serie.promise && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{serie.promise}</p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Options">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isArchived ? (
              <>
                <DropdownMenuItem onClick={() => onUpdateStatus(serie.id, "active")}>
                  <ArchiveRestore className="h-4 w-4 mr-2" />
                  Réactiver
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onRequestDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={isEditing ? onStopEdit : onStartEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  {isEditing ? "Terminer l'édition" : "Éditer"}
                </DropdownMenuItem>
                {isPaused ? (
                  <DropdownMenuItem onClick={() => onUpdateStatus(serie.id, "active")}>
                    <Play className="h-4 w-4 mr-2" />
                    Réactiver
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onUpdateStatus(serie.id, "paused")}>
                    <Pause className="h-4 w-4 mr-2" />
                    Mettre en pause
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onUpdateStatus(serie.id, "archived")}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archiver
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onRequestDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body */}
      {!isEditing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="secondary"
              className={
                serie.pillar_key
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-muted text-muted-foreground"
              }
            >
              🎯 {pillarLabel}
            </Badge>
            {serie.cadence && CADENCE_LABELS[serie.cadence] && (
              <Badge variant="outline" className="bg-background">
                🗓️ {CADENCE_LABELS[serie.cadence]}
              </Badge>
            )}
            {serie.format_template && (
              <Badge variant="outline" className="bg-background">
                🎬 {serie.format_template}
              </Badge>
            )}
            {(serie.channels || []).map((c) => (
              <Badge key={c} variant="outline" className="bg-background text-xs">
                {CHANNEL_LABELS[c] || c}
              </Badge>
            ))}
          </div>
          {serie.signature_description && serie.signature_description.trim() && (
            <p className="text-xs italic text-muted-foreground leading-relaxed">
              ✨ {serie.signature_description}
            </p>
          )}
          {serie.notes && serie.notes.trim() && (
            <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
              📝 {serie.notes}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2 border-t border-border pt-4">
          <EditableField
            label="Nom de la série"
            value={serie.name}
            field="name"
            table="series"
            idField="id"
            recordId={serie.id}
            multiline={false}
            onUpdated={onUpdated}
          />
          <EditableField
            label="Promesse"
            value={serie.promise}
            field="promise"
            table="series"
            idField="id"
            recordId={serie.id}
            onUpdated={onUpdated}
          />
          <EditableField
            label="Format type"
            value={serie.format_template}
            field="format_template"
            table="series"
            idField="id"
            recordId={serie.id}
            multiline={false}
            onUpdated={onUpdated}
          />
          <EditableField
            label="Signature visuelle / éditoriale"
            value={serie.signature_description}
            field="signature_description"
            table="series"
            idField="id"
            recordId={serie.id}
            onUpdated={onUpdated}
          />
          <EditableField
            label="Notes internes"
            value={serie.notes}
            field="notes"
            table="series"
            idField="id"
            recordId={serie.id}
            onUpdated={onUpdated}
          />

          {/* Pilier select */}
          <div className="mb-4">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block font-medium">
              Pilier rattaché
            </Label>
            <Select
              value={serie.pillar_key ?? "none"}
              onValueChange={(v) => handleSelectChange("pillar_key", v === "none" ? null : v)}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Transversale (aucun pilier)</SelectItem>
                {PILLAR_KEYS.map((k) => (
                  <SelectItem key={k!} value={k!} disabled={!pillarLabels[k!]}>
                    {pillarLabels[k!] || k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cadence select */}
          <div className="mb-4">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block font-medium">
              Cadence
            </Label>
            <Select
              value={serie.cadence ?? "none"}
              onValueChange={(v) => handleSelectChange("cadence", v === "none" ? null : v)}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non définie</SelectItem>
                {Object.entries(CADENCE_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Channels checkboxes */}
          <div className="mb-4">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block font-medium">
              Canaux
            </Label>
            <div className="flex flex-wrap gap-3">
              {Object.entries(CHANNEL_LABELS).map(([id, label]) => {
                const checked = (serie.channels || []).includes(id);
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 text-sm cursor-pointer select-none"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggleChannel(id, c === true)}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-2">
            <Button onClick={onStopEdit} size="sm" className="rounded-full">
              Terminer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
