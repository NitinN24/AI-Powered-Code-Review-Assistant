from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, HttpUrl
from github import Github, GithubException
import os
import re
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse

router = APIRouter()

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
    """Placeholder for your existing code analysis logic"""
    # Replace this with your actual analysis function
    issues = []
    
    # Example analysis (replace with your actual logic)
    lines = content.split('\n')
    for i, line in enumerate(lines, 1):
        if len(line) > 120:
            issues.append({
                "issue": f"E501: Line {i} too long ({len(line)} characters)",
                "explanation": "Line exceeds maximum length of 120 characters",
                "suggestion": "Break the line into multiple lines or use line continuation",
                "severity": "warning",
                "line_number": i,
                "doc_link": "https://pep8.org/#maximum-line-length"
            })
        
        if 'TODO' in line.upper():
            issues.append({
                "issue": f"TODO found at line {i}",
                "explanation": "TODO comment found in code",
                "suggestion": "Consider creating a proper issue or completing the task",
                "severity": "info",
                "line_number": i,
                "doc_link": ""
            })
    
    return issues

@router.post("/analyze_github/", response_model=List[GithubAnalysisResponse])
async def analyze_github(request: GithubAnalysisRequest):
    try:
        # Parse the GitHub URL
        parsed_url = parse_github_url(request.url)
        
        # Initialize GitHub client
        github_token = request.github_token or os.getenv("GITHUB_TOKEN")
        if not github_token:
            raise HTTPException(
                status_code=400, 
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
                            'last_modified': file_content.last_modified
                        }
                    ))
                else:
                    raise HTTPException(status_code=400, detail="URL points to a directory, not a file")
            except GithubException as e:
                raise HTTPException(status_code=404, detail=f"File not found: {e}")
        
        elif parsed_url['type'] == 'pull_request':
            # Analyze PR files
            try:
                pr = repo.get_pull(parsed_url['pr_number'])
                files = pr.get_files()
                
                for file in files:
                    if file.status in ['added', 'modified'] and file.filename.endswith(('.py', '.js', '.ts', '.jsx', '.tsx')):
                        # Get file content
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
                        except Exception as e:
                            # Skip files that can't be read
                            continue
                            
            except GithubException as e:
                raise HTTPException(status_code=404, detail=f"Pull request not found: {e}")
        
        elif parsed_url['type'] == 'repo':
            # Analyze repository (limited to main Python/JS files)
            try:
                contents = repo.get_contents("")
                supported_extensions = ['.py', '.js', '.ts', '.jsx', '.tsx']
                
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
                                            'last_modified': file_content.last_modified
                                        }
                                    ))
                                    files_processed += 1
                                except:
                                    continue
                        elif content_file.type == "dir" and files_processed < max_files:
                            # Recursively process directories (limited depth)
                            try:
                                sub_contents = repo.get_contents(content_file.path)
                                get_code_files(sub_contents, max_files - files_processed)
                            except:
                                continue
                
                get_code_files(contents)
                
            except GithubException as e:
                raise HTTPException(status_code=404, detail=f"Repository not found: {e}")
        
        if not results:
            raise HTTPException(status_code=404, detail="No analyzable files found")
        
        return results
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

# Additional endpoint to get repository information
@router.get("/github_info/{owner}/{repo}")
async def get_github_repo_info(owner: str, repo: str):
    """Get basic repository information"""
    try:
        github_token = os.getenv("GITHUB_TOKEN")
        if not github_token:
            raise HTTPException(status_code=400, detail="GitHub token not configured")
        
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
        raise HTTPException(status_code=404, detail=f"Repository not found: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get repository info: {str(e)}")