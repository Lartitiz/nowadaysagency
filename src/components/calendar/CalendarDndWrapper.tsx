import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

// closestCenter seul rendait le panneau idées inatteignable : sa colonne est si
// haute que son centre est toujours plus loin qu'une cellule de jour → le drop
// retombait sur une date. On cible d'abord la zone sous le pointeur.
const pointerFirstCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCenter(args);
};

interface CalendarDndWrapperProps {
  children: ReactNode;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  overlayContent: ReactNode | null;
}

export default function CalendarDndWrapper({
  children,
  onDragStart,
  onDragEnd,
  overlayContent,
}: CalendarDndWrapperProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerFirstCollision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {children}
      <DragOverlay>
        {overlayContent}
      </DragOverlay>
    </DndContext>
  );
}
