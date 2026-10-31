import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Strictly Gemma 4 models ONLY via the Gemini API as required
const GEMMA_MODELS = ['gemma-4-31b-it', 'gemma-4-26b-a4b-it'] as const;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function cleanJsonText(raw: string | undefined): string {
  if (!raw) return '{}';
  let text = raw.trim();
  // Strip any accidental markdown code fences
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return text.trim();
}

async function generateWithGemma4(params: {
  contents: unknown;
  responseSchema: Record<string, unknown>;
}): Promise<{ text: string; modelUsed: string }> {
  const ai = getAiClient();
  let lastError: unknown = null;

  for (const model of GEMMA_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents as never,
      });
      if (response.text) {
        return { text: cleanJsonText(response.text), modelUsed: model };
      }
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Only fall back to the secondary Gemma 4 variant on transient capacity/rate errors or model lookup
      if (
        msg.includes('429') || msg.includes('INTERNAL') ||
        msg.includes('503') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('NOT_FOUND')
      ) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Gemma 4 generation failed.');
}

async function startServer() {
  const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
  const PORT = Number(process.env.PORT) || 3000;

  // Support base64 spot photos up to 12MB
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', modelFamily: 'Gemma 4', models: GEMMA_MODELS });
  });

  /**
   * 1. Text to Route (Gemma 4 Structured JSON)
   * Parses messy English, Nigerian Pidgin, or Yoruba description into ordered steps.
   * NEVER invents or outputs coordinates.
   */
  app.post('/api/ai/text-to-route', async (req, res) => {
    try {
      const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      if (!description) {
        res.status(400).json({ error: 'Please enter a route description first.' });
        return;
      }

      const prompt = [
        'You are Ruto RouteParser, a campus footpath assistant for university students in Nigeria.',
        'The user has provided a messy route description in English, Nigerian Pidgin, or Yoruba.',
        'Extract an ordered list of walking steps from start to destination.',
        '',
        'STRICT RULES:',
        '1. Return strict JSON matching the schema.',
        '2. NEVER invent, guess, or include latitude/longitude coordinates.',
        '3. Keep steps in exact chronological walking order (minimum 2 steps, maximum 8 steps).',
        '4. For each step provide:',
        '   - placeName: short clear name of the spot (2 to 5 words, e.g. "Main Gate", "University Library", "Food Canopy", "Mary Hostel").',
        '   - landmark: visible landmark at or near that spot (e.g. "Security post", "Food canopy", "Library walkway").',
        '   - turn: MUST be one of "straight", "left", or "right". Use "straight" if going straight, starting, or arriving without turning.',
        '   - note: one short helpful note (under 14 words) capturing what to do at this spot.',
        '5. Detect the primary language used ("English", "Pidgin", or "Yoruba") and create a concise routeTitle like "Start -> Destination".',
        '',
        `USER DESCRIPTION: """${description}"""`,
      ].join('\n');

      const schema = {
        type: Type.OBJECT,
        properties: {
          routeTitle: {
            type: Type.STRING,
            description: 'Short title formatted like Start -> Destination',
          },
          detectedLanguage: {
            type: Type.STRING,
            enum: ['English', 'Pidgin', 'Yoruba'],
            description: 'Detected language of the user prompt',
          },
          steps: {
            type: Type.ARRAY,
            description: 'Ordered list of steps without coordinates',
            items: {
              type: Type.OBJECT,
              properties: {
                placeName: {
                  type: Type.STRING,
                  description: 'Short name of the place or node',
                },
                landmark: {
                  type: Type.STRING,
                  description: 'Visible landmark at this step',
                },
                turn: {
                  type: Type.STRING,
                  enum: ['straight', 'left', 'right'],
                  description: 'Turn direction: straight, left, or right',
                },
                note: {
                  type: Type.STRING,
                  description: 'Short navigation note for this step',
                },
              },
              required: ['placeName', 'landmark', 'turn', 'note'],
            },
          },
        },
        required: ['routeTitle', 'detectedLanguage', 'steps'],
      };

      const { text, modelUsed } = await generateWithGemma4({
        contents: prompt,
        responseSchema: schema,
      });

      const parsed = JSON.parse(text);
      const rawSteps = Array.isArray(parsed?.steps) ? parsed.steps : [];

      if (rawSteps.length === 0) {
        res.status(422).json({
          error: 'Gemma 4 could not find clear waypoints in that text. Try mentioning at least a start and destination.',
        });
        return;
      }

      // Sanitize and guarantee zero coordinates exist
      const sanitizedSteps = rawSteps.map((s: Record<string, unknown>) => {
        const validTurn =
          s.turn === 'left' || s.turn === 'right' || s.turn === 'straight'
            ? s.turn
            : 'straight';
        return {
          placeName: String(s.placeName || 'Campus Spot').trim(),
          landmark: String(s.landmark || s.placeName || 'Landmark').trim(),
          turn: validTurn,
          note: String(s.note || '').trim(),
        };
      });

      res.json({
        routeTitle: String(parsed.routeTitle || `${sanitizedSteps[0].placeName} → ${sanitizedSteps[sanitizedSteps.length - 1].placeName}`).trim(),
        detectedLanguage:
          parsed.detectedLanguage === 'Pidgin' || parsed.detectedLanguage === 'Yoruba'
            ? parsed.detectedLanguage
            : 'English',
        steps: sanitizedSteps,
        modelUsed,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to parse route with Gemma 4.';
      console.error('[text-to-route] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * 2. Route to Directions (Gemma 4 Grounded Multilingual Directions)
   * Given ordered points, notes, and distances + turns computed in code,
   * writes friendly step-by-step directions in English, Nigerian Pidgin, or Yoruba.
   */
  app.post('/api/ai/route-to-directions', async (req, res) => {
    try {
      const languageRaw = req.body?.language;
      const language: 'English' | 'Pidgin' | 'Yoruba' =
        languageRaw === 'Pidgin' || languageRaw === 'Yoruba' ? languageRaw : 'English';
      const mode = typeof req.body?.mode === 'string' ? req.body.mode : 'Walk';
      const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];

      if (steps.length < 2) {
        res.status(400).json({ error: 'Place at least 2 pins on the map before generating directions.' });
        return;
      }

      const languageLabel =
        language === 'Pidgin'
          ? 'authentic, natural Nigerian Campus Pidgin English'
          : language === 'Yoruba'
          ? 'natural conversational Yorùbá (with proper tone/diacritics where helpful)'
          : 'clear, friendly Nigerian campus English';

      interface StepPayloadItem {
        stepNumber: number;
        role: string;
        placeName: string;
        landmark: string;
        note: string;
        distanceMetersToNext: number;
        computedTurn: string;
      }

      const stepsPayload: StepPayloadItem[] = steps.map(
        (s: Record<string, unknown>, idx: number): StepPayloadItem => ({
          stepNumber: idx + 1,
          role:
            idx === 0
              ? 'START'
              : idx === steps.length - 1
              ? 'DESTINATION'
              : 'WAYPOINT',
          placeName: String(s.placeName || `Point ${idx + 1}`).trim(),
          landmark: String(s.landmark || '').trim(),
          note: String(s.note || '').trim(),
          distanceMetersToNext: Number(s.distanceMetersToNext || 0),
          computedTurn: String(s.computedTurn || 'straight'),
        })
      );

      const prompt = [
        `You are Ruto RouteAssistant. Write friendly step-by-step ${mode.toLowerCase()} directions in ${languageLabel}.`,
        '',
        'CRITICAL GROUNDING INSTRUCTIONS (MUST OBEY):',
        '1. Use ONLY the supplied steps below in the exact order given.',
        '2. Add NO extra places, NO extra buildings, NO invented landmarks, and NO extra turns.',
        '3. Keep each step instruction to ONE short sentence!',
        `4. Return exactly ${stepsPayload.length} items in "directions", matching stepNumber 1 to ${stepsPayload.length}.`,
        '5. Also write "summaryNote": ONE short sentence summarizing the route using ONLY the supplied steps.',
        '',
        `SUPPLIED STEPS (distances and turns computed from map coordinates):\n${JSON.stringify(stepsPayload, null, 2)}`,
      ].join('\n');

      const schema = {
        type: Type.OBJECT,
        properties: {
          summaryNote: {
            type: Type.STRING,
            description: 'One short sentence summarizing the route using only supplied places.',
          },
          directions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                stepNumber: {
                  type: Type.INTEGER,
                  description: '1-based step number matching input',
                },
                instruction: {
                  type: Type.STRING,
                  description: 'Friendly direction in the target language, strictly ONE short sentence.',
                },
              },
              required: ['stepNumber', 'instruction'],
            },
          },
        },
        required: ['summaryNote', 'directions'],
      };

      const { text, modelUsed } = await generateWithGemma4({
        contents: prompt,
        responseSchema: schema,
      });

      const parsed = JSON.parse(text);
      const outDirs = Array.isArray(parsed?.directions) ? parsed.directions : [];

      const normalizedDirections = stepsPayload.map((step, i) => {
        const match = outDirs.find((d: Record<string, unknown>) => Number(d.stepNumber) === i + 1) || outDirs[i];
        return {
          stepNumber: i + 1,
          instruction: String(match?.instruction || `${step.placeName}${step.note ? ` — ${step.note}` : ''}.`).trim(),
        };
      });

      res.json({
        language,
        summaryNote: String(parsed?.summaryNote || normalizedDirections[0]?.instruction || '').trim(),
        directions: normalizedDirections,
        modelUsed,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate directions with Gemma 4.';
      console.error('[route-to-directions] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * 3. Photo to Landmark Multimodal (Gemma 4 Vision)
   * Describes the visible landmark in a user-attached spot photo in one short line.
   */
  app.post('/api/ai/photo-to-landmark', async (req, res) => {
    try {
      const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : '';
      const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'image/jpeg';

      if (!imageBase64) {
        res.status(400).json({ error: 'No photo data received.' });
        return;
      }

      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

      const schema = {
        type: Type.OBJECT,
        properties: {
          landmarkNote: {
            type: Type.STRING,
            description: 'One short line (max 14 words) describing the visible landmark in the photo.',
          },
          suggestedSpotName: {
            type: Type.STRING,
            description: 'Short 2-4 word name for the visible landmark.',
          },
        },
        required: ['landmarkNote', 'suggestedSpotName'],
      };

      const contents = [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        {
          text: [
            'Look at this campus waypoint photo.',
            'Describe the main visible landmark in ONE short line (maximum 14 words) so a student walking past can recognize the spot immediately.',
            'Be concrete about colors, structures, canopies, signs, trees, or gates visible in the image.',
            'Do NOT invent unseen places or coordinates.',
          ].join(' '),
        },
      ];

      const { text, modelUsed } = await generateWithGemma4({
        contents,
        responseSchema: schema,
      });

      const parsed = JSON.parse(text);
      res.json({
        landmarkNote: String(parsed?.landmarkNote || 'Visible campus landmark at this spot').trim(),
        suggestedSpotName: String(parsed?.suggestedSpotName || 'Landmark Spot').trim(),
        modelUsed,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to analyze photo with Gemma 4.';
      console.error('[photo-to-landmark] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ruto server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
