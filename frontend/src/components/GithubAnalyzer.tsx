import React, { useState } from "react";
import {
  Box,
  Input,
  Button,
  Spinner,
  VStack,
  HStack,
  Text,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Badge,
  Divider,
  Textarea,
  useToast,
  FormControl,
  FormLabel,
  FormHelperText,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Code,
  useDisclosure,
  IconButton,
  Tooltip,
} from "@chakra-ui/react";
import {
  ExternalLinkIcon,
  InfoIcon,
  WarningIcon,
  CheckCircleIcon,
  DownloadIcon,
} from "@chakra-ui/icons";
import axios from "axios";

interface AnalysisIssue {
  issue: string;
  explanation: string;
  suggestion: string;
  severity: "error" | "warning" | "info";
  line_number?: number;
  doc_link?: string;
}

interface GithubAnalysisResult {
  file_path: string;
  content: string;
  analysis_results: AnalysisIssue[];
  metadata: {
    repo?: string;
    branch?: string;
    pr_number?: number;
    file_size?: number;
    last_modified?: string;
    status?: string;
    additions?: number;
    deletions?: number;
    changes?: number;
  };
}

interface RepoInfo {
  name: string;
  full_name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  open_issues: number;
  created_at: string;
  updated_at: string;
  default_branch: string;
}

interface AnalyzeGithubRequest {
  url: string;
  github_token?: string;
}

interface ErrorResponse {
  detail: string;
}

interface GithubAnalyzerProps {
  onCodeLoad?: (code: string, filename: string) => void;
}

const GithubAnalyzer: React.FC<GithubAnalyzerProps> = ({ onCodeLoad }) => {
  const [url, setUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [results, setResults] = useState<GithubAnalysisResult[]>([]);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const { isOpen: isTokenOpen, onToggle: onTokenToggle } = useDisclosure();
  const toast = useToast();

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <WarningIcon />;
      case "warning":
        return <InfoIcon />;
      case "info":
        return <CheckCircleIcon />;
      default:
        return <InfoIcon />;
    }
  };

  const parseGithubUrl = (url: string) => {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    return match ? { owner: match[1], repo: match[2] } : null;
  };

  const fetchRepoInfo = async (owner: string, repo: string) => {
    try {
      const response = await axios.get(`/github_info/${owner}/${repo}`);
      setRepoInfo(response.data as RepoInfo);
    } catch (error) {
      console.warn("Could not fetch repository info:", error);
    }
  };

  const validateGithubUrl = (url: string): boolean => {
    const patterns = [
      /github\.com\/[^\/]+\/[^\/]+\/blob\/[^\/]+\/.+/, // File URL
      /github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/, // PR URL
      /github\.com\/[^\/]+\/[^\/]+\/?$/, // Repo URL
    ];
    return patterns.some((pattern) => pattern.test(url));
  };

  const loadCodeToMainEditor = (result: GithubAnalysisResult) => {
    if (onCodeLoad) {
      // Extract just the filename from the path
      const filename = result.file_path.split("/").pop() || result.file_path;
      onCodeLoad(result.content, filename);

      toast({
        title: "Code Loaded",
        description: `${filename} has been loaded into the main editor`,
        status: "success",
        duration: 3000,
      });
    }
  };

  const analyze = async () => {
    if (!url.trim()) {
      toast({
        title: "Error",
        description: "Please enter a GitHub URL",
        status: "error",
        duration: 3000,
      });
      return;
    }

    if (!validateGithubUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid GitHub URL (repo, file, or PR)",
        status: "error",
        duration: 5000,
      });
      return;
    }

    setLoading(true);
    setResults([]);
    setError("");
    setRepoInfo(null);

    try {
      // Fetch repository info if it's a valid GitHub URL
      const parsedUrl = parseGithubUrl(url);
      if (parsedUrl) {
        await fetchRepoInfo(parsedUrl.owner, parsedUrl.repo);
      }

      // Analyze the GitHub URL
      const requestData: AnalyzeGithubRequest = {
        url: url.trim(),
        github_token: githubToken.trim() || undefined,
      };

      const response = await axios.post("/api/v1/analyze_github/", requestData);
      const analysisResults = response.data as GithubAnalysisResult[];

      setResults(analysisResults);

      // If there's only one file and onCodeLoad is provided, automatically load it
      if (analysisResults.length === 1 && onCodeLoad) {
        loadCodeToMainEditor(analysisResults[0]);
      }

      toast({
        title: "Analysis Complete",
        description: `Analyzed ${analysisResults.length} file(s)`,
        status: "success",
        duration: 3000,
      });
    } catch (error: any) {
      let errorMessage = "Failed to analyze GitHub URL";

      if (error.response && error.response.data) {
        const errorData = error.response.data as ErrorResponse;
        errorMessage = errorData.detail || error.message || errorMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);

      toast({
        title: "Analysis Failed",
        description: errorMessage,
        status: "error",
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const getTotalIssues = () => {
    return results.reduce(
      (total, result) => total + result.analysis_results.length,
      0
    );
  };

  const getIssuesByType = () => {
    const counts = { error: 0, warning: 0, info: 0 };
    results.forEach((result) => {
      result.analysis_results.forEach((issue) => {
        counts[issue.severity as keyof typeof counts]++;
      });
    });
    return counts;
  };

  return (
    <Box borderWidth="1px" borderRadius="lg" p={6} bg="white" boxShadow="sm">
      <VStack spacing={4} align="stretch">
        <Box>
          <Text fontSize="xl" fontWeight="bold" color="gray.800" mb={2}>
            🔍 GitHub Code Analyzer
          </Text>
          <Text color="gray.600" fontSize="sm">
            Analyze code from GitHub repositories, pull requests, or individual
            files
          </Text>
        </Box>

        <Divider />

        {/* Repository Info */}
        {repoInfo && (
          <Box
            bg="blue.50"
            p={4}
            borderRadius="md"
            borderLeft="4px"
            borderColor="blue.400"
          >
            <HStack justify="space-between" align="start">
              <VStack align="start" spacing={1}>
                <Text fontWeight="bold" color="blue.800">
                  {repoInfo.full_name}
                </Text>
                <Text fontSize="sm" color="gray.600">
                  {repoInfo.description}
                </Text>
                <HStack spacing={2}>
                  <Badge colorScheme="blue">{repoInfo.language}</Badge>
                  <Text fontSize="xs" color="gray.500">
                    ⭐ {repoInfo.stars}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    🍴 {repoInfo.forks}
                  </Text>
                </HStack>
              </VStack>
            </HStack>
          </Box>
        )}

        {/* Input Section */}
        <VStack spacing={3}>
          <FormControl>
            <FormLabel>GitHub URL</FormLabel>
            <Input
              placeholder="https://github.com/owner/repo/blob/main/file.py"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              bg="gray.50"
              _focus={{ bg: "white", borderColor: "blue.400" }}
            />
            <FormHelperText>
              Supports repository URLs, file URLs, and pull request URLs
            </FormHelperText>
          </FormControl>

          <FormControl>
            <HStack justify="space-between">
              <FormLabel mb={0}>GitHub Token (Optional)</FormLabel>
              <Button size="xs" variant="ghost" onClick={onTokenToggle}>
                {isTokenOpen ? "Hide" : "Show"} Token Field
              </Button>
            </HStack>
            {isTokenOpen && (
              <Box pt={2}>
                <Textarea
                  placeholder="ghp_xxxxxxxxxxxx (for private repos or higher rate limits)"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  size="sm"
                  rows={2}
                  bg="gray.50"
                  _focus={{ bg: "white", borderColor: "blue.400" }}
                />
                <FormHelperText fontSize="xs">
                  Required for private repositories. Get your token from GitHub
                  Settings → Developer settings → Personal access tokens
                </FormHelperText>
              </Box>
            )}
          </FormControl>

          <Button
            colorScheme="blue"
            onClick={analyze}
            isLoading={loading}
            loadingText="Analyzing..."
            width="full"
            size="lg"
          >
            🚀 Analyze Code
          </Button>
        </VStack>

        {/* Loading State */}
        {loading && (
          <Box textAlign="center" py={8}>
            <Spinner size="lg" color="blue.500" />
            <Text mt={4} color="gray.600">
              Fetching and analyzing code...
            </Text>
          </Box>
        )}

        {/* Error State */}
        {error && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Analysis Failed!</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Box>
          </Alert>
        )}

        {/* Results Summary */}
        {results.length > 0 && (
          <Box bg="gray.50" p={4} borderRadius="md">
            <Text fontWeight="bold" mb={2}>
              📊 Analysis Summary
            </Text>
            <HStack spacing={4} wrap="wrap">
              <Text>
                Files analyzed:{" "}
                <Badge colorScheme="blue">{results.length}</Badge>
              </Text>
              <Text>
                Total issues:{" "}
                <Badge colorScheme="purple">{getTotalIssues()}</Badge>
              </Text>
              {(() => {
                const counts = getIssuesByType();
                return (
                  <>
                    {counts.error > 0 && (
                      <Text>
                        Errors: <Badge colorScheme="red">{counts.error}</Badge>
                      </Text>
                    )}
                    {counts.warning > 0 && (
                      <Text>
                        Warnings:{" "}
                        <Badge colorScheme="orange">{counts.warning}</Badge>
                      </Text>
                    )}
                    {counts.info > 0 && (
                      <Text>
                        Info: <Badge colorScheme="blue">{counts.info}</Badge>
                      </Text>
                    )}
                  </>
                );
              })()}
            </HStack>
          </Box>
        )}

        {/* Results */}
        {results.length > 0 && (
          <Accordion allowMultiple>
            {results.map((result, index) => (
              <AccordionItem
                key={index}
                border="1px"
                borderColor="gray.200"
                borderRadius="md"
                mb={2}
              >
                <AccordionButton _hover={{ bg: "gray.50" }}>
                  <Box flex="1" textAlign="left">
                    <HStack>
                      <Text fontWeight="semibold">📄 {result.file_path}</Text>
                      {result.analysis_results.length > 0 && (
                        <Badge
                          colorScheme={
                            result.analysis_results.some(
                              (i) => i.severity === "error"
                            )
                              ? "red"
                              : "orange"
                          }
                        >
                          {result.analysis_results.length} issues
                        </Badge>
                      )}
                      {result.analysis_results.length === 0 && (
                        <Badge colorScheme="green">✅ No issues</Badge>
                      )}
                      {onCodeLoad && (
                        <Tooltip label="Load this file into the main editor">
                          <IconButton
                            aria-label="Load code to editor"
                            icon={<DownloadIcon />}
                            size="sm"
                            variant="ghost"
                            colorScheme="blue"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadCodeToMainEditor(result);
                            }}
                          />
                        </Tooltip>
                      )}
                    </HStack>
                  </Box>
                  <AccordionIcon />
                </AccordionButton>

                <AccordionPanel pb={4}>
                  <Tabs size="sm">
                    <TabList>
                      <Tab>Issues ({result.analysis_results.length})</Tab>
                      <Tab>File Info</Tab>
                      <Tab>Code Preview</Tab>
                    </TabList>

                    <TabPanels>
                      {/* Issues Tab */}
                      <TabPanel>
                        {result.analysis_results.length === 0 ? (
                          <Alert status="success" borderRadius="md">
                            <AlertIcon />
                            <Text>No issues found in this file! 🎉</Text>
                          </Alert>
                        ) : (
                          <VStack spacing={3} align="stretch">
                            {result.analysis_results.map(
                              (issue, issueIndex) => (
                                <Alert
                                  key={issueIndex}
                                  status={issue.severity as any}
                                  borderRadius="md"
                                  variant="left-accent"
                                >
                                  <AlertIcon
                                    as={() => getSeverityIcon(issue.severity)}
                                  />
                                  <Box flex="1">
                                    <AlertTitle fontSize="sm">
                                      {issue.issue}
                                      {issue.line_number && (
                                        <Badge
                                          ml={2}
                                          colorScheme="gray"
                                          fontSize="xs"
                                        >
                                          Line {issue.line_number}
                                        </Badge>
                                      )}
                                    </AlertTitle>
                                    <AlertDescription fontSize="sm" mt={1}>
                                      <Text>{issue.explanation}</Text>
                                      {issue.suggestion && (
                                        <Text
                                          mt={1}
                                          fontWeight="medium"
                                          color="gray.700"
                                        >
                                          💡 {issue.suggestion}
                                        </Text>
                                      )}
                                      {issue.doc_link && (
                                        <HStack mt={2}>
                                          <Button
                                            as="a"
                                            href={issue.doc_link}
                                            target="_blank"
                                            size="xs"
                                            variant="outline"
                                            rightIcon={<ExternalLinkIcon />}
                                          >
                                            Learn More
                                          </Button>
                                        </HStack>
                                      )}
                                    </AlertDescription>
                                  </Box>
                                </Alert>
                              )
                            )}
                          </VStack>
                        )}
                      </TabPanel>

                      {/* File Info Tab */}
                      <TabPanel>
                        <VStack align="start" spacing={2}>
                          <Text>
                            <strong>Path:</strong> {result.file_path}
                          </Text>
                          {result.metadata.repo && (
                            <Text>
                              <strong>Repository:</strong>{" "}
                              {result.metadata.repo}
                            </Text>
                          )}
                          {result.metadata.branch && (
                            <Text>
                              <strong>Branch:</strong> {result.metadata.branch}
                            </Text>
                          )}
                          {result.metadata.pr_number && (
                            <Text>
                              <strong>PR Number:</strong> #
                              {result.metadata.pr_number}
                            </Text>
                          )}
                          {result.metadata.file_size && (
                            <Text>
                              <strong>Size:</strong> {result.metadata.file_size}{" "}
                              bytes
                            </Text>
                          )}
                          {result.metadata.status && (
                            <Text>
                              <strong>Status:</strong> {result.metadata.status}
                            </Text>
                          )}
                          {result.metadata.additions && (
                            <Text>
                              <strong>Additions:</strong> +
                              {result.metadata.additions}
                            </Text>
                          )}
                          {result.metadata.deletions && (
                            <Text>
                              <strong>Deletions:</strong> -
                              {result.metadata.deletions}
                            </Text>
                          )}
                        </VStack>
                      </TabPanel>

                      {/* Code Preview Tab */}
                      <TabPanel>
                        <VStack spacing={3} align="stretch">
                          {onCodeLoad && (
                            <Button
                              colorScheme="blue"
                              size="sm"
                              leftIcon={<DownloadIcon />}
                              onClick={() => loadCodeToMainEditor(result)}
                            >
                              Load to Main Editor
                            </Button>
                          )}
                          <Code
                            p={4}
                            borderRadius="md"
                            bg="gray.900"
                            color="white"
                            fontSize="sm"
                            whiteSpace="pre-wrap"
                            maxH="400px"
                            overflowY="auto"
                            display="block"
                            w="full"
                          >
                            {result.content.slice(0, 2000)}
                            {result.content.length > 2000 &&
                              "\n... (truncated)"}
                          </Code>
                        </VStack>
                      </TabPanel>
                    </TabPanels>
                  </Tabs>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </VStack>
    </Box>
  );
};

export default GithubAnalyzer;
