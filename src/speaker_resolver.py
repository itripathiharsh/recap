"""Speaker name resolution module using Gemini 2.5 Flash.

Maps generic speaker labels (e.g. SPEAKER_00, SPEAKER_01) to real participant names
based on:
1. Known owner/user persona (e.g. "Harsh Vardhan Tripathi")
2. Self-introductions in dialogue ("My name is Harsh", "I am Harsh")
3. Cross-talk name mentions ("Hey Rahul", "Thanks Harsh")
4. Single-speaker auto-attribution
"""

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def resolve_speaker_names(
    turns: list[dict[str, Any]],
    user_name: str | None = None,
    participants: list[str] | None = None,
    meeting_id: str | None = None,
    gemini_keys: list[str] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Map generic speaker IDs to real names using Gemini 2.5 Flash.

    Args:
        turns: List of turn dictionaries with 'speaker', 'start', 'end', and 'text'.
        user_name: Known user/host name (defaults to DEFAULT_USER_NAME or OWNER_NAME env).
        participants: Optional list of known participant names from Google Meet/Calendar.
        meeting_id: Optional meeting ID to load data/recordings/{meeting_id}/participants.json.
        gemini_keys: Optional list of Gemini API keys for failover.

    Returns:
        Tuple of (updated_turns_list, speaker_mapping_dict).
    """
    if not turns:
        return turns, {}

    target_user = user_name or os.getenv("DEFAULT_USER_NAME") or os.getenv("OWNER_NAME") or "Harsh Vardhan Tripathi"
    unique_speakers = sorted(list(set(t.get("speaker", "UNKNOWN") for t in turns if t.get("speaker"))))

    # Check for participants.json if meeting_id is provided
    known_list = list(participants or [])
    if meeting_id:
        p_file = Path("data/recordings") / meeting_id / "participants.json"
        if p_file.exists():
            try:
                loaded = json.loads(p_file.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    for p in loaded:
                        if p not in known_list:
                            known_list.append(p)
            except Exception:
                pass

    if target_user not in known_list:
        known_list.insert(0, target_user)

    # Edge case: If only 1 speaker, directly attribute to target_user
    if len(unique_speakers) == 1 and unique_speakers[0] != "UNKNOWN":
        sole_speaker = unique_speakers[0]
        mapping = {sole_speaker: target_user}
        updated_turns = []
        for t in turns:
            item = dict(t)
            if item.get("speaker") == sole_speaker:
                item["speaker"] = target_user
            updated_turns.append(item)
        logger.info("Single speaker detected: mapped %s -> %s", sole_speaker, target_user)
        return updated_turns, mapping

    # Multiple speakers: Use Gemini to identify based on dialogue
    keys = gemini_keys or [k for k in [os.getenv("GEMINI_API_KEY"), os.getenv("GEMINI_API_KEY_2")] if k]
    if not keys:
        logger.warning("No Gemini API keys found for speaker resolution; keeping original labels.")
        return turns, {s: s for s in unique_speakers}

    # Format sample dialogue for the LLM (up to 50 turns)
    sample_dialogue = "\n".join(
        [f"[{t.get('speaker')}]: {t.get('text', '').strip()}" for t in turns[:50] if t.get("text")]
    )

    participants_str = ", ".join(f'"{p}"' for p in known_list) if known_list else f'"{target_user}"'

    prompt = f"""You are analyzing a meeting transcript to identify the participants.
Known call participants: [{participants_str}]
Primary user/host: "{target_user}"

Dialogue:
{sample_dialogue}

Task:
Map each generic speaker ID (e.g. SPEAKER_00, SPEAKER_01, etc.) to their real human name based on:
1. Matching against the known call participants list above.
2. Direct self-introductions in dialogue ("My name is Harsh", "I am Mohit").
3. How participants address each other ("Hey Mohit", "Yes Priya", "Thanks Harsh").
4. If a participant is clearly mentioned or identified in the conversation, assign their name.

If a speaker's identity is completely unknown, leave their label unchanged (e.g. "SPEAKER_01").

Return a valid JSON object matching this schema:
{{
  "mapping": {{
    "SPEAKER_00": "Harsh Vardhan Tripathi",
    "SPEAKER_01": "Mohit"
  }}
}}
"""

    mapping: dict[str, str] = {s: s for s in unique_speakers}

    try:
        import google.generativeai as genai

        for idx, key in enumerate(keys):
            try:
                genai.configure(api_key=key)
                model = genai.GenerativeModel("gemini-2.5-flash")
                resp = model.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(response_mime_type="application/json"),
                )
                data = json.loads(resp.text)
                res_mapping = data.get("mapping", {})
                if isinstance(res_mapping, dict):
                    for k, v in res_mapping.items():
                        if k in unique_speakers and v and str(v).strip():
                            mapping[k] = str(v).strip()
                logger.info("Speaker resolution succeeded with key %d: %s", idx, mapping)
                break
            except Exception as exc:
                logger.warning("Speaker resolution failed with key %d: %s", idx, exc)
    except Exception as exc:
        logger.error("Error in speaker resolution: %s", exc)

    # Apply mapping to turns
    updated_turns = []
    for t in turns:
        item = dict(t)
        spk = item.get("speaker")
        if spk in mapping:
            item["speaker"] = mapping[spk]
        updated_turns.append(item)

    return updated_turns, mapping
