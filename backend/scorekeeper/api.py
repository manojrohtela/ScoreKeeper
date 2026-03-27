from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from .models import ChatRequest, ChatResponse, StandingsResponse, UploadResponse
from .service import get_service

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_match(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Only image files are supported (JPEG, PNG, etc.)")
    svc = get_service()
    image_bytes = await file.read()
    try:
        extracted = svc.parse_image(image_bytes, file.content_type or "image/jpeg")
    except Exception as e:
        raise HTTPException(500, f"Image parsing failed: {e}")
    if not extracted:
        raise HTTPException(422, "Could not extract any player scores. Please try a clearer image.")
    try:
        match_name, match_number = svc.add_match(extracted)
    except Exception as e:
        raise HTTPException(500, f"Failed to save to database: {e}")
    return UploadResponse(
        match_name=match_name,
        match_number=match_number,
        extracted=extracted,
        message=f"{match_name} saved — {len(extracted)} player(s) recorded.",
    )


@router.get("/standings", response_model=StandingsResponse)
def get_standings():
    try:
        data = get_service().get_standings()
        return StandingsResponse(**data)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        return ChatResponse(answer=get_service().chat(req.question))
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/export")
def export_xlsx():
    try:
        xlsx_bytes = get_service().export_xlsx()
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=scores.xlsx"},
        )
    except Exception as e:
        raise HTTPException(500, str(e))
