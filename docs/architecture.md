# Architecture

## Current integration

The latest frontend design stays unchanged. `ScanPage` uses a typed `frontend/src/api.ts` client to create batches, upload one video per sample, and request analysis. `ReviewPage` fetches persisted samples with source media and allows individual field corrections. `TemplatesPage` currently offers only the blank CSV header template.

The backend now implements the expected API routes.

```text
React ScanPage
  -> POST /api/batches
  -> POST /api/batches/{id}/samples (save original video)
  -> POST /api/samples/{id}/analyze
  -> Redis / RQ -> app.jobs.process_sample
       -> OpenCV decode up to 32 candidate frames
       -> select ~8 sharp, time-distributed frames
       -> one Gemini Interactions request with 8 JPEG images
       -> Pydantic CompactExtraction validation
       -> add user-supplied Date Received, enforce label rules
       -> SQLAlchemy sample fields and keyframe media
  -> GET /api/samples/{id} (status polling)
  -> ReviewPage /api/batches/{id}/samples
       -> PATCH field value -> human verification
```

PostgreSQL stores batches, samples, field values, media metadata, processing jobs. Files reside in a local shared media volume. Redis carries jobs, and the RQ worker performs Gemini requests outside the web request lifetime. The API never directly sends videos to Gemini: the worker sends only selected JPEG stills.

## Current limitations

- The frontend shows the first selected image, not a full frame-gallery/stitched label.
- Model output is **not** independently corroborated. Human review remains required.
- The worker has a single-sample pipeline; rate-limit budgets, idempotency under concurrent clicks, retries, cancellation and restart recovery need hardening before 800-sample scale.
- The original video is kept. Selected frames are also stored for review.
- Only metadata and file extensions are checked at upload time; OpenCV rejects unreadable videos when processing.
- Sample CSV export beyond the blank template remains future work.
- Model token usage, throughput, and real-label accuracy are not benchmarked here.
