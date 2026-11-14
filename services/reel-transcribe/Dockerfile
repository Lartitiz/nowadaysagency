FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Modèle rangé dans l'image : aucun téléchargement au démarrage d'une machine.
ENV WHISPER_MODEL=small WHISPER_MODEL_DIR=/models
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8', download_root='/models')"
COPY app.py ./
ENV HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1
CMD ["python", "app.py"]
