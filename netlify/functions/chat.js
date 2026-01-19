import Anthropic from "@anthropic-ai/sdk";
import handbookChunks from "../../data/handbook-chunks.json" assert { type: "json" };
import searchIndex from "../../data/search-index.json" assert { type: "json" };

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const TOPICS = [
  "business entry", "business location", "utility services", "labor",
  "financial services", "international trade", "taxation",
  "dispute resolution", "market competition", "business insolvency",
];

function detectTopic(query) {
  const queryLower = query.toLowerCase();
  for (const topic of TOPICS) {
    if (queryLower.includes(topic)) return topic;
  }
  return null;
}

function searchChunks(query, maxResults = 12) {
  const queryLower = query.toLowerCase();
  const detectedTopic = detectTopic(query);
  const stopWords = ["the", "and", "for", "are", "what", "how", "which", "that", "this", "with", "can", "you", "tell", "about"];
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2 && !stopWords.includes(word));
  const scores = {};

  for (const chunk of handbookChunks) {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;
    if (detectedTopic) {
      if (contentLower.includes(detectedTopic)) score += 20;
      else {
        for (const otherTopic of TOPICS) {
          if (otherTopic !== detectedTopic && contentLower.includes(otherTopic)) score -= 10;
        }
      }
    }
    for (const word of queryWords) {
      if (searchIndex[word] && searchIndex[word].includes(chunk.id)) score += 3;
      if (contentLower.includes(word)) score += 1;
    }
    if (queryLower.includes("question")) {
      if (/\d+\.\s+(does|is|are|according|can|to what)/i.test(chunk.content)) score += 15;
      if (chunk.content.includes("(Y/N)")) score += 10;
    }
    if (score > 0) scores[chunk.id] = score;
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults)
    .map(([id]) => handbookChunks.find(c => c.id === parseInt(id)))
    .filter(Boolean);
}

// THIS IS THE PART NETLIFY WAS MISSING:
export const handler = async (event) => {
  // Handle CORS Preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  try {
    const { message } = JSON.parse(event.body);

    const relevantChunks = searchChunks(message, 12);
    const contextContent = relevantChunks
      .map((chunk) => `[Page ${chunk.page}]\n${chunk.content}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are an expert assistant for the World Bank's Business Ready (B-READY) 2026 Methodology Handbook. 
    Base your answers on the context provided.
    CONTEXT: ${contextContent}`;

    const stream = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
      stream: true, 
    });

    // Create the stream to pipe to the browser
    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta") {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
        controller.close();
      },
    });

    // Return the special Response object that Netlify supports for streaming
    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
