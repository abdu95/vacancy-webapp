"""The core CV-vs-JD analysis + roadmap flow (ATS/XYZ/Tools/Level, then
one roadmap item at a time)."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.auth import authenticate
from app.services import cv_analysis, jd_fetch

logger = logging.getLogger(__name__)
router = APIRouter()


class AnalyzeRequest(BaseModel):
    init_data: str
    jd: str


@router.post("/api/cv-jd-analysis")
async def cv_jd_analysis(req: AnalyzeRequest):
    user = authenticate(req.init_data)
    cv_text = db.get_active_cv_text(user["id"])
    if not cv_text:
        raise HTTPException(400, "No CV on file - upload one first")

    jd_input = req.jd.strip()
    if jd_fetch.looks_like_url(jd_input):
        try:
            jd_text = await jd_fetch.fetch_jd_text(jd_input)
        except Exception:
            logger.exception("Fetching JD from URL failed")
            raise HTTPException(400, "Couldn't read that link - try pasting the job description text instead")
    else:
        jd_text = jd_input

    if len(jd_text) < 100:
        raise HTTPException(400, "Job description looks too short")

    usage_count, quota = db.get_quota_status(user["id"])
    if usage_count >= quota:
        db.log_event(user["id"], "limit_reached")
        return {"limit_reached": True, "remaining": 0, "quota": quota}

    try:
        language = db.get_user_language(user["id"])
        outputs = await cv_analysis.analyze_cv(jd_text, cv_text, language)
    except Exception:
        logger.exception("CV/JD analysis failed")
        raise HTTPException(502, "Analysis failed, try again")

    db.increment_usage_count(user["id"])
    db.log_event(user["id"], "check_completed")
    usage_count, quota = db.get_quota_status(user["id"])
    remaining = max(0, quota - usage_count)

    try:
        analysis_id = db.save_analysis(
            user["id"], jd_text, outputs["ats"], outputs["xyz"], outputs["tools"], outputs["level"]
        )
    except Exception:
        logger.exception("Saving analysis to history failed - the analysis itself still succeeded")
        analysis_id = None

    return {
        "limit_reached": False, "remaining": remaining, "quota": quota,
        "jd_text": jd_text, "analysis_id": analysis_id, **outputs,
    }


class RoadmapItemRequest(BaseModel):
    init_data: str
    jd: str
    level: str
    item: int
    analysis_id: int | None = None


@router.post("/api/roadmap-item")
async def roadmap_item(req: RoadmapItemRequest):
    user = authenticate(req.init_data)
    cv_text = db.get_active_cv_text(user["id"])
    if not cv_text:
        raise HTTPException(400, "No CV on file - upload one first")

    title = cv_analysis.roadmap_block_title(req.level, req.item)
    max_item = cv_analysis.roadmap_max_item(req.level)
    if req.item == 1:
        db.log_event(user["id"], "roadmap_requested")

    try:
        language = db.get_user_language(user["id"])
        if title == "CV Fixes":
            fixes = await cv_analysis.generate_cv_fixes(req.level, req.jd, cv_text, language)
            result = {"title": title, "fixes": fixes, "is_last": req.item >= max_item}
        else:
            text = await cv_analysis.generate_roadmap_item(req.level, req.item, req.jd, cv_text, language)
            result = {"title": title, "text": text, "is_last": req.item >= max_item}
    except Exception:
        logger.exception("Roadmap item generation failed")
        raise HTTPException(502, "Couldn't generate this section, try again")

    if req.analysis_id is not None:
        try:
            body = {"fixes": result["fixes"]} if "fixes" in result else {"text": result["text"]}
            db.save_roadmap_item(user["id"], req.analysis_id, req.item, title, body)
        except Exception:
            logger.exception("Saving roadmap item to history failed - the item itself still succeeded")

    return result
