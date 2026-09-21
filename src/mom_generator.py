"""Generate structured Minutes of Meeting (MOM) using hosted LLM APIs.

This module reads `final.json`, serializes it for the LLM, and invokes
the primary provider (Groq) or fallback provider (Gemini) with the prompt
template from `prompts/mom_prompt.md`. Output is strictly validated
against SCHEMA.md §6 and saved as `mom.json`.
"""

import json
import logging
import os
from pathlib import Path
import re
from typing import Any, Protocol
import urllib.error
import urllib.request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.job_state import (
    JobStatus,
    get_job,
    update_job_status,
)

logger = logging.getLogger(__name__)

DEFAULT_RECORDINGS_DIR = Path("data/recordings")
DEFAULT_JOBS_DIR = Path("data/jobs")
DEFAULT_PROMPT_PATH = Path("prompts/mom_prompt.md")

# Default models
DEFAULT_GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

RETRY_PROMPT = (
    "Your last response was not valid JSON matching the required schema. "
    "Return ONLY the corrected JSON object, with no other text."
)


class ActionItem(BaseModel):
    """Schema for individual action item in MOM."""

    model_config = ConfigDict(extra="forbid")

    task: str
    owner: str = Field(..., min_length=1)
    due: str = Field(..., min_length=1)


class Mom(BaseModel):
    """Schema for mom.json matching SCHEMA.md §6."""

    model_config = ConfigDict(extra="forbid")

    meeting_id: str
    summary: str
    decisions: list[str]
    action_items: list[ActionItem]
    open_questions: list[str]


class MomGenerationFailedError(Exception):
    """Raised when MOM generation fails across all available providers."""


class LLMProvider(Protocol):
    """Interface protocol for LLM providers."""

    def complete(self, system_prompt: str, user_prompt: str, follow_up: str | None = None) -> str:
        """Send chat completion request to the LLM."""
        ...


def load_system_prompt(prompt_path: Path | None = None) -> str:
    """Load the verbatim system prompt from prompts/mom_prompt.md.

    Args:
        prompt_path: Optional path to the prompt file.

    Returns:
        The exact system prompt string.

    Raises:
        FileNotFoundError: If prompt_path does not exist.
    """
    path = prompt_path if prompt_path is not None else DEFAULT_PROMPT_PATH
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found at {path}")

    content = path.read_text(encoding="utf-8")
    # Extract prompt inside ``` codeblock under '## System prompt (used verbatim)'
    match = re.search(r"## System prompt \(used verbatim\)\s*```[^\n]*\n(.*?)```", content, re.DOTALL)
    if match:
        return match.group(1).strip()
    return content.strip()


def format_user_message(final_data: dict[str, Any]) -> str:
    """Format final.json transcript turns into readable text per mom_prompt.md.

    Args:
        final_data: Parsed final.json dictionary.

    Returns:
        Formatted prompt text including meeting title, date, and turns.
    """
    title = final_data.get("title", "Meeting")
    date = final_data.get("date", "")
    lines = [f"Meeting: {title}", f"Date: {date}", "", "Transcript:"]

    for turn in final_data.get("turns", []):
        speaker = turn.get("speaker", "UNKNOWN")
        text = turn.get("text", "").strip()
        lines.append(f"[{speaker}] {text}")

    return "\n".join(lines)


def clean_and_parse_json(raw_text: str) -> dict[str, Any]:
    """Strip markdown formatting and parse JSON from LLM response.

    Args:
        raw_text: Raw string response from LLM.

    Returns:
        Parsed JSON dictionary.

    Raises:
        json.JSONDecodeError: If raw_text cannot be parsed as JSON.
    """
    text = raw_text.strip()
    # Strip markdown code fences if model returned them
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text.strip())


class GroqProvider:
    """Groq LLM provider adapter using REST API with multi-key failover."""

    def __init__(self, api_key: str | None = None, api_keys: list[str] | None = None, model: str | None = None) -> None:
        if api_keys is not None:
            self.api_keys = [k for k in api_keys if k]
        elif api_key:
            self.api_keys = [api_key]
        else:
            self.api_keys = [k for k in [os.getenv("GROQ_API_KEY"), os.getenv("GROQ_API_KEY_2")] if k]
        self.model = model or DEFAULT_GROQ_MODEL
        self.endpoint = "https://api.groq.com/openai/v1/chat/completions"

    def complete(self, system_prompt: str, user_prompt: str, follow_up: str | None = None) -> str:
        if not self.api_keys:
            raise ValueError("No GROQ API keys configured")

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        if follow_up:
            messages.append({"role": "user", "content": follow_up})

        payload = {
            "model": self.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }

        last_exc: Exception | None = None
        for idx, key in enumerate(self.api_keys):
            try:
                logger.info("Attempting Groq completion with key index %d", idx)
                req = urllib.request.Request(
                    self.endpoint,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={
                        "Authorization": f"Bearer {key}",
                        "Content-Type": "application/json",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    },
                    method="POST",
                )

                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    return data["choices"][0]["message"]["content"]
            except Exception as exc:
                logger.warning("Groq key index %d failed: %s", idx, exc)
                last_exc = exc

        raise RuntimeError(f"All Groq API keys failed: {last_exc}")


class GeminiProvider:
    """Gemini LLM provider adapter using REST API with multi-key failover."""

    def __init__(self, api_key: str | None = None, api_keys: list[str] | None = None, model: str | None = None) -> None:
        if api_keys is not None:
            self.api_keys = [k for k in api_keys if k]
        elif api_key:
            self.api_keys = [api_key]
        else:
            self.api_keys = [k for k in [os.getenv("GEMINI_API_KEY"), os.getenv("GEMINI_API_KEY_2")] if k]
        self.model = model or DEFAULT_GEMINI_MODEL

    def complete(self, system_prompt: str, user_prompt: str, follow_up: str | None = None) -> str:
        if not self.api_keys:
            raise ValueError("No GEMINI API keys configured")

        contents: list[dict[str, Any]] = [
            {"role": "user", "parts": [{"text": f"System Instructions:\n{system_prompt}\n\n{user_prompt}"}]}
        ]
        if follow_up:
            contents.append({"role": "user", "parts": [{"text": follow_up}]})

        payload = {
            "contents": contents,
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2,
            },
        }

        last_exc: Exception | None = None
        for idx, key in enumerate(self.api_keys):
            try:
                logger.info("Attempting Gemini completion with key index %d", idx)
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={key}"
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )

                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise ValueError("No candidates in Gemini response")
                    return candidates[0]["content"]["parts"][0]["text"]
            except Exception as exc:
                logger.warning("Gemini key index %d failed: %s", idx, exc)
                last_exc = exc

        raise RuntimeError(f"All Gemini API keys failed: {last_exc}")


def _call_provider_with_retry(
    provider: Any,
    system_prompt: str,
    user_prompt: str,
    meeting_id: str,
) -> dict[str, Any]:
    """Call a provider, validate schema, and perform 1 retry if needed.

    Args:
        provider: Provider instance with .complete(...) method.
        system_prompt: System prompt string.
        user_prompt: Formatted user prompt.
        meeting_id: ID to inject into MOM JSON.

    Returns:
        Validated MOM dictionary.

    Raises:
        Exception: If initial call and retry both fail schema validation or API error.
    """
    raw_response = provider.complete(system_prompt, user_prompt)
    try:
        data = clean_and_parse_json(raw_response)
        data["meeting_id"] = meeting_id
        validated = Mom(**data)
        return validated.model_dump()
    except (json.JSONDecodeError, ValidationError) as initial_err:
        logger.warning(
            "Initial response failed schema validation (%s). Retrying once with error-correction prompt.",
            initial_err,
        )

    # 1 retry attempt with error-correction follow-up prompt
    retry_response = provider.complete(system_prompt, user_prompt, follow_up=RETRY_PROMPT)
    try:
        data = clean_and_parse_json(retry_response)
        data["meeting_id"] = meeting_id
        validated = Mom(**data)
        return validated.model_dump()
    except (json.JSONDecodeError, ValidationError) as retry_err:
        raise ValueError(f"Follow-up retry also failed schema validation: {retry_err}") from retry_err


def generate_mom(
    meeting_id: str,
    recordings_dir: Path | None = None,
    jobs_dir: Path | None = None,
    prompt_path: Path | None = None,
    force: bool = False,
    provider: Any | None = None,
) -> dict[str, Any]:
    """Generate structured mom.json from final.json via LLM.

    Reads data/recordings/{meeting_id}/final.json.
    Updates job status to 'mom_ready'.

    Args:
        meeting_id: Unique identifier for the meeting.
        recordings_dir: Optional directory containing recordings.
        jobs_dir: Optional directory containing jobs.
        prompt_path: Optional path to prompts/mom_prompt.md.
        force: If True, bypass status checks.
        provider: Optional mock or custom provider instance.

    Returns:
        Validated MOM dictionary.

    Raises:
        MomGenerationFailedError: If both primary and fallback providers fail.
    """
    rec_dir = (recordings_dir if recordings_dir is not None else DEFAULT_RECORDINGS_DIR) / meeting_id
    final_path = rec_dir / "final.json"
    mom_path = rec_dir / "mom.json"

    if not final_path.exists():
        raise MomGenerationFailedError(f"Final transcript not found at {final_path}")

    # Check job status
    try:
        job = get_job(meeting_id, jobs_dir=jobs_dir)
        current_status = job.get("status")
        if not force and current_status != JobStatus.MERGED.value:
            logger.warning("Job %s is in status '%s', expected '%s'", meeting_id, current_status, JobStatus.MERGED.value)
    except Exception as exc:
        logger.warning("Could not read job state for %s: %s", meeting_id, exc)

    with open(final_path, "r", encoding="utf-8") as f:
        final_data = json.load(f)

    system_prompt = load_system_prompt(prompt_path=prompt_path)
    user_prompt = format_user_message(final_data)

    # Provider fallback pipeline
    validated_mom: dict[str, Any] | None = None
    last_error: str | None = None

    if provider is not None:
        # Use provided test/custom provider
        try:
            validated_mom = _call_provider_with_retry(provider, system_prompt, user_prompt, meeting_id)
        except Exception as exc:
            last_error = f"Injected provider failed: {exc}"
    else:
        # Standard production sequence: Gemini primary (native Hinglish), Groq fallback
        providers = [
            ("Gemini", GeminiProvider()),
            ("Groq", GroqProvider()),
        ]

        for name, prov in providers:
            try:
                logger.info("Attempting MOM generation with %s for %s", name, meeting_id)
                validated_mom = _call_provider_with_retry(prov, system_prompt, user_prompt, meeting_id)
                logger.info("MOM generation succeeded with %s for %s", name, meeting_id)
                break
            except Exception as exc:
                logger.error("Provider %s failed for %s: %s", name, meeting_id, exc)
                last_error = f"{name} failed: {exc}"

    if validated_mom is None:
        error_msg = f"All MOM generation providers failed for meeting {meeting_id}. Last error: {last_error}"
        try:
            update_job_status(meeting_id, JobStatus.FAILED.value, error=error_msg, jobs_dir=jobs_dir)
        except Exception:
            pass
        raise MomGenerationFailedError(error_msg)

    # Write mom.json atomically
    temp_mom = mom_path.with_suffix(".json.tmp")
    with open(temp_mom, "w", encoding="utf-8") as f:
        json.dump(validated_mom, f, indent=2)
    temp_mom.replace(mom_path)

    # Update job status to 'mom_ready'
    try:
        update_job_status(meeting_id, JobStatus.MOM_READY.value, force=force, jobs_dir=jobs_dir)
    except Exception as exc:
        logger.warning("Could not update job status for %s to 'mom_ready': %s", meeting_id, exc)

    return validated_mom
