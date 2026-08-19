from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.config import get_settings
from app.api.projects import projects_router

settings = get_settings()

app = FastAPI(title=settings.app_name)

app.include_router(health_router)
app.include_router(projects_router)
