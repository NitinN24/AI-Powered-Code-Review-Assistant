from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ReviewHistoryResponse(BaseModel):
    id: int
    filename: str
    code: str
    review_result: str
    created_at: datetime