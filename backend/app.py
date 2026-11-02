import os
import io
import zipfile
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

API_KEY = os.getenv("AUDIOSHAKE_API_KEY", "").strip()
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "100"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
AUDIO_SHAKE_BASE = "https://api.audioshake.ai"

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"}
# Four dedicated stems plus residual = five returned tracks.
TARGETS = [
    {"model": "vocals", "formats": ["wav"]},
    {"model": "drums", "formats": ["wav"]},
    {"model": "bass", "formats": ["wav"]},
    {"model": "piano", "formats": ["wav"]},
    {"model": "residual", "formats": ["wav"]},
]

app = FastAPI(title="STEMLAB AI API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def provider_headers() -> dict[str, str]:
    if not API_KEY or API_KEY == "replace_me":
        raise HTTPException(
            status_code=503,
            detail="Falta configurar AUDIOSHAKE_API_KEY en backend/.env",
        )
    return {"x-api-key": API_KEY}


def provider_error(response: requests.Response) -> None:
    if not response.ok:
        try:
            detail = response.json()
        except Exception:
            detail = response.text[:1000]
        raise HTTPException(
            status_code=502,
            detail={"message": "El proveedor de audio rechazó la solicitud", "provider": detail},
        )


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "STEMLAB AI", "provider_configured": bool(API_KEY and API_KEY != "replace_me")}


@app.post("/api/separations")
async def create_separation(file: UploadFile = File(...)) -> dict[str, Any]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Formato no admitido. Usa MP3, WAV, FLAC, M4A, AAC u OGG.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"El archivo supera el límite de {MAX_UPLOAD_MB} MB.")

    headers = provider_headers()
    safe_name = Path(file.filename or f"audio{suffix}").name

    # Upload directly from the backend so the provider key never reaches the browser.
    try:
        upload_response = requests.post(
            f"{AUDIO_SHAKE_BASE}/assets",
            headers=headers,
            files={"file": (safe_name, content, file.content_type or "application/octet-stream")},
            timeout=180,
        )
        provider_error(upload_response)
        asset = upload_response.json()
        asset_id = asset.get("id")
        if not asset_id:
            raise HTTPException(status_code=502, detail="AudioShake no devolvió un identificador de archivo.")

        task_response = requests.post(
            f"{AUDIO_SHAKE_BASE}/tasks",
            headers={**headers, "Content-Type": "application/json"},
            json={"assetId": asset_id, "targets": TARGETS},
            timeout=60,
        )
        provider_error(task_response)
        task = task_response.json()
        task_id = task.get("id")
        if not task_id:
            raise HTTPException(status_code=502, detail="AudioShake no devolvió un identificador de tarea.")

        return {
            "task_id": task_id,
            "status": "processing",
            "filename": safe_name,
            "message": "La separación comenzó correctamente.",
        }
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="El proveedor tardó demasiado en responder. Intenta nuevamente.")
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con el proveedor: {str(exc)}")


@app.get("/api/separations/{task_id}")
def get_separation(task_id: str) -> dict[str, Any]:
    if not task_id or len(task_id) > 200 or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for ch in task_id):
        raise HTTPException(status_code=400, detail="Identificador de tarea inválido.")

    headers = provider_headers()
    try:
        response = requests.get(f"{AUDIO_SHAKE_BASE}/tasks/{task_id}", headers=headers, timeout=45)
        provider_error(response)
        task = response.json()
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="No se pudo consultar el estado a tiempo.")
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar la tarea: {str(exc)}")

    targets = task.get("targets") or []
    normalized = []
    all_completed = bool(targets)
    any_failed = False

    labels = {
        "vocals": "Voz",
        "drums": "Batería",
        "bass": "Bajo",
        "piano": "Piano",
        "residual": "Otros instrumentos",
    }

    for target in targets:
        model = (target.get("model") or "").lower()
        status = (target.get("status") or "processing").lower()
        if status not in {"completed", "complete", "succeeded"}:
            all_completed = False
        if status in {"failed", "error"}:
            any_failed = True

        outputs = target.get("output") or []
        for output in outputs:
            link = output.get("link")
            if link:
                normalized.append({
                    "id": target.get("id") or model,
                    "model": model,
                    "name": labels.get(model, model or "Pista"),
                    "format": output.get("format") or "wav",
                    "url": link,
                    "status": status,
                })

    if any_failed:
        overall = "failed"
    elif all_completed:
        overall = "completed"
    else:
        overall = "processing"

    return {
        "task_id": task.get("id", task_id),
        "status": overall,
        "targets": [
            {
                "model": t.get("model"),
                "status": t.get("status"),
                "error": t.get("error"),
            }
            for t in targets
        ],
        "stems": normalized,
        "cost": task.get("cost"),
    }


@app.get("/api/separations/{task_id}/download")
def download_stems_zip(task_id: str):
    """Build a ZIP server-side so browser CORS rules on provider URLs do not block downloads."""
    task_data = get_separation(task_id)
    if task_data["status"] != "completed":
        raise HTTPException(status_code=409, detail="La separación todavía no está completa.")
    if not task_data["stems"]:
        raise HTTPException(status_code=404, detail="No se encontraron pistas para descargar.")

    archive = io.BytesIO()
    try:
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
            for index, stem in enumerate(task_data["stems"], start=1):
                audio_response = requests.get(stem["url"], timeout=180)
                audio_response.raise_for_status()
                safe_name = stem["name"].lower().replace(" ", "-")
                ext = stem.get("format") or "wav"
                zf.writestr(f"{index:02d}-{safe_name}.{ext}", audio_response.content)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"No se pudieron recuperar todas las pistas: {str(exc)}")

    archive.seek(0)
    return StreamingResponse(
        archive,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="STEMLAB-AI-pistas.zip"'}
    )


# Serve the built web app from the same service in production.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    if not FRONTEND_DIST.exists():
        raise HTTPException(status_code=404, detail="Frontend no disponible. Ejecuta el build de producción.")
    requested = (FRONTEND_DIST / full_path).resolve()
    if full_path and requested.is_file() and FRONTEND_DIST.resolve() in requested.parents:
        return FileResponse(requested)
    return FileResponse(FRONTEND_DIST / "index.html")
