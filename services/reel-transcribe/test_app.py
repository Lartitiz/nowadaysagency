"""Tests sans modèle : python3 -m unittest test_app (depuis ce dossier)."""

import unittest

import app


class CleanWords(unittest.TestCase):
    def test_elisions_recollees(self):
        raw = [("Bonjour,", 0, 0.5), (" je", 0.9, 1.1), (" m", 1.1, 1.2), (" 'appelle", 1.2, 1.5), (" aujourd", 2, 2.4), (" 'hui", 2.4, 2.8)]
        self.assertEqual(
            [(w["text"], w["start"], w["end"]) for w in app.clean_words(raw)],
            [("Bonjour,", 0, 0.5), ("je", 0.9, 1.1), ("m’appelle", 1.1, 1.5), ("aujourd’hui", 2, 2.8)],
        )

    def test_bruit_retire_et_ponctuation_collee(self):
        raw = [("♪", 0, 1), ("C’est", 1, 1.2), ("vrai", 1.2, 1.5), (" ?", 1.5, 1.6)]
        self.assertEqual([w["text"] for w in app.clean_words(raw)], ["C’est", "vrai\u00a0?"])

    def test_nombres_json(self):
        import json
        import numpy as np

        json.dumps(app.clean_words([("Oui", np.float64(0.1), np.float64(0.4))]))


class ParseItems(unittest.TestCase):
    def test_refuse_http_et_durees_folles(self):
        self.assertIsNone(app.parse_items({"items": [{"url": "http://x.fr/a.mp4", "duration": 5}]}))
        self.assertIsNone(app.parse_items({"items": [{"url": "https://x.fr/a.mp4", "duration": 500}]}))
        self.assertIsNone(app.parse_items({"items": []}))

    def test_accepte_un_morceau(self):
        self.assertEqual(
            app.parse_items({"items": [{"url": "https://x.fr/a.mp4", "seek": "2", "duration": 8}]}),
            [{"url": "https://x.fr/a.mp4", "seek": 2.0, "duration": 8.0}],
        )


if __name__ == "__main__":
    unittest.main()
