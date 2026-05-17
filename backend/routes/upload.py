import base64
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response

from database import db

router = APIRouter(prefix="/api")

ALLOWED_TYPES = {"jpg", "jpeg", "png", "gif", "webp", "svg"}
MAX_SIZE_MB = 10


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    if ext not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Image must be under {MAX_SIZE_MB}MB")

    image_id = str(uuid.uuid4())
    content_type = file.content_type or f"image/{ext}"

    await db.images.insert_one({
        "id": image_id,
        "data": base64.b64encode(content).decode(),
        "content_type": content_type,
        "created_at": datetime.utcnow().isoformat(),
    })

    return {"filename": image_id, "url": f"/api/images/{image_id}"}


@router.get("/images/{image_id}")
async def get_image(image_id: str):
    doc = await db.images.find_one({"id": image_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")
    content = base64.b64decode(doc["data"])
    return Response(content=content, media_type=doc.get("content_type", "image/jpeg"))


# Backward-compat: serve old disk-uploaded files if they still exist
from pathlib import Path
from fastapi.responses import FileResponse

_UPLOAD_DIR = Path(__file__).parent.parent / "uploads"

@router.get("/uploads/{filename}")
async def get_upload(filename: str):
    filepath = _UPLOAD_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath)
