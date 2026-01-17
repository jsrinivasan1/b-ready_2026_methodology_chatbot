const Anthropic = require("@anthropic-ai/sdk");
const handbookChunks = require("../../data/handbook-chunks.json");
const searchIndex = require("../../data/search-index.json");

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Search for relevant chunks based on query
function searchChunks(query, maxResults = 5) {
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);

  // Score each chunk based on keyword matches
  const scores = {};

  for (const word of queryWords) {
    // Check exact matches in index
    if (searchIndex[word]) {
      for (const chunkId of searchIndex[word]) {
        scores[chunkId] = (scores[chunkId] || 0) + 2;
      }
    }

    // Check partial matches
    for (const [indexWord, chunkIds] of Object.entries(searchIndex)) {
      if (indexWord.includes(word) || word.includes(indexWord)) {
        for (const chunkId of chunkIds) {
          scores[chunkId] = (scores[chunkId] || 0) + 1;
        }
      }
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
    const relevantChunks = searchChunks(message, 5);
    const context = relevantChunks
      .map((chunk) => `[Page ${chunk.page}]\n${chunk.content}`)
      .join("\n\n---\n\n");

    // Build system prompt
    const systemPrompt = `You are an expert assistant for the World Bank's Business Ready (B-READY) 2026 Methodology Handbook. Your role is to help users understand the B-READY methodology, indicators, scoring systems, and data collection processes.

IMPORTANT GUIDELINES:
1. Base your answers primarily on the handbook content provided in the context
2. Be accurate and cite specific sections or pages when possible
3. If the context doesn't contain enough information to fully answer, say so
4. Use clear, professional language appropriate for policy professionals
5. When explaining indicators or scoring, be precise about the methodology
6. If asked about something not in the handbook, politely explain you can only answer questions about B-READY methodology

CONTEXT FROM THE HANDBOOK:
${context || "No specific context found for this query."}`;

    // Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
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
