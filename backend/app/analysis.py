import subprocess
import tempfile
import os
import json
import yaml
import re
import shlex
import shutil
from contextlib import contextmanager
from dataclasses import dataclass
from typing import List, Dict, Optional, Union, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
import platform

from app.ai_explanation import model_instance
from app.lint_explanations import LINT_EXPLANATIONS
from app.error_lookup import COMMON_ERROR_EXPLANATIONS
from app.doc_links import DOC_LINKS

class AnalysisError(Exception):
    """Base exception for analysis errors"""
    pass


class ToolExecutionError(AnalysisError):
    """Exception raised when external tools fail"""
    pass


class UnsupportedFileTypeError(AnalysisError):
    """Exception raised for unsupported file types"""
    pass


@dataclass
class AnalysisConfig:
    """Configuration for code analysis"""
    timeout: int = 15
    max_code_snippet_length: int = 200
    temp_dir: Optional[str] = None
    enable_parallel_execution: bool = False
    max_workers: int = 3


@dataclass
class AnalysisIssue:
    """Represents a code analysis issue"""
    issue: str
    explanation: Optional[str] = None
    line_number: Optional[int] = None
    column: Optional[int] = None
    severity: str = "error"


class CommandRunner:
    """Handles secure command execution"""
    
    def __init__(self, timeout: int = 15):
        self.timeout = timeout
    
    def run_command(self, cmd: List[str], input_text: Optional[str] = None) -> str:
        """Safely run a command with proper error handling"""
        try:
            # Validate command components
            if not cmd or not all(isinstance(arg, str) for arg in cmd):
                raise ToolExecutionError("Invalid command format")
            
            result = subprocess.run(
                cmd,
                input=input_text,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                check=False  # Don't raise on non-zero exit codes
            )
            
            output = result.stdout.strip()
            if result.stderr:
                output += "\n" + result.stderr.strip()
            
            return output
            
        except subprocess.TimeoutExpired:
            raise ToolExecutionError(f"Command timed out after {self.timeout}s")
        except Exception as e:
            raise ToolExecutionError(f"Error running command: {e}")


class PathCleaner:
    """Handles cleaning of temporary paths from output"""
    
    @staticmethod
    def clean_temp_paths(output: str, temp_path: str, display_name: str = "your_file") -> str:
        """Clean temporary file paths from tool output"""
        if not output or not temp_path:
            return output
        
        temp_path_regex = re.escape(temp_path)
        base_temp = os.path.basename(temp_path)
        
        # Replace full temp path
        output = re.sub(temp_path_regex, display_name, output)
        # Replace just the filename
        output = re.sub(re.escape(base_temp), display_name, output)
        # Clean system temp directories
        output = re.sub(r"C:\\Users\\[^:]+\\AppData\\Local\\Temp\\", "", output)
        output = re.sub(r"/tmp/", "", output)
        
        return output


class FileManager:
    """Handles temporary file operations safely"""
    
    def __init__(self, temp_dir: Optional[str] = None):
        if temp_dir:
            self.temp_dir = temp_dir
        else:
            self.temp_dir = os.path.join(os.path.dirname(__file__), "..", "tmp")
        os.makedirs(self.temp_dir, exist_ok=True)
    
    @contextmanager
    def create_temp_file(self, content: str, suffix: str):
        """Create a temporary file with automatic cleanup"""
        temp_file = None
        try:
            temp_file = tempfile.NamedTemporaryFile(
                suffix=suffix, 
                delete=False, 
                mode="w", 
                dir=self.temp_dir,
                encoding='utf-8'
            )
            temp_file.write(content)
            temp_file.flush()
            temp_path = temp_file.name
            temp_file.close()
            yield temp_path
        finally:
            if temp_file:
                self._safe_unlink(temp_path if 'temp_path' in locals() else temp_file.name)
    
    def _safe_unlink(self, path: str):
        """Safely remove a file"""
        try:
            if os.path.exists(path):
                os.unlink(path)
        except Exception:
            pass  # Log this in production
    
    def cleanup_java_class_files(self, java_file_path: str):
        """Clean up Java .class files"""
        base = java_file_path[:-5]  # Remove .java extension
        try:
            for f in os.listdir(self.temp_dir):
                if f.startswith(os.path.basename(base)) and f.endswith('.class'):
                    self._safe_unlink(os.path.join(self.temp_dir, f))
        except Exception:
            pass


class ToolDetector:
    """Detects available tools and provides cross-platform commands"""
    
    def __init__(self):
        self._tool_cache = {}
    
    def get_node_command(self, tool: str) -> str:
        """Get the appropriate Node.js command for the platform"""
        cache_key = f"node_{tool}"
        if cache_key in self._tool_cache:
            return self._tool_cache[cache_key]
        
        # Check for npx first
        npx_cmd = "npx.cmd" if platform.system() == "Windows" else "npx"
        if shutil.which(npx_cmd):
            cmd = npx_cmd
        else:
            # Fallback to direct tool execution
            tool_cmd = f"{tool}.cmd" if platform.system() == "Windows" else tool
            if shutil.which(tool_cmd):
                cmd = tool_cmd
            else:
                raise ToolExecutionError(f"Neither npx nor {tool} found in PATH")
        
        self._tool_cache[cache_key] = cmd
        return cmd
    
    def check_tool_available(self, tool: str) -> bool:
        """Check if a tool is available"""
        return shutil.which(tool) is not None


class LanguageAnalyzer:
    """Base class for language-specific analyzers"""
    
    def __init__(self, config: AnalysisConfig, file_manager: FileManager, 
                 command_runner: CommandRunner, path_cleaner: PathCleaner,
                 tool_detector: ToolDetector):
        self.config = config
        self.file_manager = file_manager
        self.command_runner = command_runner
        self.path_cleaner = path_cleaner
        self.tool_detector = tool_detector
    
    def analyze(self, content: str, filename: str) -> List[AnalysisIssue]:
        """Analyze code content - to be implemented by subclasses"""
        raise NotImplementedError


class PythonAnalyzer(LanguageAnalyzer):
    """Python code analyzer"""
    
    def analyze(self, content: str, filename: str) -> List[AnalysisIssue]:
        issues = []
        display_name = "your_file.py"
        
        with self.file_manager.create_temp_file(content, ".py") as temp_path:
            # Run flake8
            if self.tool_detector.check_tool_available("flake8"):
                try:
                    result = self.command_runner.run_command(["flake8", temp_path])
                    if result.strip():
                        cleaned = self.path_cleaner.clean_temp_paths(result, temp_path, display_name)
                        issues.extend(self._parse_flake8_output(cleaned))
                except ToolExecutionError:
                    pass  # Tool failed, continue with other tools
            
            # Run pylint
            if self.tool_detector.check_tool_available("pylint"):
                try:
                    result = self.command_runner.run_command(["pylint", temp_path])
                    if result.strip():
                        cleaned = self.path_cleaner.clean_temp_paths(result, temp_path, display_name)
                        issues.extend(self._parse_pylint_output(cleaned))
                except ToolExecutionError:
                    pass
        
        return issues
    
    def _parse_flake8_output(self, output: str) -> List[AnalysisIssue]:
        """Parse flake8 output into AnalysisIssue objects"""
        issues = []
        for line in output.strip().splitlines():
            if line.strip():
                issues.append(AnalysisIssue(issue=line.strip()))
        return issues
    
    def _parse_pylint_output(self, output: str) -> List[AnalysisIssue]:
        """Parse pylint output into AnalysisIssue objects"""
        issues = []
        for line in output.strip().splitlines():
            if line and not line.startswith("Your code has been rated"):
                issues.append(AnalysisIssue(issue=line.strip()))
        return issues


class JavaScriptAnalyzer(LanguageAnalyzer):
    """JavaScript/TypeScript code analyzer"""
    
    def analyze(self, content: str, filename: str) -> List[AnalysisIssue]:
        issues = []
        is_typescript = filename.endswith((".ts", ".tsx"))
        ext = ".ts" if is_typescript else ".js"
        display_name = f"your_file{ext}"
        
        with self.file_manager.create_temp_file(content, ext) as temp_path:
            # Run TypeScript compiler for .ts files
            if is_typescript:
                try:
                    tsc_cmd = self.tool_detector.get_node_command("tsc")
                    result = self.command_runner.run_command([tsc_cmd, "--noEmit", temp_path])
                    if result.strip():
                        cleaned = self.path_cleaner.clean_temp_paths(result, temp_path, display_name)
                        issues.extend(self._parse_tsc_output(cleaned))
                except (ToolExecutionError, Exception):
                    pass
            
            # Run ESLint
            try:
                eslint_cmd = self.tool_detector.get_node_command("eslint")
                result = self.command_runner.run_command([eslint_cmd, "--no-ignore", temp_path])
                if result.strip():
                    cleaned = self.path_cleaner.clean_temp_paths(result, temp_path, display_name)
                    issues.extend(self._parse_eslint_output(cleaned))
            except (ToolExecutionError, Exception):
                pass
        
        return issues
    
    def _parse_tsc_output(self, output: str) -> List[AnalysisIssue]:
        """Parse TypeScript compiler output"""
        issues = []
        for line in output.strip().splitlines():
            if line.strip():
                issues.append(AnalysisIssue(issue=line.strip()))
        return issues
    
    def _parse_eslint_output(self, output: str) -> List[AnalysisIssue]:
        """Parse ESLint output"""
        issues = []
        for line in output.strip().splitlines():
            if line.strip():
                issues.append(AnalysisIssue(issue=line.strip()))
        return issues


class JavaAnalyzer(LanguageAnalyzer):
    """Java code analyzer"""
    
    def analyze(self, content: str, filename: str) -> List[AnalysisIssue]:
        issues = []
        display_name = "your_file.java"
        
        with self.file_manager.create_temp_file(content, ".java") as temp_path:
            try:
                result = self.command_runner.run_command(["javac", temp_path])
                if result.strip():
                    cleaned = self.path_cleaner.clean_temp_paths(result, temp_path, display_name)
                    issues.extend(self._parse_javac_output(cleaned))
            except ToolExecutionError:
                issues.append(AnalysisIssue(
                    issue="Java file could not be analyzed: compiler not available or failed",
                    explanation="Ensure javac is installed and accessible"
                ))
            finally:
                # Clean up .class files
                self.file_manager.cleanup_java_class_files(temp_path)
        
        return issues
    
    def _parse_javac_output(self, output: str) -> List[AnalysisIssue]:
        """Parse javac compiler output"""
        issues = []
        for line in output.strip().splitlines():
            if line.strip():
                issues.append(AnalysisIssue(issue=line.strip()))
        return issues


class CAnalyzer(LanguageAnalyzer):
    """C/C++ code analyzer"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.is_cpp = False
    
    def analyze(self, content: str, filename: str) -> List[AnalysisIssue]:
        self.is_cpp = filename.endswith((".cpp", ".cc", ".cxx", ".hpp", ".hxx"))
        ext = ".cpp" if self.is_cpp else ".c"
        display_name = f"your_file{ext}"
        compiler = "g++" if self.is_cpp else "gcc"
        
        issues = []
        
        with self.file_manager.create_temp_file(content, ext) as temp_path:
            try:
                result = self.command_runner.run_command([compiler, "-fsyntax-only", temp_path])
                if result.strip():
                    cleaned = self.path_cleaner.clean_temp_paths(result, temp_path, display_name)
                    issues.extend(self._parse_compiler_output(cleaned, content))
            except ToolExecutionError as e:
                issues.append(AnalysisIssue(
                    issue=f"{'C++' if self.is_cpp else 'C'} file could not be analyzed: {e}",
                    explanation="Compiler not available or compilation failed"
                ))
        
        return issues
    
    def _parse_compiler_output(self, output: str, content: str) -> List[AnalysisIssue]:
        """Parse GCC/G++ compiler output"""
        issues = []
        lines = [line for line in output.splitlines() if line.strip()]
        
        for line in lines:
            if "error:" in line or "warning:" in line:
                # Try to get predefined explanation
                explanation = self._get_mapped_explanation(line)
                
                if not explanation:
                    # Generate AI explanation
                    lang = "C++" if self.is_cpp else "C"
                    prompt = (
                        f"As a {lang} code review assistant, explain this compiler error or warning and how to fix it:\n"
                        f"Issue: {line}\n"
                        f"Code:\n{content[:self.config.max_code_snippet_length]}"
                    )
                    try:
                        explanation = model_instance.explain(prompt)
                    except Exception:
                        explanation = "No explanation available"
                
                issues.append(AnalysisIssue(
                    issue=line.strip(),
                    explanation=explanation.strip() if explanation else "No explanation available"
                ))
        
        return issues
    
    def _get_mapped_explanation(self, error_message: str) -> Optional[str]:
        """Get predefined explanation for common errors"""
        for key, explanation in COMMON_ERROR_EXPLANATIONS.items():
            if key in error_message:
                return explanation
        return None


class StructuredDataAnalyzer(LanguageAnalyzer):
    """Analyzer for JSON and YAML files"""
    
    def analyze(self, content: str, filename: str) -> List[AnalysisIssue]:
        issues = []
        
        if filename.endswith(".json"):
            try:
                json.loads(content)
            except json.JSONDecodeError as e:
                issues.append(AnalysisIssue(
                    issue=f"JSON SyntaxError: {e}",
                    explanation="Fix the JSON syntax error to make the file valid"
                ))
        
        elif filename.endswith((".yaml", ".yml")):
            try:
                yaml.safe_load(content)
            except yaml.YAMLError as e:
                issues.append(AnalysisIssue(
                    issue=f"YAML SyntaxError: {e}",
                    explanation="Fix the YAML syntax error to make the file valid"
                ))
        
        return issues


def is_real_lint_issue(issue: str) -> bool:
    summary_keywords = [
        'problems (', 'potentially fixable', 'Summary of', 'Code Explanation',
        'n - node', 'plain English', 'A simple summary', 'This is a very simple',
        'error and 0 warnings', 'how to fix the problem with the assistant',
        'Summarize', 'example of', 'assistant', 'fix the problem',
    ]
    if issue.strip().lower() == "code explanation":
        return False
    if any(keyword.lower() in issue.lower() for keyword in summary_keywords):
        return False
    return True

def extract_lint_code(issue: str) -> Optional[str]:
    # Try to extract the error code (works for Python, JS, etc)
    match = re.search(r"\b([A-Z]\d{3,})\b", issue)
    if match:
        return match.group(1)
    match = re.search(r"\bno-[\w-]+\b", issue)
    if match:
        return match.group(0)
    return None


class CodeAnalyzer:
    """Main code analyzer that coordinates language-specific analyzers"""
    
    def __init__(self, config: Optional[AnalysisConfig] = None):
        self.config = config or AnalysisConfig()
        self.file_manager = FileManager(self.config.temp_dir)
        self.command_runner = CommandRunner(self.config.timeout)
        self.path_cleaner = PathCleaner()
        self.tool_detector = ToolDetector()
        
        # Initialize language analyzers
        analyzer_args = (self.config, self.file_manager, self.command_runner, 
                        self.path_cleaner, self.tool_detector)
        
        self.analyzers = {
            '.py': PythonAnalyzer(*analyzer_args),
            '.js': JavaScriptAnalyzer(*analyzer_args),
            '.jsx': JavaScriptAnalyzer(*analyzer_args),
            '.ts': JavaScriptAnalyzer(*analyzer_args),
            '.tsx': JavaScriptAnalyzer(*analyzer_args),
            '.java': JavaAnalyzer(*analyzer_args),
            '.c': CAnalyzer(*analyzer_args),
            '.cpp': CAnalyzer(*analyzer_args),
            '.cc': CAnalyzer(*analyzer_args),
            '.cxx': CAnalyzer(*analyzer_args),
            '.hpp': CAnalyzer(*analyzer_args),
            '.hxx': CAnalyzer(*analyzer_args),
            '.json': StructuredDataAnalyzer(*analyzer_args),
            '.yaml': StructuredDataAnalyzer(*analyzer_args),
            '.yml': StructuredDataAnalyzer(*analyzer_args),
        }
    
    def analyze_and_explain(self, content: bytes, filename: str) -> Tuple[List[Dict], str]:
        """Main analysis function - maintains compatibility with original API"""
        try:
            # Input validation
            if not content:
                raise AnalysisError("Empty content provided")
            
            if not filename:
                raise AnalysisError("Filename is required")
            
            # Decode content safely
            try:
                content_str = content.decode('utf-8')
            except UnicodeDecodeError:
                try:
                    content_str = content.decode('latin-1')
                except UnicodeDecodeError:
                    raise AnalysisError("Cannot decode file content")
            
            # Get file extension
            _, ext = os.path.splitext(filename.lower())
            
            # Check if we support this file type
            if ext not in self.analyzers:
                raise UnsupportedFileTypeError(f"Analysis for {ext} files is not implemented yet")
            
            # Run analysis
            analyzer = self.analyzers[ext]
            issues = analyzer.analyze(content_str, filename)
            
            # Generate code summary
            code_summary = self._generate_code_summary(content_str, filename)

            # Incorporate AI-powered suggestions (PHASE 4A)
            results = []
            for issue in issues:
                # Convert to dict if needed
                if isinstance(issue, AnalysisIssue):
                    issue_dict = {
                        "issue": issue.issue,
                        "explanation": issue.explanation
                    }
                elif isinstance(issue, dict):
                    issue_dict = dict(issue)
                else:
                    issue_dict = {"issue": str(issue)}

                # Add AI suggestion if actionable
                suggestion = None
                if "issue" in issue_dict and issue_dict["issue"] and is_real_lint_issue(issue_dict["issue"]):
                    # Use a relevant code snippet for suggestion
                    code_snippet = content_str[:self.config.max_code_snippet_length]
                    suggestion_prompt = (
                        f"Given this code issue:\n"
                        f"Issue: {issue_dict['issue']}\n"
                        f"Relevant code:\n{code_snippet}\n"
                        "Suggest a corrected version of the code, if possible. "
                        "Only output code, no explanation."
                    )
                    try:
                        suggestion = model_instance.explain(suggestion_prompt)
                        if suggestion:
                            suggestion = re.sub(r"^```[\w]*\n", "", suggestion)
                            suggestion = re.sub(r"\n```$", "", suggestion)
                            suggestion = suggestion.strip()
                    except Exception:
                        suggestion = None
                issue_dict["suggestion"] = suggestion
                results.append(issue_dict)
            # End AI-powered suggestions block

            return results, code_summary
            
        except (AnalysisError, UnsupportedFileTypeError) as e:
            return [str(e)], "No meaningful summary could be generated for this file."
        except Exception as e:
            return [f"Unexpected error during analysis: {e}"], "No meaningful summary could be generated for this file."
    
    def _generate_code_summary(self, content: str, filename: str) -> str:
        """Generate AI-powered code summary"""
        try:
            # Determine language
            if filename.endswith(".py"):
                lang = "Python"
            elif filename.endswith((".js", ".jsx", ".ts", ".tsx")):
                lang = "JavaScript/TypeScript"
            elif filename.endswith(".java"):
                lang = "Java"
            elif filename.endswith((".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hxx")):
                lang = "C or C++"
            else:
                lang = "this"
            
            prompt = (
                f"You are a senior software engineer performing code analysis on a {lang} file.\n"
                "Explain the code *strictly* in the following professional format:\n\n"
                "1. Provide a numbered list of what the code does — one sentence per point.\n"
                "2. Do not include any markdown, extra newlines, or conversational language.\n"
                "3. End with a 'Notes:' section only if suggestions or improvements are needed.\n\n"
                "Follow this sample structure strictly:\n"
                "1. Imports standard modules os and sys.\n"
                "2. Defines a User class with name, age, and data attributes.\n"
                "3. Implements method add_data to append to data list.\n"
                "4. Implements method get_data to return data.\n"
                "5. Implements method to calculate year of birth.\n"
                "6. Defines a function to process a list of users.\n"
                "7. Creates two User objects and processes them.\n"
                "Notes: Remove unused imports. Add input validation for age.\n\n"
                f"Code:\n{content}"
            )
            
            summary = model_instance.explain(prompt)
            
            if summary and summary.strip():
                # Clean up formatting
                summary = re.sub(r"\*\*(.*?)\*\*", r"\1", summary)
                summary = re.sub(r"\n{2,}", "\n", summary.strip())
                summary = summary.strip()
                
                # Validate format
                if re.match(r"^1\.\s", summary):
                    return summary
            
            return "No meaningful summary could be generated for this file."
            
        except Exception:
            return "No meaningful summary could be generated for this file."


# Maintain backward compatibility
def get_mapped_explanation(error_message):
    """Legacy function for backward compatibility"""
    for key, explanation in COMMON_ERROR_EXPLANATIONS.items():
        if key in error_message:
            return explanation
    return None


def analyze_and_explain(content: bytes, filename: str):
    """Legacy function for backward compatibility"""
    analyzer = CodeAnalyzer()
    return analyzer.analyze_and_explain(content, filename)