import React, { useEffect, useState } from "react";
import axios from "axios";
import { Box, Heading, Text, Spinner } from "@chakra-ui/react";
import CopyButton from "../components/CopyButton";

type Review = {
  id: number;
  filename: string;
  created_at: string;
  code: string;
  review_result: string;
};

type HistoryProps = {
  userId: number | string | null;
};

const History: React.FC<HistoryProps> = ({ userId }) => {
  const [history, setHistory] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await axios.get<Review[]>(
          `/api/history?user_id=${userId}`
        );
        setHistory(response.data);
      } catch (err) {
        console.error("Failed to fetch history:", err);
        setError("Failed to load history. Please try again.");
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [userId]);

  if (!userId) {
    return <Text>Please sign in to see your history.</Text>;
  }

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minH="200px"
      >
        <Spinner size="lg" color="blue.500" />
        <Text ml={3}>Loading your history...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box textAlign="center" py={8}>
        <Text color="red.500" fontSize="lg">
          {error}
        </Text>
      </Box>
    );
  }

  if (history.length === 0) {
    return (
      <Box textAlign="center" py={8}>
        <Text fontSize="lg" color="gray.600">
          No past reviews found.
        </Text>
      </Box>
    );
  }

  return (
    <Box maxW="4xl" mx="auto" p={4}>
      <Heading as="h2" size="lg" mb={6} textAlign="center">
        Past Reviews
      </Heading>
      {history.map((review) => (
        <Box
          key={review.id}
          mb={8}
          borderWidth="1px"
          borderRadius="lg"
          p={6}
          bg="white"
          shadow="md"
          _hover={{ shadow: "lg" }}
          transition="shadow 0.2s"
        >
          <Box mb={4}>
            <Text fontSize="md" mb={2}>
              <Text as="span" fontWeight="bold" color="blue.600">
                File:
              </Text>{" "}
              <Text as="span" fontFamily="mono">
                {review.filename}
              </Text>
            </Text>
            <Text fontSize="sm" color="gray.600">
              <Text as="span" fontWeight="bold">
                Date:
              </Text>{" "}
              {new Date(review.created_at).toLocaleString()}
            </Text>
          </Box>

          <Box mb={4}>
            <Text fontWeight="bold" mb={2} color="green.600">
              Code:
            </Text>
            <Box position="relative">
              <Box
                as="pre"
                bg="gray.50"
                borderRadius="md"
                p={4}
                overflowX="auto"
                fontSize="sm"
                fontFamily="mono"
                border="1px solid"
                borderColor="gray.200"
                maxH="300px"
              >
                {review.code}
              </Box>
              <Box position="absolute" top={2} right={2}>
                <CopyButton value={review.code} />
              </Box>
            </Box>
          </Box>

          <Box>
            <Text fontWeight="bold" mb={2} color="purple.600">
              Review Results:
            </Text>
            <Box position="relative">
              <Box
                as="pre"
                bg="gray.50"
                borderRadius="md"
                p={4}
                overflowX="auto"
                fontSize="sm"
                fontFamily="mono"
                border="1px solid"
                borderColor="gray.200"
                maxH="300px"
                whiteSpace="pre-wrap"
              >
                {review.review_result}
              </Box>
              <Box position="absolute" top={2} right={2}>
                <CopyButton value={review.review_result} />
              </Box>
            </Box>
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default History;
