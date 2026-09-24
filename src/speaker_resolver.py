"""Speaker Mapping Engine & Resolution Module.

Maps generic pyannote speaker labels (e.g. SPEAKER_00, SPEAKER_01) to real participant
names retrieved from Google Meet REST API or DOM fallback.

Architecture:
Google Meet participants + pyannote diarized speakers
                   ↓
         speaker mapping engine
                   ↓
            named transcript

Gating Rules:
- Only assign a person's real name when there is sufficient evidence:
  1. Direct self-introductions in dialogue ("I am ...", "My name is ...")
  2. Direct conversational address + immediate response
  3. Single-speaker auto-attribution (only 1 speaker and 1 participant)
  4. Temporal presence constraints (sessions / join-leave times)
- If confidence is insufficient or ambiguous, RETAIN the generic label (e.g. SPEAKER_00).
- NEVER guess. NEVER invent names.
"""

from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger("speaker_resolver")

MIN_MAPPING_CONFIDENCE = 0.85


def load_known_participants(
    meeting_id: str | None = None,
    provided_participants: list[Any] | None = None,
    recordings_dir: Path | None = None,
) -> list[dict[str, Any]]:
    """Load and normalize participant records from Google Meet API or DOM fallback.

    Args:
        meeting_id: Optional meeting identifier.
        provided_participants: Optional passed participants list (strings or dicts).
        recordings_dir: Optional custom recordings directory path.

    Returns:
        List of normalized participant dictionaries.
    """
    clean_participants: list[dict[str, Any]] = []

    # 1. Ingest provided participants
    if provided_participants:
        for p in provided_participants:
            if isinstance(p, str) and p.strip():
                clean_participants.append({
                    "displayName": p.strip(),
                    "source": "provided",
                    "sessions": [],
                })
            elif isinstance(p, dict) and p.get("displayName"):
                clean_participants.append({
                    "displayName": p["displayName"].strip(),
                    "user_type": p.get("user_type", "unknown"),
                    "earliestStartTime": p.get("earliestStartTime"),
                    "latestEndTime": p.get("latestEndTime"),
                    "sessions": p.get("sessions", []),
                    "source": p.get("source", "provided"),
                })

    # 2. Ingest from participants.json if meeting_id is supplied
    if meeting_id:
        p_file = (recordings_dir if recordings_dir is not None else Path("data/recordings")) / meeting_id / "participants.json"
        if p_file.exists():
            try:
                loaded = json.loads(p_file.read_text(encoding="utf-8"))
                items = []
                if isinstance(loaded, dict) and "participants" in loaded:
                    items = loaded.get("participants", [])
                elif isinstance(loaded, list):
                    items = loaded

                for item in items:
                    if isinstance(item, str) and item.strip():
                        if not any(cp["displayName"] == item.strip() for cp in clean_participants):
                            clean_participants.append({
                                "displayName": item.strip(),
                                "source": "dom_fallback",
                                "sessions": [],
                            })
                    elif isinstance(item, dict) and item.get("displayName"):
                        d_name = item["displayName"].strip()
                        if not any(cp["displayName"] == d_name for cp in clean_participants):
                            clean_participants.append({
                                "displayName": d_name,
                                "user_type": item.get("user_type", "unknown"),
                                "earliestStartTime": item.get("earliestStartTime"),
                                "latestEndTime": item.get("latestEndTime"),
                                "sessions": item.get("sessions", []),
                                "source": item.get("source", "google_meet_api"),
                            })
            except Exception as exc:
                logger.warning("Could not read participants file for %s: %s", meeting_id, exc)

    return clean_participants


def resolve_speaker_names(
    turns: list[dict[str, Any]],
    user_name: str | None = None,
    participants: list[Any] | None = None,
    meeting_id: str | None = None,
    gemini_keys: list[str] | None = None,
    recordings_dir: Path | None = None,
    min_confidence: float = 0.75,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Map generic speaker IDs to real names with strict evidence gating.

    Integrates:
    1. Google Meet Live Closed Captions (Primary ground truth: temporal overlap + presence + text similarity)
    2. Single-speaker auto-attribution (only 1 speaker and 1 participant)
    3. Multi-turn dialogue analysis with Gemini LLM (Secondary fallback for remaining unmapped turns)

    Args:
        turns: List of turn dictionaries with 'speaker', 'start', 'end', and 'text'.
        user_name: Known user/host name (defaults to DEFAULT_USER_NAME or OWNER_NAME env).
        participants: Optional list of known participant names or dicts.
        meeting_id: Optional meeting ID to load data/recordings/{meeting_id}/participants.json.
        gemini_keys: Optional list of Gemini API keys for failover.
        recordings_dir: Optional custom recordings directory path.
        min_confidence: Minimum required confidence threshold (default: 0.75).

    Returns:
        Tuple of (updated_turns_list, speaker_mapping_dict).
    """
    if not turns:
        return turns, {}

    target_user = (
        user_name
        or os.getenv("DEFAULT_USER_NAME")
        or os.getenv("OWNER_NAME")
        or "Harsh Vardhan Tripathi"
    )
    unique_speakers = sorted(list(set(t.get("speaker", "UNKNOWN") for t in turns if t.get("speaker"))))

    # Load normalized participants
    known_participants = load_known_participants(meeting_id, participants, recordings_dir=recordings_dir)

    # Ensure target_user is in candidate list if not already present
    if not any(p["displayName"] == target_user for p in known_participants):
        known_participants.insert(0, {
            "displayName": target_user,
            "source": "owner",
            "sessions": [],
        })

    candidate_names = [p["displayName"] for p in known_participants if p.get("displayName")]

    # Default fallback mapping: preserve original speaker labels (never guess!)
    mapping: dict[str, str] = {s: s for s in unique_speakers}
    evidence_log: dict[str, dict[str, Any]] = {}

    rec_dir = (recordings_dir if recordings_dir is not None else Path("data/recordings")) / meeting_id if meeting_id else None
    captions_available = False

    # -------------------------------------------------------------
    # 1. Primary Ground Truth: Google Meet Live Caption Correlation
    # -------------------------------------------------------------
    if rec_dir:
        captions_file = rec_dir / "captions.json"
        if captions_file.exists():
            try:
                captions_data = json.loads(captions_file.read_text(encoding="utf-8"))
                captions_available = bool(captions_data.get("captions_available", False))

                stt_segments = None
                stt_file = rec_dir / "transcript.json"
                if stt_file.exists():
                    try:
                        stt_segments = json.loads(stt_file.read_text(encoding="utf-8")).get("segments", [])
                    except Exception:
                        pass

                from src.caption_mapper import correlate_captions_to_speakers
                cap_mapping, cap_details = correlate_captions_to_speakers(
                    captions_data=captions_data,
                    diarized_turns=turns,
                    participants=known_participants,
                    stt_segments=stt_segments,
                    min_confidence=min_confidence,
                )
                for spk_id, assigned in cap_mapping.items():
                    ev = cap_details.get(spk_id, {})
                    evidence_log[spk_id] = ev
                    if assigned != spk_id:
                        mapping[spk_id] = assigned
                        logger.info("Speaker %s mapped to '%s' via live captions", spk_id, assigned)
            except Exception as cap_err:
                logger.warning("Live caption correlation failed for %s: %s", meeting_id, cap_err)

    # Check for unmapped speakers
    unresolved_speakers = [s for s in unique_speakers if mapping.get(s) == s and s != "UNKNOWN"]

    # -------------------------------------------------------------
    # 2. Single speaker detected in audio fallback
    # -------------------------------------------------------------
    if len(unique_speakers) == 1 and unique_speakers[0] != "UNKNOWN" and unique_speakers[0] in unresolved_speakers:
        sole_speaker = unique_speakers[0]
        assigned = candidate_names[0] if candidate_names else target_user
        mapping[sole_speaker] = assigned
        evidence_log[sole_speaker] = {
            "assigned_name": assigned,
            "confidence": 1.0,
            "source": "single_speaker_heuristic",
            "evidence": "Single speaker in meeting; attributed to primary user/sole participant.",
        }
        logger.info("Single speaker detected: %s -> %s", sole_speaker, assigned)
        unresolved_speakers = []

    # -------------------------------------------------------------
    # 3. LLM Dialogue Analysis Fallback for remaining unresolved speakers
    # -------------------------------------------------------------
    if unresolved_speakers:
        keys = gemini_keys or [k for k in [os.getenv("GEMINI_API_KEY"), os.getenv("GEMINI_API_KEY_2")] if k]
        if keys:
            sample_turns = [t for t in turns if t.get("text") and str(t.get("text")).strip()][:50]
            sample_dialogue = "\n".join(
                [f"[{t.get('speaker')}]: {t.get('text', '').strip()}" for t in sample_turns]
            )

            participants_info = []
            for p in known_participants:
                details = f'- "{p["displayName"]}" (source: {p.get("source", "unknown")})'
                if p.get("earliestStartTime") and p.get("latestEndTime"):
                    details += f' [present: {p["earliestStartTime"]} to {p["latestEndTime"]}]'
                participants_info.append(details)
            participants_text = "\n".join(participants_info)

            prompt = f"""You are the Speaker Mapping Engine for a meeting transcription pipeline.
You are given a list of verified meeting participants and a sample dialogue with generic speaker labels ({', '.join(unresolved_speakers)}).

Verified Meeting Participants:
{participants_text}
Primary User / Host: "{target_user}"

Meeting Dialogue:
{sample_dialogue}

TASK:
Determine if there is SUFFICIENT EVIDENCE to map each generic speaker ID to a verified participant's real name.

EVIDENCE CRITERIA:
1. Self-introduction: Speaker explicitly introduces themselves ("Hi, I'm Harsh", "This is Rahul").
2. Direct conversational address + immediate response: Another speaker addresses them by name ("Rahul, what do you think?"), and this speaker responds.
3. Contextual attribution: Clear, unambiguous evidence in the dialogue confirming identity.

STRICT CONFIDENCE GATING RULES:
- ONLY assign a real name if you have strong, unambiguous evidence (confidence >= 0.85).
- If evidence is weak, ambiguous, or absent, RETAIN the original speaker ID (e.g. keep "SPEAKER_00").
- NEVER GUESS.
- NEVER INVENT NAMES. Only use names from the Verified Meeting Participants list.
- If two speakers could both be a certain person, DO NOT ASSIGN. Retain their generic IDs.

Return a valid JSON object matching this exact schema:
{{
  "mappings": {{
    "SPEAKER_00": {{
      "assigned_name": "Harsh Vardhan Tripathi",
      "confidence": 0.95,
      "evidence": "Direct self-introduction in turn 1 ('Hi, I am Harsh')"
    }}
  }}
}}
"""
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
                        res_mappings = data.get("mappings", {})

                        if isinstance(res_mappings, dict):
                            for spk_id, item in res_mappings.items():
                                if spk_id not in unresolved_speakers:
                                    continue

                                assigned_name = item.get("assigned_name", spk_id)
                                confidence = float(item.get("confidence", 0.0))
                                evidence = str(item.get("evidence", ""))

                                if (
                                    confidence >= MIN_MAPPING_CONFIDENCE
                                    and assigned_name in candidate_names
                                    and assigned_name != spk_id
                                ):
                                    mapping[spk_id] = assigned_name
                                    logger.info(
                                        "Speaker mapping accepted via dialogue: %s -> %s (confidence=%.2f, evidence='%s')",
                                        spk_id,
                                        assigned_name,
                                        confidence,
                                        evidence,
                                    )
                                    evidence_log[spk_id] = {
                                        "assigned_name": assigned_name,
                                        "confidence": confidence,
                                        "source": "dialogue_llm",
                                        "evidence": {"text": evidence},
                                    }
                                else:
                                    mapping[spk_id] = spk_id
                                    if spk_id not in evidence_log:
                                        evidence_log[spk_id] = {
                                            "assigned_name": spk_id,
                                            "confidence": confidence,
                                            "source": "unresolved",
                                            "evidence": {"reason": "Insufficient dialogue evidence"},
                                        }

                        break
                    except Exception as exc:
                        logger.warning("Speaker mapping engine attempt %d failed: %s", idx, exc)

            except Exception as exc:
                logger.error("Error in speaker mapping engine: %s", exc)

    # -------------------------------------------------------------
    # 4. Save speaker_mapping.json artifact for audit and API
    # -------------------------------------------------------------
    if rec_dir:
        try:
            mapping_records = []
            for s in unique_speakers:
                resolved_val = mapping.get(s, s)
                is_resolved = (resolved_val != s)
                ev = evidence_log.get(s, {})
                mapping_records.append({
                    "speaker_id": s,
                    "name": resolved_val,
                    "resolved_name": resolved_val if is_resolved else None,
                    "confidence": ev.get("confidence", 0.0),
                    "source": ev.get("source", "live_caption_temporal_mapping" if is_resolved else "unresolved"),
                    "evidence": ev.get("evidence", {}),
                })

            mapping_payload = {
                "meeting_id": meeting_id,
                "captions_available": captions_available,
                "speakers": mapping_records,
                "saved_at": datetime.now(timezone.utc).isoformat(),
            }
            map_file = rec_dir / "speaker_mapping.json"
            map_file.write_text(json.dumps(mapping_payload, indent=2), encoding="utf-8")
        except Exception as sm_err:
            logger.warning("Could not write speaker_mapping.json for %s: %s", meeting_id, sm_err)

    return _apply_mapping_to_turns(turns, mapping, evidence_log), mapping


def _apply_mapping_to_turns(
    turns: list[dict[str, Any]],
    mapping: dict[str, str],
    evidence_log: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Apply speaker mapping dictionary to transcript turns."""
    updated_turns = []
    for t in turns:
        item = dict(t)
        spk = item.get("speaker")
        raw_id = item.get("speaker_id") or spk
        resolved = mapping.get(raw_id, raw_id) if raw_id else spk
        ev = (evidence_log or {}).get(raw_id, {}) if raw_id else {}
        conf = ev.get("confidence")

        if resolved and resolved != raw_id:
            item["speaker"] = resolved
            item["speaker_id"] = raw_id
            item["resolved_name"] = resolved
            if conf is not None:
                item["confidence"] = conf
        else:
            item["speaker"] = raw_id
            if "speaker_id" in item and item["speaker_id"] is None:
                del item["speaker_id"]
        updated_turns.append(item)
    return updated_turns

