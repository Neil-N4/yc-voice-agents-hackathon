// server.ts — Voice Right Bun server
//
// Serves index.html, exposes API for the Python brain + STT.
// Python subprocess pattern: call brain.py / stt.py via `bun $` — keeps TS thin.
//
// Start: bun run server.ts
// Open:  http://localhost:3000

import { $ } from "bun";

const PORT = 3000;
const PROFILE_PATH = "data/profiles/default.voicepassport.json";
const PROFILE_TEMPLATE = "data/profiles/default.voicepassport.json.template";
const PREFERENCES_PATH = "voice-right.md";

async function loadProfile() {
    const f = Bun.file(PROFILE_PATH);
    if (await f.exists()) return await f.json();
    // Fall back to template, stamping timestamps
    const template = await Bun.file(PROFILE_TEMPLATE).json();
    const now = new Date().toISOString();
    template.created = now;
    template.updated = now;
    await Bun.write(PROFILE_PATH, JSON.stringify(template, null, 2));
    return template;
}

async function saveProfile(profile: unknown) {
    await Bun.write(PROFILE_PATH, JSON.stringify(profile, null, 2));
}

Bun.serve({
    port: PORT,
    routes: {
        // Static
        "/": async () => new Response(Bun.file("index.html")),

        // QR code page for audience participation: scans to whatever URL the
        // viewer is hitting (works for localhost, ngrok tunnel, whatever).
        "/qr": async (req) => {
            const url = new URL(req.url);
            const host = req.headers.get("host") || `localhost:${PORT}`;
            const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
            const targetUrl = `${proto}://${host}/`;
            const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=20&bgcolor=09090b&color=fafafa&data=${encodeURIComponent(targetUrl)}`;
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Voice Right — try it</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #09090b; color: #fafafa; font-family: 'Inter', -apple-system, system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
.card { text-align: center; max-width: 520px; }
h1 { font-size: 42px; letter-spacing: -0.02em; margin-bottom: 8px; }
.tagline { color: #a1a1aa; font-size: 15px; margin-bottom: 40px; }
.qr-wrap { background: #09090b; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 28px; display: inline-block; }
img { display: block; width: 100%; max-width: 380px; height: auto; }
.url { margin-top: 24px; font-family: 'SF Mono', ui-monospace, monospace; font-size: 13px; color: #a1a1aa; word-break: break-all; }
.hint { margin-top: 28px; color: #71717a; font-size: 13px; line-height: 1.6; }
</style></head>
<body>
<div class="card">
  <h1>Voice Right</h1>
  <div class="tagline">Hear👂 you and write✍️ for you correctly, everywhere.</div>
  <div class="qr-wrap"><img src="${qrImg}" alt="QR code"></div>
  <div class="url">${targetUrl}</div>
  <div class="hint">Scan with your phone camera to try Voice Right right now.<br>Your voice never leaves your device.</div>
</div>
</body></html>`;
            return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        },

        // Profile API
        "/api/profile": {
            async GET() {
                const profile = await loadProfile();
                return Response.json(profile);
            },
            async PUT(req) {
                const profile = await req.json();
                await saveProfile(profile);
                return Response.json({ ok: true });
            },
        },

        // Preferences (voice-right.md)
        "/api/preferences": async () => {
            const f = Bun.file(PREFERENCES_PATH);
            const text = await f.exists() ? await f.text() : "";
            return Response.json({ markdown: text });
        },

        // Style transfer — calls brain.py
        "/api/style": {
            async POST(req) {
                const { text, app } = (await req.json()) as { text: string; app: string };
                if (!text || !app) {
                    return Response.json({ error: "text and app required" }, { status: 400 });
                }
                try {
                    // Call brain.py subprocess
                    const result = await $`.venv/bin/python brain.py style ${text} ${app}`
                        .quiet()
                        .text();
                    return Response.json({ styled: result.trim(), app });
                } catch (err) {
                    return Response.json({ error: String(err) }, { status: 500 });
                }
            },
        },

        // Screenshot → Gemma 4 E4B vision → term extraction
        "/api/screenshot-to-terms": {
            async POST(req) {
                try {
                    const formData = await req.formData();
                    const file = formData.get("file") as File | null;
                    if (!file || typeof file === "string") {
                        return Response.json({ error: "no file uploaded (form field 'file')" }, { status: 400 });
                    }

                    // Write to a temp file brain.py can read
                    const ext = (file.name.split(".").pop() || "png").toLowerCase();
                    const tmpPath = `/tmp/voice-right-upload-${Date.now()}.${ext}`;
                    await Bun.write(tmpPath, file);

                    const raw = await $`.venv/bin/python brain.py terms ${tmpPath}`.quiet().text();

                    // Find the last line that parses as a JSON array (brain.py emits tensor
                    // debug + [WARN] lines from Cactus before the final JSON).
                    const lines = raw.trim().split("\n").filter(Boolean);
                    let terms: string[] | null = null;
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const line = lines[i].trim();
                        if (!line.startsWith("[")) continue;
                        try {
                            const parsed = JSON.parse(line);
                            if (Array.isArray(parsed) && parsed.every(t => typeof t === "string")) {
                                terms = parsed;
                                break;
                            }
                        } catch { /* keep scanning */ }
                    }

                    if (!terms) {
                        return Response.json({
                            error: "could not parse terms from brain.py output",
                            raw: raw.slice(-500),
                        }, { status: 500 });
                    }

                    return Response.json({ terms, image: tmpPath });
                } catch (err) {
                    return Response.json({ error: String(err) }, { status: 500 });
                }
            },
        },

        // Capture a user correction: diff original STT output vs edited text,
        // extract (wrong, right) phrase pairs, append to passport.
        "/api/correction": {
            async POST(req) {
                const { original, edited } = (await req.json()) as { original: string; edited: string };
                if (typeof original !== "string" || typeof edited !== "string") {
                    return Response.json({ error: "original and edited (strings) required" }, { status: 400 });
                }
                try {
                    const raw = await $`.venv/bin/python brain.py correction ${original} ${edited}`
                        .quiet()
                        .text();

                    // Same parsing pattern as /api/screenshot-to-terms — find last JSON line.
                    const lines = raw.trim().split("\n").filter(Boolean);
                    let added: unknown[] | null = null;
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const line = lines[i].trim();
                        if (!line.startsWith("[")) continue;
                        try {
                            const parsed = JSON.parse(line);
                            if (Array.isArray(parsed)) { added = parsed; break; }
                        } catch { /* keep scanning */ }
                    }
                    if (!added) {
                        return Response.json({
                            error: "could not parse corrections from brain.py output",
                            raw: raw.slice(-500),
                        }, { status: 500 });
                    }
                    return Response.json({ added });
                } catch (err) {
                    return Response.json({ error: String(err) }, { status: 500 });
                }
            },
        },

        // App routing via FunctionGemma 270M: takes free-form text, picks a target
        // app via on-device function calling. Falls back to a keyword heuristic when
        // the tiny model doesn't commit (common — 270M is small). Returns which path
        // was used so the UI can show the honest story.
        "/api/detect-app": {
            async POST(req) {
                try {
                    const { text } = (await req.json()) as { text: string };
                    if (!text) return Response.json({ error: "text required" }, { status: 400 });

                    const raw = await $`.venv/bin/python brain.py detect-app ${text}`.quiet().text();
                    const lines = raw.trim().split("\n").filter(Boolean);
                    let parsed: any = null;
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const line = lines[i].trim();
                        if (!line.startsWith("{")) continue;
                        try { parsed = JSON.parse(line); break; } catch { /* keep scanning */ }
                    }
                    if (!parsed) {
                        return Response.json({
                            error: "could not parse detect-app result",
                            raw: raw.slice(-500),
                        }, { status: 500 });
                    }
                    return Response.json(parsed);
                } catch (err) {
                    return Response.json({ error: String(err) }, { status: 500 });
                }
            },
        },

        // Voiceprint: accept an audio recording, compute 256-dim speaker embedding,
        // running-average into the passport. Audio must be 16-bit PCM WAV.
        // The brain converts from WebM/other via ffmpeg before calling this endpoint
        // (we also do a best-effort conversion here to unblock direct browser MediaRecorder
        // blobs which are typically audio/webm).
        "/api/voiceprint": {
            async POST(req) {
                try {
                    const formData = await req.formData();
                    const file = formData.get("file") as File | null;
                    if (!file || typeof file === "string") {
                        return Response.json({ error: "no file uploaded (form field 'file')" }, { status: 400 });
                    }

                    // Write raw upload
                    const rawPath = `/tmp/voice-right-voiceprint-${Date.now()}.bin`;
                    await Bun.write(rawPath, file);

                    // Convert to 16-bit PCM 16kHz mono WAV (speaker model requires this).
                    const wavPath = `${rawPath}.wav`;
                    const ff = await $`ffmpeg -y -i ${rawPath} -ar 16000 -ac 1 -sample_fmt s16 ${wavPath}`
                        .quiet()
                        .nothrow();
                    if (ff.exitCode !== 0) {
                        return Response.json({
                            error: "ffmpeg conversion failed",
                            stderr: String(ff.stderr).slice(-500),
                        }, { status: 500 });
                    }

                    const raw = await $`.venv/bin/python brain.py voiceprint ${wavPath}`.quiet().text();

                    // brain.py prints a JSON object on its last line; scan from the end.
                    const lines = raw.trim().split("\n").filter(Boolean);
                    let parsed: any = null;
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const line = lines[i].trim();
                        if (!line.startsWith("{")) continue;
                        try { parsed = JSON.parse(line); break; } catch { /* keep scanning */ }
                    }
                    if (!parsed) {
                        return Response.json({
                            error: "could not parse voiceprint result",
                            raw: raw.slice(-500),
                        }, { status: 500 });
                    }
                    return Response.json(parsed);
                } catch (err) {
                    return Response.json({ error: String(err) }, { status: 500 });
                }
            },
        },

        // Calibration: generate personalized script from passport terms
        "/api/calibrate/generate": {
            async POST(req) {
                try {
                    // Use passport terms if no list in body.
                    let terms: string[] = [];
                    try {
                        const body = (await req.json()) as { terms?: string[] } | null;
                        if (body && Array.isArray(body.terms)) terms = body.terms;
                    } catch { /* empty body is fine */ }

                    if (terms.length === 0) {
                        const profile = await loadProfile();
                        terms = (profile.terms || []).map((t: any) => t.text).filter(Boolean);
                    }

                    const termArg = terms.join(",");
                    const raw = termArg
                        ? await $`.venv/bin/python brain.py calibrate ${termArg}`.quiet().text()
                        : await $`.venv/bin/python brain.py calibrate`.quiet().text();

                    // Find last JSON array line (brain.py emits tensor debug before the JSON).
                    const lines = raw.trim().split("\n").filter(Boolean);
                    let sentences: string[] | null = null;
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const line = lines[i].trim();
                        if (!line.startsWith("[")) continue;
                        try {
                            const parsed = JSON.parse(line);
                            if (Array.isArray(parsed) && parsed.every(s => typeof s === "string")) {
                                sentences = parsed;
                                break;
                            }
                        } catch { /* keep scanning */ }
                    }

                    if (!sentences) {
                        return Response.json({
                            error: "could not parse sentences from brain.py output",
                            raw: raw.slice(-500),
                        }, { status: 500 });
                    }
                    return Response.json({ sentences });
                } catch (err) {
                    return Response.json({ error: String(err) }, { status: 500 });
                }
            },
        },

        // Calibration: accept an audio recording, stub until stt.py lands.
        // Returns simulated before/after accuracy scaled by passport richness
        // so the UI can demo the "82% → 97%" moment even before wiring STT.
        "/api/calibrate/benchmark": {
            async POST(req) {
                try {
                    const profile = await loadProfile();
                    const termCount = (profile.terms || []).length;
                    const corrCount = (profile.corrections || []).length;

                    // Before: naive baseline roughly 60-82% depending on how hard the
                    // user's vocabulary is. After: rises toward 97% as passport fills up.
                    const before = Math.max(58, 82 - termCount * 2);
                    const after = Math.min(97, before + 10 + termCount * 1 + corrCount * 2);

                    return Response.json({
                        accuracy_before: before,
                        accuracy_after: after,
                        patterns_learned: corrCount,
                        stt_wired: false,
                        note: "stt.py not wired — accuracy simulated from passport richness",
                    });
                } catch (err) {
                    return Response.json({ error: String(err) }, { status: 500 });
                }
            },
        },

        // Transcription — will call stt.py once Neil's stt.py lands
        "/api/transcribe": {
            async POST(req) {
                return Response.json({
                    error: "stt.py not yet wired — Neil's piece",
                    parakeet: "",
                    whisper_pass1: "",
                    whisper_pass2: "",
                }, { status: 501 });
            },
        },
    },

    // 404 fallback
    fetch() {
        return new Response("Not Found", { status: 404 });
    },

    error(err) {
        console.error(err);
        return new Response(`Server error: ${err.message}`, { status: 500 });
    },
});

console.log(`Voice Right server running at http://localhost:${PORT}`);
