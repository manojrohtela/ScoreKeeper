from pydantic import BaseModel


class PlayerStanding(BaseModel):
    rank: int
    name: str
    total: int
    matches: dict[str, int]


class StandingsResponse(BaseModel):
    players: list[PlayerStanding]
    match_headers: list[str]


class UploadResponse(BaseModel):
    match_name: str
    match_number: int
    extracted: dict[str, int]
    message: str


class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str
