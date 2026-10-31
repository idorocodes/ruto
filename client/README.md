# Ruto — Verified Campus Route Cards

**Never miss road inside campus again.**

Ruto is a mobile-first web application where university students draw campus footpaths, generate friendly landmark directions in **English**, **Nigerian Pidgin**, or **Yorùbá**, send them as peer-to-peer **Route Cards**, and cryptographically verify integrity via **SHA-256** before accepting.

---

## How Gemma 4 Is Used

Ruto uses **Gemma 4** (`gemma-4-31b-it` / `gemma-4-26b-a4b-it`) exclusively through the official `@google/genai` SDK on an Express server (`server.ts`) so the `GEMINI_API_KEY` stays strictly server-side and is never exposed in client bundles.

Gemma 4 powers three core workflows:

### 1. Text-to-Route (`POST /api/ai/text-to-route`)
- **Input:** A messy, natural-language route description written by a student in English, Nigerian Pidgin, or Yorùbá — for example:
  > *"Comot for main gate, waka straight pass the library, turn left after the food canopy, na there Mary hostel dey."*
- **Structured JSON Output:** Gemma 4 uses `responseMimeType: "application/json"` and a strict `responseSchema` to return an ordered array of steps, each containing:
  - `placeName` (string)
  - `landmark` (string)
  - `turn` (`"straight"` | `"left"` | `"right"`)
  - `note` (short string)
- **Zero Hallucinated Coordinates:** Coordinates (`lat`/`lng`) are intentionally excluded from the schema and prohibited in the prompt. After Gemma returns the structured steps, the student taps the Leaflet OpenStreetMap canvas to place each step's pin on the real map.

### 2. Route-to-Directions (`POST /api/ai/route-to-directions`)
- **Geometry Computed in Code:** Before calling Gemma 4, Ruto computes exact segment distances (via the Haversine formula) and turn angles (`straight`, `left`, `right`, `slight left`, `slight right`) directly from the placed map coordinates in `src/utils/geo.ts`.
- **Grounded Multilingual Generation:** Gemma 4 receives ONLY the ordered points, user/landmark notes, and code-computed distances and turns, then writes natural, friendly step-by-step directions in the selected language (**English**, **Nigerian Pidgin**, or **Yorùbá**).
- **Strict Constraints:** Gemma is instructed to use ONLY the supplied steps, add no extra places or turns, and keep every step to one short sentence.

### 3. Photo-to-Landmark Multimodal (`POST /api/ai/photo-to-landmark`)
- **Input:** A student attaches or snaps a photo of a campus spot (e.g., a yellow transformer, food canopy, or hostel gate) on any waypoint.
- **Vision Understanding:** Gemma 4 inspects the inline image (`inlineData`) and returns a concise, one-line description of the visible landmark via structured JSON. That line automatically populates the waypoint's navigation note.

---

## Cryptographic Route Card Verification (Web Crypto SHA-256)

1. **Canonical Route Serialization (`src/utils/crypto.ts`):**
   When a route card is sent, Ruto builds a deterministic JSON payload with a fixed key order, coordinates rounded to 6 decimal places, trimmed strings, `cardId`, `sender`, `recipient`, and a random 128-bit cryptographic `salt`.
2. **SHA-256 Signing:**
   The canonical JSON is hashed in the browser using `crypto.subtle.digest("SHA-256", ...)` and stored alongside the card.
3. **Verification on Open & Tamper Simulation:**
   Whenever a card is viewed in Inbox or Card Detail, Ruto recomputes the SHA-256 hash from the stored route data and compares it against the card's original hash:
   - **Match:** Displays the green **Verified** banner and enables **Accept Route**.
   - **Mismatch:** Displays the red **Changed after it was sent** banner and disables **Accept Route**.
   - **Stage Demo Mode:** Open the **Demo Menu** (top bar flask/shield button or Card Detail toggle) and click **Simulate Tampering** to mutate a stored route in `localStorage` without updating its hash, demonstrating live tamper detection on stage.

---

## Unified Data Module (`src/api.ts`) & Shared Route Library

All client data and API calls go exclusively through **`src/api.ts`**. At the top of `src/api.ts`:

```ts
const API_BASE_URL = ""; // empty = mock mode (localStorage). When set, call the real server.
```

Both modes share identical inputs, outputs, and `{ error: string, message?: string }` error contracts:

- **Profiles & Signed Route Cards:** `createProfile` (`POST /profiles`), `sendCard` (`POST /cards`), `getInbox` (`GET /inbox/:handle`, polled every 5s while visible), `getCard` (`GET /cards/:id`), `verifyCard` (`GET /cards/:id/verify`), and `respondCard` (`POST /cards/:id/respond`).
- **Shared Campus Route Library:** `savePath` (`POST /paths` with Douglas-Peucker track simplification to <= 30 points), `searchPaths` (`GET /paths?q=&from=&to=`), `getNearPaths` (`GET /paths/near?lat=&lng=&radius=500`, sending only a rounded coordinate and never storing it), `getPath` (`GET /paths/:id` with code-recomputed reverse direction), and `confirmPath` (`POST /paths/:id/confirm` crowd confirmation & `"May be outdated"` flagging).
- **On-Device Live Navigation:** Uses `navigator.geolocation.watchPosition` and Haversine math strictly on-device (live GPS is never stored or sent to Gemma 4).

---

## Running Locally

```bash
npm install
# Set GEMINI_API_KEY in .env
npm run dev
```

Open `http://localhost:3000`.

## License

Open source under the [MIT License](./LICENSE). Built with Gemma 4.
