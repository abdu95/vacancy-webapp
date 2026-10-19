"""My CVs: check status, upload, list, switch active, delete."""

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Request
from pydantic import BaseModel

from app import db
from app.auth import authenticate
from app.services import cv_parser, hypothesis

logger = logging.getLogger(__name__)
router = APIRouter()


class CVStatusRequest(BaseModel):
    init_data: str = ""


@router.post("/api/cv-status")
async def cv_status(req: CVStatusRequest, request: Request):
    user = authenticate(req.init_data, request)
    cv_text = db.get_active_cv_text(user["user_id"])
    lang = db.get_user_language(user["user_id"])
    return {"has_cv": bool(cv_text), "lang": lang, "name": db.get_user_name(user["user_id"])}


@router.post("/api/upload-cv")
async def upload_cv(request: Request, init_data: str = Form(""), file: UploadFile = File(...)):
    user = authenticate(init_data, request)

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

    db.add_cv(user["user_id"], file.filename, cv_text, extracted_position)
    db.log_event(user["user_id"], "cv_uploaded")
    return {"saved": True}


class ListCvsRequest(BaseModel):
    init_data: str = ""


@router.post("/api/cvs")
async def list_cvs(req: ListCvsRequest, request: Request):
    user = authenticate(req.init_data, request)
    return {"cvs": db.list_cvs(user["user_id"])}


class SetActiveCvRequest(BaseModel):
    init_data: str = ""
    cv_id: int


@router.post("/api/cvs/set-active")
async def set_active_cv(req: SetActiveCvRequest, request: Request):
    user = authenticate(req.init_data, request)
    found = db.set_active_cv(user["user_id"], req.cv_id)
    if not found:
        raise HTTPException(404, "CV not found")
    return {"updated": True}


class DeleteCvRequest(BaseModel):
    init_data: str = ""
    cv_id: int


@router.post("/api/cvs/delete")
async def delete_cv(req: DeleteCvRequest, request: Request):
    user = authenticate(req.init_data, request)
    found = db.delete_cv(user["user_id"], req.cv_id)
    if not found:
        raise HTTPException(404, "CV not found")
    return {"deleted": True}
