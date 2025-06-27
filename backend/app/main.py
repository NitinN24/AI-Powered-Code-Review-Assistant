from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from github import Github, GithubException
from typing import Optional, List, Dict, Any
import re
import os
from .analysis import analyze_and_explain
from .ai_explanation import model_instance
from .review import router as review_router
from .chat import router as chat_router
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI-Powered Code Review Assistant",
    description="API for code analysis, explanation, and chat assistance",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, restrict to your frontend's URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include existing routers
app.include_router(review_router, prefix="/api/v1", tags=["reviews"])
app.include_router(chat_router, prefix="/api/v1", tags=["chat"])

# Pydantic models for GitHub integration
class GithubAnalysisRequest(BaseModel):
    url: str
    github_token: Optional[str] = None

class GithubAnalysisResponse(BaseModel):
    file_path: str
    content: str
    analysis_results: List[Dict[str, Any]]
    metadata: Dict[str, Any]

def parse_github_url(url: str) -> Dict[str, str]:
    """Parse GitHub URL to extract owner, repo, path, and type"""
    patterns = {
        'file_blob': r'github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.+)',
        'file_raw': r'github\.com/([^/]+)/([^/]+)/raw/([^/]+)/(.+)',
        'pull_request': r'github\.com/([^/]+)/([^/]+)/pull/(\d+)',
        'repo': r'github\.com/([^/]+)/([^/]+)/?$',
    }
    
    for url_type, pattern in patterns.items():
        match = re.search(pattern, url)
        if match:
            if url_type in ['file_blob', 'file_raw']:
                return {
                    'type': 'file',
                    'owner': match.group(1),
                    'repo': match.group(2),
                    'branch': match.group(3),
                    'path': match.group(4)
                }
            elif url_type == 'pull_request':
                return {
                    'type': 'pull_request',
                    'owner': match.group(1),
                    'repo': match.group(2),
                    'pr_number': int(match.group(3))
                }
            elif url_type == 'repo':
                return {
                    'type': 'repo',
                    'owner': match.group(1),
                    'repo': match.group(2)
                }
    
    raise ValueError("Invalid GitHub URL format")

def analyze_code_content(content: str, filename: str) -> List[Dict[str, Any]]:
    """Analyze code content using your existing analysis logic"""
    try:
        # Use your existing analyze_and_explain function
        results, _ = analyze_and_explain(content.encode('utf-8'), filename)
        
        # Convert to the expected format for GitHub analysis
        formatted_results = []
        for result in results:
            formatted_results.append({
                "issue": result.get("rule", "Code Issue"),
                "explanation": result.get("message", "No explanation available"),
                "suggestion": result.get("suggestion", "Consider reviewing this code"),
                "severity": result.get("severity", "info"),
                "line_number": result.get("line", None),
                "doc_link": result.get("doc_link", "")
            })
        
        return formatted_results
        
    except Exception as e:
        logger.error(f"Error analyzing code content: {str(e)}")
        # Fallback to simple analysis if your existing function fails
        return [{
            "issue": "Analysis Error",
            "explanation": f"Could not analyze file: {str(e)}",
            "suggestion": "Please check the file format and try again",
            "severity": "error",
            "line_number": None,
            "doc_link": ""
        }]

@app.post("/analyze/", tags=["analysis"])
async def analyze_code(file: UploadFile = File(...)):
    """Analyze uploaded code file and return results with summary"""
    try:
        # Validate file size (e.g., max 10MB)
        if file.size and file.size > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File size too large. Maximum 10MB allowed."
            )
        
        # Validate file type (optional)
        allowed_extensions = {'.py', '.js', '.java', '.cpp', '.c', '.ts', '.jsx', '.tsx'}
        if file.filename:
            ext = '.' + file.filename.split('.')[-1].lower()
            if ext not in allowed_extensions:
                logger.warning(f"File extension {ext} not in allowed list, but proceeding")
        
        content = await file.read()
        
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is empty"
            )
        
        results, code_summary = analyze_and_explain(content, file.filename)
        
        logger.info(f"Successfully analyzed file: {file.filename}")
        return {"results": results, "summary": code_summary}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing file {file.filename}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to analyze file"
        )

@app.post("/explain/", tags=["explanation"])
async def explain_code(
    code: str = Form(...),
    issue: str = Form(None)
):
    """Explain code or specific code issues"""
    try:
        # Validate input
        if not code.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Code cannot be empty"
            )
        
        if len(code) > 50000:  # Limit code length
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Code too long. Maximum 50,000 characters allowed."
            )
        
        # Build prompt
        if issue:
            prompt = f"Explain this code issue in plain English:\nIssue: {issue}\nCode:\n{code}\n"
        else:
            prompt = f"Explain what this code does:\n{code}\n"
        
        explanation = model_instance.explain(prompt)
        
        if not explanation:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI service temporarily unavailable"
            )
        
        logger.info("Successfully generated code explanation")
        return {"explanation": explanation}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error explaining code: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate explanation"
        )

@app.post("/api/v1/analyze_github/", response_model=List[GithubAnalysisResponse], tags=["github"])
async def analyze_github(request: GithubAnalysisRequest):
    """Analyze GitHub repository, pull request, or file"""
    try:
        # Parse the GitHub URL
        parsed_url = parse_github_url(request.url)
        
        # Initialize GitHub client
        github_token = request.github_token or os.getenv("GITHUB_TOKEN")
        if not github_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GitHub token is required. Set GITHUB_TOKEN environment variable or provide in request."
            )
        
        g = Github(github_token)
        repo_name = f"{parsed_url['owner']}/{parsed_url['repo']}"
        repo = g.get_repo(repo_name)
        
        results = []
        
        if parsed_url['type'] == 'file':
            # Analyze single file
            try:
                file_content = repo.get_contents(parsed_url['path'], ref=parsed_url['branch'])
                if file_content.type == 'file':
                    content = file_content.decoded_content.decode('utf-8')
                    analysis_results = analyze_code_content(content, parsed_url['path'])
                    
                    results.append(GithubAnalysisResponse(
                        file_path=parsed_url['path'],
                        content=content,
                        analysis_results=analysis_results,
                        metadata={
                            'repo': repo_name,
                            'branch': parsed_url['branch'],
                            'file_size': file_content.size,
                            'last_modified': str(file_content.last_modified) if file_content.last_modified else None
                        }
                    ))
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="URL points to a directory, not a file"
                    )
            except GithubException as e:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"File not found: {e}"
                )
        
        elif parsed_url['type'] == 'pull_request':
            # Analyze PR files
            try:
                pr = repo.get_pull(parsed_url['pr_number'])
                files = pr.get_files()
                
                for file in files:
                    if file.status in ['added', 'modified'] and file.filename.endswith(('.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c')):
                        try:
                            file_content = repo.get_contents(file.filename, ref=pr.head.sha)
                            content = file_content.decoded_content.decode('utf-8')
                            analysis_results = analyze_code_content(content, file.filename)
                            
                            results.append(GithubAnalysisResponse(
                                file_path=file.filename,
                                content=content,
                                analysis_results=analysis_results,
                                metadata={
                                    'repo': repo_name,
                                    'pr_number': parsed_url['pr_number'],
                                    'status': file.status,
                                    'additions': file.additions,
                                    'deletions': file.deletions,
                                    'changes': file.changes
                                }
                            ))
                        except Exception:
                            continue
                            
            except GithubException as e:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Pull request not found: {e}"
                )
        
        elif parsed_url['type'] == 'repo':
            # Analyze repository (limited to main files)
            try:
                contents = repo.get_contents("")
                supported_extensions = ['.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c']
                
                def get_code_files(contents_list, max_files=10):
                    files_processed = 0
                    for content_file in contents_list:
                        if files_processed >= max_files:
                            break
                            
                        if content_file.type == "file":
                            if any(content_file.name.endswith(ext) for ext in supported_extensions):
                                try:
                                    file_content = repo.get_contents(content_file.path)
                                    content = file_content.decoded_content.decode('utf-8')
                                    analysis_results = analyze_code_content(content, content_file.path)
                                    
                                    results.append(GithubAnalysisResponse(
                                        file_path=content_file.path,
                                        content=content,
                                        analysis_results=analysis_results,
                                        metadata={
                                            'repo': repo_name,
                                            'file_size': file_content.size,
                                            'last_modified': str(file_content.last_modified) if file_content.last_modified else None
                                        }
                                    ))
                                    files_processed += 1
                                except:
                                    continue
                        elif content_file.type == "dir" and files_processed < max_files:
                            try:
                                sub_contents = repo.get_contents(content_file.path)
                                get_code_files(sub_contents, max_files - files_processed)
                            except:
                                continue
                
                get_code_files(contents)
                
            except GithubException as e:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Repository not found: {e}"
                )
        
        if not results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No analyzable files found"
            )
        
        logger.info(f"Successfully analyzed GitHub URL: {request.url}")
        return results
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing GitHub URL {request.url}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}"
        )

@app.get("/api/v1/github_info/{owner}/{repo}", tags=["github"])
async def get_github_repo_info(owner: str, repo: str):
    """Get basic repository information"""
    try:
        github_token = os.getenv("GITHUB_TOKEN")
        if not github_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GitHub token not configured"
            )
        
        g = Github(github_token)
        repo_obj = g.get_repo(f"{owner}/{repo}")
        
        return {
            "name": repo_obj.name,
            "full_name": repo_obj.full_name,
            "description": repo_obj.description,
            "language": repo_obj.language,
            "stars": repo_obj.stargazers_count,
            "forks": repo_obj.forks_count,
            "open_issues": repo_obj.open_issues_count,
            "created_at": repo_obj.created_at,
            "updated_at": repo_obj.updated_at,
            "default_branch": repo_obj.default_branch
        }
    except GithubException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository not found: {e}"
        )
    except Exception as e:
        logger.error(f"Error getting repository info: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get repository info: {str(e)}"
        )

@app.get("/", tags=["root"])
def read_root():
    """Root endpoint with API information"""
    return {
        "message": "Welcome to the AI-Powered Code Review Assistant API!",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc",
        "features": [
            "File upload analysis",
            "Code explanation",
            "GitHub integration",
            "Chat assistance"
        ]
    }

@app.get("/health", tags=["health"])
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "code-review-api"}