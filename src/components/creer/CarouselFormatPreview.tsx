import examplePhoto from "@/assets/laetitia-photo.webp";

export type CarouselPreviewMode = "text" | "photo" | "mix" | "pure_photo" | "user_slides";

/** A real three-slide example, using the user's photos when already selected. */
export default function CarouselFormatPreview({ mode, photos = [] }: { mode: CarouselPreviewMode; photos?: string[] }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-1.5 w-full mb-2">
      {[0, 1, 2].map((i) => {
        const photo = mode === "photo" || mode === "pure_photo" || (mode === "mix" && i !== 1);
        const overlay = mode === "photo";
        return (
          <div key={i} className={`relative aspect-[4/5] overflow-hidden rounded-lg border border-black/5 ${i === 1 ? "bg-bordeaux text-white" : "bg-rose-pale text-bordeaux"}`}>
            {photo ? (
              <>
                <img src={photos[i % Math.max(photos.length, 1)] || examplePhoto} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: i === 1 ? "55% 30%" : "50% 60%" }} />
                {overlay && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6 text-white text-[10px] sm:text-[11px] leading-tight font-semibold">{["Dans les coulisses", "Un autre regard", "À ton tour"][i]}</div>}
              </>
            ) : (
              <div className="h-full p-2 sm:p-3 flex flex-col justify-center gap-2">
                <span className="text-[8px] uppercase tracking-wider opacity-75">{mode === "user_slides" ? "Ton texte" : `0${i + 1}`}</span>
                <span className="font-display text-[12px] sm:text-[15px] leading-tight">{mode === "user_slides" ? ["Tes mots,", "ton message,", "ton style."][i] : ["Une idée à partager", "Ce qui compte", "Et maintenant ?"][i]}</span>
                <span className="space-y-1"><span className="block h-0.5 rounded bg-current opacity-30" /><span className="block h-0.5 w-3/4 rounded bg-current opacity-30" /></span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
