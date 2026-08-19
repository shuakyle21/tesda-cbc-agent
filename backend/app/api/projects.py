from fastapi import APIRouter

projects_router = APIRouter()

@projects_router.get("/projects")
def get_projects() -> dict[str, list[dict[str, str]]]:
    return {
        "projects": [
            {"id": "1", "name": "Project 1"},
            {"id": "2", "name": "Project 2"},
        ]
    }