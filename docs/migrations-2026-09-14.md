# Migrations du 14 septembre 2026

Les fichiers ci-dessous sont les sept migrations effectivement enregistrées par Lovable. Les copies initiales non enregistrées ont été retirées pour éviter un second passage des mêmes CREATE POLICY/TRIGGER. Le registre de production est conservé.

| Fichier validé initialement | Fichier enregistré à conserver |
| --- | --- |
| `20260914110000_pinterest_persistence.sql` | `20260914123926_cb3d4d57-0b5c-4767-801b-74306805f65b.sql` |
| `20260914143000_linkedin_safe_persistence.sql` | `20260914124011_3b4ca480-b998-48a6-aef8-fc3f79ad1c3d.sql` |
| `20260914144500_calendar_share_contract.sql` | `20260914124114_a3377741-e722-4a33-a69b-b7ca2776ca4f.sql` |
| `20260914150000_shared_branding_links_scope.sql` | `20260914124141_f8e265d2-6b91-453c-af17-d8e34a37da97.sql` |
| `20260914153000_launch_calendar_recovery.sql` | `20260914124242_1ac59d7a-0dd2-4759-8dbb-5f970f9b640d.sql` |
| `20260914154500_crosspost_persistence.sql` | `20260914124713_0f976596-d53a-4a2e-8cad-ba9d9c6b6e0d.sql` |
| `20260914160000_settings_preferences.sql` | `20260914124736_af23de31-5862-4e99-b49b-e74c8993e523.sql` |

Le SQL correspond exactement aux fichiers validés, sauf les deux lignes de création du bucket crosspost-sources : Lovable impose son outil natif de stockage. Sur un nouvel environnement, créer d’abord un bucket de nom/id `crosspost-sources`, **public=false**, sans policy automatique supplémentaire. La migration ajoute les seules policies nécessaires sur storage.objects : lecture membre, dépôt/suppression propriétaire ou gestionnaire/éditeur, aucun UPDATE. Le test jetable reproduit ce prérequis et vérifie existence et confidentialité.

Les tests SQL pointent sur les fichiers enregistrés. Les versions initiales ne doivent pas être rejouées. Le contenu client et les affectations historiques des 20 tables contrôlées sont inchangés après les sept applications (empreintes avant/après identiques).
