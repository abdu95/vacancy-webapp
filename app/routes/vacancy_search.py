"""Vacancy search, title suggestion, fit scoring, and CV recommendations
against one found vacancy."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.auth import verify_init_data, authenticate
from app.services import cv_fixes, hypothesis, scoring, vacancy_source  # vacancy_source - see its docstring

logger = logging.getLogger(__name__)
router = APIRouter()


class SearchRequest(BaseModel):
    init_data: str
    job_title: str
    location: str = "Any"
    work_setup: str = "Any"
    industry: str = "Any"
    seen_companies: list[str] = []


@router.post("/api/search")
async def search(req: SearchRequest):
    verify_init_data(req.init_data)  # confirms the request really came from Telegram

    try:
        vacancies = await vacancy_source.search_vacancies(
            req.job_title, req.location, req.work_setup, req.industry,
            seen_companies=req.seen_companies or None,
        )
    except Exception:
        logger.exception("Vacancy search failed")
        raise HTTPException(502, "Search failed, try again")

    return {"vacancies": vacancies}


class SuggestTitlesRequest(BaseModel):
    init_data: str


@router.post("/api/suggest-titles")
async def suggest_titles(req: SuggestTitlesRequest):
    user = authenticate(req.init_data)
    cv_text = db.get_active_cv_text(user["id"])
    if not cv_text:
        raise HTTPException(400, "No CV on file - upload one first")

    try:
        titles = await hypothesis.suggest_job_titles(cv_text)
    except Exception:
        logger.exception("Title suggestion failed")
        raise HTTPException(502, "Couldn't generate suggestions, try again")

    return {"titles": titles}


class Vacancy(BaseModel):
    title: str
    company: str
    location: str = ""
    url: str = ""
    summary: str = ""


class ScoreRequest(BaseModel):
    init_data: str
    vacancy: Vacancy


@router.post("/api/score-vacancy")
async def score_vacancy_endpoint(req: ScoreRequest):
    user = authenticate(req.init_data)
    cv_text = db.get_active_cv_text(user["id"])
    if not cv_text:
        raise HTTPException(400, "No CV on file - upload one first")

    try:
        language = db.get_user_language(user["id"])
        score = await scoring.score_vacancy(cv_text, req.vacancy.model_dump(), language)
    except Exception:
        logger.exception("Scoring failed")
        raise HTTPException(502, "Couldn't score your CV, try again")

    return score


class RecommendationsRequest(BaseModel):
    init_data: str
    vacancy: Vacancy
    level: str


@router.post("/api/cv-recommendations")
async def cv_recommendations(req: RecommendationsRequest):
    user = authenticate(req.init_data)
    cv_text = db.get_active_cv_text(user["id"])
    if not cv_text:
        raise HTTPException(400, "No CV on file - upload one first")

    try:
        language = db.get_user_language(user["id"])
        fixes = await cv_fixes.generate_cv_fixes(req.level, req.vacancy.model_dump(), cv_text, language)
    except Exception:
        logger.exception("CV fix generation failed")
        raise HTTPException(502, "Couldn't generate recommendations, try again")

    return {"fixes": fixes}
