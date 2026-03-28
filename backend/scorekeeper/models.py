from pydantic import BaseModel


# ── Standings ──────────────────────────────────────────────────────────────
class PlayerStanding(BaseModel):
    rank: int
    username: str
    display_name: str
    total: int
    matches: dict[str, int]


class StandingsResponse(BaseModel):
    players: list[PlayerStanding]
    match_headers: list[str]


class MatchSummary(BaseModel):
    id: int
    name: str


class AdminMatchPlayer(BaseModel):
    username: str
    display_name: str
    points: int


class AdminMatchDetailResponse(BaseModel):
    match_id: int
    match_name: str
    players: list[AdminMatchPlayer]


class MatchListResponse(BaseModel):
    matches: list[MatchSummary]


# ── Upload / Extract ────────────────────────────────────────────────────────
class ExtractedPlayer(BaseModel):
    username: str
    display_name: str
    raw_name: str      # what the AI actually read from the image
    points: int


class ExtractResponse(BaseModel):
    players: list[ExtractedPlayer]   # all 8 fixed players, points pre-filled from image


# ── Confirm upload ──────────────────────────────────────────────────────────
class PlayerScore(BaseModel):
    username: str
    points: int


class ConfirmUploadRequest(BaseModel):
    code: str
    players: list[PlayerScore]


class ConfirmUploadResponse(BaseModel):
    match_name: str
    match_number: int
    message: str


# ── Admin code ──────────────────────────────────────────────────────────────
class VerifyCodeRequest(BaseModel):
    code: str


class VerifyCodeResponse(BaseModel):
    valid: bool


class ChangeCodeRequest(BaseModel):
    old_code: str
    new_code: str


class ChangeCodeResponse(BaseModel):
    success: bool
    message: str


class AdminActionResponse(BaseModel):
    success: bool
    message: str


# ── Chat ────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str
