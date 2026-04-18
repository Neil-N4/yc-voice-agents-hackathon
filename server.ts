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
