"""No network calls; validate the exact output contract at the boundary."""
import pytest
from pydantic import ValidationError

from app.schemas import CompactExtraction


def test_small_label_contract_preserves_identifiers():
    value = CompactExtraction.model_validate({
        "label_type": "small",
        "sample_id": "00125767",
        "date_sampled": "2026-09-28",
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
