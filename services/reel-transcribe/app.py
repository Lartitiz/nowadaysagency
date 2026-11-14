"""Écoute de la voix des reels (Google Cloud Run, projet nowadays-reels-1113).

Rend le moment où chaque mot est dit, pour caler les sous-titres mot à mot des
reels « Je me filme » (son du clip) et « voix enregistrée » montés par
HyperFrames. Décidé le 14/11/2026 : Whisper (faster-whisper, modèle `small`,
français) hébergé chez nous plutôt qu'un service payant à l'usage.

Service PRIVÉ : seul le relais `reel-render-gateway` l'appelle (jeton d'identité
Google, droit `run.invoker`). Le relais vérifie la session de la cliente et
garde les résultats en cache ; ici, rien n'est stocké.

POST /transcribe  {"items": [{"url": "...", "seek": 0, "duration": 8.5}]}
→ {"items": [{"words": [{"text": "Bonjour", "start": 0.12, "end": 0.48}]}]}
Les temps sont en secondes depuis le début du morceau demandé (après `seek`).
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
MODEL_DIR = os.environ.get("WHISPER_MODEL_DIR", "/models")
LANGUAGE = "fr"
MAX_ITEMS = 12
MAX_ITEM_SECONDS = 70.0
MAX_BODY_BYTES = 20_000

_model = None
_pipeline = None
_model_lock = threading.Lock()
# Une écoute à la fois par machine : le modèle prend tous les processeurs.
_run_lock = threading.Lock()


def get_pipeline():
    """Modèle chargé une fois par machine. Le traitement par lots découpe la voix
    sur les silences : 57 s de voix écoutées en ~7 s au lieu de ~50 s (mesuré le 14/11)."""
    global _model, _pipeline
    with _model_lock:
        if _pipeline is None:
            from faster_whisper import BatchedInferencePipeline, WhisperModel

            _model = WhisperModel(
                MODEL_NAME,
                device="cpu",
                compute_type="int8",
                download_root=MODEL_DIR,
                cpu_threads=os.cpu_count() or 4,
            )
            _pipeline = BatchedInferencePipeline(model=_model)
        return _pipeline


def valid_url(url: object) -> bool:
    if not isinstance(url, str) or len(url) > 2000:
        return False
    parsed = urlparse(url)
    return parsed.scheme == "https" and bool(parsed.hostname)


def extract_audio(url: str, seek: float, duration: float, out_path: str) -> None:
    """Son du morceau demandé, en mono 16 kHz (ce qu'attend Whisper). Marche pour un clip vidéo ou un fichier audio."""
    cmd = [
        "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
        "-ss", f"{max(seek, 0):.3f}", "-t", f"{duration:.3f}",
        "-i", url, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", out_path,
    ]
    subprocess.run(cmd, check=True, timeout=90)


def has_audio(path: str) -> bool:
    return os.path.exists(path) and os.path.getsize(path) > 1000


APOSTROPHES = ("'", "’")


def clean_words(raw: list[tuple[str, float, float]]) -> list[dict]:
    """Mots prêts à afficher : bruit retiré, élisions recollées (« m » + « 'appelle » → « m’appelle »)."""
    words: list[dict] = []
    for text, start, end in raw:
        text = text.strip().replace("'", "’")
        if not text or not any(ch.isalnum() for ch in text):
            if words and text and not text.startswith(("♪", "�")):
                # Typographie française : espace insécable avant ? ! : ;
                words[-1]["text"] += ("\u00a0" if text[0] in "?!:;»" else "") + text
            continue
        if words and (text.startswith("’") or words[-1]["text"].endswith("’")):
            words[-1]["text"] += text
            words[-1]["end"] = round(float(end), 3)
            continue
        words.append({"text": text, "start": round(float(start), 3), "end": round(float(end), 3)})
    return words


def words_of(path: str) -> list[dict]:
    segments, _info = get_pipeline().transcribe(
        path,
        language=LANGUAGE,
        word_timestamps=True,
        beam_size=5,
        batch_size=4,
    )
    return clean_words([(w.word, w.start, w.end) for segment in segments for w in (segment.words or [])])


def transcribe_items(items: list[dict]) -> list[dict]:
    results = []
    with tempfile.TemporaryDirectory() as tmp, _run_lock:
        for index, item in enumerate(items):
            path = os.path.join(tmp, f"{index}.wav")
            try:
                extract_audio(item["url"], float(item.get("seek") or 0), float(item["duration"]), path)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                # Clip sans piste son ou lien illisible : pas de sous-titres pour ce morceau, le reste continue.
                results.append({"words": [], "error": "audio_unreadable"})
                continue
            results.append({"words": words_of(path) if has_audio(path) else []})
    return results


def parse_items(body: dict) -> list[dict] | None:
    items = body.get("items")
    if not isinstance(items, list) or not 0 < len(items) <= MAX_ITEMS:
        return None
    clean = []
    for item in items:
        if not isinstance(item, dict) or not valid_url(item.get("url")):
            return None
        try:
            seek = float(item.get("seek") or 0)
            duration = float(item.get("duration"))
        except (TypeError, ValueError):
            return None
        if not (0 <= seek < 3600 and 0 < duration <= MAX_ITEM_SECONDS):
            return None
        clean.append({"url": item["url"], "seek": seek, "duration": duration})
    return clean


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            return self._send(200, {"ok": True, "model": MODEL_NAME})
        return self._send(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/transcribe":
            return self._send(404, {"error": "not_found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            return self._send(413, {"error": "too_large"})
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._send(400, {"error": "invalid_json"})
        items = parse_items(body if isinstance(body, dict) else {})
        if items is None:
            return self._send(400, {"error": "invalid_items"})
        try:
            results = transcribe_items(items)
        except Exception as error:  # noqa: BLE001
            print(json.dumps({"event": "reel_transcribe_error", "message": str(error)[:300]}), flush=True)
            return self._send(500, {"error": "internal"})
        total = sum(len(r["words"]) for r in results)
        print(json.dumps({"event": "reel_transcribe_done", "items": len(items), "words": total}), flush=True)
        return self._send(200, {"items": results})

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return


if __name__ == "__main__":
    # Modèle chargé au démarrage : la première écoute n'attend pas le chargement.
    threading.Thread(target=get_pipeline, daemon=True).start()
    port = int(os.environ.get("PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
