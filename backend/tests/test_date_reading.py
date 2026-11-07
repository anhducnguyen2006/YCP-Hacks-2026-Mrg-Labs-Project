"""Date interpretation must not introduce guessed years or overwrite evidence."""
import pytest

from app.date_reading import resolve_sampled_date


@pytest.mark.parametrize("raw,model,expected,cap", [
    ("09/28/26", "2016-09-28", "2026-09-28", "low"),
    ("10/05/26", "2016-10-05", "2026-10-05", "low"),
    ("09/28/26", "2020-04-28", "2026-09-28", "low"),
    ("09/28/26", "2026-09-28", "2026-09-28", "medium"),
    ("09/28/6", "2016-09-28", "2026-09-28", "low"),
    ("09/28/2026", "2026-09-28", "2026-09-28", None),
    ("2026-09-28", "2026-09-28", "2026-09-28", None),
    ("8Sep26", "2026-09-08", "2026-09-08", "medium"),
    ("09/28/??", "2016-09-28", None, "medium"),
    ("09/15", None, None, "medium"),
    ("09/31/26", None, None, "low"),
    ("02/29/25", None, None, "low"),
    ("12/31/26", "2026-12-31", None, "low"),
    ("10/05/2016", "2016-10-05", "2016-10-05", "low"),
    ("09/28/5", None, None, "medium"),
    (None, "2016-09-28", None, "low"),
    (None, None, None, None),
])
def test_sampled_date_uses_verbatim_evidence(raw, model, expected, cap):
    decision = resolve_sampled_date(raw, model, "2026-11-07")
    assert decision.value == expected
    assert decision.confidence_cap == cap
    if raw:
        assert raw in decision.note


def test_leading_zeros_and_normalized_date():
    decision = resolve_sampled_date("09/07/26", "2026-09-07", "2026-11-07")
    assert decision.value == "2026-09-07"


def test_no_century_assumption_when_one_digit_does_not_match_receiving_year():
    decision = resolve_sampled_date("09/28/7", None, "2026-11-07")
    assert decision.value is None
    assert "ambiguous" in decision.note
