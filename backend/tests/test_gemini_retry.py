from pathlib import Path

from app.gemini import GeminiExtractionService, TransientGeminiError
from app.schemas import ExtractionResponse


def test_auto_mode_uses_only_remaining_attempt_budget() -> None:
    service = object.__new__(GeminiExtractionService)
    service.input_mode = "auto"
    service.max_attempts = 3

    def failed_video(path: Path, attempt_budget: int) -> ExtractionResponse:
        assert attempt_budget == 3
        raise TransientGeminiError(RuntimeError("503"), attempts=2)

    expected = ExtractionResponse.model_validate({"label_type": "unknown", "fields": {}})
    service._extract_video = failed_video
    service.extract_frames = lambda path, attempt_budget: (
        assert_remaining(attempt_budget, expected)
    )

    assert service.extract(Path("sample.MOV")) == expected


def assert_remaining(attempt_budget: int | None, expected: ExtractionResponse) -> ExtractionResponse:
    assert attempt_budget == 1
    return expected


def test_transient_error_preserves_attempt_count() -> None:
    error = TransientGeminiError(RuntimeError("provider unavailable"), attempts=2)

    assert error.attempts == 2
    assert str(error) == "provider unavailable"
