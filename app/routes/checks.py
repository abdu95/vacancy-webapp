"""My Checks: analysis history (list/get/delete)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.auth import authenticate

router = APIRouter()


class ChecksRequest(BaseModel):
    init_data: str


@router.post("/api/checks")
async def list_checks(req: ChecksRequest):
    user = authenticate(req.init_data)
    return {"checks": db.list_analyses(user["id"])}


class GetCheckRequest(BaseModel):
    init_data: str
    analysis_id: int


@router.post("/api/checks/get")
async def get_check(req: GetCheckRequest):
    user = authenticate(req.init_data)
    analysis = db.get_analysis(user["id"], req.analysis_id)
    if not analysis:
        raise HTTPException(404, "Check not found")
    return analysis


@router.post("/api/checks/delete")
async def delete_check(req: GetCheckRequest):
    user = authenticate(req.init_data)
    found = db.delete_analysis(user["id"], req.analysis_id)
    if not found:
        raise HTTPException(404, "Check not found")
    return {"deleted": True}
