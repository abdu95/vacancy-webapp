"""Application tracking: save/list/update-status/delete."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.auth import authenticate

logger = logging.getLogger(__name__)
router = APIRouter()


class Vacancy(BaseModel):
    title: str
    company: str
    location: str = ""
    url: str = ""
    summary: str = ""


class ApplyRequest(BaseModel):
    init_data: str
    vacancy: Vacancy
    score: dict | None = None


@router.post("/api/apply")
async def apply(req: ApplyRequest):
    user = authenticate(req.init_data)
    cv_text = db.get_active_cv_text(user["id"]) or ""

    try:
        db.save_application(user["id"], req.vacancy.model_dump(), cv_text, req.score)
    except Exception:
        logger.exception("Saving application failed")
        raise HTTPException(500, "Couldn't save your application, try again")

    return {"saved": True}


class ApplicationsRequest(BaseModel):
    init_data: str


@router.post("/api/applications")
async def list_applications(req: ApplicationsRequest):
    user = authenticate(req.init_data)
    try:
        applications = db.list_applications(user["id"])
    except Exception:
        logger.exception("Listing applications failed")
        raise HTTPException(500, "Couldn't load your applications, try again")
    return {"applications": applications}


class UpdateApplicationStatusRequest(BaseModel):
    init_data: str
    application_id: int
    status: str


@router.post("/api/applications/update-status")
async def update_application_status(req: UpdateApplicationStatusRequest):
    user = authenticate(req.init_data)
    if req.status not in db.VALID_STATUSES:
        raise HTTPException(400, "Invalid status")
    found = db.update_application_status(user["id"], req.application_id, req.status)
    if not found:
        raise HTTPException(404, "Application not found")
    return {"updated": True}


class DeleteApplicationRequest(BaseModel):
    init_data: str
    application_id: int


@router.post("/api/applications/delete")
async def delete_application(req: DeleteApplicationRequest):
    user = authenticate(req.init_data)
    found = db.delete_application(user["id"], req.application_id)
    if not found:
        raise HTTPException(404, "Application not found")
    return {"deleted": True}
