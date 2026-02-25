interface CharacterCounterProps {
  count: number;
  max: number;
  sweetSpot?: { min: number; max: number };
}

export default function CharacterCounter({ count, max, sweetSpot }: CharacterCounterProps) {
  const inSweetSpot = sweetSpot && count >= sweetSpot.min && count <= sweetSpot.max;
  const overMax = count > max;
  const color = overMax
    ? "text-destructive"
    : inSweetSpot
    ? "text-green-600"
    : sweetSpot && (count < sweetSpot.min || count > sweetSpot.max)
    ? "text-orange-600"
    : "text-muted-foreground";

  return (
    <span className={`text-xs font-medium ${color}`}>
      {count} / {max} car.
      {inSweetSpot && " ✨ Sweet spot"}
      {overMax && " — Trop long"}
    </span>
  );
}
