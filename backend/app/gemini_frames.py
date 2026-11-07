"""One Gemini Interactions request containing multiple locally selected images."""
import base64
from collections.abc import Sequence

from google import genai
from google.genai import errors, types

from app.config import get_settings
from app.frame_selection import SelectedFrame
from app.schemas import CompactExtraction


PROMPT = """Read a laboratory sample label across these time-ordered frames of ONE rotating tube.
Each frame may show a different section of the same cylindrical label. Combine evidence
across images; do not concatenate unrelated characters. Do not guess unreadable handwriting.
Return EXACTLY the JSON schema requested. Keep IDs and serial numbers as strings, preserving
case and leading zeros when legible. Use null for missing or unreadable fields and list
uncertain field keys under uncertain_fields or unreadable_fields. Never fabricate values.
Large: barcode=sample_id, Date=date_sampled, Equip ID=machine,
Sample point=component, Ref Lube=reference_lube; serial_number=null.
Small: barcode=sample_id, Date=date_sampled, RN=machine, SN=serial_number,
component is the CIRCLED number (1-6) and CIRCLED GS or NGS; reference_lube=null.
Date Received is supplied by the batch and MUST NOT be inferred or returned.
label_type must be small, large, or unknown.
DATE TRANSCRIPTION IS A SEPARATE TASK FROM DATE INTERPRETATION:
1) date_sampled_raw MUST be an exact transcription of the characters visibly
written in the Date box. Preserve separators and incomplete years (e.g.
09/28/6 or 09/28/??). Use null if the date box is illegible or absent.
Never silently complete a year in date_sampled_raw.
2) date_sampled is an ISO YYYY-MM-DD *candidate* ONLY when the FULL four-digit
year, month and day are visibly clear. Otherwise use null. Do not infer the
century or year from Date Received, today's date, or the rest of the sample.
3) If several frames conflict, reproduce the clearest visible date in
date_sampled_raw, mark date_sampled as uncertain, and do not claim high
overall confidence. In particular, distinguish 10/05 versus 04/28 and
handwritten 2/6, 0/6, 3/8 and 1/7 carefully.
The backend independently normalizes abbreviated years from date_sampled_raw
and flags any conflict or implausible date; do NOT invent a full year here.
If uncertain, mark date_sampled for manual review.
For the entire sample, also report overall_confidence as "high", "medium", or "low".
This is a SUBJECTIVE visual reading confidence, not a probability of correctness.
HIGH: all applicable fields appear legible, consistent across frames, and no
unresolved ambiguities. MEDIUM: one or more fields are difficult to read,
but enough evidence supports a plausible transcription. LOW: key fields are
unreadable, contradictory, truncated, or visibly ambiguous.
Do not let human-provided Date Received or inapplicable fields influence confidence.
Be conservative, especially with handwriting, digits, and abbreviated machine IDs.
Provide confidence_reason (one short factual sentence citing visible uncertainty).
Keys: label_type, sample_id, date_sampled, date_sampled_raw, machine, component, serial_number,
reference_lube, uncertain_fields, unreadable_fields, overall_confidence,
confidence_reason.
"""


class GeminiRateLimitError(RuntimeError):
    """Gemini refused the request because this project is rate/quota limited."""


class GeminiUnavailableError(RuntimeError):
    """Gemini is temporarily unavailable due to service capacity."""


def _is_status(exc: Exception, code: int) -> bool:
    """Recognize both standard google.genai and Interactions SDK errors.

    Interactions wraps some API errors in google.genai._gaos exceptions that
    are NOT subclasses of google.genai.errors.APIError. Keep detection narrow
    and avoid depending on private SDK module imports.
    """
    if isinstance(exc, errors.APIError):
        return exc.code == code
    if code == 429 and type(exc).__name__ == "RateLimitError":
        return "429" in str(exc) or "rate limit" in str(exc).lower()
    if code == 503 and type(exc).__name__ == "InternalServerError":
        return "503" in str(exc) or "service_unavailable" in str(exc).lower()
    return False


def analyze_selected_frames(frames: Sequence[SelectedFrame]) -> CompactExtraction:
    if not frames:
        raise ValueError("Cannot analyze an empty set of frames.")
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    images = [
        {
            "type": "image",
            "data": base64.b64encode(frame.jpeg).decode("ascii"),
            "mime_type": "image/jpeg",
        }
        for frame in frames
    ]
    # A single 429 must not keep the only worker busy for five minutes while
    # SDK retries sleep. Retrying a project-level quota limit is a policy/UI
    # decision made after checking usage, not part of one video extraction.
    client = genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )
    try:
        interaction = client.interactions.create(
            model=settings.gemini_model,
            input=[{"type": "text", "text": PROMPT}, *images],
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": CompactExtraction.model_json_schema(),
            },
            generation_config={"thinking_level": settings.gemini_thinking_level},
            timeout=settings.gemini_request_timeout_seconds,
        )
    except Exception as exc:
        # The Interactions API has a separate SDK exception hierarchy for 429
        # and 503. Do not accidentally turn these into opaque "analysis failed".
        if _is_status(exc, 429):
            raise GeminiRateLimitError(
                "Gemini rate or quota limit (HTTP 429). Check the selected "
                "Google AI project and retry after its quota resets."
            ) from exc
        if _is_status(exc, 503):
            raise GeminiUnavailableError(
                "Gemini model capacity unavailable (HTTP 503). Try again later."
            ) from exc
        raise
    finally:
        client.close()
    if not interaction.output_text:
        raise RuntimeError("Gemini returned no extraction text.")
    return CompactExtraction.model_validate_json(interaction.output_text)
