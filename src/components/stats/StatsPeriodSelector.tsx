import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type PeriodPreset, PERIOD_LABELS } from "./stats-types";

interface StatsPeriodSelectorProps {
  periodPreset: PeriodPreset;
  onPresetChange: (v: PeriodPreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  monthOptions: { value: string; label: string }[];
}

export default function StatsPeriodSelector({
  periodPreset, onPresetChange,
  customFrom, customTo, onCustomFromChange, onCustomToChange,
  monthOptions,
}: StatsPeriodSelectorProps) {
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-sm font-medium">Période :</Label>
        <Select value={periodPreset} onValueChange={v => onPresetChange(v as PeriodPreset)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map(k => (
              <SelectItem key={k} value={k}>{PERIOD_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {periodPreset === "custom" && (
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-sm">Du :</Label>
          <Select value={customFrom} onValueChange={onCustomFromChange}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label className="text-sm">Au :</Label>
          <Select value={customTo} onValueChange={onCustomToChange}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}
