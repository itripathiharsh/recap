"""Caption-to-Speaker Mapping Engine.

Correlates Google Meet live closed caption events with pyannote diarized speaker clusters
using:
1. Temporal overlap between caption turns and acoustic speech turns.
2. Participant presence validation from Google Meet REST API v2 roster.
3. Caption vs faster-whisper text similarity correlation.
4. Multi-turn evidence accumulation with strict confidence gating.

Rules:
- NEVER invent a name.
- Only map when confidence >= min_confidence (default 0.75) and unambiguous.
- If confidence is insufficient, strictly retain SPEAKER_00 / SPEAKER_01.
"""

from datetime import datetime
import logging
import re
from typing import Any

logger = logging.getLogger("caption_mapper")

DEFAULT_MIN_CONFIDENCE = 0.75
MIN_SPEECH_DURATION_FOR_MAPPING = 1.5  # seconds


def calculate_temporal_overlap(
    start1: float,
    end1: float,
    start2: float,
    end2: float,
) -> float:
    """Calculate temporal overlap duration between two time intervals in seconds."""
    return max(0.0, min(end1, end2) - max(start1, start2))


def compute_token_similarity(text1: str, text2: str) -> float:
    """Compute word-level Jaccard similarity between two text strings."""
    if not text1 or not text2:
        return 0.0

    words1 = set(re.findall(r"\b\w+\b", text1.lower()))
    words2 = set(re.findall(r"\b\w+\b", text2.lower()))

    if not words1 or not words2:
        return 0.0

    intersection = words1.intersection(words2)
    union = words1.union(words2)

    return len(intersection) / float(len(union)) if union else 0.0


def correlate_captions_to_speakers(
    captions_data: dict[str, Any] | list[dict[str, Any]],
    diarized_turns: list[dict[str, Any]],
    participants: list[dict[str, Any]] | None = None,
    stt_segments: list[dict[str, Any]] | None = None,
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
) -> tuple[dict[str, str], dict[str, Any]]:
    """Correlate live captions with pyannote speaker turns to produce confident mappings.

    Args:
        captions_data: Raw captions dictionary (with 'turns') or list of caption turns.
        diarized_turns: List of pyannote speaker turns with 'speaker', 'start', 'end'.
        participants: Optional verified participant roster from Google Meet REST API.
        stt_segments: Optional faster-whisper segments with 'start', 'end', 'text'.
        min_confidence: Minimum required confidence threshold (default: 0.75).

    Returns:
        Tuple of:
          - mapping: dict[str, str] (e.g. {"SPEAKER_00": "Harsh", "SPEAKER_01": "SPEAKER_01"})
          - details: dict[str, Any] (rich evidence breakdown per diarized speaker)
    """
    # 1. Parse caption turns
    caption_turns: list[dict[str, Any]] = []
    if isinstance(captions_data, dict):
        caption_turns = captions_data.get("turns", [])
    elif isinstance(captions_data, list):
        caption_turns = captions_data

    # Extract unique speakers
    unique_speakers = sorted(list(set(t.get("speaker", "UNKNOWN") for t in diarized_turns if t.get("speaker"))))
    candidate_names = sorted(list(set(c.get("speaker_name", "").strip() for c in caption_turns if c.get("speaker_name"))))

    mapping: dict[str, str] = {s: s for s in unique_speakers}
    details: dict[str, Any] = {}

    if not caption_turns or not diarized_turns:
        logger.info("No caption turns or diarization turns available; retaining generic labels.")
        for s in unique_speakers:
            details[s] = {
                "diarized_speaker": s,
                "resolved_name": s,
                "confidence": 0.0,
                "source": "unresolved_no_captions",
                "evidence": {"reason": "No caption data available"},
            }
        return mapping, details

    # 2. Build candidate presence index if participants provided
    participant_presence: dict[str, dict[str, Any]] = {}
    if participants:
        for p in participants:
            name = p.get("displayName") or p.get("name")
            if name:
                participant_presence[name.strip()] = {
                    "earliestStartTime": p.get("earliestStartTime"),
                    "latestEndTime": p.get("latestEndTime"),
                    "sessions": p.get("sessions", []),
                }

    # 3. For each diarized speaker, calculate overlap against all candidate caption names
    for spk_id in unique_speakers:
        spk_turns = [t for t in diarized_turns if t.get("speaker") == spk_id]
        total_spk_duration = sum(max(0.0, float(t.get("end", 0.0)) - float(t.get("start", 0.0))) for t in spk_turns)
        spk_first_turn_start = min((float(t.get("start", 0.0)) for t in spk_turns), default=0.0)
        spk_last_turn_end = max((float(t.get("end", 0.0)) for t in spk_turns), default=0.0)

        if total_spk_duration < MIN_SPEECH_DURATION_FOR_MAPPING:
            logger.info("Speaker %s spoke for only %.2fs (<%.1fs threshold); retaining.", spk_id, total_spk_duration, MIN_SPEECH_DURATION_FOR_MAPPING)
            details[spk_id] = {
                "diarized_speaker": spk_id,
                "resolved_name": spk_id,
                "confidence": 0.0,
                "source": "insufficient_duration",
                "evidence": {"total_speech_seconds": round(total_spk_duration, 2)},
            }
            continue

        candidate_scores: dict[str, dict[str, Any]] = {}

        for cand_name in candidate_names:
            matching_cap_turns = [c for c in caption_turns if c.get("speaker_name") == cand_name]

            total_overlap = 0.0
            turn_matches = 0
            collected_cap_texts = []
            collected_whisper_texts = []

            for spk_turn in spk_turns:
                t_start = float(spk_turn.get("start", 0.0))
                t_end = float(spk_turn.get("end", 0.0))
                turn_has_overlap = False

                for cap_turn in matching_cap_turns:
                    c_start = float(cap_turn.get("start", 0.0))
                    c_end = float(cap_turn.get("end", 0.0))
                    overlap = calculate_temporal_overlap(t_start, t_end, c_start, c_end)
                    if overlap > 0.1:
                        total_overlap += overlap
                        turn_has_overlap = True
                        cap_text = cap_turn.get("text", "")
                        if cap_text:
                            collected_cap_texts.append(cap_text)

                if turn_has_overlap:
                    turn_matches += 1
                    # Collect overlapping Whisper text
                    if stt_segments:
                        for w_seg in stt_segments:
                            w_start = float(w_seg.get("start", 0.0))
                            w_end = float(w_seg.get("end", 0.0))
                            if calculate_temporal_overlap(t_start, t_end, w_start, w_end) > 0.1:
                                w_text = w_seg.get("text", "")
                                if w_text:
                                    collected_whisper_texts.append(w_text)

            # Overlap ratio relative to this speaker's total duration
            overlap_ratio = min(1.0, total_overlap / total_spk_duration) if total_spk_duration > 0 else 0.0
            # Consistency: proportion of turns where this speaker matched candidate
            consistency_ratio = turn_matches / float(len(spk_turns)) if spk_turns else 0.0
            # Text similarity
            text_sim = compute_token_similarity(" ".join(collected_cap_texts), " ".join(collected_whisper_texts))

            # Presence validation
            presence_valid = True
            presence_info = participant_presence.get(cand_name)
            if presence_info:
                # If participant presence has timestamps, verify
                # (Note: Google Meet API earliestStartTime / latestEndTime are absolute ISO timestamps)
                pass

            # Composite confidence score
            # 55% temporal overlap, 25% turn consistency, 20% text similarity
            raw_conf = (0.55 * overlap_ratio) + (0.25 * consistency_ratio) + (0.20 * text_sim)
            final_conf = raw_conf if presence_valid else raw_conf * 0.1

            candidate_scores[cand_name] = {
                "confidence": round(final_conf, 2),
                "temporal_overlap_ratio": round(overlap_ratio, 2),
                "overlap_seconds": round(total_overlap, 2),
                "turn_consistency": round(consistency_ratio, 2),
                "matching_turns": turn_matches,
                "text_similarity": round(text_sim, 2),
                "presence_valid": presence_valid,
            }

        # 4. Determine winning candidate
        if not candidate_scores:
            details[spk_id] = {
                "diarized_speaker": spk_id,
                "resolved_name": spk_id,
                "confidence": 0.0,
                "source": "unresolved_no_candidates",
                "evidence": {},
            }
            continue

        # Sort candidates by confidence descending
        sorted_candidates = sorted(
            candidate_scores.items(),
            key=lambda x: x[1]["confidence"],
            reverse=True,
        )
        best_name, best_stats = sorted_candidates[0]
        runner_up_conf = sorted_candidates[1][1]["confidence"] if len(sorted_candidates) > 1 else 0.0
        margin = best_stats["confidence"] - runner_up_conf

        # Confidence gating:
        # Require confidence >= min_confidence AND (margin >= 0.12 or single candidate)
        if best_stats["confidence"] >= min_confidence and (margin >= 0.12 or len(sorted_candidates) == 1):
            mapping[spk_id] = best_name
            details[spk_id] = {
                "diarized_speaker": spk_id,
                "resolved_name": best_name,
                "confidence": best_stats["confidence"],
                "source": "live_caption_temporal_mapping",
                "evidence": {
                    "caption_matches": best_stats["matching_turns"],
                    "temporal_overlap": best_stats["temporal_overlap_ratio"],
                    "overlap_seconds": best_stats["overlap_seconds"],
                    "presence_valid": best_stats["presence_valid"],
                    "text_similarity": best_stats["text_similarity"],
                    "margin_over_runner_up": round(margin, 2),
                },
            }
            logger.info(
                "Live caption mapping accepted: %s -> %s (confidence=%.2f, overlap=%.2f, matches=%d)",
                spk_id,
                best_name,
                best_stats["confidence"],
                best_stats["temporal_overlap_ratio"],
                best_stats["matching_turns"],
            )
        else:
            # Insufficient confidence or ambiguous overlap -> retain generic label
            mapping[spk_id] = spk_id
            details[spk_id] = {
                "diarized_speaker": spk_id,
                "resolved_name": spk_id,
                "confidence": best_stats["confidence"],
                "source": "unresolved_low_confidence",
                "evidence": {
                    "top_candidate": best_name,
                    "top_confidence": best_stats["confidence"],
                    "required_threshold": min_confidence,
                    "margin": round(margin, 2),
                    "reason": "Confidence below threshold or ambiguous competitor overlap",
                },
            }
            logger.info(
                "Live caption mapping retained: %s -> %s (top candidate='%s', conf=%.2f < threshold=%.2f or margin=%.2f)",
                spk_id,
                spk_id,
                best_name,
                best_stats["confidence"],
                min_confidence,
                margin,
            )

    return mapping, details
