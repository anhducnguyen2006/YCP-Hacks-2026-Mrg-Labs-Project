"""No network calls; validate the exact output contract at the boundary."""
import pytest
from pydantic import ValidationError

from app.schemas import CompactExtraction


def test_small_label_contract_preserves_identifiers():
    value = CompactExtraction.model_validate({
        "label_type": "small",
        "sample_id": "00125767",
        "date_sampled": "2026-09-28",
        "date_sampled_raw": "09/28/26",
        "machine": "UP 7246",
        "component": "5 NGS",
        "serial_number": "My1207238",
        "reference_lube": None,
        "uncertain_fields": ["serial_number"],
        "unreadable_fields": [],
        "overall_confidence": "medium",
        "confidence_reason": "The handwritten serial number is visually ambiguous.",
    })
    assert value.sample_id == "00125767"
    assert value.serial_number == "My1207238"
    assert value.overall_confidence == "medium"
    assert value.date_sampled_raw == "09/28/26"
    assert "ambiguous" in value.confidence_reason


def test_rejects_unexpected_model_keys():
    with pytest.raises(ValidationError):
        CompactExtraction.model_validate({
            "label_type": "small",
            "tracking_number": "125767",
            "sample_id": None,
            "date_sampled": None,
            "machine": None,
            "component": None,
            "serial_number": None,
            "reference_lube": None,
            "uncertain_fields": [],
            "unreadable_fields": [],
        })

def test_request_has_no_automatic_retries_and_a_bounded_timeout(monkeypatch):
    """A slow or quota-limited model must not occupy RQ for five minutes."""
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from app import gemini_frames
    from app.frame_selection import SelectedFrame

    monkeypatch.setattr(gemini_frames, "get_settings", lambda: SimpleNamespace(
        gemini_api_key="local-fake-key", gemini_model="gemini-3.6-flash",
        gemini_thinking_level="minimal", gemini_request_timeout_seconds=120,
    ))
    sdk = MagicMock()
    sdk.interactions.create.return_value.output_text = CompactExtraction(
        label_type="small", sample_id="00125767", date_sampled=None, date_sampled_raw="09/28/26",
        machine="UP 7246", component="5 NGS", serial_number="My1207238",
        reference_lube=None, uncertain_fields=[], unreadable_fields=[],
        overall_confidence="high", confidence_reason="The text is legible.",
    ).model_dump_json()
    client = MagicMock(return_value=sdk)
    monkeypatch.setattr(gemini_frames.genai, "Client", client)

    result = gemini_frames.analyze_selected_frames([
        SelectedFrame(timestamp_seconds=0.25, jpeg=b"some-jpeg", sharpness=2.5)
    ])

    assert result.serial_number == "My1207238"
    assert client.call_args.kwargs["http_options"].retry_options.attempts == 1
    assert sdk.interactions.create.call_args.kwargs["timeout"] == 120
    assert sdk.close.called


def test_http_429_is_reported_as_rate_limit_without_retry(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from google.genai import errors

    from app import gemini_frames
    from app.frame_selection import SelectedFrame

    monkeypatch.setattr(gemini_frames, "get_settings", lambda: SimpleNamespace(
        gemini_api_key="local-fake-key", gemini_model="gemini-3.6-flash",
        gemini_thinking_level="minimal", gemini_request_timeout_seconds=120,
    ))
    sdk = MagicMock()
    sdk.interactions.create.side_effect = errors.ClientError(
        429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Quota reached"}}
    )
    monkeypatch.setattr(gemini_frames.genai, "Client", lambda **kwargs: sdk)

    with pytest.raises(gemini_frames.GeminiRateLimitError, match="HTTP 429"):
        gemini_frames.analyze_selected_frames([
            SelectedFrame(timestamp_seconds=0.25, jpeg=b"some-jpeg", sharpness=2.5)
        ])
    assert sdk.interactions.create.call_count == 1
    assert sdk.close.called

def test_interactions_sdk_429_is_detected(monkeypatch):
    """Interactions emits RateLimitError, not google.genai.errors.ClientError."""
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from app import gemini_frames
    from app.frame_selection import SelectedFrame

    monkeypatch.setattr(gemini_frames, "get_settings", lambda: SimpleNamespace(
        gemini_api_key="fake", gemini_model="gemini-3.6-flash",
        gemini_thinking_level="minimal", gemini_request_timeout_seconds=120,
    ))
    sdk = MagicMock()
    RateLimitError = type("RateLimitError", (Exception,), {})
    sdk.interactions.create.side_effect = RateLimitError(
        "Error code: 429 - Rate limit exceeded (20 requests per day)")
    monkeypatch.setattr(gemini_frames.genai, "Client", lambda **kwargs: sdk)
    with pytest.raises(gemini_frames.GeminiRateLimitError, match="HTTP 429"):
        gemini_frames.analyze_selected_frames([
            SelectedFrame(timestamp_seconds=0.25, jpeg=b"some-jpeg", sharpness=2.5)
        ])
    assert sdk.interactions.create.call_count == 1
    assert sdk.close.called


def test_interactions_sdk_503_is_detected(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from app import gemini_frames
    from app.frame_selection import SelectedFrame

    monkeypatch.setattr(gemini_frames, "get_settings", lambda: SimpleNamespace(
        gemini_api_key="fake", gemini_model="gemini-3.6-flash",
        gemini_thinking_level="minimal", gemini_request_timeout_seconds=120,
    ))
    sdk = MagicMock()
    InternalServerError = type("InternalServerError", (Exception,), {})
    sdk.interactions.create.side_effect = InternalServerError(
        "Error code: 503 - service_unavailable")
    monkeypatch.setattr(gemini_frames.genai, "Client", lambda **kwargs: sdk)
    with pytest.raises(gemini_frames.GeminiUnavailableError, match="HTTP 503"):
        gemini_frames.analyze_selected_frames([
            SelectedFrame(timestamp_seconds=0.25, jpeg=b"some-jpeg", sharpness=2.5)
        ])
    assert sdk.interactions.create.call_count == 1
    assert sdk.close.called
