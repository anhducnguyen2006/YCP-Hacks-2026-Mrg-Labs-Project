from app.schemas import ExtractionResponse


def test_large_label_preserves_string_identifiers() -> None:
    result = ExtractionResponse.model_validate(
        {
            "label_type": "large",
            "fields": {
                "sample_id": {"value": "00123779", "status": "extracted"},
                "machine": {"value": "53279869", "status": "extracted"},
                "component": {"value": "420 NDF", "status": "extracted"},
                "serial_number": {"value": None, "status": "not_applicable"},
                "reference_lube": {"value": "Adjusting Side", "status": "extracted"},
            },
        }
    )
    assert result.fields.sample_id.value == "00123779"
    assert result.fields.serial_number.status == "not_applicable"


def test_small_label_requires_physical_circled_component_value() -> None:
    result = ExtractionResponse.model_validate(
        {
            "label_type": "small",
            "fields": {
                "sample_id": {"value": "111329", "status": "extracted"},
                "component": {"value": "4 GS", "status": "extracted"},
                "reference_lube": {"value": None, "status": "not_applicable"},
            },
        }
    )
    assert result.label_type == "small"
    assert result.fields.component.value == "4 GS"


def test_missing_handwritten_date_is_explicit() -> None:
    result = ExtractionResponse.model_validate(
        {"label_type": "unknown", "fields": {"date_sampled": {"status": "missing", "reason": "Not visible"}}}
    )
    assert result.fields.date_sampled.value is None
    assert result.fields.date_sampled.status == "missing"
