"""
brain.py — Voice Right's Gemma 4 E4B brain.

Responsibilities:
- Load Gemma 4 E4B via Cactus Python SDK (vision + audio + text + tool calling)
- Extract terms + writing style from screenshots (vision)
- Extract writing style from imported content (iMessage DB, Gmail .mbox, etc.)
- Generate personalized calibration script from user's vocabulary
- Reconcile dual-STT outputs (pick best, apply corrections from passport)
- Style transfer: rewrite dictated text in user's style for target app
- Read `voice-right.md` preferences file and thread into every style-transfer prompt

Depends on Cactus Python SDK being built: `cactus build --python` + `cactus download google/gemma-4-E4B-it`.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Lazy import so the file loads even if Cactus isn't built yet.
# Real calls to Gemma 4 will fail with a clear error until `source ./setup && cactus build --python` has run.
try:
    from src.cactus import cactus_init, cactus_complete, cactus_destroy
    from src.downloads import ensure_model
    CACTUS_AVAILABLE = True
except ImportError:
    CACTUS_AVAILABLE = False


PROFILE_PATH = Path("data/profiles/default.voicepassport.json")
PREFERENCES_PATH = Path("voice-right.md")
GEMMA_4_E4B = "google/gemma-4-E4B-it"


# ============================================================
# Data model — mirrors data/schema.md
# ============================================================

@dataclass
class Term:
    id: str
    text: str
    source: str  # "screenshot" | "manual" | "correction"
    added: str   # ISO 8601 UTC


@dataclass
class Correction:
    id: str
    wrong: str
    right: str
    confidence: float
    uses: int
    last_applied: str  # ISO 8601 UTC


@dataclass
class AppStyle:
    tone: str
    sample_size: int
    last_learned: str


@dataclass
class Calibration:
    last_run_id: str | None = None
    accuracy_before: float | None = None
    accuracy_after: float | None = None


@dataclass
class VoicePassport:
    version: str = "1.0"
    name: str = "default"
    created: str = ""
    updated: str = ""
    language: str = "en"
    terms: list[Term] = field(default_factory=list)
    corrections: list[Correction] = field(default_factory=list)
    style_per_app: dict[str, AppStyle] = field(default_factory=dict)
    calibration: Calibration = field(default_factory=Calibration)


# ============================================================
# Passport I/O
# ============================================================

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_passport(path: Path = PROFILE_PATH) -> VoicePassport:
    """Load the .voicepassport.json file, or return a fresh one if missing."""
    if not path.exists():
        return new_passport()
    raw = json.loads(path.read_text())
    return VoicePassport(
        version=raw.get("version", "1.0"),
        name=raw.get("name", "default"),
        created=raw.get("created", now_iso()),
        updated=raw.get("updated", now_iso()),
        language=raw.get("language", "en"),
        terms=[Term(**t) for t in raw.get("terms", [])],
        corrections=[Correction(**c) for c in raw.get("corrections", [])],
        style_per_app={k: AppStyle(**v) for k, v in raw.get("style_per_app", {}).items()},
        calibration=Calibration(**raw.get("calibration", {})),
    )


def save_passport(passport: VoicePassport, path: Path = PROFILE_PATH) -> None:
    passport.updated = now_iso()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(passport), indent=2))


def new_passport() -> VoicePassport:
    ts = now_iso()
    return VoicePassport(created=ts, updated=ts)


def load_preferences_md(path: Path = PREFERENCES_PATH) -> str:
    """Load the voice-right.md preferences file. Returns empty string if missing."""
    return path.read_text() if path.exists() else ""


# ============================================================
# Gemma 4 E4B model lifecycle
# ============================================================

_model_handle: int | None = None


def load_gemma() -> int:
    """Load Gemma 4 E4B once and reuse the handle across calls."""
    global _model_handle
    if not CACTUS_AVAILABLE:
        raise RuntimeError(
            "Cactus Python SDK not built. Run:\n"
            "    cd cactus && source ./setup && cd ..\n"
            "    cactus build --python\n"
            "    cactus download google/gemma-4-E4B-it"
        )
    if _model_handle is None:
        weights = ensure_model(GEMMA_4_E4B)
        _model_handle = cactus_init(str(weights), None, False)
    return _model_handle


def unload_gemma() -> None:
    global _model_handle
    if _model_handle is not None and CACTUS_AVAILABLE:
        cactus_destroy(_model_handle)
        _model_handle = None


# ============================================================
# Core capabilities (skeletons — fill in as we go)
# ============================================================

def extract_terms_from_screenshot(image_path: str) -> list[str]:
    """Use Gemma 4 E4B vision to extract domain vocabulary from a screenshot.

    Pipeline:
    1. Pass image to Gemma 4 E4B via cactus_complete with `images: [path]` in the message.
    2. Prompt emphasizes anti-hallucination (only extract visible terms).
    3. Parse one term per line, strip, dedupe.
    """
    if not CACTUS_AVAILABLE:
        raise RuntimeError("Cactus not available — extract_terms_from_screenshot requires Gemma 4 E4B")

    if not Path(image_path).exists():
        raise FileNotFoundError(f"Screenshot not found: {image_path}")

    model = load_gemma()

    system_prompt = (
        "You extract vocabulary terms from a screenshot. "
        "Look at the image and pull out proper nouns, brand/product names, domain-specific jargon, "
        "technical terms, acronyms, and unique people names that are clearly visible in the text.\n\n"
        "Rules:\n"
        "- ONLY extract terms that are clearly visible in the image. Do NOT invent or infer terms.\n"
        "- Skip common words (the, and, is, of, for, etc.).\n"
        "- Skip generic UI chrome (Send, Inbox, Menu, Settings, etc.) unless it's clearly domain-specific.\n"
        "- Output one term per line — no bullets, no numbering, no quotes, no explanations.\n"
        "- If the image has no extractable vocabulary, output exactly the single word: NONE"
    )

    messages = json.dumps([
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": "Extract the vocabulary terms from this screenshot.",
            "images": [str(image_path)],
        },
    ])

    options = json.dumps({"max_tokens": 400, "temperature": 0.1})
    result = json.loads(cactus_complete(model, messages, options, None, None))

    if not result.get("success"):
        raise RuntimeError(f"Gemma 4 E4B vision failed: {result.get('error')}")

    raw = result["response"].strip()
    if raw.upper().strip() == "NONE":
        return []

    # Parse: one term per line, strip, drop empties + 1-char junk + duplicates
    seen: set[str] = set()
    out: list[str] = []
    for line in raw.splitlines():
        term = line.strip().strip("-•*·").strip()
        if not term or len(term) < 2:
            continue
        low = term.lower()
        if low in seen:
            continue
        seen.add(low)
        out.append(term)
    return out


def extract_style_from_content(content: str, app: str) -> AppStyle:
    """Analyze imported text content (iMessage history, email, etc.) → AppStyle."""
    raise NotImplementedError("TODO: build content → style extraction")


def generate_calibration_script(terms: list[str], n_sentences: int = 5) -> list[str]:
    """Generate personalized sentences using the user's vocabulary."""
    raise NotImplementedError("TODO: build calibration script generator")


def reconcile_stt(parakeet: str, whisper_pass1: str, whisper_pass2: str,
                  passport: VoicePassport) -> str:
    """Take the 3 STT outputs + known corrections and return the best text."""
    raise NotImplementedError("TODO: build STT reconciliation")


def style_transfer(text: str, target_app: str, passport: VoicePassport,
                   preferences_md: str = "") -> str:
    """Rewrite dictated text in the user's style for the target app.

    Pipeline:
    1. Read preferences_md (voice-right.md) for explicit user rules.
    2. Look up style_per_app[target_app] for learned style.
    3. Prompt Gemma 4 E4B with text + style + preferences → styled output.
    """
    if not CACTUS_AVAILABLE:
        raise RuntimeError("Cactus not available — style_transfer requires Gemma 4 E4B")

    model = load_gemma()

    # Build the prompt
    app_style = passport.style_per_app.get(target_app)
    style_hint = f"The user's {target_app} style: {app_style.tone}." if app_style else ""
    prefs_section = f"\n\n## User preferences (voice-right.md)\n{preferences_md}" if preferences_md else ""

    system_prompt = (
        "You rewrite dictated voice input as it would be typed natively in a specific app. "
        "Preserve meaning exactly. Match the user's writing style and the app's conventions. "
        "Output ONLY the rewritten text — no explanation, no quoting, no preamble."
        f"\n\n## Target app\n{target_app}"
        f"\n\n## Style guidance\n{style_hint or f'Use conventions typical for {target_app}.'}"
        f"{prefs_section}"
    )

    messages = json.dumps([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": text},
    ])

    options = json.dumps({"max_tokens": 300, "temperature": 0.5})
    result = json.loads(cactus_complete(model, messages, options, None, None))

    if not result.get("success"):
        raise RuntimeError(f"Gemma 4 E4B failed: {result.get('error')}")

    return result["response"].strip()


def capture_correction(original: str, edited: str, passport: VoicePassport) -> list[Correction]:
    """Diff original STT output vs user-edited result. Append phrase-level corrections to the passport.

    Mutates `passport.corrections` in place:
    - Existing (wrong, right) pair → increment `uses`, update `last_applied`.
    - New pair → append a new `Correction`.

    Returns the list of NEWLY-added corrections (not the already-known ones).
    The caller is responsible for persisting the passport via `save_passport`.
    """
    import difflib
    import uuid

    orig_words = original.split()
    edit_words = edited.split()

    new_corrections: list[Correction] = []
    now = now_iso()

    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=orig_words, b=edit_words).get_opcodes():
        if tag != "replace":
            continue
        wrong = " ".join(orig_words[i1:i2]).strip()
        right = " ".join(edit_words[j1:j2]).strip()
        if not wrong or not right or wrong.lower() == right.lower():
            continue

        existing = next(
            (c for c in passport.corrections if c.wrong == wrong and c.right == right),
            None,
        )
        if existing is not None:
            existing.uses += 1
            existing.last_applied = now
            continue

        new_corr = Correction(
            id=f"correction_{uuid.uuid4().hex[:8]}",
            wrong=wrong,
            right=right,
            confidence=1.0,  # user-confirmed
            uses=1,
            last_applied=now,
        )
        passport.corrections.append(new_corr)
        new_corrections.append(new_corr)

    passport.updated = now
    return new_corrections


# ============================================================
# CLI entry point for quick testing
# ============================================================

def _cli() -> None:
    """
    Usage:
        python brain.py style "so we just launched" gmail
        python brain.py style "so we just launched" imessage
    """
    import sys
    if len(sys.argv) < 2:
        print(__doc__)
        return

    cmd = sys.argv[1]

    if cmd == "style":
        if len(sys.argv) < 4:
            print("usage: python brain.py style <text> <target_app>")
            return
        text, app = sys.argv[2], sys.argv[3]
        passport = load_passport()
        prefs = load_preferences_md()
        try:
            out = style_transfer(text, app, passport, prefs)
            print(out)
        finally:
            unload_gemma()

    elif cmd == "terms":
        if len(sys.argv) < 3:
            print("usage: python brain.py terms <image_path>")
            return
        image_path = sys.argv[2]
        try:
            terms = extract_terms_from_screenshot(image_path)
            # Output JSON so the server can parse reliably (vs. line-by-line which
            # can be corrupted by Cactus stderr [WARN] messages).
            print(json.dumps(terms))
        finally:
            unload_gemma()

    elif cmd == "correction":
        if len(sys.argv) < 4:
            print('usage: python brain.py correction "<original>" "<edited>"')
            return
        original, edited = sys.argv[2], sys.argv[3]
        passport = load_passport()
        new = capture_correction(original, edited, passport)
        save_passport(passport)
        print(json.dumps([asdict(c) for c in new]))

    elif cmd == "info":
        print(f"CACTUS_AVAILABLE: {CACTUS_AVAILABLE}")
        print(f"Profile path: {PROFILE_PATH}")
        print(f"Preferences path: {PREFERENCES_PATH}")
        passport = load_passport()
        print(f"Passport has {len(passport.terms)} terms, {len(passport.corrections)} corrections")
        print(f"Apps with learned style: {list(passport.style_per_app.keys())}")

    else:
        print(f"unknown command: {cmd}")
        print("available: style, terms, correction, info")


if __name__ == "__main__":
    _cli()
