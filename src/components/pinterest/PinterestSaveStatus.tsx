import { Button } from "@/components/ui/button";
export default function PinterestSaveStatus({ editor }: { editor: { loading: boolean; saving: boolean; error: string; dirty: boolean; canWrite: boolean; load: () => Promise<void> } }) {
  return <div aria-live="polite" className="my-3 text-sm">
    {editor.loading ? <p>Chargement…</p> : editor.saving ? <p>Enregistrement…</p> : editor.error ? <div role="alert"><p>{editor.error}</p><Button variant="outline" onClick={() => void editor.load()}>Réessayer la lecture</Button></div> : editor.dirty ? <p>Modifications non enregistrées</p> : null}
    {!editor.loading && !editor.canWrite && <p>Lecture seule</p>}
  </div>;
}
