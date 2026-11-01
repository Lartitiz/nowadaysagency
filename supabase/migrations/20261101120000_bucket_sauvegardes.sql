-- Bucket PRIVÉ des exports de sécurité mensuels (edge export-securite).
-- Aucune policy sur storage.objects pour ce bucket : seul le service_role
-- (l'edge) peut lire et écrire. Les clientes et le rôle anon n'y ont pas accès.
INSERT INTO storage.buckets (id, name, public)
VALUES ('sauvegardes', 'sauvegardes', false)
ON CONFLICT (id) DO NOTHING;
