"""Daily vacancy-alerts saved search criteria (get/save)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.auth import authenticate

router = APIRouter()


class SavedSearchRequest(BaseModel):
    init_data: str


@router.post("/api/saved-search")
async def get_saved_search(req: SavedSearchRequest):
    user = authenticate(req.init_data)
    return db.get_saved_search(user["id"])


class SaveSavedSearchRequest(BaseModel):
    init_data: str
    job_title: str
    location: str = ""
    alerts_enabled: bool = False


@router.post("/api/saved-search/save")
async def save_saved_search(req: SaveSavedSearchRequest):
    user = authenticate(req.init_data)
    job_title = req.job_title.strip()
    if req.alerts_enabled and not job_title:
        raise HTTPException(400, "Set a job title before turning on alerts")
    db.save_search_criteria(user["id"], job_title, req.location.strip(), req.alerts_enabled)
    return {"saved": True}


class AlertBatchRequest(BaseModel):
    init_data: str
    batch_id: str


@router.post("/api/alert-batch")
async def get_alert_batch(req: AlertBatchRequest):
    """Backs the alert message's button: the Mini App opens with
    ?alert_batch=<id> in its URL and calls this to fetch the exact
    vacancies that digest sent, scoped to the authenticated user so one
    person's batch_id can't be used to read another's."""
    user = authenticate(req.init_data)
    batch = db.get_alert_batch(user["id"], req.batch_id)
    if not batch:
        raise HTTPException(404, "This alert has expired or no longer exists")
    return batch
