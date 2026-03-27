from fastapi import APIRouter, File, HTTPException, UploadFile

from .models import ChatRequest, ChatResponse, StandingsResponse, UploadResponse
from .service import get_service

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_match(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported (JPEG, PNG, etc.)")

    svc = get_service()
    image_bytes = await file.read()

    try:
        extracted = svc.parse_image(image_bytes, file.content_type or "image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image parsing failed: {e}")

    if not extracted:
        raise HTTPException(status_code=422, detail="Could not extract any player scores from the image. Please try a clearer image.")

    try:
        match_name, match_number = svc.add_match(extracted)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update sheet: {e}")

    return UploadResponse(
        match_name=match_name,
        match_number=match_number,
        extracted=extracted,
        message=f"{match_name} saved — {len(extracted)} player(s) recorded.",
    )


@router.get("/standings", response_model=StandingsResponse)
def get_standings():
    try:
        return get_service().get_standings()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        answer = get_service().chat(req.question)
        return ChatResponse(answer=answer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
