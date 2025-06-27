from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .database import Base  # <-- relative import!

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)

class ReviewHistory(Base):
    __tablename__ = "review_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    filename = Column(String)
    code = Column(Text)
    review_result = Column(Text)  # Store as JSON string
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")