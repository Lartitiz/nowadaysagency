import type { ComponentProps } from "react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { useCarouselStyles } from "@/hooks/use-carousel-styles";
import { useSlideRedoApi } from "@/hooks/use-slide-redo-api";

/** L'éditeur, branché sur « Mes styles » de l'espace de travail et sur « Refaire cette slide ». */
export default function CarouselEditorConnected(props: Omit<ComponentProps<typeof CarouselEditor>, "savedStyles" | "slideRedo">) {
  const savedStyles = useCarouselStyles();
  const slideRedo = useSlideRedoApi();
  return <CarouselEditor {...props} savedStyles={savedStyles} slideRedo={slideRedo} />;
}
