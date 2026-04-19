import { $ } from "bun";

const PORT = 3000;
const ROOT = process.cwd();
const PROFILES_DIR = `${ROOT}/data/profiles`;
const PREFERENCES_PATH = `${ROOT}/voice-right.md`;
const home = process.env.HOME || "";
const pythonCandidates = [
    process.env.VOICE_RIGHT_PYTHON,
    `${ROOT}/.venv/bin/python`,
    `${ROOT}/../cactus/venv/bin/python`,
    `${home}/cactus/venv/bin/python`,
    `${home}/Documents/cactus/venv/bin/python`,
    `${home}/Documents/Playground/cactus/venv/bin/python`,
    "python3",
].filter(Boolean) as string[];

let PYTHON_BIN = "python3";
for (const candidate of pythonCandidates) {
    if (candidate === "python3") {
        PYTHON_BIN = candidate;
        break;
    }
    if (await Bun.file(candidate).exists()) {
        PYTHON_BIN = candidate;
        break;
    }
}

function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

function profilePath(nameOrId: string) {
    return `${PROFILES_DIR}/${slugify(nameOrId)}.voicepassport.json`;
}

async function ensureProfilesDir() {
    await Bun.$`mkdir -p ${PROFILES_DIR}`.quiet();
}

async function ensureDefaultProfile() {
    await ensureProfilesDir();
    const path = profilePath("default");
    if (!(await Bun.file(path).exists())) {
        await runBrain(["create-profile", "Profile"], path);
    }
}

async function runBrain(args: string[], profile?: string) {
    let cmd = $`${PYTHON_BIN} brain.py ${args}`;
    if (profile) cmd = cmd.env({ VOICE_RIGHT_PROFILE_PATH: profile });
    return await cmd.quiet().text();
}

async function runStt(args: string[], profile?: string) {
    let cmd = $`${PYTHON_BIN} stt.py ${args}`;
    if (profile) cmd = cmd.env({ VOICE_RIGHT_PROFILE_PATH: profile });
    return await cmd.quiet().text();
}

async function loadProfile(id = "default") {
    await ensureDefaultProfile();
    const path = profilePath(id);
    const file = Bun.file(path);
    if (!(await file.exists())) {
        await runBrain(["create-profile", id], path);
    }
    return await Bun.file(path).json();
}

async function saveProfile(id: string, profile: unknown) {
    await ensureProfilesDir();
    await Bun.write(profilePath(id), JSON.stringify(profile, null, 2));
}

function parseLastJson(raw: string) {
    const lines = raw.trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            return JSON.parse(lines[i]);
        } catch {
            continue;
        }
    }
    return null;
}

function isTextLike(file: File) {
    const name = file.name.toLowerCase();
    return (
        file.type.startsWith("text/") ||
        [".md", ".txt", ".json", ".csv", ".tsv", ".html", ".xml", ".eml"].some((ext) => name.endsWith(ext))
    );
}

async function extractText(file: File, tmpPath: string) {
    if (isTextLike(file)) {
        return await file.text();
    }

    const lower = file.name.toLowerCase();
    if ([".rtf", ".doc", ".docx", ".odt", ".html"].some((ext) => lower.endsWith(ext))) {
        try {
            return (await $`textutil -convert txt -stdout ${tmpPath}`.quiet().text()).trim();
        } catch {
            return "";
        }
    }

    if (lower.endsWith(".pdf")) {
        try {
            return (await $`strings ${tmpPath}`.quiet().text()).slice(0, 12000).trim();
        } catch {
            return "";
        }
    }

    return "";
}

function normaliseTargets(input: FormDataEntryValue | null) {
    const raw = String(input || "");
    return raw
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

await ensureDefaultProfile();

Bun.serve({
    port: PORT,
    routes: {
        "/": async () => new Response(Bun.file("index.html")),

        "/qr": async (req) => {
            const host = req.headers.get("host") || `localhost:${PORT}`;
            const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
            const targetUrl = `${proto}://${host}/`;
            const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=20&bgcolor=09090b&color=fafafa&data=${encodeURIComponent(targetUrl)}`;
            return new Response(
                `<!doctype html><html><body style="background:#09090b;color:#fafafa;font-family:Inter,system-ui;display:grid;place-items:center;min-height:100vh">
                <div style="text-align:center"><h1>Voice Right</h1><p>Scan to try it live.</p><img src="${qrImg}" style="border-radius:20px"><p>${targetUrl}</p></div>
                </body></html>`,
                { headers: { "Content-Type": "text/html; charset=utf-8" } },
            );
        },

        "/api/profiles": {
            async GET() {
                const raw = await runBrain(["profiles"]);
                return Response.json(parseLastJson(raw) || []);
            },
            async POST(req) {
                const body = (await req.json()) as { name?: string };
                const name = body.name?.trim();
                if (!name) return Response.json({ error: "name required" }, { status: 400 });
                const path = profilePath(name);
                const raw = await runBrain(["create-profile", name], path);
                return Response.json(parseLastJson(raw) || {});
            },
        },

        "/api/profile": {
            async GET(req) {
                const id = new URL(req.url).searchParams.get("id") || "default";
                return Response.json(await loadProfile(id));
            },
            async PUT(req) {
                const id = new URL(req.url).searchParams.get("id") || "default";
                await saveProfile(id, await req.json());
                return Response.json({ ok: true });
            },
        },

        "/api/preferences": async () => {
            const text = (await Bun.file(PREFERENCES_PATH).exists()) ? await Bun.file(PREFERENCES_PATH).text() : "";
            return Response.json({ markdown: text });
        },

        "/api/import-memory": {
            async POST(req) {
                try {
                    const form = await req.formData();
                    const id = String(form.get("profile") || "default");
                    const profile = profilePath(id);
                    const file = form.get("file") as File | null;
                    if (!file || typeof file === "string") {
                        return Response.json({ error: "file required" }, { status: 400 });
                    }
                    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
                    const tmpPath = `/tmp/voice-right-import-${Date.now()}.${ext}`;
                    await Bun.write(tmpPath, file);

                    let raw = "";
                    if (file.type.startsWith("image/")) {
                        raw = await runBrain(["import", "image", file.name, tmpPath], profile);
                    } else {
                        const text = await extractText(file, tmpPath);
                        raw = await runBrain(["import", ext || "text", file.name, text || file.name], profile);
                    }
                    const payload = parseLastJson(raw);
                    return Response.json({ ok: true, ...(payload || {}) });
                } catch (err) {
                    return Response.json({ error: String(err) }, { status: 500 });
                }
            },
        },

        "/api/calibrate/generate": {
            async POST(req) {
                const body = (await req.json().catch(() => ({}))) as { profile?: string; terms?: string[] };
                const id = body.profile || "default";
                const profile = profilePath(id);
                const termArg = Array.isArray(body.terms) && body.terms.length ? body.terms.join(",") : "";
                const raw = termArg ? await runBrain(["calibrate", termArg], profile) : await runBrain(["calibrate"], profile);
                return Response.json({ sentences: parseLastJson(raw) || [] });
            },
        },

        "/api/calibrate/benchmark": {
            async POST(req) {
                try {
                    const form = await req.formData();
                    const id = String(form.get("profile") || "default");
                    const profile = profilePath(id);
                    const file = form.get("file") as File | null;
                    const expected = String(form.get("expected") || "");
                    if (!file || typeof file === "string") {
                        return Response.json({ error: "file required" }, { status: 400 });
                    }
                    const tmpPath = `/tmp/voice-right-calibrate-${Date.now()}.wav`;
                    await Bun.write(tmpPath, file);
                    const raw = await runStt(["benchmark", tmpPath, expected], profile);
                    return Response.json(parseLastJson(raw) || {});
                } catch (err) {
                    return Response.json({ error: String(err) }, { status: 500 });
                }
            },
        },

        "/api/compose": {
            async POST(req) {
                try {
                    const form = await req.formData();
                    const id = String(form.get("profile") || "default");
                    const profile = profilePath(id);
                    const targets = normaliseTargets(form.get("targets"));
                    const typedText = String(form.get("text") || "").trim();
                    const file = form.get("file") as File | null;
                    let transcript = typedText;
                    let stt = null;

                    if (file && typeof file !== "string" && file.size) {
                        const tmpPath = `/tmp/voice-right-compose-${Date.now()}.wav`;
                        await Bun.write(tmpPath, file);
                        const rawStt = await runStt(["transcribe", tmpPath], profile);
                        stt = parseLastJson(rawStt) || {};
                        transcript = stt.final || stt.whisper_pass2 || stt.whisper_pass1 || stt.parakeet || transcript;
                    }

                    if (!transcript) {
                        return Response.json({ error: "audio or text required" }, { status: 400 });
                    }

                    const rawCompose = await runBrain(["compose", transcript, targets.join(",") || "email"], profile);
                    const composed = parseLastJson(rawCompose) || {};
                    return Response.json({
                        transcript,
                        stt,
                        intent: composed.intent || transcript,
                        outputs: composed.outputs || {},
                    });
                } catch (err) {
                    return Response.json({ error: String(err) }, { status: 500 });
                }
            },
        },

        "/api/style": {
            async POST(req) {
                const { profile = "default", text, app } = (await req.json()) as { profile?: string; text: string; app: string };
                const raw = await runBrain(["style", text, app], profilePath(profile));
                return Response.json({ styled: raw.trim(), app });
            },
        },
    },

    fetch() {
        return new Response("Not Found", { status: 404 });
    },

    error(err) {
        console.error(err);
        return new Response(`Server error: ${err.message}`, { status: 500 });
    },
});

console.log(`Voice Right server running at http://localhost:${PORT}`);
