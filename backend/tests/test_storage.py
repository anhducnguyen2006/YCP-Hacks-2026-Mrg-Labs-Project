import pytest

from app.storage import validate_filename


def test_supported_video_extensions_are_accepted() -> None:
    assert validate_filename("tube.MP4") == "tube.MP4"
    assert validate_filename("tube.mov") == "tube.mov"
    assert validate_filename("tube.webm") == "tube.webm"


@pytest.mark.parametrize("filename", ["sample.pdf", "sample.png", None, "sample"])
def test_unsupported_video_extensions_are_rejected(filename: str | None) -> None:
    with pytest.raises(ValueError, match="Unsupported video extension"):
        validate_filename(filename)
