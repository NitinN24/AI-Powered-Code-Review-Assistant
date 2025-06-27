from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.models import ReviewHistory  # Adjust import as needed
from app.schemas import ReviewHistoryResponse  # Adjust import as needed
from app.database import get_db  # Adjust import as needed

router = APIRouter()

@router.get("/api/history", response_model=List[ReviewHistoryResponse])
def get_history(user_id: int, db: Session = Depends(get_db)):
    """
    Returns the code review history for the given user.
    """
    history = db.query(ReviewHistory).filter(ReviewHistory.user_id == user_id).order_by(ReviewHistory.created_at.desc()).all()
    if history is None:
        raise HTTPException(status_code=404, detail="No review history found for this user.")
    return history