from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from scorekeeper.api import router as scorekeeper_router

app = FastAPI(title="ScoreKeeper API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scorekeeper_router, prefix="/api/scorekeeper")


@app.get("/health")
def health():
    return {"status": "ok", "agent": "scorekeeper"}
