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
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && process.env.GEMINI_API_KEY.trim() !== "") {
    return process.env.GEMINI_API_KEY.trim();
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
      description: "True ONLY if visible waste is present and the declared waste streams are clearly segregated in separate bins/containers/bags without cross-contamination. MUST be false if no waste is visible, image is an empty scene, wall, floor, table, person, or unrelated object, or if waste is unsegregated/contaminated.",
    },
    confidence: {
      type: Type.STRING,
      description: "'high' if the view is clear and definitive (whether verified or rejected); 'low' if lighting is too dark, blurry, occluded, or at an ambiguous angle to evaluate waste contents.",
    },
    detectedStreams: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of waste streams genuinely visible and identifiable in the image from ['wet', 'dry', 'sanitary', 'special_care']. Empty array [] if no waste or unidentifiable.",
    },
    creditsAwarded: {
      type: Type.INTEGER,
      description: "Leaf Credits awarded (1 to 5) strictly based on verified segregated streams. 0 if verified is false or confidence is low.",
    },
    reason: {
      type: Type.STRING,
      description: "Accurate, honest, citizen-friendly explanation (1-2 sentences) describing what is visible in the image and why this verification verdict and credit score was determined.",
    },
    streams: {
      type: Type.OBJECT,
      properties: {
        wet: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN, description: "True only if wet/organic waste (kitchen scraps, peels) is genuinely visible in a separate compartment." },
            status: { type: Type.STRING, description: "clean, contaminated, or none" },
            note: { type: Type.STRING, description: "Specific observation of wet compartment, or 'Not visible / not present'" },
            verdict: { type: Type.STRING, description: "clean, contaminated, or none" },
          },
          required: ["detected", "status", "note", "verdict"],
        },
        dry: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN, description: "True only if dry recyclables (paper, plastic, cardboard, metal) are genuinely visible in a separate compartment." },
            status: { type: Type.STRING, description: "clean, contaminated, or none" },
            note: { type: Type.STRING, description: "Specific observation of dry compartment, or 'Not visible / not present'" },
            verdict: { type: Type.STRING, description: "clean, contaminated, or none" },
          },
          required: ["detected", "status", "note", "verdict"],
        },
        sanitary: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN, description: "True only if sanitary waste wrapped in marked paper/pouch is genuinely visible." },
            status: { type: Type.STRING, description: "wrapped, unwrapped, or none" },
            note: { type: Type.STRING, description: "Specific observation of sanitary waste, or 'Not visible / not present'" },
            verdict: { type: Type.STRING, description: "wrapped, unwrapped, or none" },
          },
          required: ["detected", "status", "note", "verdict"],
        },
        special_care: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN, description: "True only if hazardous/e-waste/batteries/sharps in dedicated container are genuinely visible." },
            status: { type: Type.STRING, description: "safe, hazardous, or none" },
            note: { type: Type.STRING, description: "Specific observation of special care waste, or 'Not visible / not present'" },
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

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    model: "gemini-3.7-flash",
    hasApiKey: Boolean(resolveGeminiApiKey()),
  });
});

// Stage 1: Photo Verification Endpoint
app.post("/api/verify/photo", async (req, res) => {
  try {
    const { photo, streams = {}, location } = req.body;

    if (!photo) {
      return res.status(400).json({ error: "Photo image data is required" });
    }

    const ai = getGeminiClient();
    if (!ai) {
      console.error("GEMINI_API_KEY is not configured on the server.");
      return res.status(500).json({
        error: "Gemini API key is not configured. Please ensure GEMINI_API_KEY is set in environment variables.",
      });
    }

    const parsedPhoto = parseBase64(photo, "image/jpeg");
    if (!parsedPhoto) {
      return res.status(400).json({ error: "Invalid photo format" });
    }

    const activeStreamsList = [
      streams.wet && "Wet Stream (Green Bin / Kitchen & Organic Waste, Peels, Food)",
      streams.dry && "Dry Stream (Recyclable Paper, Plastic, Cardboard, Cans)",
      streams.sanitary && "Sanitary Waste (Wrapped securely in newspaper/pouch with red mark)",
      streams.special_care && "Special Care / Hazardous (E-waste, batteries, chemicals, sharps isolated)",
    ].filter(Boolean);

    const activeStreams = activeStreamsList.join(", ");

    const systemPrompt = `You are the strict, objective AI waste segregation verification engine for the Ahmedabad Municipal Corporation (AMC) SafaiSeva civic reward program.
Your job is to inspect user-submitted photos of household waste to verify whether the declared waste streams are genuinely present, cleanly segregated, and unadulterated.

CRITICAL FIRST STEP — REALITY & CONTENT CHECK:
1. First, check if the photograph actually depicts real household waste or waste collection containers/bins/bags.
2. If the photo shows:
   - An empty room, blank wall, table, desk, floor, ceiling, outdoor scenery without waste,
   - A person, selfie, screen photo, random furniture, household object, toy, pet, vehicle,
   - Empty bins with no waste inside, or unclear dark/blurry noise,
   YOU MUST IMMEDIATELY REJECT:
   - "verified": false
   - "confidence": "high"
   - "detectedStreams": []
   - "creditsAwarded": 0
   - "reason": "No waste or waste containers detected in this photo. Please submit a clear photograph of your segregated waste bins."
   - "streams": mark all streams with detected: false, verdict: "none", status: "none", note: "No waste visible in frame"
   NEVER award credits or mark verified for empty scenes, furniture, walls, tables, or non-waste photos.

STREAM COMPARISON & SEGREGATION RULES:
If actual waste or waste containers are present, compare what is visually evident in the image against the streams declared by the user:
Declared streams: ${activeStreams || "None selected"}

- Wet Waste (લીલો કચરો): Organic kitchen waste, vegetable/fruit peels, cooked food scraps, tea leaves. Must be placed in a green bin or designated wet compartment. MUST NOT contain plastic bags, wrappers, plastic liners, thermocol, glass, or dry recyclables.
- Dry Waste (સૂકો કચરો): Clean recyclable paper, cardboard, plastic bottles, packaging, metal cans in a blue bin or separate compartment. MUST NOT contain food scraps or liquid waste.
- Sanitary Waste: Diapers, sanitary napkins, bandages, medical cotton securely wrapped in paper/newspaper with a red cross/dot marking or dedicated sanitary pouch.
- Special Care (Hazardous): E-waste, batteries, tube lights, pesticide bottles, syringes/sharps safely isolated in a separate container/box.

SEGREGATION DECISION LOGIC:
- If the user selected multiple streams (e.g. Wet + Dry), BOTH streams MUST be visibly present and separated into separate containers or compartments. If waste is all mixed together in a single bin/bag without separation, set "verified": false, "creditsAwarded": 0.
- If there is visible cross-contamination (e.g. plastic in the wet waste, wet food inside dry recyclables), set "verified": false, "creditsAwarded": 0, with a clear explanation in "reason".
- If the declared streams are clearly segregated and compliant:
  - Set "verified": true
  - Set "confidence": "high"
  - Set "detectedStreams" to the list of verified streams (e.g. ["wet", "dry"])
  - Set "creditsAwarded" based on the count and quality of verified streams:
    * 1 credit for 1 cleanly segregated stream.
    * 2-3 credits for standard 2-stream segregation (Wet + Dry).
    * 3-4 credits for 3-stream segregation (Wet + Dry + Sanitary).
    * 4-5 credits for full 4-stream segregation (Wet + Dry + Sanitary + Special Care).
- If the photo contains waste bins but the camera angle, shadow, or blur makes it impossible to inspect the contents with certainty:
  - Set "verified": false, "confidence": "low", "creditsAwarded": 0
  - "reason": Explain specifically what is ambiguous so the user can provide a video sweep or retake.

Provide honest, accurate, non-fabricated observations. Do not make up positive results.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
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
              text: `Evaluate this waste segregation photo. Selected streams declared by user: ${JSON.stringify(
                streams
              )}. Location: ${location?.address || "Ahmedabad"}. Inspect the image strictly and return the verification decision JSON.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: verificationSchema,
        temperature: 0.1,
      },
    });

    const responseText = response.text?.trim() || "{}";
    const result = JSON.parse(responseText);

    return res.json(result);
  } catch (error: any) {
    console.error("Gemini Photo Analysis Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to analyze photo with Gemini API",
    });
  }
});

// Stage 2: Video Verification Endpoint
app.post("/api/verify/video", async (req, res) => {
  try {
    const { video, videoFrames = [], streams = {}, location } = req.body;

    if (!video && (!videoFrames || videoFrames.length === 0)) {
      return res.status(400).json({ error: "Video data or video frames are required" });
    }

    const ai = getGeminiClient();
    if (!ai) {
      console.error("GEMINI_API_KEY is not configured on the server.");
      return res.status(500).json({
        error: "Gemini API key is not configured. Please ensure GEMINI_API_KEY is set in environment variables.",
      });
    }

    const activeStreamsList = [
      streams.wet && "Wet Stream (Green Bin / Kitchen & Organic Waste, Peels, Food)",
      streams.dry && "Dry Stream (Recyclable Paper, Plastic, Cardboard, Cans)",
      streams.sanitary && "Sanitary Waste (Wrapped securely in newspaper/pouch with red mark)",
      streams.special_care && "Special Care / Hazardous (E-waste, batteries, chemicals, sharps isolated)",
    ].filter(Boolean);

    const activeStreams = activeStreamsList.join(", ");

    const systemPrompt = `You are the strict, objective AI waste segregation inspection engine for the Ahmedabad Municipal Corporation (AMC) SafaiSeva civic reward program.
The citizen provided a short video because their initial photo had low confidence or required multi-angle inspection.

CRITICAL FIRST STEP — REALITY & CONTENT CHECK:
1. Examine the motion, multiple angles, and inside of all visible bins/compartments shown in the video.
2. If the video does NOT show real household waste or waste containers (e.g. video of floor, wall, desk, ceiling, person, room, or empty surfaces):
   - Set "verified": false
   - Set "confidence": "high"
   - Set "detectedStreams": []
   - Set "creditsAwarded": 0
   - Set "reason": "No waste or waste containers detected in the video clip. Please capture your segregated waste bins."
   - Mark all stream details as not detected.

STREAM VERIFICATION:
If waste containers are shown:
User declared streams: ${activeStreams || "None selected"}

- Verify that declared streams are segregated across the recorded sweep with zero cross-contamination.
- If verified = true: award 1-5 Leaf Credits according to the verified streams.
- If verified = false: award 0 credits and clearly state why in "reason".`;

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
      model: "gemini-3.7-flash",
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
        temperature: 0.1,
      },
    });

    const responseText = response.text?.trim() || "{}";
    const result = JSON.parse(responseText);

    return res.json(result);
  } catch (error: any) {
    console.error("Gemini Video Analysis Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to analyze video with Gemini API",
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
