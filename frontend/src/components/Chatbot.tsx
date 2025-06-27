import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Input,
  Button,
  VStack,
  Text,
  HStack,
  Spinner,
  Alert,
  AlertIcon,
  IconButton,
} from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import axios from "axios";

type Message = {
  role: "user" | "bot";
  content: string;
  timestamp?: Date;
};

type ChatbotProps = {
  code: string;
  issues?: any[];
  apiBaseUrl?: string; // Allow customizable API base URL
};

type ChatResponse = {
  answer: string;
  success?: boolean;
  error_message?: string;
};

const Chatbot: React.FC<ChatbotProps> = ({
  code,
  issues,
  apiBaseUrl = "http://localhost:8000/api/v1", // Default API base URL
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const getErrorMessage = (err: unknown): string => {
    // Check if it's an axios error by checking properties
    if (err && typeof err === "object" && "response" in err) {
      const axiosError = err as any;
      if (axiosError.response?.data?.detail) {
        return axiosError.response.data.detail;
      }
      if (axiosError.response?.status === 503) {
        return "AI service is temporarily unavailable. Please try again later.";
      }
      if (axiosError.response?.status === 429) {
        return "Too many requests. Please wait a moment before trying again.";
      }
      if (axiosError.message) {
        return axiosError.message;
      }
    }
    if (err instanceof Error) {
      return err.message;
    }
    return "An unexpected error occurred";
  };

  const sendMessage = async () => {
    if (!userInput.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: userInput.trim(),
      timestamp: new Date(),
    };

    // Clear any previous errors
    setError(null);

    // Add user message immediately
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    // Clear input
    const currentInput = userInput;
    setUserInput("");

    try {
      const response = await axios.post<ChatResponse>(
        `${apiBaseUrl}/chat/`,
        {
          code,
          issues,
          message: currentInput,
        },
        {
          timeout: 30000, // 30 second timeout
        }
      );

      const botMessage: Message = {
        role: "bot",
        content: response.data.answer,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);

      // Handle API-level errors in successful HTTP responses
      if (response.data.success === false && response.data.error_message) {
        setError(response.data.error_message);
      }
    } catch (err) {
      console.error("Chat error:", err);
      const errorMessage = getErrorMessage(err);

      const errorBotMessage: Message = {
        role: "bot",
        content: `Sorry, I encountered an error: ${errorMessage}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorBotMessage]);
      setError(errorMessage);
    } finally {
      setLoading(false);
      // Refocus input for better UX
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Box borderWidth="1px" borderRadius="md" p={4} mt={4} bg="gray.50">
      <HStack justify="space-between" mb={2}>
        <Text fontWeight="bold">Code Review Chatbot</Text>
        {messages.length > 0 && (
          <IconButton
            aria-label="Clear chat"
            icon={<CloseIcon />}
            size="sm"
            variant="ghost"
            onClick={clearChat}
          />
        )}
      </HStack>

      {error && (
        <Alert status="error" size="sm" mb={2}>
          <AlertIcon />
          <Text fontSize="sm">{error}</Text>
        </Alert>
      )}

      <VStack align="stretch" spacing={2} maxH="300px" overflowY="auto" mb={2}>
        {messages.length === 0 && (
          <Text color="gray.500" textAlign="center" py={4}>
            Ask me anything about your code! I can help explain functions,
            suggest improvements, or answer questions about the analysis.
          </Text>
        )}

        {messages.map((msg, idx) => (
          <Box
            key={idx}
            alignSelf={msg.role === "user" ? "flex-end" : "flex-start"}
            bg={msg.role === "user" ? "blue.100" : "gray.200"}
            borderRadius="md"
            px={3}
            py={2}
            maxW="85%"
            boxShadow="sm"
          >
            <Text
              fontWeight="semibold"
              color={msg.role === "user" ? "blue.800" : "gray.700"}
              fontSize="sm"
            >
              {msg.role === "user" ? "You" : "AI"}
              {msg.timestamp && (
                <Text as="span" fontSize="xs" color="gray.500" ml={2}>
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              )}
            </Text>
            <Text whiteSpace="pre-wrap" mt={1}>
              {msg.content}
            </Text>
          </Box>
        ))}

        {loading && (
          <Box alignSelf="flex-start">
            <HStack spacing={2} p={2}>
              <Spinner size="sm" />
              <Text fontSize="sm" color="gray.500">
                AI is thinking...
              </Text>
            </HStack>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </VStack>

      <HStack spacing={2}>
        <Input
          ref={inputRef}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the code analysis, request explanations, or get suggestions..."
          disabled={loading}
          maxLength={1000}
        />
        <Button
          onClick={sendMessage}
          isLoading={loading}
          colorScheme="purple"
          isDisabled={!userInput.trim()}
          loadingText="Sending"
        >
          Send
        </Button>
      </HStack>

      {userInput.length > 900 && (
        <Text fontSize="xs" color="orange.500" mt={1}>
          {1000 - userInput.length} characters remaining
        </Text>
      )}
    </Box>
  );
};

export default Chatbot;
