import base64
import json
import re

import gspread
from groq import Groq

from .config import get_settings
from .models import PlayerStanding, StandingsResponse

_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


class ScoreKeeperService:
    def __init__(self):
        s = get_settings()
        self.groq = Groq(api_key=s.groq_api_key)

        creds_dict = json.loads(s.google_service_account_json)
        gc = gspread.service_account_from_dict(creds_dict, scopes=_SCOPES)
        self.sheet = gc.open_by_key(s.google_sheet_id).sheet1
        self._ensure_header()

    # ------------------------------------------------------------------ #

    def _ensure_header(self) -> None:
        row1 = self.sheet.row_values(1)
        if not row1:
            self.sheet.update("A1", [["Player"]])

    @staticmethod
    def _col_letter(n: int) -> str:
        result = ""
        while n:
            n, rem = divmod(n - 1, 26)
            result = chr(65 + rem) + result
        return result

    def _get_all_data(self) -> tuple[list[str], dict[str, dict[str, int]]]:
        """Returns (match_headers, {player_name: {match_name: points}})."""
        all_values = self.sheet.get_all_values()
        if not all_values:
            return [], {}

        headers = all_values[0]
        match_headers = headers[1:]  # skip 'Player' column

        players: dict[str, dict[str, int]] = {}
        for row in all_values[1:]:
            if not row or not row[0].strip():
                continue
            name = row[0].strip()
            scores: dict[str, int] = {}
            for i, match in enumerate(match_headers):
                raw = row[i + 1] if i + 1 < len(row) else ""
                scores[match] = int(raw) if str(raw).strip().lstrip("-").isdigit() else 0
            players[name] = scores

        return match_headers, players

    # ------------------------------------------------------------------ #

    def parse_image(self, image_bytes: bytes, content_type: str) -> dict[str, int]:
        """Use Groq Llama-4 vision to extract {player: points} from image."""
        b64 = base64.b64encode(image_bytes).decode()

        completion = self.groq.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{b64}"
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "Extract every player name and their numeric score/points "
                                "from this image.\n"
                                "Return ONLY valid JSON — no markdown, no explanation:\n"
                                '{"players": [{"name": "...", "points": 42}, ...]}\n'
                                "If names are in Hindi or other scripts, keep them as-is."
                            ),
                        },
                    ],
                }
            ],
            max_tokens=1024,
        )

        content = completion.choices[0].message.content or ""
        # Strip markdown code fences if present
        content = re.sub(r"```(?:json)?", "", content).strip()
        try:
            result = json.loads(content)
        except Exception:
            m = re.search(r"\{.*\}", content, re.DOTALL)
            result = json.loads(m.group()) if m else {}

        return {
            p["name"].strip(): int(p["points"])
            for p in result.get("players", [])
            if p.get("name") and str(p.get("points", "")).lstrip("-").isdigit()
        }

    def add_match(self, player_scores: dict[str, int]) -> tuple[str, int]:
        """Append a new match column. Returns (match_name, match_number)."""
        all_values = self.sheet.get_all_values() or [["Player"]]
        headers = all_values[0]

        match_number = len(headers)  # len-1 existing matches + 1 new
        match_name = f"Match {match_number}"
        new_col = len(headers) + 1
        col_letter = self._col_letter(new_col)

        # Write header for new match column
        self.sheet.update(f"{col_letter}1", [[match_name]])

        # Map existing player names (lowercase) → row index (1-based)
        player_rows: dict[str, int] = {}
        for i, row in enumerate(all_values[1:], start=2):
            if row and row[0].strip():
                player_rows[row[0].strip().lower()] = i

        next_row = len(all_values) + 1
        for name, points in player_scores.items():
            name_lower = name.lower()
            row_idx: int | None = None

            # Exact match first, then partial
            for existing, r in player_rows.items():
                if existing == name_lower or existing in name_lower or name_lower in existing:
                    row_idx = r
                    break

            if row_idx is None:
                # New player — add row
                self.sheet.update(f"A{next_row}", [[name]])
                row_idx = next_row
                player_rows[name_lower] = next_row
                next_row += 1

            self.sheet.update(f"{col_letter}{row_idx}", [[points]])

        return match_name, match_number

    def get_standings(self) -> StandingsResponse:
        match_headers, players_data = self._get_all_data()

        standings = sorted(
            [
                {"name": n, "total": sum(s.values()), "matches": s}
                for n, s in players_data.items()
            ],
            key=lambda x: x["total"],
            reverse=True,
        )

        return StandingsResponse(
            players=[
                PlayerStanding(rank=i + 1, **s)
                for i, s in enumerate(standings)
            ],
            match_headers=match_headers,
        )

    def chat(self, question: str) -> str:
        match_headers, players_data = self._get_all_data()

        if not players_data:
            if any(kw in question.lower() for kw in ["point", "score", "match", "player"]):
                return "अभी तक कोई match data नहीं है। पहले एक image upload करें। / No match data yet. Please upload a match image first."
            return "I don't have any data yet. Please upload a match image first."

        # Build context table
        sorted_players = sorted(
            players_data.items(),
            key=lambda x: sum(x[1].values()),
            reverse=True,
        )
        lines = ["=== Match Points Data ==="]
        for rank, (name, scores) in enumerate(sorted_players, 1):
            total = sum(scores.values())
            details = " | ".join(f"{m}: {p}" for m, p in scores.items())
            lines.append(f"Rank {rank}: {name} — Total: {total} pts | {details}")
        context = "\n".join(lines)

        completion = self.groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a helpful points/score assistant for a game leaderboard. "
                        "Answer questions about player scores and match standings. "
                        "The user may ask in Hindi or English — always respond in the SAME language they used. "
                        "Be concise and friendly. Use the data below to answer accurately.\n\n"
                        + context
                    ),
                },
                {"role": "user", "content": question},
            ],
            max_tokens=512,
        )

        return completion.choices[0].message.content or "Sorry, I couldn't generate a response."


_service: ScoreKeeperService | None = None


def get_service() -> ScoreKeeperService:
    global _service
    if _service is None:
        _service = ScoreKeeperService()
    return _service
