"""Tests for scheduler, worker pipeline orchestration, and heartbeat reporting."""

from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from src.heartbeat import collect_system_metrics, send_heartbeat
from src.scheduler import SchedulerDaemon
from src.worker import execute_meeting_pipeline


def test_collect_system_metrics():
    """Verify system metrics collection contains all required keys."""
    metrics = collect_system_metrics(data_dir="data")
    assert "cpu_percent" in metrics
    assert "ram_percent" in metrics
    assert "disk" in metrics
    assert "uptime_seconds" in metrics
    assert "version" in metrics
    assert "timestamp" in metrics
    assert isinstance(metrics["cpu_percent"], float)
    assert isinstance(metrics["ram_percent"], float)
    assert isinstance(metrics["disk"], dict)


@patch("src.heartbeat.db_record_system_event")
def test_send_heartbeat(mock_record_event):
    """Verify send_heartbeat logs to Supabase system_events."""
    mock_record_event.return_value = True

    payload = send_heartbeat(
        status="online",
        current_meeting_id="test-meet-123",
        current_state="recording",
    )
    assert payload["status"] == "online"
    assert payload["current_meeting"] == "test-meet-123"
    assert payload["current_state"] == "recording"
    assert mock_record_event.called


@patch("src.scheduler.get_supabase_client")
@patch("src.scheduler.db_update_meeting_status")
@patch("src.scheduler.db_record_system_event")
def test_scheduler_recover_stale_jobs(mock_record_event, mock_update_status, mock_get_client):
    """Verify recover_stale_jobs finds and fails stale meetings."""
    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_select = MagicMock()
    mock_in = MagicMock()
    mock_exec = MagicMock()

    mock_client.table.return_value = mock_table
    mock_table.select.return_value = mock_select
    mock_select.in_.return_value = mock_in
    mock_in.execute.return_value = MagicMock(
        data=[{"id": "stale-1", "status": "joining"}, {"id": "stale-2", "status": "recording"}]
    )
    mock_get_client.return_value = mock_client

    daemon = SchedulerDaemon()
    daemon.recover_stale_jobs()

    assert mock_update_status.call_count == 2
    mock_update_status.assert_any_call(
        "stale-1",
        status="failed",
        error_message="Worker restarted while meeting was active. Marked failed by recovery watchdog.",
    )
    mock_update_status.assert_any_call(
        "stale-2",
        status="failed",
        error_message="Worker restarted while meeting was active. Marked failed by recovery watchdog.",
    )


@patch("src.worker.join_and_record")
@patch("src.worker.transcribe")
@patch("src.worker.diarize")
@patch("src.worker.merge_transcript_and_speakers")
@patch("src.worker.generate_mom")
@patch("src.worker.deliver")
@patch("src.worker.db_create_job")
@patch("src.worker.db_update_job")
@patch("src.worker.db_update_meeting_status")
@patch("src.worker.db_save_transcript")
@patch("src.worker.db_save_speaker_turns")
@patch("src.worker.db_save_mom")
@patch("src.worker.db_record_system_event")
def test_execute_meeting_pipeline_success(
    mock_rec_event,
    mock_save_mom,
    mock_save_speakers,
    mock_save_transcript,
    mock_update_status,
    mock_update_job,
    mock_create_job,
    mock_deliver,
    mock_gen_mom,
    mock_merge,
    mock_diarize,
    mock_transcribe,
    mock_join,
    tmp_path,
):
    """Verify the full pipeline orchestration updates Supabase and finishes successfully."""
    meeting_data = {
        "id": "meet-test-uuid",
        "meet_link": "https://meet.google.com/abc-defg-hij",
        "title": "Strategy Sync",
        "scheduled_start": datetime.now(timezone.utc).isoformat(),
        "expected_duration_minutes": 30,
    }

    mock_create_job.return_value = {"id": "job-test-uuid"}
    fake_audio = tmp_path / "audio.wav"
    fake_audio.write_text("fake audio")
    mock_join.return_value = fake_audio
    mock_transcribe.return_value = {
        "segments": [
            {
                "start": 0.0,
                "end": 30.0,
                "text": "Hello world everyone, let's get started with our quarterly sync meeting and review priorities across all engineering and product teams for this quarter.",
            },
            {
                "start": 30.5,
                "end": 50.0,
                "text": "We have several major milestones to discuss including API integration, testing coverage, and deployment timelines.",
            },
        ],
        "language": "en",
    }
    mock_diarize.return_value = {"speaker_turns": [{"speaker": "SPEAKER_00", "start": 0.0, "end": 50.0}]}
    mock_merge.return_value = {
        "turns": [
            {
                "speaker": "SPEAKER_00",
                "start": 0.0,
                "end": 50.0,
                "text": "Hello world everyone, let's get started with our quarterly sync meeting and review priorities across all engineering and product teams for this quarter. We have several major milestones to discuss including API integration, testing coverage, and deployment timelines.",
            }
        ]
    }
    mock_gen_mom.return_value = {"summary": "Great meeting", "decisions": [], "action_items": []}
    mock_deliver.return_value = {"status": "delivered"}

    jobs_dir = tmp_path / "jobs"
    recordings_dir = tmp_path / "recordings"

    success = execute_meeting_pipeline(
        meeting=meeting_data,
        jobs_dir=jobs_dir,
        recordings_dir=recordings_dir,
    )

    assert success is True
    # Verify meeting status transitions
    statuses = [c.kwargs.get("status") for c in mock_update_status.call_args_list]
    assert "recording" in statuses
    assert "processing" in statuses
    assert "completed" in statuses

    # Verify artifacts saved to Supabase
    assert mock_save_transcript.called
    assert mock_save_speakers.called
    assert mock_save_mom.called
    assert mock_deliver.called
