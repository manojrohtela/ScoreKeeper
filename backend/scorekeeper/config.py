from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    groq_api_key: str = ""
    google_sheet_id: str = ""
    google_service_account_json: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


_settings: "Settings | None" = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
