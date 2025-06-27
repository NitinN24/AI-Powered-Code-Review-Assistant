from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, validator
from typing import List, Optional
import logging
from app.ai_explanation import model_instance

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

class ChatRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50000, description="User's code")
    issues: Optional[List[dict]] = Field(None, description="Analysis issues")
    message: str = Field(..., min_length=1, max_length=1000, description="User's question")
    
    @validator('code')
    def validate_code(cls, v):
        if not v.strip():
            raise ValueError('Code cannot be empty or whitespace only')
        return v.strip()
    
    @validator('message')
    def validate_message(cls, v):
        if not v.strip():
            raise ValueError('Message cannot be empty or whitespace only')
        return v.strip()

class ChatResponse(BaseModel):
    answer: str
    success: bool = True
    error_message: Optional[str] = None

class ChatService:
    """Service class to handle chat logic"""
    
    @staticmethod
    def build_prompt(code: str, issues: Optional[List[dict]], message: str) -> str:
        """Build a structured prompt for the AI model"""
        prompt_parts = [
            "You are a helpful code assistant. Analyze the following code and answer the user's question.",
            "",
            "USER CODE:",
            "```",
            code,
            "```",
        ]
        
        if issues:
            prompt_parts.extend([
                "",
                "ANALYSIS ISSUES:",
                str(issues),
            ])
        
        prompt_parts.extend([
            "",
            "USER QUESTION:",
            message,
            "",
            "Please provide a helpful, accurate response:"
        ])
        
        return "\n".join(prompt_parts)
    
    @staticmethod
    async def get_ai_response(prompt: str) -> str:
        """Get response from AI model with error handling"""
        try:
            # Add timeout and other safety measures as needed
            response = model_instance.explain(prompt)
            
            if not response or not response.strip():
                raise ValueError("Empty response from AI model")
                
            return response.strip()
            
        except Exception as e:
            logger.error(f"AI model error: {str(e)}")
            # Don't expose internal errors to users
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI service temporarily unavailable. Please try again later."
            )

@router.post("/chat/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat endpoint for code-related questions
    
    Args:
        request: ChatRequest containing code, optional issues, and user message
        
    Returns:
        ChatResponse with AI-generated answer
        
    Raises:
        HTTPException: If validation fails or AI service is unavailable
    """
    try:
        # Build structured prompt
        prompt = ChatService.build_prompt(
            request.code, 
            request.issues, 
            request.message
        )
        
        # Get AI response
        answer = await ChatService.get_ai_response(prompt)
        
        logger.info(f"Successfully processed chat request")
        
        return ChatResponse(answer=answer)
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error in chat endpoint: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred"
        )

# Optional: Add rate limiting decorator
# @limiter.limit("10/minute")  # requires slowapi or similar