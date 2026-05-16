from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pathlib import Path
import uuid

router = APIRouter(prefix="/api")

UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    if ext not in ("jpg", "jpeg", "png", "gif", "webp", "svg"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    filename = f"{uuid.uuid4()}.{ext}"
    filepath = UPLOAD_DIR / filename
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    return {"filename": filename, "url": f"/api/uploads/{filename}"}


@router.get("/uploads/{filename}")
async def get_upload(filename: str):
    filepath = UPLOAD_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath)
