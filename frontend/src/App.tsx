// App.tsx
import React, { useState, useCallback, useMemo } from "react";
import {
  Box,
  Button,
  Heading,
  VStack,
  Text,
  Spinner,
  Input,
  useToast,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Divider,
} from "@chakra-ui/react";
import MonacoEditor from "@monaco-editor/react";
import AnalysisResult, { type ResultItem } from "./components/AnalysisResult";
import { fetchAnalysisAndExplanations, fetchExplanation } from "./api";
import Chatbot from "./components/Chatbot";
import GithubAnalyzer from "./components/GithubAnalyzer";

interface AnalysisResponse {
  issues: ResultItem[] | ResultItem;
  summary?: string;
}

interface LoadingState {
  analyzing: boolean;
  explaining: boolean;
}

interface AppError {
  message: string;
  type: "upload" | "analysis" | "explanation" | "validation";
}

const getLanguage = (filename: string): string => {
  const extension = filename.toLowerCase().split(".").pop();
  const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    pyw: "python",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    go: "go",
    rs: "rust",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sh: "shell",
    bash: "shell",
    json: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    ini: "ini",
    md: "markdown",
    markdown: "markdown",
  };
  return languageMap[extension || ""] || "plaintext";
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "java",
  "cpp",
  "c",
  "cs",
  "php",
  "rb",
  "go",
  "rs",
  "swift",
  "kt",
  "scala",
  "html",
  "css",
  "scss",
  "json",
  "xml",
  "yaml",
  "yml",
];

const defaultCodeExamples: Record<string, string> = {
  python: `# Python example
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(10))`,

  javascript: `// JavaScript example
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));`,

  typescript: `// TypeScript example
function fibonacci(n: number): number {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));`,
};

const App: React.FC = () => {
  const toast = useToast();
  const [code, setCode] = useState<string>(defaultCodeExamples.python);
  const [filename, setFilename] = useState<string>("example.py");
  const [results, setResults] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState<LoadingState>({
    analyzing: false,
    explaining: false,
  });
  const [explanation, setExplanation] = useState<string>("");
  const [error, setError] = useState<AppError | null>(null);

  const editorLanguage = useMemo(() => getLanguage(filename), [filename]);
  const isLoading = loading.analyzing || loading.explaining;

  const handleError = useCallback(
    (error: unknown, type: AppError["type"]) => {
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      setError({ message, type });
      toast({
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Error`,
        description: message,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    },
    [toast]
  );

  const validateFile = useCallback(
    (file: File): boolean => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (file.size > MAX_FILE_SIZE) {
        handleError(
          new Error(`File exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit.`),
          "validation"
        );
        return false;
      }
      if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
        handleError(
          new Error(`.${extension} is not a supported file format.`),
          "validation"
        );
        return false;
      }
      return true;
    },
    [handleError]
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);
      if (!validateFile(file)) {
        e.target.value = "";
        return;
      }

      setFilename(file.name);
      const reader = new FileReader();

      reader.onload = (event) => {
        const content = event.target?.result as string;
        setCode(content);
        toast({
          title: "File uploaded successfully",
          status: "success",
          duration: 2000,
          isClosable: true,
        });
      };

      reader.onerror = () => {
        handleError(new Error("Failed to read file."), "upload");
      };

      reader.onloadend = () => {
        e.target.value = "";
      };

      reader.readAsText(file);
    },
    [validateFile, handleError, toast]
  );

  const analyzeCode = useCallback(async () => {
    if (!code.trim()) {
      handleError(new Error("Please provide code to analyze"), "validation");
      return;
    }

    setLoading((prev) => ({ ...prev, analyzing: true }));
    setResults(null);
    setError(null);

    try {
      const response = await fetchAnalysisAndExplanations(code, filename);

      let issues: ResultItem[] = [];
      let summary: string | undefined;

      if (Array.isArray(response)) {
        issues = Array.isArray(response[0]) ? response[0] : [response[0]];
        summary = response[1];
      } else if (typeof response === "object" && response !== null) {
        if ("issues" in response) {
          issues = Array.isArray(response.issues)
            ? response.issues
            : [response.issues];
          summary = response.summary;
        } else {
          issues = [response as ResultItem];
        }
      }

      setResults({ issues, summary });

      toast({
        title: "Analysis completed",
        description: `Found ${issues.length} issue(s).`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (err) {
      handleError(err, "analysis");
    } finally {
      setLoading((prev) => ({ ...prev, analyzing: false }));
    }
  }, [code, filename, toast, handleError]);

  const explainCode = useCallback(async () => {
    if (!code.trim()) {
      handleError(new Error("Please provide code to explain"), "validation");
      return;
    }

    setLoading((prev) => ({ ...prev, explaining: true }));
    setExplanation("");
    setError(null);

    try {
      const response = await fetchExplanation(code);
      setExplanation(response);

      toast({
        title: "Explanation ready",
        status: "success",
        duration: 2000,
        isClosable: true,
      });
    } catch (err) {
      handleError(err, "explanation");
    } finally {
      setLoading((prev) => ({ ...prev, explaining: false }));
    }
  }, [code, handleError, toast]);

  const handleFilenameChange = useCallback(
    (newName: string) => {
      const newLang = getLanguage(newName);
      const currentLang = getLanguage(filename);
      setFilename(newName);

      if (
        newLang !== currentLang &&
        code ===
          (defaultCodeExamples[currentLang] || defaultCodeExamples.python)
      ) {
        setCode(defaultCodeExamples[newLang] || "");
      }
    },
    [filename, code]
  );

  // Handler for when GitHub code is loaded
  const handleGithubCodeLoad = useCallback(
    (githubCode: string, githubFilename: string) => {
      setCode(githubCode);
      setFilename(githubFilename);
      setResults(null);
      setExplanation("");
      setError(null);
    },
    []
  );

  return (
    <Box maxW="1200px" mx="auto" p={6}>
      <Heading mb={6} textAlign="center" color="teal.600">
        🤖 AI-Powered Code Review Assistant
      </Heading>

      <VStack spacing={8} align="stretch">
        {error && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle textTransform="capitalize">
                {error.type} Error
              </AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Box>
          </Alert>
        )}

        {/* GitHub Integration */}
        <Box>
          <Heading size="md" mb={4} color="gray.700">
            📁 GitHub Integration
          </Heading>
          <GithubAnalyzer onCodeLoad={handleGithubCodeLoad} />
        </Box>

        <Divider />

        {/* File Upload */}
        <Box>
          <Heading size="md" mb={4} color="gray.700">
            📂 Manual File Upload
          </Heading>
          <Button
            as="label"
            colorScheme="blue"
            size="lg"
            width="full"
            cursor="pointer"
          >
            📁 Upload Code File
            <Input
              type="file"
              hidden
              onChange={handleFileUpload}
              accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
            />
          </Button>
          <Text fontSize="sm" color="gray.600" mt={2} textAlign="center">
            Supported: {ALLOWED_EXTENSIONS.slice(0, 8).join(", ")}... (Max: 5MB)
          </Text>
        </Box>

        {/* Filename input */}
        <Input
          placeholder="Enter filename (e.g., example.py)"
          value={filename}
          onChange={(e) => handleFilenameChange(e.target.value)}
          isDisabled={isLoading}
        />

        {/* Code Editor */}
        <Box>
          <Text mb={2} fontWeight="semibold">
            Code Editor:
          </Text>
          <Box
            border="1px"
            borderColor="gray.200"
            borderRadius="md"
            overflow="hidden"
          >
            <MonacoEditor
              height="400px"
              language={editorLanguage}
              value={code}
              onChange={(val) => setCode(val || "")}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
              }}
              theme="vs-light"
            />
          </Box>
        </Box>

        {/* Buttons */}
        <Box display="flex" gap={4} flexWrap="wrap">
          <Button
            colorScheme="teal"
            onClick={analyzeCode}
            isLoading={loading.analyzing}
            isDisabled={!code.trim() || isLoading}
            loadingText="Analyzing..."
            flex="1"
          >
            🔍 Analyze Code
          </Button>
          <Button
            colorScheme="purple"
            onClick={explainCode}
            isLoading={loading.explaining}
            isDisabled={!code.trim() || isLoading}
            loadingText="Explaining..."
            variant="outline"
            flex="1"
          >
            💡 Explain Code
          </Button>
        </Box>

        {/* Spinner */}
        {isLoading && (
          <Box textAlign="center" py={4}>
            <Spinner size="xl" color="teal.500" />
            <Text mt={2}>
              {loading.analyzing
                ? "Analyzing code..."
                : "Generating explanation..."}
            </Text>
          </Box>
        )}

        {/* Results */}
        {results && (
          <AnalysisResult
            results={{
              lintResults: Array.isArray(results.issues)
                ? results.issues
                : [results.issues],
              codeSummary: results.summary,
            }}
          />
        )}

        {/* Explanation */}
        {explanation && (
          <Box
            mt={4}
            p={6}
            bg="purple.50"
            borderRadius="md"
            border="1px solid"
            borderColor="purple.200"
          >
            <Heading size="md" mb={3} color="purple.700">
              💡 Code Explanation
            </Heading>
            <Text whiteSpace="pre-wrap">{explanation}</Text>
          </Box>
        )}

        <Divider />

        {/* Chatbot */}
        <Box>
          <Heading size="md" mb={4} color="gray.700">
            💬 AI Assistant
          </Heading>
          <Chatbot
            code={code}
            issues={
              Array.isArray(results?.issues)
                ? results.issues
                : results?.issues
                ? [results.issues]
                : []
            }
          />
        </Box>
      </VStack>
    </Box>
  );
};

export default App;
