"""Conservative normalization of Gemini's literal handwritten date transcription.

Dates are transcribed visually first. We normalize only supported formats rather
than asking Gemini to invent century/month/day information. This never rewrites
existing reviewed records, and ambiguous cases remain reviewable.
"""
from dataclasses import dataclass
from datetime import date
import re


_MONTHS = {month: n for n, month in enumerate((
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
), start=1)}


@dataclass(frozen=True)
class DateDecision:
    value: str | None
    note: str
    confidence_cap: str | None = None


def _calendar_day(month: int, day: int, year: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def resolve_sampled_date(
    literal: str | None,
    model_normalized: str | None,
    receiving_date: str,
) -> DateDecision:
    """Prefer legible literal evidence over Gemini's inferred ISO date.

    The batch receiving year is *only* a hint for abbreviated year notation.
    A single-digit year matching it is provisional and always flagged; missing
    years stay blank. No 2016->2026 mass rewrite is attempted.
    """
    received = date.fromisoformat(receiving_date)
    raw = (literal or "").strip()
    if not raw or raw.lower() in {"null", "none", "n/a", "unreadable", "blank", "-"}:
        if model_normalized:
            return DateDecision(
                None, "Gemini proposed a date without a verbatim transcription "
                "of the label. Left blank for verification.", "low",
            )
        return DateDecision(None, "No reliably legible date was transcribed.")

    if "?" in raw or "…" in raw:
        return DateDecision(
            None, f'Date on label: "{raw}". Incomplete characters; '
            "year/month/day cannot be inferred safely.", "medium",
        )

    month: int
    day: int
    year_digits: str
    inferred = False
    normalized: date | None = None

    # Unambiguous full year-first notation such as 2026-09-28.
    iso_match = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", raw)
    if iso_match:
        yyyy, mm, dd = map(int, iso_match.groups())
        normalized = _calendar_day(mm, dd, yyyy)
    else:
        # The laboratory's label convention is US month/day/year.
        us_match = re.fullmatch(r"(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{1,4})", raw)
        named_match = re.fullmatch(
            r"(\d{1,2})\s*[- /]?\s*([A-Za-z]{3,9})\s*[- /]?\s*(\d{1,4})", raw,
        )
        if us_match:
            mm, dd, year_digits = us_match.groups()
            month, day = int(mm), int(dd)
        elif named_match and named_match.group(2).lower()[:3] in _MONTHS:
            dd, name, year_digits = named_match.groups()
            month, day = _MONTHS[name.lower()[:3]], int(dd)
        else:
            return DateDecision(
                None, f'Date on label: "{raw}". Unsupported or ambiguous format; '
                "leave blank for manual verification.", "medium",
            )

        if len(year_digits) == 4:
            year = int(year_digits)
        elif len(year_digits) == 2:
            year = (received.year // 100) * 100 + int(year_digits)
            inferred = True
        elif len(year_digits) == 1 and int(year_digits) == received.year % 10:
            year = received.year
            inferred = True
        else:
            return DateDecision(
                None, f'Date on label: "{raw}". Year is incomplete or ambiguous; '
                "leave blank for manual verification.", "medium",
            )
        normalized = _calendar_day(month, day, year)

    if normalized is None:
        return DateDecision(
            None, f'Date on label: "{raw}". Invalid calendar date; '
            "leave blank for manual verification.", "low",
        )
    if normalized > received:
        return DateDecision(
            None, f'Date on label: "{raw}". Parsed date is after the batch '
            "receiving date; verification required.", "low",
        )

    notes = [f'Date on label: "{raw}" → {normalized.isoformat()}.']
    cap = "medium" if inferred else None
    if inferred:
        notes.append(
            "Abbreviated year expanded using the batch receiving year "
            "(a provisional interpretation; verify the original)."
        )

    if model_normalized and model_normalized != normalized.isoformat():
        notes.append(
            f"Gemini's separate ISO interpretation was {model_normalized}; "
            "it conflicts with the literal transcription, so verify the image."
        )
        cap = "low"

    # Older samples are possible, so warn rather than replacing dates.
    if (received - normalized).days > 365 * 5:
        notes.append(
            "Sample date predates receipt by more than five years; "
            "verify against the original label."
        )
        cap = "low"

    return DateDecision(normalized.isoformat(), " ".join(notes), cap)
