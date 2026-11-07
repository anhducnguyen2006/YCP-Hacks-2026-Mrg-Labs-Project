"""One Gemini Interactions request containing multiple locally selected images."""
import base64
from collections.abc import Sequence

from google import genai

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
label_type must be small, large, or unknown. Dates: YYYY-MM-DD when unambiguous.
Pay particular attention to visually similar handwritten 3/8, 6/8, 2/7.
If uncertain, mark the corresponding field for manual review.
For the entire sample, also report overall_confidence as "high", "medium", or "low".
This is a SUBJECTIVE visual reading confidence, not a probability of correctness.
HIGH: all applicable fields appear legible, consistent across frames, and no
unresolved ambiguities. MEDIUM: one or more fields are difficult to read,
but enough evidence supports a plausible transcription. LOW: key fields are
unreadable, contradictory, truncated, or visibly ambiguous.
Do not let human-provided Date Received or inapplicable fields influence confidence.
Be conservative, especially with handwriting, digits, and abbreviated machine IDs.
Provide confidence_reason (one short factual sentence citing visible uncertainty).
Keys: label_type, sample_id, date_sampled, machine, component, serial_number,
reference_lube, uncertain_fields, unreadable_fields, overall_confidence,
confidence_reason.
"""


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
    client = genai.Client(api_key=settings.gemini_api_key)
    interaction = client.interactions.create(
        model=settings.gemini_model,
        input=[{"type": "text", "text": PROMPT}, *images],
        response_format={
            "type": "text",
            "mime_type": "application/json",
            "schema": CompactExtraction.model_json_schema(),
        },
        generation_config={"thinking_level": settings.gemini_thinking_level},
    )
    if not interaction.output_text:
        raise RuntimeError("Gemini returned no extraction text.")
    return CompactExtraction.model_validate_json(interaction.output_text)
