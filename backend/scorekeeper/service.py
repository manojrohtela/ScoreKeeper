import base64
import json
import re
import sqlite3
from difflib import SequenceMatcher
from pathlib import Path

from groq import Groq

from .config import get_settings

DB_PATH = Path(__file__).parent / "scores.db"
MAX_IMAGE_BYTES = 3 * 1024 * 1024

# ── Fixed 8 players ──────────────────────────────────────────────────────────
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

DEFAULT_CODE = "dheeraj351"


# ── DB helpers ────────────────────────────────────────────────────────────────
def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _init_db() -> None:
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS players (
                username     TEXT PRIMARY KEY,
                display_name TEXT NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS matches (
                id   INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS scores (
                username TEXT    NOT NULL,
                match_id INTEGER NOT NULL REFERENCES matches(id),
                points   INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (username, match_id)
            )
        """)

        # Seed default admin code if not set
        con.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_code', ?)",
            (DEFAULT_CODE,),
        )

        # Seed fixed players
        for username, display_name in FIXED_PLAYERS:
            con.execute(
                "INSERT OR IGNORE INTO players (username, display_name) VALUES (?,?)",
                (username, display_name),
            )


# ── Fuzzy name → username matching ───────────────────────────────────────────
def _clean(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _fuzzy_match(raw: str, usernames: list[str]) -> tuple[str, float]:
    """Return (best_username, ratio). ratio >= 0.5 is a match."""
    raw_c = _clean(raw)
    best, best_ratio = usernames[0], 0.0
    for u in usernames:
        ratio = SequenceMatcher(None, raw_c, _clean(u)).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best = u
    return best, best_ratio


# ── Service ───────────────────────────────────────────────────────────────────
class ScoreKeeperService:
    def __init__(self):
        _init_db()
        self._usernames = [u for u, _ in FIXED_PLAYERS]
        self._groq: Groq | None = None

    def _get_groq(self) -> Groq:
        api_key = get_settings().groq_api_key.strip()
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not configured. Set it in backend/.env before using upload or chat."
            )
        if self._groq is None:
            self._groq = Groq(api_key=api_key)
        return self._groq

    # ── Admin code ─────────────────────────────────────────────────────────

    def verify_code(self, code: str) -> bool:
        with _conn() as con:
            row = con.execute("SELECT value FROM settings WHERE key='admin_code'").fetchone()
        return row and row["value"] == code

    def change_code(self, old_code: str, new_code: str) -> tuple[bool, str]:
        if not self.verify_code(old_code):
            return False, "Galat purana code hai. / Old code is incorrect."
        if len(new_code) < 4:
            return False, "New code must be at least 4 characters."
        with _conn() as con:
            con.execute("UPDATE settings SET value=? WHERE key='admin_code'", (new_code,))
        return True, "Code successfully changed!"

    # ── Image extraction ────────────────────────────────────────────────────

    def extract_from_image(self, image_bytes: bytes, content_type: str) -> list[dict]:
        """
        Call vision LLM, fuzzy-map names to the 8 fixed players.
        Returns list of {username, display_name, raw_name, points} for ALL 8 players.
        """
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise ValueError(
                "Image is too large for vision upload. Please use a photo under 3 MB."
            )
        groq = self._get_groq()
        b64 = base64.b64encode(image_bytes).decode()
        completion = groq.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{content_type};base64,{b64}"},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Extract every player username/name and their numeric score/points "
                            "from this image.\n"
                            "Return ONLY valid JSON — no markdown, no explanation:\n"
                            '{"players": [{"name": "...", "points": 42}, ...]}\n'
                            "Keep names exactly as shown."
                        ),
                    },
                ],
            }],
            max_tokens=1024,
        )

        raw = re.sub(r"```(?:json)?", "", completion.choices[0].message.content or "").strip()
        try:
            result = json.loads(raw)
        except Exception:
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            result = json.loads(m.group()) if m else {}

        extracted: dict[str, int] = {}   # raw_name → points (before mapping)
        matched_raw: dict[str, str] = {} # username → raw_name

        for p in result.get("players", []):
            name = str(p.get("name", "")).strip()
            pts_raw = str(p.get("points", "0")).lstrip("-")
            if not name or not pts_raw.isdigit():
                continue
            username, ratio = _fuzzy_match(name, self._usernames)
            if ratio >= 0.5:
                # Only overwrite if this is a better match
                if username not in extracted or ratio > 0:
                    extracted[username] = int(p["points"])
                    matched_raw[username] = name

        # Build full list of all 8 players
        player_map = {u: dn for u, dn in FIXED_PLAYERS}
        return [
            {
                "username":     u,
                "display_name": player_map[u],
                "raw_name":     matched_raw.get(u, "—"),
                "points":       extracted.get(u, 0),
            }
            for u in self._usernames
        ]

    # ── Save confirmed match ────────────────────────────────────────────────

    def save_match(self, player_scores: list[dict]) -> tuple[str, int]:
        """player_scores: [{username, points}]"""
        with _conn() as con:
            count = con.execute("SELECT COUNT(*) FROM matches").fetchone()[0]
            match_number = count + 1
            match_name = f"Match {match_number}"
            cur = con.execute("INSERT INTO matches (name) VALUES (?)", (match_name,))
            match_id = cur.lastrowid
            for ps in player_scores:
                con.execute(
                    "INSERT INTO scores (username, match_id, points) VALUES (?,?,?)"
                    " ON CONFLICT(username, match_id) DO UPDATE SET points=excluded.points",
                    (ps["username"], match_id, ps["points"]),
                )
        return match_name, match_number

    # ── Standings ───────────────────────────────────────────────────────────

    def get_standings(self) -> dict:
        with _conn() as con:
            matches = [dict(r) for r in con.execute("SELECT id, name FROM matches ORDER BY id")]
            scores = con.execute("SELECT username, match_id, points FROM scores").fetchall()
            players = [dict(r) for r in con.execute("SELECT username, display_name FROM players")]

        score_map: dict[str, dict[int, int]] = {}
        for row in scores:
            score_map.setdefault(row["username"], {})[row["match_id"]] = row["points"]

        standings = []
        for p in players:
            u = p["username"]
            sm = score_map.get(u, {})
            total = sum(sm.values())
            match_points = {m["name"]: sm.get(m["id"], 0) for m in matches}
            standings.append({
                "username":     u,
                "display_name": p["display_name"],
                "total":        total,
                "matches":      match_points,
            })

        standings.sort(key=lambda x: x["total"], reverse=True)
        for i, s in enumerate(standings):
            s["rank"] = i + 1

        return {"players": standings, "match_headers": [m["name"] for m in matches]}

    # ── Export ──────────────────────────────────────────────────────────────

    def export_xlsx(self) -> bytes:
        import io
        import openpyxl
        from openpyxl.styles import Alignment, Font, PatternFill

        data = self.get_standings()
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Scores"

        headers = ["Rank", "Username", "Display Name"] + data["match_headers"] + ["Total"]
        hfill = PatternFill("solid", fgColor="1e293b")
        hfont = Font(bold=True, color="FFFFFF")
        for col, h in enumerate(headers, 1):
            c = ws.cell(row=1, column=col, value=h)
            c.fill = hfill
            c.font = hfont
            c.alignment = Alignment(horizontal="center")

        for ri, p in enumerate(data["players"], 2):
            ws.cell(row=ri, column=1, value=p["rank"])
            ws.cell(row=ri, column=2, value=p["username"])
            ws.cell(row=ri, column=3, value=p["display_name"])
            for ci, mh in enumerate(data["match_headers"]):
                ws.cell(row=ri, column=4 + ci, value=p["matches"].get(mh, 0))
            ws.cell(row=ri, column=len(headers), value=p["total"])

        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    # ── Chat ────────────────────────────────────────────────────────────────

    def chat(self, question: str) -> str:
        groq = self._get_groq()
        data = self.get_standings()
        if not data["match_headers"]:
            return "अभी तक कोई match data नहीं है। / No match data yet. Please upload a match image first."

        lines = ["=== Match Points Data ==="]
        for p in data["players"]:
            details = " | ".join(f"{m}: {v}" for m, v in p["matches"].items())
            lines.append(
                f"Rank {p['rank']}: {p['display_name']} (@{p['username']}) "
                f"— Total: {p['total']} | {details}"
            )

        completion = groq.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a helpful points/score assistant for a game leaderboard. "
                        "Answer questions about player scores and match standings. "
                        "Players have both a username and a display name — use display names in answers. "
                        "The user may ask in Hindi or English — always respond in the SAME language. "
                        "Be concise and friendly.\n\n" + "\n".join(lines)
                    ),
                },
                {"role": "user", "content": question},
            ],
            max_tokens=512,
        )
        return completion.choices[0].message.content or "Sorry, could not generate a response."


_service: ScoreKeeperService | None = None


def get_service() -> ScoreKeeperService:
    global _service
    if _service is None:
        _service = ScoreKeeperService()
    return _service
