const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type Batch = {
  id: string;
  name: string;
  receiving_date: string;
  default_export_filename: string;
  created_at: string;
  updated_at: string;
};

export type BatchStatus = {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  needs_review: number;
  items: { id: string; status: string }[];
};

export type InventoryResponse = { total: number; items: Sample[] };

export type SampleField = {
  id: string;
  field_key: string;
  predicted_value: string | null;
  current_value: string | null;
  confidence: number | null;
  confidence_source: string | null;
  status: string;
  review_required: boolean;
  reviewed: boolean;
  review_reason: string | null;
};

export type SampleMedia = {
  id: string;
  media_type: "video" | "keyframe";
  mime_type: string;
  metadata_json: Record<string, string | number>;
};

export type Sample = {
  id: string;
  batch_id: string;
  external_sample_id: string | null;
  label_type: string;
  processing_status: string;
  review_status: string;
  ai_confidence: "high" | "medium" | "low" | null;
  ai_confidence_reason: string | null;
  created_at: string;
  updated_at: string;
  fields: SampleField[];
  media: SampleMedia[];
  latest_job: { status: string; current_stage: string; error_message: string | null } | null;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  baseUrl: API_BASE_URL,
  batches: () => request<Batch[]>("/api/batches"),
  batchStatus: (batchId: string) => request<BatchStatus>(`/api/batches/${encodeURIComponent(batchId)}/status`),
  deleteSamples: (batchId: string, sampleIds: string[]) =>
    request<{ deleted: number }>(`/api/batches/${encodeURIComponent(batchId)}/samples/delete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sample_ids: sampleIds }),
    }),
  inventory: (batchId: string, options: { search: string; status: string; confidence: string; sortBy: string; descending: boolean; offset: number }) => {
    const params = new URLSearchParams({
      search: options.search, status: options.status, confidence: options.confidence, sort_by: options.sortBy,
      descending: String(options.descending), offset: String(options.offset), limit: "50",
    });
    return request<InventoryResponse>(`/api/batches/${encodeURIComponent(batchId)}/inventory?${params}`);
  },
  exportBatch: async (batchId: string, reviewedOnly = false): Promise<Blob> => {
    const response = await fetch(
      `${API_BASE_URL}/api/batches/${encodeURIComponent(batchId)}/export.csv?reviewed_only=${reviewedOnly}`
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail ?? `Export failed (${response.status})`);
    }
    return response.blob();
  },
  createBatch: (payload: Pick<Batch, "name" | "receiving_date" | "default_export_filename">) =>
    request<Batch>("/api/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  samples: (batchId: string, offset = 0) => request<Sample[]>(`/api/batches/${batchId}/samples?offset=${offset}&limit=50`),
  uploadSample: (batchId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Sample>(`/api/batches/${batchId}/samples`, { method: "POST", body: form });
  },
  analyze: (sampleId: string) => request<Sample>(`/api/samples/${sampleId}/analyze`, { method: "POST" }),
  sample: (sampleId: string) => request<Sample>(`/api/samples/${sampleId}`),
  updateField: (sampleId: string, fieldKey: string, value: string) =>
    request<Sample>(`/api/samples/${sampleId}/fields/${fieldKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_value: value }),
    }),
  mediaUrl: (mediaId: string) => `${API_BASE_URL}/api/media/${mediaId}`,
};
