"""My CVs: check status, upload, list, switch active, delete."""

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app import db
from app.auth import authenticate
from app.services import cv_parser, hypothesis

logger = logging.getLogger(__name__)
router = APIRouter()


class CVStatusRequest(BaseModel):
    init_data: str


@router.post("/api/cv-status")
async def cv_status(req: CVStatusRequest):
    user = authenticate(req.init_data)
    cv_text = db.get_active_cv_text(user["id"])
    lang = db.get_user_language(user["id"])
    return {"has_cv": bool(cv_text), "lang": lang}


@router.post("/api/upload-cv")
async def upload_cv(init_data: str = Form(...), file: UploadFile = File(...)):
    user = authenticate(init_data)

    if not file.filename.lower().endswith((".pdf", ".docx")):
        raise HTTPException(400, "Only PDF and DOCX files are accepted")

    file_bytes = await file.read()
    try:
        cv_text = cv_parser.parse_cv(file.filename, file_bytes)
    except Exception:
        logger.exception("CV parsing failed")
        raise HTTPException(400, "Could not read that file - try a different PDF/DOCX")

    if not cv_text.strip():
        raise HTTPException(400, "Could not find any text in that file")

    try:
        extracted_position = await hypothesis.extract_current_position(cv_text)
    except Exception:
        logger.exception("Position extraction failed - saving the CV anyway")
        extracted_position = None

    db.add_cv(user["id"], file.filename, cv_text, extracted_position)
    db.log_event(user["id"], "cv_uploaded")
    return {"saved": True}


class ListCvsRequest(BaseModel):
    init_data: str


@router.post("/api/cvs")
async def list_cvs(req: ListCvsRequest):
    user = authenticate(req.init_data)
    return {"cvs": db.list_cvs(user["id"])}


class SetActiveCvRequest(BaseModel):
    init_data: str
    cv_id: int


@router.post("/api/cvs/set-active")
async def set_active_cv(req: SetActiveCvRequest):
    user = authenticate(req.init_data)
    found = db.set_active_cv(user["id"], req.cv_id)
    if not found:
        raise HTTPException(404, "CV not found")
    return {"updated": True}


class DeleteCvRequest(BaseModel):
    init_data: str
    cv_id: int


@router.post("/api/cvs/delete")
async def delete_cv(req: DeleteCvRequest):
    user = authenticate(req.init_data)
    found = db.delete_cv(user["id"], req.cv_id)
    if not found:
        raise HTTPException(404, "CV not found")
    return {"deleted": True}
