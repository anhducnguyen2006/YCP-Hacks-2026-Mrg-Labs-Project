import { useRef, useState } from "react";
import { Alert, Badge, Box, Button, Group, Paper, Progress, ScrollArea, Stack, Text } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Files, UploadCloud } from "lucide-react";
import { api } from "../../api";

type UploadState = "ready" | "uploading" | "queued" | "processing" | "completed" | "failed";
type UploadItem = { id: number; file: File; state: UploadState; sampleId?: string; error?: string };
const MAX_FILES = 800;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const VALID_EXTENSIONS = /\.(mov|mp4|webm)$/i;

export function BulkUpload({ batchId }: { batchId: string }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [dragging, setDragging] = useState(false);
  const nextId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const queryClient = useQueryClient();

  const changeItems = (update: (previous: UploadItem[]) => UploadItem[]) => {
    const next = update(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  };
  const status = useQuery({
    queryKey: ["batch-status", batchId],
    queryFn: () => api.batchStatus(batchId),
    enabled: items.some((item) => Boolean(item.sampleId)),
    refetchInterval: (query) => {
      const uploading = itemsRef.current.some((item) => item.state === "uploading");
      const pendingServer = (query.state.data?.queued ?? 0) + (query.state.data?.processing ?? 0);
      return uploading || pendingServer > 0 ? 3000 : false;
    },
  });
  const serverStates = new Map((status.data?.items ?? []).map((item) => [item.id, item.status]));
  const effectiveState = (item: UploadItem) =>
    item.sampleId ? (serverStates.get(item.sampleId) ?? item.state) : item.state;
  const done = items.filter((item) => effectiveState(item) === "completed").length;
  const errors = items.filter((item) => effectiveState(item) === "failed").length;
  const inProgress = items.filter((item) => ["uploading", "queued", "processing"].includes(effectiveState(item))).length;

  const addFiles = (files: File[]) => {
    if (running) return;
    const allowed = files.filter((file) =>
      VALID_EXTENSIONS.test(file.name) && file.size > 0 && file.size <= MAX_FILE_SIZE
    );
    const rejected = files.length - allowed.length;
    const slots = Math.max(0, MAX_FILES - itemsRef.current.length);
    const accepted = allowed.slice(0, slots);
    if (rejected || accepted.length < allowed.length) {
      setNotice(`${rejected} invalid/oversized file(s), ${allowed.length - accepted.length} over the ${MAX_FILES}-video limit. Maximum 50 MB per video.`);
    } else setNotice(null);
    changeItems((previous) => [...previous, ...accepted.map((file) => ({
      id: ++nextId.current, file, state: "ready" as const,
    }))]);
  };
  const patch = (id: number, changes: Partial<UploadItem>) =>
    changeItems((previous) => previous.map((item) => item.id === id ? { ...item, ...changes } : item));

  const runQueue = async (onlyFailures = false) => {
    if (running) return;
    setRunning(true);
    const tasks = itemsRef.current.filter((item) =>
      onlyFailures ? effectiveState(item) === "failed" : item.state === "ready"
    );
    let cursor = 0;
    const worker = async () => {
      while (cursor < tasks.length) {
        const item = tasks[cursor++];
        try {
          if (item.sampleId) {
            patch(item.id, { state: "queued", error: undefined });
            await api.analyze(item.sampleId);
          } else {
            patch(item.id, { state: "uploading", error: undefined });
            const sample = await api.uploadSample(batchId, item.file);
            patch(item.id, { state: "queued", sampleId: sample.id });
            await api.analyze(sample.id);
          }
        } catch (error) {
          patch(item.id, {
            state: "failed",
            error: error instanceof Error ? error.message : "Request failed",
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, () => worker()));
    setRunning(false);
    void queryClient.invalidateQueries({ queryKey: ["batch-status", batchId] });
    void queryClient.invalidateQueries({ queryKey: ["samples", batchId] });
    void queryClient.invalidateQueries({ queryKey: ["review-samples", batchId] });
  };

  const visible = showAll ? items : items.slice(0, 30);
  return <Stack gap="md">
    <Text size="sm" c="dimmed">Drop up to 800 rotation videos. Uploads use two concurrent connections; analysis runs through the existing background worker queue.</Text>
    <Box
      role="button"
      tabIndex={running ? -1 : 0}
      aria-label="Drop sample videos or browse files"
      className={`bulk-dropzone${dragging ? " bulk-dropzone-active" : ""}`}
      onClick={() => { if (!running) fileInput.current?.click(); }}
      onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !running) { event.preventDefault(); fileInput.current?.click(); } }}
      onDragOver={(event) => { event.preventDefault(); }}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}
      style={{ cursor: running ? "not-allowed" : "pointer" }}
    >
      <UploadCloud size={32} color="#288647" />
      <Text fw={700} size="sm">Drop MOV, MP4, or WebM videos here</Text>
      <Text c="dimmed" size="xs">Or click to browse · Up to 50 MB each</Text>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".mov,.mp4,.webm,video/quicktime,video/mp4,video/webm"
        aria-label="Select multiple sample videos"
        style={{ display: "none" }}
        onChange={(event) => { addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }}
      />
    </Box>
    {notice && <Alert color="yellow" icon={<AlertCircle size={16} />}>{notice}</Alert>}
    {status.isError && <Alert color="yellow">Could not refresh batch processing status: {status.error.message}</Alert>}
    {items.length > 0 && <>
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <Badge color="gray">{items.length} selected</Badge>
          <Badge color="green">{done} completed</Badge>
          {inProgress > 0 && <Badge color="blue">{inProgress} active</Badge>}
          {errors > 0 && <Badge color="red">{errors} failed</Badge>}
        </Group>
        <Group gap="xs">
          <Button variant="default" size="xs" disabled={running} onClick={() => {
            changeItems((current) => current.filter((item) => item.sampleId));
            setNotice(null);
          }}>Clear unuploaded</Button>
          <Button size="xs" color="green" leftSection={<Files size={16} />} loading={running}
            disabled={running || !items.some((item) => item.state === "ready")}
            onClick={() => void runQueue()}>Upload & analyze</Button>
          {errors > 0 && <Button variant="light" size="xs" color="red" disabled={running}
            onClick={() => void runQueue(true)}>Retry failed</Button>}
        </Group>
      </Group>
      <Progress value={items.length ? Math.round(done / items.length * 100) : 0} color="green" size="lg" aria-label="Batch analysis completion" />
      <ScrollArea.Autosize mah={330} type="auto">
        <Stack gap={5}>
          {visible.map((item) => {
            const state = effectiveState(item);
            return <Paper key={item.id} withBorder p="xs" radius="sm">
              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Text size="xs" fw={600} truncate>{item.file.name}</Text>
                  {item.error && <Text size="xs" c="red">{item.error}</Text>}
                </Box>
                <Badge size="xs" color={state === "completed" ? "green" : state === "failed" ? "red" : state === "ready" ? "gray" : "blue"}>
                  {state === "completed" ? <CheckCircle2 size={12} /> : state}
                </Badge>
              </Group>
            </Paper>;
          })}
        </Stack>
      </ScrollArea.Autosize>
      {items.length > 30 && <Button size="xs" variant="subtle" onClick={() => setShowAll((old) => !old)}>
        {showAll ? "Show first 30" : `Show all ${items.length} videos`}
      </Button>}
      <Text size="xs" c="dimmed">Keep this page open while uploads are in progress. Background analysis continues after uploads finish.</Text>
    </>}
  </Stack>;
}
