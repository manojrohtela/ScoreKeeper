# ScoreKeeper — Match Points Tracker

Upload match scoresheet images, auto-extract player points via AI vision, track a per-match leaderboard in Google Sheets, and let players ask questions in Hindi or English.

## Features
- **Image OCR via AI** — upload any scoresheet photo; Groq Llama-4 vision reads player names & points automatically
- **Google Sheets integration** — each match adds a new column; all history preserved
- **Live leaderboard** — table sorted by total points with per-match breakdown
- **Bilingual chat** — ask in Hindi or English ("Match 3 mein mere kitne points hain?")

## Stack
- **Frontend**: React 18, Vite, Tailwind CSS v4, Framer Motion
- **Backend**: FastAPI, Groq SDK (Llama-4 vision + Llama-3.3 chat), gspread

## Google Sheets Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Create a project
2. Enable **Google Sheets API** and **Google Drive API**
3. Create a **Service Account** → download JSON key
4. Create a Google Sheet and share it with the service account email (Editor access)
5. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`

## Local Development

### Backend
```bash
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in GROQ_API_KEY, GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend && npm install
echo "VITE_API_BASE_URL=http://localhost:8000/api/scorekeeper" > .env
npm run dev
```
