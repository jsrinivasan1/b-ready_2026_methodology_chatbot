const Anthropic = require("@anthropic-ai/sdk");
const handbookChunks = require("../../data/handbook-chunks.json");
const searchIndex = require("../../data/search-index.json");

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// B-READY topics for topic-aware search
const TOPICS = [
  "business entry",
  "business location",
  "utility services",
  "labor",
  "financial services",
  "international trade",
  "taxation",
  "dispute resolution",
  "market competition",
  "business insolvency",
];

// Detect which topic the query is about
function detectTopic(query) {
  const queryLower = query.toLowerCase();
  for (const topic of TOPICS) {
    if (queryLower.includes(topic)) {
      return topic;
    }
  }
  return null;
}

// Improved search for relevant chunks based on query
function searchChunks(query, maxResults = 12) {
  const queryLower = query.toLowerCase();

  // Detect if query is about a specific topic
  const detectedTopic = detectTopic(query);

  // Extract keywords from query
  const stopWords = [
    "the",
    "and",
    "for",
    "are",
    "what",
    "how",
    "which",
    "that",
    "this",
    "with",
    "can",
    "you",
    "tell",
    "about",
    "please",
    "show",
    "list",
    "all",
  ];
  const queryWords = queryLower
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .filter((word) => !stopWords.includes(word));

  // Score each chunk
  const scores = {};

  for (const chunk of handbookChunks) {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;

    // CRITICAL: If a topic is detected, heavily prioritize chunks from that topic
    if (detectedTopic) {
      if (contentLower.includes(detectedTopic)) {
        score += 20; // Big boost for topic match
      } else {
        // Penalize chunks from other topics
        for (const otherTopic of TOPICS) {
          if (otherTopic !== detectedTopic && contentLower.includes(otherTopic + " topic")) {
            score -= 10;
          }
        }
      }
    }

    // Keyword matching from index
    for (const word of queryWords) {
      if (searchIndex[word] && searchIndex[word].includes(chunk.id)) {
        score += 3;
      }

      // Direct content match
      if (contentLower.includes(word)) {
        score += 1;
      }
    }

    // Boost for questionnaire content when query mentions "question" or "questionnaire"
    if (
      queryLower.includes("question") ||
      queryLower.includes("questionnaire")
    ) {
      // Look for numbered questions (e.g., "35.", "36.")
      const hasNumberedQuestions = /\d+\.\s+(does|is|are|according|can|to what)/i.test(
        chunk.content
      );
      if (hasNumberedQuestions) {
        score += 15;
      }

      // Look for Y/N patterns typical in questionnaires
      if (chunk.content.includes("(Y/N)")) {
        score += 10;
      }
    }

    // Boost for restriction-related queries
    if (queryLower.includes("restriction")) {
      if (
        contentLower.includes("absence of restriction") ||
        contentLower.includes("no paid") ||
        contentLower.includes("no screening") ||
        contentLower.includes("no restriction") ||
        contentLower.includes("1.2.1") ||
        contentLower.includes("1.2.2")
      ) {
        score += 10;
      }
    }

    // Boost for indicator queries
    if (queryLower.includes("indicator")) {
      if (
        contentLower.includes("indicator") &&
        (contentLower.includes("table") || contentLower.includes("subcategory"))
      ) {
        score += 5;
      }
    }

    // Multi-word phrase matching
    for (let i = 0; i < queryWords.length - 1; i++) {
      const phrase = queryWords[i] + " " + queryWords[i + 1];
      if (contentLower.includes(phrase)) {
        score += 5;
      }
    }

    if (score > 0) {
      scores[chunk.id] = score;
    }
  }

  // Sort by score and get top results
  const sortedChunks = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults)
    .map(([chunkId]) => handbookChunks.find((c) => c.id === parseInt(chunkId)))
    .filter(Boolean);

  return sortedChunks;
}

// Main handler
exports.handler = async (event) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error:
            "API key not configured. Please add ANTHROPIC_API_KEY to environment variables.",
        }),
      };
    }

    // Parse request
    const { message } = JSON.parse(event.body || "{}");

    if (!message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Message is required" }),
      };
    }

    // Search for relevant context
    const relevantChunks = searchChunks(message, 12);
    const context = relevantChunks
      .map((chunk) => `[Page ${chunk.page}]\n${chunk.content}`)
      .join("\n\n---\n\n");

    // Build system prompt
    const systemPrompt = `You are an expert assistant for the World Bank's Business Ready (B-READY) 2026 Methodology Handbook. Your role is to help users understand the B-READY methodology, indicators, scoring systems, and data collection processes.

IMPORTANT GUIDELINES:
1. Base your answers primarily on the handbook content provided in the context
2. Be accurate and cite specific sections or pages when possible
3. If asked about specific indicators or questions, list them ALL if they appear in the context
4. Use clear, professional language appropriate for policy professionals
5. When explaining indicators or scoring, be precise about the methodology
6. Format lists of indicators or questions clearly with numbers or bullets
7. If the context contains questionnaire questions (typically starting with numbers like "35.", "36."), extract and present them fully
8. Pay attention to the topic being asked about - only use content relevant to that specific topic

CONTEXT FROM THE HANDBOOK:
${context || "No specific context found for this query."}`;

    // Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    });

    // Extract response text
    const responseText =
      response.content[0]?.text || "I could not generate a response.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response: responseText,
        sources: relevantChunks.map((c) => ({ page: c.page })),
      }),
    };
  } catch (error) {
    console.error("Error:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Failed to process request: " + error.message,
      }),
    };
  }
};
