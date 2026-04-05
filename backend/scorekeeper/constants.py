from __future__ import annotations

DB_FILENAME = "scores.db"
DEFAULT_ADMIN_CODE = "dheeraj351"
MAX_IMAGE_BYTES = 3 * 1024 * 1024
VISION_IMAGE_MAX_DIMENSION = 2048
VISION_IMAGE_MIN_DIMENSION = 1200
VISION_IMAGE_UPSCALE_FACTOR = 2
VISION_IMAGE_CONTRAST = 1.15
VISION_IMAGE_SHARPNESS = 1.25
VISION_ROW_CROP_BANDS: list[tuple[float, float, float, float]] = [
    (0.00, 0.36, 1.00, 0.50),
    (0.00, 0.42, 1.00, 0.56),
    (0.00, 0.48, 1.00, 0.62),
    (0.00, 0.54, 1.00, 0.68),
    (0.00, 0.60, 1.00, 0.74),
    (0.00, 0.66, 1.00, 0.80),
    (0.00, 0.72, 1.00, 0.86),
    (0.00, 0.78, 1.00, 0.92),
    (0.00, 0.84, 1.00, 1.00),
]
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
CHAT_MODEL = "llama-3.3-70b-versatile"

PLAYER_DEFINITIONS: list[dict[str, object]] = [
    {
        "username": "dheeraj3515",
        "display_name": "Dheeraj comptition wale",
        "aliases": ["dhee13101671", "dheeraj3551"],
    },
    {"username": "BishanRocks", "display_name": "Bishan ji photo wale", "aliases": []},
    {"username": "SagarJajoriya", "display_name": "Sagar AI news wale", "aliases": []},
    {"username": "devbanna11", "display_name": "Dev ji pornhub wale", "aliases": []},
    {"username": "m_cynophilist", "display_name": "Manoj Gyanchodi wale", "aliases": []},
    {"username": "RahulIndiaRock", "display_name": "Rahul Sir paise wale", "aliases": []},
    {"username": "Gambler.gb.rcb", "display_name": "Pandey ji 3 baar call wale", "aliases": []},
    {"username": "amitp0107", "display_name": "Amit hamesha gayab rhne wale", "aliases": []},
]

FIXED_PLAYERS: list[tuple[str, str]] = [
    (str(player["username"]), str(player["display_name"])) for player in PLAYER_DEFINITIONS
]

PLAYER_ALIAS_TO_CANONICAL: dict[str, str] = {
    alias: str(player["username"])
    for player in PLAYER_DEFINITIONS
    for alias in player.get("aliases", [])
}

MATCHABLE_USERNAMES: list[str] = [
    str(player["username"]) for player in PLAYER_DEFINITIONS
] + [
    alias for player in PLAYER_DEFINITIONS for alias in player.get("aliases", [])
]

GROQ_KEY_MISSING_ERROR = (
    "GROQ_API_KEY is not configured. Set it in backend/.env before using upload or chat."
)
IMAGE_TOO_LARGE_ERROR = "Image is too large for vision upload. Please use a photo under 3 MB."
NO_MATCH_DATA_MESSAGE = (
    "अभी तक कोई match data नहीं है। / No match data yet. Please upload a match image first."
)

VISION_PROMPT = (
    "This is a mobile screenshot of a fantasy cricket leaderboard.\n"
    "The leaderboard contains 8 player rows. Read every visible row, not just the first few.\n"
    "Also read the match title/team matchup shown at the top of the screenshot, such as 'GT vs RR'.\n"
    "If a match title is visible, extract it exactly as shown and exclude words like 'Live' or UI labels.\n"
    "Extract only the visible player/team usernames and their numeric score/points.\n"
    "Ignore headers, logos, buttons, tabs, icons, and any surrounding UI text.\n"
    "Preserve usernames exactly as shown, including underscores, dots, and digits.\n"
    "If a username is partially unclear, use the closest visible spelling from the screenshot.\n"
    "Return every row you can see, even if some are partially cut off.\n"
    "Return ONLY valid JSON — no markdown, no explanation:\n"
    '{"match_title": "GT vs RR", "players": [{"name": "...", "points": 42}, ...]}\n'
    "Keep names exactly as shown."
)

VISION_CROP_PROMPT = (
    "This is a cropped slice of a fantasy cricket leaderboard screenshot.\n"
    "Read every visible player/team row in this slice.\n"
    "There may be only 1 or 2 rows visible here.\n"
    "If a match title is visible in this slice, extract it exactly as shown and exclude words like 'Live' or UI labels.\n"
    "Extract only visible usernames and their numeric score/points.\n"
    "Ignore headers, logos, buttons, tabs, icons, and any surrounding UI text.\n"
    "Preserve usernames exactly as shown, including underscores, dots, and digits.\n"
    "Return ONLY valid JSON — no markdown, no explanation:\n"
    '{"match_title": "", "players": [{"name": "...", "points": 42}, ...]}\n'
    "Keep names exactly as shown."
)

CHAT_SYSTEM_PROMPT_PREFIX = (
    "You are a helpful points/score assistant for a game leaderboard. "
    "Answer questions about player scores and match standings. "
    "Players have both a username and a display name — use display names in answers. "
    "The user may ask in Hindi or English — always respond in the SAME language. "
    "Be concise and friendly.\n\n"
)
