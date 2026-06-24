-- Les tokens de partage étaient générés en base64 « standard » (caractères + / =),
-- non sûrs en URL : un « / » casse la route /calendrier/partage/:token, un « + »
-- devient une espace une fois décodé. On bascule sur du base64url sans padding.
-- (translate : '+' -> '-', '/' -> '_', '=' -> supprimé.)

ALTER TABLE calendar_shares
  ALTER COLUMN share_token
  SET DEFAULT translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');

-- Répare les tokens existants contenant des caractères non URL-safe.
-- (Les liens déjà distribués avec ces caractères étaient de toute façon cassés ;
--  un lien re-copié depuis l'app pointera désormais vers le token corrigé.)
-- Les tokens déjà URL-safe ne sont pas touchés (préserve les liens fonctionnels).
UPDATE calendar_shares
SET share_token = translate(share_token, '+/=', '-_')
WHERE share_token ~ '[+/=]';
