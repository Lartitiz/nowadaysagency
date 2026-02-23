import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, toLocalDateStr } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (date: string) => void;
  contentLabel: string;
  contentEmoji?: string;
  defaultDate?: Date;
  loading?: boolean;
}

export function AddToCalendarDialog({
  open,
  onOpenChange,
  onConfirm,
  contentLabel,
  contentEmoji = "📅",
  defaultDate,
  loading,
}: Props) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate || tomorrow);

  const handleConfirm = () => {
    const dateStr = toLocalDateStr(selectedDate);
    onConfirm(dateStr);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {contentEmoji} Ajouter au calendrier
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">{contentLabel}</p>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal rounded-[10px] h-11",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate
                    ? format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })
                    : "Choisis une date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full rounded-pill"
          >
            ✅ Ajouter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
