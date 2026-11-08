"""Guard the boundary between per-frame OCR, structured data and review signals."""
import pytest

from app.ocr_contract import assess_fields, clean_value, confidence_score, sampled_date


@pytest.mark.parametrize(("raw", "expected", "valid"), [
    ("110826", "2026-11-08", True),
    ("2026-11-08", "2026-11-08", True),
    ("022926", "022926", False),
    ("13/10/26", "13/10/26", False),
    ("11/08", "11/08", False),
    ("N/A", None, False),
    ("", None, False),
])
def test_ocr_date_normalization(raw, expected, valid):
    assert sampled_date(raw) == (expected, valid)


def test_input_confidence_is_not_calibrated_accuracy():
    assert confidence_score(0.95) == 0.95
    assert confidence_score("0.81") == 0.81
    assert confidence_score(-1) is None
    assert confidence_score(1.7) is None
    assert confidence_score(float("nan")) is None


def test_missing_required_fields_cannot_report_high_confidence():
    minimal = {"sample_id": {"value": "00001234", "confidence": .99}}
    rating, reason = assess_fields(minimal, "small")
    assert rating == "low" and "date_sampled" in reason


def test_complete_fields_with_optional_blank_have_high_summary():
    fields = {
        "sample_id": {"value": "00001234", "confidence": .98},
        "date_sampled": {"value": "2026-11-08", "confidence": .97},
        "machine": {"value": "UP 5258", "confidence": .97},
        "component": {"value": "5 GS", "confidence": .96},
        "serial_number": {"value": "N/A", "confidence": 0.0},
        "reference_lube": {"value": "[Leave Blank]", "confidence": 1.0},
    }
    assert assess_fields(fields, "small")[0] == "high"
    assert clean_value(fields["serial_number"]["value"]) is None
    fields["date_sampled"]["confidence"] = .50
    assert assess_fields(fields, "small")[0] == "low"
