import laetitiaPhoto from "@/assets/laetitia-photo.webp";

export default function FounderPhoto() {
  return (
    <img
      src={laetitiaPhoto}
      alt="Laetitia, fondatrice de Nowadays"
      className="w-full max-w-xs rounded-2xl shadow-strong object-cover aspect-[3/4]"
      loading="lazy"
      decoding="async"
    />
  );
}
