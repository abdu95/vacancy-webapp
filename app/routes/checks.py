"""My Checks: analysis history (list/get/delete)."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app import db
from app.auth import authenticate

router = APIRouter()


class ChecksRequest(BaseModel):
    init_data: str = ""


@router.post("/api/checks")
async def list_checks(req: ChecksRequest, request: Request):
    user = authenticate(req.init_data, request)
    checks_used, _ = db.get_quota_status(user["user_id"])
    return {"checks": db.list_analyses(user["user_id"]), "checks_used": checks_used}


class GetCheckRequest(BaseModel):
    init_data: str = ""
    analysis_id: int


@router.post("/api/checks/get")
async def get_check(req: GetCheckRequest, request: Request):
    user = authenticate(req.init_data, request)
    analysis = db.get_analysis(user["user_id"], req.analysis_id)
    if not analysis:
        raise HTTPException(404, "Check not found")
    return analysis


@router.post("/api/checks/delete")
async def delete_check(req: GetCheckRequest, request: Request):
    user = authenticate(req.init_data, request)
    found = db.delete_analysis(user["user_id"], req.analysis_id)
    if not found:
        raise HTTPException(404, "Check not found")
    return {"deleted": True}
