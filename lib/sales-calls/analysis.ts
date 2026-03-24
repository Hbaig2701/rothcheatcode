import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResults } from "@/lib/types/sales-call";

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

/**
 * System prompt for sales call analysis.
 * PLUGGABLE: Replace this with training-material-specific content when provided.
 */
const SYSTEM_PROMPT = `You are an expert sales coach specializing in financial advisory sales calls, particularly for retirement planning and Roth conversion strategies.

Analyze the following sales call transcript and provide a structured assessment.

You MUST respond with valid JSON matching this exact structure:
{
  "score": <number 1-100>,
  "summary": "<2-3 sentence overall summary of the call>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", ...],
  "improvements": ["<specific area to improve 1>", "<specific area to improve 2>", ...],
  "nextSteps": ["<actionable next step 1>", "<actionable next step 2>", ...],
  "keyMoments": [
    { "description": "<notable moment from the call>", "sentiment": "positive|negative|neutral" }
  ],
  "metrics": {
    "rapportBuilding": <1-10>,
    "needsDiscovery": <1-10>,
    "productKnowledge": <1-10>,
    "objectionHandling": <1-10>,
    "closingAbility": <1-10>,
    "complianceAdherence": <1-10>
  }
}

Scoring guide:
- 90-100: Exceptional call, masterful execution
- 75-89: Strong call with minor improvements needed
- 60-74: Solid call but clear areas for growth
- 45-59: Below average, significant coaching needed
- Below 45: Needs fundamental improvement

Guidelines:
- Be specific — reference actual moments and language from the transcript
- Provide at least 3 items each for strengths, improvements, and nextSteps
- Provide 3-5 key moments
- Focus on retirement planning / Roth conversion context where relevant
- Respond ONLY with JSON, no additional text`;

/**
 * Analyze a sales call transcript using Claude.
 */
export async function analyzeTranscript(
  transcript: string
): Promise<AnalysisResults> {
  const anthropic = getAnthropic();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Here is the sales call transcript to analyze:\n\n${transcript}`,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Extract JSON from the response
  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse analysis JSON from Claude response");
  }

  const results: AnalysisResults = JSON.parse(jsonMatch[0]);

  // Validate score is within range
  if (typeof results.score !== "number" || results.score < 0 || results.score > 100) {
    throw new Error("Invalid score from analysis");
  }

  return results;
}
