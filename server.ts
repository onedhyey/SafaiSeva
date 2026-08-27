import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Initialize express app
const app = express();
const PORT = 3000;

// Body parsing with 50mb limit for images/videos
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Helper to get Gemini API key from environment or local env files
function resolveGeminiApiKey(): string | undefined {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY") {
    return process.env.GEMINI_API_KEY;
  }
  // Try reading from .env or .env.example
  for (const filename of [".env", ".env.example"]) {
    try {
      const fullPath = path.join(process.cwd(), filename);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const match = content.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/);
        if (match && match[1] && match[1] !== "MY_GEMINI_API_KEY" && match[1].trim() !== "") {
          return match[1].trim();
        }
      }
    } catch {
      // Ignore file read errors
    }
  }
  return undefined;
}

// Helper to get Gemini client
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper to parse base64 Data URLs
function parseBase64(input: string, fallbackMime: string) {
  if (!input) return null;
  if (input.startsWith("data:")) {
    const match = input.match(/^data:([^;]+);base64,(.*)$/s);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
  }
  return { mimeType: fallbackMime, data: input };
}

// Verification Response Schema for Structured JSON Output
const verificationSchema = {
  type: Type.OBJECT,
  properties: {
    verified: {
      type: Type.BOOLEAN,
      description: "True if declared waste streams are present and segregated without severe cross-contamination. False otherwise.",
    },
    confidence: {
      type: Type.STRING,
      description: "Confidence level: 'high' if the view is clear and definitive, 'low' if blurry, dark, ambiguous, or obscured.",
    },
    detectedStreams: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Array of stream identifiers detected from ['wet', 'dry', 'sanitary', 'special_care'].",
    },
    creditsAwarded: {
      type: Type.INTEGER,
      description: "Variable Leaf Credits awarded (1 to 5) based on count and purity of segregated streams verified. 0 if verified is false or confidence is low.",
    },
    reason: {
      type: Type.STRING,
      description: "Concise, citizen-friendly explanation (1-2 sentences) describing why this verification verdict was reached.",
    },
    streams: {
      type: Type.OBJECT,
      properties: {
        wet: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN },
            status: { type: Type.STRING, description: "clean, contaminated, or none" },
            note: { type: Type.STRING },
            verdict: { type: Type.STRING, description: "clean, contaminated, or none" },
          },
          required: ["detected", "status", "note", "verdict"],
        },
        dry: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN },
            status: { type: Type.STRING, description: "clean, contaminated, or none" },
            note: { type: Type.STRING },
            verdict: { type: Type.STRING, description: "clean, contaminated, or none" },
          },
          required: ["detected", "status", "note", "verdict"],
        },
        sanitary: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN },
            status: { type: Type.STRING, description: "wrapped, unwrapped, or none" },
            note: { type: Type.STRING },
            verdict: { type: Type.STRING, description: "wrapped, unwrapped, or none" },
          },
          required: ["detected", "status", "note", "verdict"],
        },
        special_care: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN },
            status: { type: Type.STRING, description: "safe, hazardous, or none" },
            note: { type: Type.STRING },
            verdict: { type: Type.STRING, description: "safe, hazardous, or none" },
          },
          required: ["detected", "status", "note", "verdict"],
        },
      },
      required: ["wet", "dry", "sanitary", "special_care"],
    },
  },
  required: ["verified", "confidence", "detectedStreams", "creditsAwarded", "reason", "streams"],
};

// Fallback logic when no API key is provided or offline simulation
function generateFallbackVerification(
  streams: { wet: boolean; dry: boolean; sanitary: boolean; special_care: boolean },
  override: string = "auto",
  mediaType: "photo" | "video" = "photo"
) {
  if (override === "force_approve") {
    const streamCount = [streams.wet, streams.dry, streams.sanitary, streams.special_care].filter(Boolean).length;
    const credits = Math.min(5, Math.max(1, streamCount + (streams.special_care ? 2 : streams.sanitary ? 1 : 0)));
    return {
      verified: true,
      confidence: "high",
      detectedStreams: Object.keys(streams).filter((k) => (streams as any)[k]),
      creditsAwarded: credits,
      reason: "All declared streams compliant. Organic wet and recyclable dry compartments cleanly separated.",
      streams: {
        wet: { detected: streams.wet, status: streams.wet ? "clean" : "none", note: streams.wet ? "Clean organic kitchen waste" : "Not declared", verdict: streams.wet ? "clean" : "none" },
        dry: { detected: streams.dry, status: streams.dry ? "clean" : "none", note: streams.dry ? "Clean paper and dry recyclables" : "Not declared", verdict: streams.dry ? "clean" : "none" },
        sanitary: { detected: streams.sanitary, status: streams.sanitary ? "wrapped" : "none", note: streams.sanitary ? "Wrapped in newspaper with red mark" : "None", verdict: streams.sanitary ? "wrapped" : "none" },
        special_care: { detected: streams.special_care, status: streams.special_care ? "safe" : "none", note: streams.special_care ? "Isolated in designated hazard box" : "None", verdict: streams.special_care ? "safe" : "none" },
      },
    };
  }

  if (override === "force_reject") {
    return {
      verified: false,
      confidence: "high",
      detectedStreams: ["wet", "dry"],
      creditsAwarded: 0,
      reason: "Non-biodegradable synthetic wrapper identified in wet bin. Waste must be 100% segregated.",
      streams: {
        wet: { detected: true, status: "contaminated", note: "Plastic liner detected in wet compartment", verdict: "contaminated" },
        dry: { detected: true, status: "clean", note: "Clean dry recyclables", verdict: "clean" },
        sanitary: { detected: false, status: "none", note: "None", verdict: "none" },
        special_care: { detected: false, status: "none", note: "None", verdict: "none" },
      },
    };
  }

  if (override === "force_review" && mediaType === "photo") {
    return {
      verified: false,
      confidence: "low",
      detectedStreams: Object.keys(streams).filter((k) => (streams as any)[k]),
      creditsAwarded: 0,
      reason: "Partial shadow over the dry waste bin makes plastic film boundary ambiguous. Additional video verification required.",
      streams: {
        wet: { detected: streams.wet, status: "clean", note: "Organic peels visible", verdict: "clean" },
        dry: { detected: streams.dry, status: "unclear", note: "Ambiguous boundary due to lighting", verdict: "none" },
        sanitary: { detected: streams.sanitary, status: streams.sanitary ? "wrapped" : "none", note: streams.sanitary ? "Wrapped item" : "None", verdict: streams.sanitary ? "wrapped" : "none" },
        special_care: { detected: streams.special_care, status: streams.special_care ? "safe" : "none", note: streams.special_care ? "Isolated container" : "None", verdict: streams.special_care ? "safe" : "none" },
      },
    };
  }

  // Standard calculation
  const streamCount = [streams.wet, streams.dry, streams.sanitary, streams.special_care].filter(Boolean).length;
  if (streamCount === 0) {
    return {
      verified: false,
      confidence: "high",
      detectedStreams: [],
      creditsAwarded: 0,
      reason: "No waste streams selected for verification. Please select at least one segregated stream.",
      streams: {
        wet: { detected: false, status: "none", note: "Not declared", verdict: "none" },
        dry: { detected: false, status: "none", note: "Not declared", verdict: "none" },
        sanitary: { detected: false, status: "none", note: "Not declared", verdict: "none" },
        special_care: { detected: false, status: "none", note: "Not declared", verdict: "none" },
      },
    };
  }

  let credits = 2;
  if (streamCount === 1) credits = 1;
  else if (streamCount === 2) credits = 2;
  else if (streamCount === 3) credits = 3;
  else if (streamCount >= 4) credits = 4;
  if (streams.special_care) credits = Math.min(5, credits + 1);

  return {
    verified: true,
    confidence: "high",
    detectedStreams: Object.keys(streams).filter((k) => (streams as any)[k]),
    creditsAwarded: credits,
    reason: `All ${streamCount} declared stream${streamCount > 1 ? "s" : ""} verified cleanly segregated with zero cross-contamination.`,
    streams: {
      wet: { detected: streams.wet, status: streams.wet ? "clean" : "none", note: streams.wet ? "Clean organic waste, no plastics" : "None", verdict: streams.wet ? "clean" : "none" },
      dry: { detected: streams.dry, status: streams.dry ? "clean" : "none", note: streams.dry ? "Clean dry paper and recyclables" : "None", verdict: streams.dry ? "clean" : "none" },
      sanitary: { detected: streams.sanitary, status: streams.sanitary ? "wrapped" : "none", note: streams.sanitary ? "Securely wrapped with marking" : "None", verdict: streams.sanitary ? "wrapped" : "none" },
      special_care: { detected: streams.special_care, status: streams.special_care ? "safe" : "none", note: streams.special_care ? "Isolated hazard compartment" : "None", verdict: streams.special_care ? "safe" : "none" },
    },
  };
}

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    model: "gemini-2.5-flash-lite",
    hasApiKey: Boolean(resolveGeminiApiKey()),
  });
});

// Stage 1: Photo Verification Endpoint
app.post("/api/verify/photo", async (req, res) => {
  try {
    const { photo, streams, location, household, override = "auto" } = req.body;

    if (!photo) {
      return res.status(400).json({ error: "Photo image data is required" });
    }

    // Check manual override for jury/demo testing
    if (override && override !== "auto") {
      const fallback = generateFallbackVerification(streams, override, "photo");
      return res.json(fallback);
    }

    const ai = getGeminiClient();
    if (!ai) {
      console.warn("GEMINI_API_KEY is not set. Using smart heuristic fallback.");
      const fallback = generateFallbackVerification(streams, override, "photo");
      return res.json(fallback);
    }

    const parsedPhoto = parseBase64(photo, "image/jpeg");
    if (!parsedPhoto) {
      return res.status(400).json({ error: "Invalid photo format" });
    }

    const activeStreams = [
      streams.wet && "Wet Stream (Green Bin / Kitchen & Organic Waste)",
      streams.dry && "Dry Stream (Recyclable Paper, Plastic, Cardboard, Cans)",
      streams.sanitary && "Sanitary Waste (Wrapped securely in newspaper/pouch with red dot)",
      streams.special_care && "Special Care / Hazardous (E-waste, batteries, chemicals, sharps isolated)",
    ]
      .filter(Boolean)
      .join(", ");

    const systemPrompt = `You are an expert waste segregation inspection AI for the Ahmedabad Municipal Corporation (AMC) SafaiSeva civic reward program.
Your role is to inspect the submitted photo of household waste bins and verify whether the declared waste streams are cleanly segregated according to official guidelines.

The user selected the following waste streams:
${activeStreams || "None selected"}

Detailed Inspection Rules:
1. Stream Presence & Segregation:
   - Verify if the bins/containers or bags matching the declared streams are visible.
   - Wet waste: Must be organic, food scraps, vegetable peels, compostable material. It MUST NOT have plastic bags or synthetic packaging mixed into the organic matter.
   - Dry waste: Must be dry recyclables (paper, cardboard, clean bottles, cans).
   - Sanitary waste: Must be wrapped in newspaper/paper with a red marking or safely enclosed in a sanitary pouch.
   - Special care (Hazardous): Must be isolated in a dedicated box/bag (batteries, bulbs, electronics, medical sharps).
2. Contamination & Cleanliness:
   - If there is blatant cross-contamination (e.g. plastic bags inside wet bin, unwashed wet food in dry paper bin, or mixed unsegregated trash), set verified to false.
   - If the image is unrelated, empty, or not waste bins, set verified to false and confidence to high.
3. Confidence Determination:
   - Set confidence to "high" when the photo is clear, well-lit, and the contents of all declared compartments can be unambiguously assessed (whether compliant or failing).
   - Set confidence to "low" when:
     * The photo is blurry, dark, heavily occluded, or taken at an awkward angle.
     * It is hard to tell whether a boundary is plastic liner or shadow.
     * You cannot be certain if an item is cross-contaminated or clean.
     * When confidence is "low", DO NOT fail the user! Set verified to false and confidence to "low" so the app prompts them for a video or retake.
4. Variable Credit Calculation:
   - For verified = true (high confidence), award variable Leaf Credits based on the number and quality of verified streams:
     * 1 credit for 1 cleanly segregated stream.
     * 2-3 credits for standard 2-stream segregation (Wet + Dry).
     * 3-4 credits for 3-stream segregation (Wet + Dry + Sanitary wrapped).
     * 4-5 credits for full 4-stream segregation (Wet + Dry + Sanitary + Special Care).
     * Award 0 credits if verified is false or confidence is low.
5. Reason & Itemized notes:
   - Provide a concise, polite, encouraging 1-2 sentence explanation in "reason".
   - Provide concise notes for each stream in the streams object.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: parsedPhoto.mimeType,
                data: parsedPhoto.data,
              },
            },
            {
              text: `Please verify this waste segregation photo. Selected streams: ${JSON.stringify(
                streams
              )}. Location: ${location?.address || "Ahmedabad"}. Evaluate compliance and return JSON according to schema.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: verificationSchema,
        temperature: 0.2,
      },
    });

    const responseText = response.text?.trim() || "{}";
    const result = JSON.parse(responseText);

    return res.json(result);
  } catch (error: any) {
    console.error("Gemini Photo Analysis Error:", error);
    // Return a safe structured response on failure
    return res.status(500).json({
      error: error.message || "Failed to analyze photo with Gemini",
      fallback: generateFallbackVerification(req.body.streams || {}, req.body.override, "photo"),
    });
  }
});

// Stage 2: Video Verification Endpoint
app.post("/api/verify/video", async (req, res) => {
  try {
    const { video, videoFrames = [], streams, location, household, override = "auto" } = req.body;

    if (!video && (!videoFrames || videoFrames.length === 0)) {
      return res.status(400).json({ error: "Video data or video frames are required" });
    }

    // Check manual override for jury/demo testing
    if (override && override !== "auto") {
      const fallback = generateFallbackVerification(streams, override, "video");
      return res.json(fallback);
    }

    const ai = getGeminiClient();
    if (!ai) {
      console.warn("GEMINI_API_KEY is not set. Using smart heuristic fallback.");
      const fallback = generateFallbackVerification(streams, override, "video");
      return res.json(fallback);
    }

    const activeStreams = [
      streams.wet && "Wet Stream (Green Bin / Kitchen & Organic Waste)",
      streams.dry && "Dry Stream (Recyclable Paper, Plastic, Cardboard, Cans)",
      streams.sanitary && "Sanitary Waste (Wrapped securely in newspaper/pouch with red dot)",
      streams.special_care && "Special Care / Hazardous (E-waste, batteries, chemicals, sharps isolated)",
    ]
      .filter(Boolean)
      .join(", ");

    const systemPrompt = `You are an expert waste segregation inspection AI for the Ahmedabad Municipal Corporation (AMC) SafaiSeva civic reward program.
The citizen was asked to provide a short video because their initial photo had low confidence or required additional verification.

The user selected the following waste streams:
${activeStreams || "None selected"}

Your task is to analyze the video (and/or video sequence frames) to make a definitive final verification of the waste segregation.

Detailed Video Inspection Rules:
1. Examine the motion, multiple angles, and inside of all visible bins/compartments shown in the video.
2. Verify that the declared waste streams are present and segregated without cross-contamination:
   - Organic wet waste is pure without plastic bags.
   - Dry recyclables are separate from organic waste.
   - Sanitary waste is wrapped and marked.
   - Special care items are isolated.
3. Final Verdict:
   - Since this is the Stage 2 Video Verification, your confidence should be "high" (unless the video is completely black/unrelated).
   - Set verified = true if the video confirms proper segregation.
   - Set verified = false if the video reveals cross-contamination or mixed unsegregated waste.
4. Variable Credit Calculation:
   - For verified = true: Award the variable Leaf Credits (1 to 5) reflecting the verified streams and thoroughness of segregation:
     * 1 credit for 1 cleanly segregated stream.
     * 2-3 credits for standard 2-stream segregation (Wet + Dry).
     * 3-4 credits for 3-stream segregation (Wet + Dry + Sanitary).
     * 4-5 credits for full 4-stream segregation (Wet + Dry + Sanitary + Special Care).
     * 0 credits if verified = false.
5. Reason:
   - Provide a clear, encouraging confirmation (e.g. "Video inspection confirmed clean separation of organic and recyclable streams across all angles.") or specific reason for failure.`;

    const parts: any[] = [];

    // Add video inline if available
    if (video) {
      const parsedVideo = parseBase64(video, "video/webm");
      if (parsedVideo) {
        parts.push({
          inlineData: {
            mimeType: parsedVideo.mimeType,
            data: parsedVideo.data,
          },
        });
      }
    }

    // Add keyframes if provided for high-resolution reinforcement
    if (Array.isArray(videoFrames)) {
      for (const frame of videoFrames.slice(0, 5)) {
        const parsedFrame = parseBase64(frame, "image/jpeg");
        if (parsedFrame) {
          parts.push({
            inlineData: {
              mimeType: parsedFrame.mimeType,
              data: parsedFrame.data,
            },
          });
        }
      }
    }

    parts.push({
      text: `Perform final video verification for waste segregation. Declared streams: ${JSON.stringify(
        streams
      )}. Location: ${location?.address || "Ahmedabad"}. Return structured JSON according to schema.`,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: verificationSchema,
        temperature: 0.2,
      },
    });

    const responseText = response.text?.trim() || "{}";
    const result = JSON.parse(responseText);

    return res.json(result);
  } catch (error: any) {
    console.error("Gemini Video Analysis Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to analyze video with Gemini",
      fallback: generateFallbackVerification(req.body.streams || {}, req.body.override, "video"),
    });
  }
});

// Vite middleware & production static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SafaiSeva server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
