import React from "react";
import { Box, Text, Link, useToast } from "@chakra-ui/react";
import CopyButton from "./CopyButton";

/**
 * ResultItem describes a single linting or analysis issue.
 */
export type ResultItem = {
  issue: string;
  explanation?: string;
  suggestion?: string;
  doc_link?: string;
};

/**
 * AnalysisData represents the primary data structure used for rendering results.
 * - lintResults: an array of ResultItem objects.
 * - codeSummary: optional summary of the code as string.
 */
type AnalysisData = {
  lintResults: ResultItem[];
  codeSummary?: string;
};

/**
 * Props accepted by AnalysisResult component.
 * Supports multiple possible shapes for backwards compatibility with
 * different backend response formats.
 */
type Props = {
  results:
    | ResultItem[] // array of issues (preferred)
    | ResultItem // single issue object (must be wrapped)
    | [ResultItem[], string] // [issues array, summary]
    | AnalysisData // { lintResults, codeSummary }
    | null
    | undefined;
};

/**
 * Helper function to safely render text content
 */
const safeRenderText = (content: any): string => {
  if (typeof content === "string") return content;
  if (typeof content === "number") return String(content);
  if (content === null || content === undefined) return "";
  if (typeof content === "object") {
    console.warn("Attempted to render object as text:", content);
    return JSON.stringify(content);
  }
  return String(content);
};

/**
 * AnalysisResult component renders the linting/analysis results and code summary.
 * It is robust against various backend result formats.
 */
const AnalysisResult: React.FC<Props> = ({ results }) => {
  const toast = useToast();

  // Debug logging
  console.log("AnalysisResult received results:", results);

  /**
   * Robustly normalize the results prop into AnalysisData.
   * Handles:
   *   - array of ResultItem
   *   - single ResultItem object
   *   - tuple [ResultItem[], string]
   *   - { lintResults, codeSummary }
   *   - null/undefined/empty
   * If the input does not match any recognized structure, returns empty results.
   */
  const parseResults = (input: Props["results"]): AnalysisData => {
    if (!input) {
      // Null or undefined, treat as empty results
      return { lintResults: [] };
    }

    // Case 1: Already in AnalysisData format
    if (
      typeof input === "object" &&
      input !== null &&
      "lintResults" in input &&
      Array.isArray((input as AnalysisData).lintResults)
    ) {
      return input as AnalysisData;
    }

    // Case 2: [ResultItem[], string] tuple
    if (Array.isArray(input)) {
      // [ResultItem[], string] or just ResultItem[]
      if (
        input.length === 2 &&
        Array.isArray(input[0]) &&
        typeof input[1] === "string"
      ) {
        // [issues array, summary]
        return {
          lintResults: input[0] as ResultItem[],
          codeSummary: input[1] as string,
        };
      }
      // Array of ResultItem
      if (
        input.length === 0 ||
        (typeof input[0] === "object" &&
          input[0] !== null &&
          "issue" in input[0])
      ) {
        return { lintResults: input as ResultItem[] };
      }
      // Nested array as first element (shouldn't happen, but handle gracefully)
      if (Array.isArray(input[0])) {
        return {
          lintResults: input[0] as ResultItem[],
          codeSummary:
            input.length > 1 && typeof input[1] === "string"
              ? (input[1] as string)
              : undefined,
        };
      }
    }

    // Case 3: Single ResultItem object (not an array)
    if (
      typeof input === "object" &&
      input !== null &&
      "issue" in input &&
      typeof (input as ResultItem).issue === "string"
    ) {
      return { lintResults: [input as ResultItem] };
    }

    // Unrecognized structure, warn and return empty
    console.warn("Unexpected results format:", input);
    return { lintResults: [] };
  };

  // Normalize the results prop into an AnalysisData structure
  const { lintResults, codeSummary } = parseResults(results);

  // Debug logging
  console.log("Parsed results:", { lintResults, codeSummary });

  // Handler for copy-to-clipboard
  const handleCopySuccess = () => {
    toast({
      title: "Copied!",
      description: "Suggestion copied to clipboard.",
      status: "success",
      duration: 1500,
      isClosable: true,
    });
  };

  // Render when there are no results and no summary
  if (!lintResults.length && !codeSummary) {
    return (
      <Box mt={4} p={4} borderWidth="1px" borderRadius="md" bg="gray.50">
        <Text fontSize="xl" fontWeight="bold" mb={2}>
          Analysis Results
        </Text>
        <Text color="green.600" fontWeight="medium">
          ✅ No issues found!
        </Text>
      </Box>
    );
  }

  // Main render
  return (
    <Box mt={4} p={4} borderWidth="1px" borderRadius="md" bg="gray.50">
      <Text fontSize="xl" fontWeight="bold" mb={2}>
        Analysis Results
      </Text>
      {lintResults.length === 0 ? (
        <Text color="green.600" fontWeight="medium">
          ✅ No issues found!
        </Text>
      ) : (
        <>
          <Text fontSize="sm" color="gray.600" mb={4}>
            Found {lintResults.length} issue
            {lintResults.length !== 1 ? "s" : ""}
          </Text>
          {lintResults.map((item, idx) => {
            // Debug each item
            console.log(`Rendering item ${idx}:`, item);

            // Safety check for item structure
            if (!item || typeof item !== "object") {
              console.warn(`Invalid item at index ${idx}:`, item);
              return null;
            }

            return (
              <Box
                key={`issue-${idx}`}
                mb={4}
                p={3}
                borderWidth="1px"
                borderRadius="md"
                bg="white"
                boxShadow="sm"
              >
                <Text fontWeight="bold" color="red.600" mb={2}>
                  🚨 {safeRenderText(item.issue)}
                </Text>
                {item.explanation && (
                  <Box mt={3}>
                    <Text fontWeight="semibold" mb={2} color="gray.700">
                      💡 Explanation:
                    </Text>
                    <Box
                      bg="blue.50"
                      borderLeft="4px solid"
                      borderLeftColor="blue.400"
                      borderRadius={4}
                      p={3}
                      fontFamily="mono"
                      fontSize="sm"
                      whiteSpace="pre-wrap"
                      overflowX="auto"
                    >
                      {safeRenderText(item.explanation)}
                    </Box>
                  </Box>
                )}
                {item.suggestion && (
                  <Box mt={3}>
                    <Text fontWeight="semibold" mb={2} color="gray.700">
                      🔧 Suggested Fix:
                    </Text>
                    <Box
                      bg="green.50"
                      borderLeft="4px solid"
                      borderLeftColor="green.400"
                      borderRadius={4}
                      p={3}
                      fontFamily="mono"
                      fontSize="sm"
                      whiteSpace="pre-wrap"
                      overflowX="auto"
                      position="relative"
                    >
                      {safeRenderText(item.suggestion)}
                    </Box>
                    <Box mt={2}>
                      <CopyButton
                        value={safeRenderText(item.suggestion)}
                        onCopy={handleCopySuccess}
                        aria-label={`Copy suggestion for: ${safeRenderText(
                          item.issue
                        )}`}
                      />
                    </Box>
                  </Box>
                )}
                {item.doc_link && (
                  <Box mt={3}>
                    <Link
                      href={safeRenderText(item.doc_link)}
                      color="teal.600"
                      isExternal
                      fontWeight="medium"
                      _hover={{
                        color: "teal.800",
                        textDecoration: "underline",
                      }}
                      aria-label={`Learn more about: ${safeRenderText(
                        item.issue
                      )}`}
                    >
                      📚 Learn more →
                    </Link>
                  </Box>
                )}
              </Box>
            );
          })}
        </>
      )}
      {codeSummary && (
        <Box
          mt={6}
          p={4}
          borderWidth="1px"
          borderRadius="md"
          bg="blue.50"
          borderColor="blue.200"
        >
          <Text fontSize="lg" fontWeight="semibold" mb={3} color="blue.800">
            📋 Code Summary
          </Text>
          <Text
            color="blue.700"
            whiteSpace="pre-wrap"
            lineHeight="1.6"
            fontSize="sm"
          >
            {safeRenderText(codeSummary)}
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default AnalysisResult;
