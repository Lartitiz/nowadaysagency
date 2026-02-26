import { useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Slide {
  title: string;
  body: string;
  slideNumber: number;
}

interface CarouselSliderProps {
  slides: Slide[];
  mediaUrls?: string[];
}

export function CarouselSlider({ slides, mediaUrls }: CarouselSliderProps) {
  const [current, setCurrent] = useState(0);
  const touchStart = useRef<number | null>(null);

  const prev = useCallback(() => setCurrent(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setCurrent(i => Math.min(slides.length - 1, i + 1)), [slides.length]);

  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) { diff > 0 ? next() : prev(); }
    touchStart.current = null;
  };

  const slide = slides[current];

  return (
    <div
      className="relative w-full aspect-square select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Counter */}
      <span className="absolute top-3 right-3 z-10 text-[10px] font-semibold bg-black/50 text-white px-2 py-0.5 rounded-full">
        {current + 1}/{slides.length}
      </span>

      {/* Arrows */}
      {current > 0 && (
        <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/80 flex items-center justify-center shadow-sm hover:bg-white transition-colors">
          <ChevronLeft className="h-4 w-4 text-gray-700" />
        </button>
      )}
      {current < slides.length - 1 && (
        <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/80 flex items-center justify-center shadow-sm hover:bg-white transition-colors">
          <ChevronRight className="h-4 w-4 text-gray-700" />
        </button>
      )}

      {/* Content */}
      {mediaUrls && mediaUrls[current] ? (
        <img src={mediaUrls[current]} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center px-8" style={{ background: "linear-gradient(135deg, hsl(340 60% 96%), hsl(30 60% 97%))" }}>
          <p className="text-xl font-bold text-gray-900 text-center leading-tight mb-2" style={{ fontFamily: "'Libre Baskerville', serif" }}>
            {slide?.title}
          </p>
          <p className="text-sm text-gray-600 text-center leading-relaxed max-w-[80%]">
            {slide?.body}
          </p>
        </div>
      )}

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`rounded-full transition-all ${i === current ? "w-1.5 h-1.5 bg-blue-500" : "w-1.5 h-1.5 bg-gray-400/50"}`}
          />
        ))}
      </div>
    </div>
  );
}
