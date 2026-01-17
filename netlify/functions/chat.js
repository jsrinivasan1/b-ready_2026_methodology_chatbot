const Anthropic = require("@anthropic-ai/sdk");
const handbookChunks = require("../../data/handbook-chunks.json");
const searchIndex = require("../../data/search-index.json");

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Improved search for relevant chunks based on query
function searchChunks(query, maxResults = 10) {
  // Normalize and extract keywords from query
  const queryLower = query.toLowerCase();
  const queryWords = queryLower
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .filter(
      (word) =>
        ![
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
        ].includes(word)
    );

  // Score each chunk based on keyword matches
  const scores = {};

  // Method 1: Use search index for keyword matching
  for (const word of queryWords) {
    // Exact matches in index (highest weight)
    if (searchIndex[word]) {
      for (const chunkId of searchIndex[word]) {
        scores[chunkId] = (scores[chunkId] || 0) + 3;
      }
    }

    // Partial matches (medium weight)
    for (const [indexWord, chunkIds] of Object.entries(searchIndex)) {
      if (
        indexWord.length > 3 &&
        (indexWord.includes(word) || word.includes(indexWord))
      ) {
        for (const chunkId of chunkIds) {
          scores[chunkId] = (scores[chunkId] || 0) + 1;
        }
      }
    }
  }

  // Method 2: Direct content search for important terms
  // This catches cases where the index might miss context
  const importantTerms = queryWords.filter((w) => w.length > 4);

  for (const chunk of handbookChunks) {
    const contentLower = chunk.content.toLowerCase();

    // Bonus for chunks containing multiple query words together
    let multiWordBonus = 0;
    for (let i = 0; i < queryWords.length - 1; i++) {
      const phrase = queryWords[i] + " " + queryWords[i + 1];
      if (contentLower.includes(phrase)) {
        multiWordBonus += 5;
      }
    }

    // Bonus for chunks with important terms in headers/tables
    for (const term of importantTerms) {
      // Check for term appearing near indicator-like patterns
      if (
        contentLower.includes(term) &&
        (contentLower.includes("indicator") ||
          contentLower.includes("subcategory") ||
          contentLower.includes("category"))
      ) {
        scores[chunk.id] = (scores[chunk.id] || 0) + 2;
      }
    }

    if (multiWordBonus > 0) {
      scores[chunk.id] = (scores[chunk.id] || 0) + multiWordBonus;
    }

    // Special handling for "restrictions" queries - boost chunks with restriction lists
    if (
      queryLower.includes("restriction") &&
      contentLower.includes("restriction")
    ) {
      // Extra boost if it contains numbered indicators or "no" phrases (indicating restriction absence indicators)
      if (
        contentLower.includes("no paid") ||
        contentLower.includes("no screening") ||
        contentLower.includes("no local") ||
        contentLower.includes("absence of")
      ) {
        scores[chunk.id] = (scores[chunk.id] || 0) + 8;
      }
    }

    // Boost for table-like content with indicators
    if (
      contentLower.includes("table") &&
      contentLower.includes("indicator")
    ) {
      scores[chunk.id] = (scores[chunk.id] || 0) + 2;
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

    // Search for relevant context - increased to 10 chunks for better coverage
    const relevantChunks = searchChunks(message, 10);
    const context = relevantChunks
      .map((chunk) => `[Page ${chunk.page}]\n${chunk.content}`)
      .join("\n\n---\n\n");

    // Build system prompt
    const systemPrompt = `You are an expert assistant for the World Bank's Business Ready (B-READY) 2026 Methodology Handbook. Your role is to help users understand the B-READY methodology, indicators, scoring systems, and data collection processes.

IMPORTANT GUIDELINES:
1. Base your answers primarily on the handbook content provided in the context
2. Be accurate and cite specific sections or pages when possible
3. If asked about specific indicators, list them ALL if they are provided in the context
4. Use clear, professional language appropriate for policy professionals
5. When explaining indicators or scoring, be precise about the methodology
6. Format lists of indicators clearly with numbers or bullets
7. If the context contains tables or indicator lists, extract and present that information fully

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
