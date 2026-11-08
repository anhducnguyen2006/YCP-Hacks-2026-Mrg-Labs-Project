"""Normalized OCR field contract for the existing seven-column laboratory schema."""
from datetime import date
import math
import re

FIELDS = ("sample_id", "date_sampled", "date_received", "machine",
          "component", "serial_number", "reference_lube")
# Required for a useful tube record; serial/lube can be legitimately blank.
REQUIRED = ("sample_id", "date_sampled", "machine", "component")
ABSENT = {"", "N/A", "[LEAVE BLANK]", "NONE", "NULL"}


def clean_value(raw: object) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip()
    return None if value.upper() in ABSENT else value


def confidence_score(raw: object) -> float | None:
    try:
        score = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(score) or not 0 <= score <= 1:
        return None
    return score


def sampled_date(raw: object) -> tuple[str | None, bool]:
    """Translate local OCR MMDDYY to ISO; preserve malformed/partial text for review.

    Two-digit dates are interpreted as 2000-2068 / 1969-1999, following a
    documented century pivot. This is an interpretation, NOT proof of the year.
    """
    value = clean_value(raw)
    if value is None:
        return None, False
    try:
        if re.fullmatch(r"\d{6}", value):
            month, day, yy = int(value[:2]), int(value[2:4]), int(value[4:])
            year = (2000 + yy) if yy <= 68 else (1900 + yy)
            return date(year, month, day).isoformat(), True
        return date.fromisoformat(value).isoformat(), True
    except ValueError:
        return value, False


def assess_fields(fields: dict[str, dict], label_type: str) -> tuple[str, str]:
    """Conservative sample assessment. OCR text confidence isn't correctness probability."""
    missing = [key for key in REQUIRED if not clean_value(fields.get(key, {}).get("value"))]
    uncertain = []
    scores = []
    for key, data in fields.items():
        if key == "date_received":
            continue
        if (label_type == "small" and key == "reference_lube") or (
            label_type == "large" and key == "serial_number"
        ):
            continue
        if not clean_value(data.get("value")):
            continue
        score = confidence_score(data.get("confidence"))
        if score is None or score < 0.90:
            uncertain.append(key)
        else:
            scores.append(score)
    if missing:
        return "low", "Missing required OCR fields: " + ", ".join(missing)
    if uncertain:
        return "low", "Low/unknown OCR recognition confidence: " + ", ".join(uncertain)
    if not scores:
        return "low", "No usable OCR confidence evidence."
    if min(scores) >= 0.93:
        return "high", "All applicable OCR readings have scores at least 0.93; verification still required."
    return "medium", "Applicable OCR scores meet 0.90; verify against the source label."
