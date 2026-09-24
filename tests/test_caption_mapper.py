"""Comprehensive automated test suite for Google Meet Live Caption Speaker Mapping.

Covers all 13 Phase 12 requirements:
1. caption parsing
2. caption deduplication
3. timestamp conversion
4. pyannote/caption overlap
5. participant presence filtering
6. confidence calculation
7. ambiguous mapping
8. unresolved speaker fallback
9. late participant
10. early participant
11. caption unavailable
12. duplicate captions
13. existing speaker resolver regression
"""

import json
from pathlib import Path
import pytest
import time

from src.caption_observer import CaptionCollector
from src.caption_mapper import (
    calculate_temporal_overlap,
    compute_token_similarity,
    correlate_captions_to_speakers,
    DEFAULT_MIN_CONFIDENCE,
)
from src.speaker_resolver import resolve_speaker_names


# -------------------------------------------------------------
# 1. Caption Parsing
# -------------------------------------------------------------
def test_caption_parsing():
    """Verify parsing caption turns from dictionary and list structures."""
    sample_dict = {
        "meeting_id": "test-meet-1",
        "captions_available": True,
        "turns": [
            {
                "speaker_name": "Mohit",
                "start": 10.0,
                "end": 15.5,
                "text": "Let's review the API spec.",
                "source": "google_meet_live_caption",
            }
        ],
    }
    diarized = [{"speaker": "SPEAKER_00", "start": 9.8, "end": 15.6}]

    mapping, details = correlate_captions_to_speakers(sample_dict, diarized)
    assert mapping["SPEAKER_00"] == "Mohit"
    assert details["SPEAKER_00"]["confidence"] >= 0.75
    assert details["SPEAKER_00"]["source"] == "live_caption_temporal_mapping"


# -------------------------------------------------------------
# 2. Caption Deduplication & Streaming Aggregation
# -------------------------------------------------------------
def test_caption_deduplication(tmp_path: Path):
    """Verify progressive word-by-word streaming caption updates coalesce into a single turn."""
    collector = CaptionCollector(
        meeting_id="dedup-meet",
        recording_start_monotonic=time.monotonic(),
        recordings_dir=tmp_path,
    )

    # Simulate streaming words: "Let's", "Let's discuss", "Let's discuss the backend"
    collector.add_raw_event({"speaker_name": "Mohit", "text": "Let's", "offset_seconds": 1.0})
    collector.add_raw_event({"speaker_name": "Mohit", "text": "Let's discuss", "offset_seconds": 2.0})
    collector.add_raw_event({"speaker_name": "Mohit", "text": "Let's discuss the backend", "offset_seconds": 3.0})

    saved_file = collector.save()
    data = json.loads(saved_file.read_text(encoding="utf-8"))

    assert len(data["turns"]) == 1
    assert data["turns"][0]["speaker_name"] == "Mohit"
    assert data["turns"][0]["text"] == "Let's discuss the backend"
    assert data["turns"][0]["start"] == 1.0
    assert data["turns"][0]["end"] == 3.0


# -------------------------------------------------------------
# 3. Timestamp Conversion & Monotonic Drift
# -------------------------------------------------------------
def test_timestamp_conversion(tmp_path: Path):
    """Verify browser offset is calibrated and non-negative."""
    base_time = time.monotonic() - 10.0
    collector = CaptionCollector(
        meeting_id="drift-meet",
        recording_start_monotonic=base_time,
        recordings_dir=tmp_path,
    )

    # Event with browser offset 12.34s
    collector.add_raw_event({"speaker_name": "Aparna", "text": "Hello team", "offset_seconds": 12.34})
    saved_file = collector.save()
    data = json.loads(saved_file.read_text(encoding="utf-8"))

    turn = data["turns"][0]
    assert turn["start"] == 12.34
    assert turn["end"] >= 12.34


# -------------------------------------------------------------
# 4. Pyannote / Caption Overlap Calculation
# -------------------------------------------------------------
def test_pyannote_caption_overlap():
    """Verify temporal overlap logic with disjoint, partial, and full overlaps."""
    # Disjoint
    assert calculate_temporal_overlap(0.0, 5.0, 6.0, 10.0) == 0.0
    # Adjacent
    assert calculate_temporal_overlap(0.0, 5.0, 5.0, 10.0) == 0.0
    # Partial overlap
    assert calculate_temporal_overlap(0.0, 5.0, 3.0, 8.0) == 2.0
    # Full containment
    assert calculate_temporal_overlap(2.0, 4.0, 1.0, 6.0) == 2.0


# -------------------------------------------------------------
# 5. Participant Presence Filtering
# -------------------------------------------------------------
def test_participant_presence_filtering():
    """Verify that participant presence info is evaluated and respected."""
    captions = [
        {"speaker_name": "Harsh", "start": 10.0, "end": 20.0, "text": "Testing presence"},
    ]
    diarized = [
        {"speaker": "SPEAKER_00", "start": 10.0, "end": 20.0},
    ]
    participants = [
        {"displayName": "Harsh", "earliestStartTime": "2026-09-20T10:00:00Z", "latestEndTime": "2026-09-20T10:30:00Z"}
    ]

    mapping, details = correlate_captions_to_speakers(captions, diarized, participants=participants)
    assert mapping["SPEAKER_00"] == "Harsh"
    assert details["SPEAKER_00"]["evidence"]["presence_valid"] is True


# -------------------------------------------------------------
# 6. Confidence Calculation
# -------------------------------------------------------------
def test_confidence_calculation():
    """Verify composite confidence calculation using temporal overlap, turn consistency, and text similarity."""
    captions = [
        {"speaker_name": "Harsh", "start": 0.0, "end": 10.0, "text": "Good morning everyone let's start the sync."},
        {"speaker_name": "Harsh", "start": 20.0, "end": 30.0, "text": "Moving on to sprint planning."},
    ]
    diarized = [
        {"speaker": "SPEAKER_00", "start": 0.0, "end": 10.0},
        {"speaker": "SPEAKER_00", "start": 20.0, "end": 30.0},
    ]
    stt_segments = [
        {"start": 0.0, "end": 10.0, "text": "Good morning everyone let's start the sync."},
        {"start": 20.0, "end": 30.0, "text": "Moving on to sprint planning."},
    ]

    mapping, details = correlate_captions_to_speakers(
        captions,
        diarized,
        stt_segments=stt_segments,
    )

    assert mapping["SPEAKER_00"] == "Harsh"
    conf = details["SPEAKER_00"]["confidence"]
    # With 100% overlap, 100% turn consistency, and 100% text similarity:
    # 0.55 * 1.0 + 0.25 * 1.0 + 0.20 * 1.0 = 1.0
    assert conf >= 0.95
    assert details["SPEAKER_00"]["evidence"]["temporal_overlap"] == 1.0
    assert details["SPEAKER_00"]["evidence"]["text_similarity"] == 1.0


# -------------------------------------------------------------
# 7. Ambiguous Mapping (Refuse to Map)
# -------------------------------------------------------------
def test_ambiguous_mapping():
    """When two candidates have almost equal overlap with a speaker (margin < 0.12), refuse to guess."""
    # Caption turns overlap equally with SPEAKER_00
    captions = [
        {"speaker_name": "Mohit", "start": 10.0, "end": 15.0, "text": "Speaking here"},
        {"speaker_name": "Aparna", "start": 10.0, "end": 15.0, "text": "Speaking here too"},
    ]
    diarized = [
        {"speaker": "SPEAKER_00", "start": 10.0, "end": 15.0},
    ]

    mapping, details = correlate_captions_to_speakers(captions, diarized)
    # Must retain generic ID because margin is 0.0
    assert mapping["SPEAKER_00"] == "SPEAKER_00"
    assert details["SPEAKER_00"]["source"] == "unresolved_low_confidence"


# -------------------------------------------------------------
# 8. Unresolved Speaker Fallback (Never Invent a Name)
# -------------------------------------------------------------
def test_unresolved_speaker_fallback():
    """When confidence is below threshold, speaker label MUST remain SPEAKER_XX."""
    captions = [
        {"speaker_name": "Mohit", "start": 100.0, "end": 101.0, "text": "Brief word"},
    ]
    diarized = [
        {"speaker": "SPEAKER_01", "start": 0.0, "end": 50.0},
    ]

    mapping, details = correlate_captions_to_speakers(captions, diarized, min_confidence=0.75)
    assert mapping["SPEAKER_01"] == "SPEAKER_01"
    assert details["SPEAKER_01"]["confidence"] < 0.75


# -------------------------------------------------------------
# 9. Late Participant Handling
# -------------------------------------------------------------
def test_late_participant_handling():
    """Participant who joins late (at t=60s) is correctly mapped to later segments only."""
    captions = [
        {"speaker_name": "Harsh", "start": 0.0, "end": 30.0, "text": "I am here from the beginning."},
        {"speaker_name": "Mohit", "start": 65.0, "end": 90.0, "text": "Sorry I joined late everyone."},
    ]
    diarized = [
        {"speaker": "SPEAKER_00", "start": 0.0, "end": 30.0},
        {"speaker": "SPEAKER_01", "start": 65.0, "end": 90.0},
    ]

    mapping, details = correlate_captions_to_speakers(captions, diarized)
    assert mapping["SPEAKER_00"] == "Harsh"
    assert mapping["SPEAKER_01"] == "Mohit"


# -------------------------------------------------------------
# 10. Early Participant Handling
# -------------------------------------------------------------
def test_early_participant_handling():
    """Participant who leaves early (at t=40s) is not mapped to later speech."""
    captions = [
        {"speaker_name": "Aparna", "start": 0.0, "end": 35.0, "text": "I have to leave early."},
        {"speaker_name": "Harsh", "start": 50.0, "end": 80.0, "text": "Continuing the meeting."},
    ]
    diarized = [
        {"speaker": "SPEAKER_01", "start": 0.0, "end": 35.0},
        {"speaker": "SPEAKER_02", "start": 50.0, "end": 80.0},
    ]

    mapping, details = correlate_captions_to_speakers(captions, diarized)
    assert mapping["SPEAKER_01"] == "Aparna"
    assert mapping["SPEAKER_02"] == "Harsh"


# -------------------------------------------------------------
# 11. Captions Unavailable (No Crash, Safe Fallback)
# -------------------------------------------------------------
def test_captions_unavailable():
    """When captions_available is False or turns are empty, returns generic speaker labels without crashing."""
    captions_empty = {"captions_available": False, "turns": []}
    diarized = [
        {"speaker": "SPEAKER_00", "start": 0.0, "end": 10.0},
        {"speaker": "SPEAKER_01", "start": 10.0, "end": 20.0},
    ]

    mapping, details = correlate_captions_to_speakers(captions_empty, diarized)
    assert mapping["SPEAKER_00"] == "SPEAKER_00"
    assert mapping["SPEAKER_01"] == "SPEAKER_01"
    assert details["SPEAKER_00"]["source"] == "unresolved_no_captions"


# -------------------------------------------------------------
# 12. Duplicate Captions
# -------------------------------------------------------------
def test_duplicate_captions(tmp_path: Path):
    """Rapid duplicate caption emissions from DOM mutations are deduplicated cleanly."""
    collector = CaptionCollector(
        meeting_id="dup-test",
        recording_start_monotonic=time.monotonic(),
        recordings_dir=tmp_path,
    )

    # Identical emissions within 1 second
    collector.add_raw_event({"speaker_name": "Mohit", "text": "Finalizing the budget.", "offset_seconds": 10.0})
    collector.add_raw_event({"speaker_name": "Mohit", "text": "Finalizing the budget.", "offset_seconds": 10.5})
    collector.add_raw_event({"speaker_name": "Mohit", "text": "Finalizing the budget.", "offset_seconds": 11.0})

    saved = collector.save()
    data = json.loads(saved.read_text(encoding="utf-8"))

    assert len(data["turns"]) == 1
    assert data["turns"][0]["speaker_name"] == "Mohit"
    assert data["turns"][0]["text"] == "Finalizing the budget."


# -------------------------------------------------------------
# 13. Existing Speaker Resolver Regression
# -------------------------------------------------------------
def test_existing_speaker_resolver_regression(tmp_path: Path):
    """Verify resolve_speaker_names falls back gracefully when no captions exist."""
    rec_dir = tmp_path / "data" / "recordings" / "reg-meet"
    rec_dir.mkdir(parents=True, exist_ok=True)

    # Single speaker case without captions -> single speaker heuristic should map to primary user
    turns = [
        {"speaker": "SPEAKER_00", "start": 0.0, "end": 15.0, "text": "Hello world"},
    ]

    updated_turns, mapping = resolve_speaker_names(
        turns=turns,
        user_name="Harsh Vardhan Tripathi",
        meeting_id="reg-meet",
        recordings_dir=tmp_path / "data" / "recordings",
    )

    assert mapping["SPEAKER_00"] == "Harsh Vardhan Tripathi"
    assert updated_turns[0]["speaker"] == "Harsh Vardhan Tripathi"
    assert updated_turns[0]["speaker_id"] == "SPEAKER_00"
    assert updated_turns[0]["resolved_name"] == "Harsh Vardhan Tripathi"
