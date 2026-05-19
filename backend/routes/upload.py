import base64
import math
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response

from auth import get_current_user
from database import db

router = APIRouter(prefix="/api")

ALLOWED_TYPES = {"jpg", "jpeg", "png", "gif", "webp", "svg"}
MAX_SIZE_MB = 10


def _resolve_ext(filename: str, content_type: str) -> str:
    ext = filename.split(".")[-1].lower() if filename and "." in filename else ""
    if not ext or ext not in ALLOWED_TYPES:
        mime_map = {
            "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
            "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
        }
        ext = mime_map.get(content_type or "", "bin")
    return ext


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    ext = _resolve_ext(file.filename or "", file.content_type or "")
    if ext not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Image must be under {MAX_SIZE_MB}MB")

    image_id = str(uuid.uuid4())
    content_type = file.content_type or f"image/{ext}"
    name = file.filename if file.filename and file.filename != "blob" else f"image.{ext}"

    await db.images.insert_one({
        "id": image_id,
        "name": name,
        "data": base64.b64encode(content).decode(),
        "content_type": content_type,
        "size": len(content),
        "created_at": datetime.utcnow().isoformat(),
    })

    return {"id": image_id, "filename": image_id, "url": f"/api/images/{image_id}"}


@router.get("/images")
async def list_images(
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=100),
    search: str = Query("", alias="q"),
    current_user=Depends(get_current_user),
):
    query = {}
    if search:
        query["name"] = {"$regex": search, "$options": "i"}

    total = await db.images.count_documents(query)
    skip = (page - 1) * limit
    cursor = db.images.find(query, {"_id": 0, "data": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)

    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": max(1, math.ceil(total / limit)),
    }


@router.get("/images/{image_id}")
async def get_image(image_id: str):
    doc = await db.images.find_one({"id": image_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")
    content = base64.b64decode(doc["data"])
    return Response(
        content=content,
        media_type=doc.get("content_type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.delete("/images/{image_id}")
async def delete_image(image_id: str, current_user=Depends(get_current_user)):
    result = await db.images.delete_one({"id": image_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"ok": True}


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
