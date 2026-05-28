# Fix bug "Edge Function" sur le Coach engagement

## Diagnostic

Le bug n'est pas dans l'edge function `engagement-coaching` — c'est un **classique bug de closure React** côté `EngagementCoachingDialog.tsx`.

```ts
// ligne 78
const handleTonSelect = (t: string) => {
  setTon(t);
  generate();   // ❌ lit `ton` depuis le state PRÉCÉDENT (encore "")
};
```

Comme `setTon` est asynchrone, `generate()` est exécutée avec la closure où `ton === ""`. Le body envoyé contient `ton_envie: ""`, et l'edge function (qui valide les champs requis via `validateRequiredFields(..., ["post_text", "objectif", "ton_envie", "platform"])`) renvoie une erreur. Côté UI ça remonte en toast "Erreur — Impossible de générer", d'où l'impression d'un "bug Edge Function".

## Fix

Passer la valeur directement à `generate(tValue)` au lieu de relire le state :

```ts
const generate = async (tonValue: string) => {
  setLoading(true);
  try {
    const { data, error } = await invokeWithTimeout("engagement-coaching", {
      body: {
        post_text: postText,
        objectif,
        ton_envie: tonValue,         // ← valeur explicite, plus de closure stale
        platform,
        workspace_id: workspaceId !== user?.id ? workspaceId : undefined,
      },
    }, 60000);
    if (error) throw new Error(error.message);
    setResult(data);
  } catch (e: any) {
    toast({ title: "Erreur", description: e.message || "Impossible de générer", variant: "destructive" });
  } finally {
    setLoading(false);
  }
};

const handleTonSelect = (t: string) => {
  setTon(t);
  generate(t);   // ← passage direct
};
```

## Fichier touché

- `src/components/engagement/EngagementCoachingDialog.tsx` — signature de `generate` + appel dans `handleTonSelect`.

Pas de changement backend, pas de migration.
