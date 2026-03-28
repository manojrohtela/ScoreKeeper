from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from .models import (
    AdminActionResponse,
    AdminMatchDetailResponse,
    ChangeCodeRequest, ChangeCodeResponse,
    ChatRequest, ChatResponse,
    ConfirmUploadRequest, ConfirmUploadResponse,
    ExtractResponse,
    MatchListResponse,
    StandingsResponse,
    VerifyCodeRequest, VerifyCodeResponse,
)
from .service import get_service

router = APIRouter()


# ── Admin code ────────────────────────────────────────────────────────────────
@router.post("/verify-code", response_model=VerifyCodeResponse)
def verify_code(req: VerifyCodeRequest):
    return VerifyCodeResponse(valid=get_service().verify_code(req.code))


@router.post("/change-code", response_model=ChangeCodeResponse)
def change_code(req: ChangeCodeRequest):
    success, message = get_service().change_code(req.old_code, req.new_code)
    return ChangeCodeResponse(success=success, message=message)


# ── Admin: match data management ──────────────────────────────────────────────
@router.get("/matches", response_model=MatchListResponse)
def list_matches():
    return MatchListResponse(matches=get_service().list_matches())


@router.get("/matches/{match_id}", response_model=AdminMatchDetailResponse)
def get_match(match_id: int):
    try:
        return AdminMatchDetailResponse(**get_service().get_match(match_id))
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/matches/{match_id}/update", response_model=AdminActionResponse)
def update_match(match_id: int, req: ConfirmUploadRequest):
    if not get_service().verify_code(req.code):
        raise HTTPException(401, "Invalid admin code.")
    try:
        match_name, _ = get_service().update_match(
            match_id,
            [p.model_dump() for p in req.players],
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Failed to update match: {e}")
    return AdminActionResponse(success=True, message=f"{match_name} updated successfully.")


@router.post("/matches/{match_id}/delete", response_model=AdminActionResponse)
def delete_match(match_id: int, req: VerifyCodeRequest):
    if not get_service().verify_code(req.code):
        raise HTTPException(401, "Invalid admin code.")
    try:
        match_name = get_service().delete_match(match_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Failed to delete match: {e}")
    return AdminActionResponse(success=True, message=f"{match_name} deleted successfully.")


@router.post("/reset-data", response_model=AdminActionResponse)
def reset_data(req: VerifyCodeRequest):
    if not get_service().verify_code(req.code):
        raise HTTPException(401, "Invalid admin code.")
    try:
        get_service().reset_data()
    except Exception as e:
        raise HTTPException(500, f"Failed to reset data: {e}")
    return AdminActionResponse(success=True, message="All match data has been reset.")


# ── Upload: extract only (no save) ───────────────────────────────────────────
@router.post("/upload", response_model=ExtractResponse)
async def upload_match(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Only image files are supported.")
    image_bytes = await file.read()
    try:
        players = get_service().extract_from_image(image_bytes, file.content_type or "image/jpeg")
    except ValueError as e:
        raise HTTPException(413, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, f"Image extraction failed: {e}")
    return ExtractResponse(players=players)


# ── Confirm: verify code + save ───────────────────────────────────────────────
@router.post("/confirm-upload", response_model=ConfirmUploadResponse)
def confirm_upload(req: ConfirmUploadRequest):
    if not get_service().verify_code(req.code):
        raise HTTPException(401, "Invalid admin code.")
    try:
        match_name, match_number = get_service().save_match(
            [p.model_dump() for p in req.players]
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to save: {e}")
    return ConfirmUploadResponse(
        match_name=match_name,
        match_number=match_number,
        message=f"{match_name} saved successfully with {len(req.players)} players.",
    )


# ── Standings ─────────────────────────────────────────────────────────────────
@router.get("/standings", response_model=StandingsResponse)
def get_standings():
    try:
        data = get_service().get_standings()
        return StandingsResponse(**data)
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Chat ──────────────────────────────────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        return ChatResponse(answer=get_service().chat(req.question))
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Export ────────────────────────────────────────────────────────────────────
@router.get("/export")
def export_xlsx():
    try:
        return Response(
            content=get_service().export_xlsx(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=scores.xlsx"},
        )
    except Exception as e:
        raise HTTPException(500, str(e))
