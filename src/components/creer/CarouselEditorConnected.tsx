import type { ComponentProps } from "react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { useCarouselStyles } from "@/hooks/use-carousel-styles";

/** L'éditeur, branché sur « Mes styles » de l'espace de travail. */
export default function CarouselEditorConnected(props: Omit<ComponentProps<typeof CarouselEditor>, "savedStyles">) {
  const savedStyles = useCarouselStyles();
  return <CarouselEditor {...props} savedStyles={savedStyles} />;
}
