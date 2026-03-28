from __future__ import annotations

DB_FILENAME = "scores.db"
DEFAULT_ADMIN_CODE = "dheeraj351"
MAX_IMAGE_BYTES = 3 * 1024 * 1024
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
CHAT_MODEL = "llama-3.3-70b-versatile"

FIXED_PLAYERS: list[tuple[str, str]] = [
    ("dheeraj3515",    "Dheeraj comptition wale"),
    ("BishanRocks",    "Bishan ji photo wale"),
    ("SagarJajoriya",  "Sagar AI news wale"),
    ("devbanna11",     "Dev ji pornhub wale"),
    ("m_cynophilist",  "Manoj Gyanchodi wale"),
    ("RahulIndiaRock", "Rahul Sir paise wale"),
    ("Gambler.gb.rcb", "Pandey ji 3 baar call wale"),
    ("amitp0107",      "Amit hamesha gayab rhne wale"),
]

GROQ_KEY_MISSING_ERROR = (
    "GROQ_API_KEY is not configured. Set it in backend/.env before using upload or chat."
)
IMAGE_TOO_LARGE_ERROR = "Image is too large for vision upload. Please use a photo under 3 MB."
NO_MATCH_DATA_MESSAGE = (
    "अभी तक कोई match data नहीं है। / No match data yet. Please upload a match image first."
)

VISION_PROMPT = (
    "Extract every player username/name and their numeric score/points from this image.\n"
    "Return ONLY valid JSON — no markdown, no explanation:\n"
    '{"players": [{"name": "...", "points": 42}, ...]}\n'
    "Keep names exactly as shown."
)

CHAT_SYSTEM_PROMPT_PREFIX = (
    "You are a helpful points/score assistant for a game leaderboard. "
    "Answer questions about player scores and match standings. "
    "Players have both a username and a display name — use display names in answers. "
    "The user may ask in Hindi or English — always respond in the SAME language. "
    "Be concise and friendly.\n\n"
)
