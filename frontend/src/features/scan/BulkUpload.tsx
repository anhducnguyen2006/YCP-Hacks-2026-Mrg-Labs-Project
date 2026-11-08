import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Box, Button, Divider, Group, Modal, Paper, Progress, ScrollArea, Stack, Text } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Files, Pause, Play, UploadCloud, Ban, RotateCcw, Camera, Square } from "lucide-react";
import { api } from "../../api";

type UploadState = "ready" | "uploading" | "queued" | "processing" | "completed" | "failed" | "canceled" | "paused";
type UploadItem = { id: number; file: File; state: UploadState; sampleId?: string; error?: string };
const MAX_FILES = 800;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_RECORDING_MS = 15_000;
const VALID_EXTENSIONS = /\.(mov|mp4|webm)$/i;

export function BulkUpload({ batchId }: { batchId: string }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const pauseRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const nextId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoPreview = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const discardRecording = useRef(false);
  const recordingStartedAt = useRef(0);
  const recordingTimer = useRef<number | undefined>(undefined);
  const recordingStopTimer = useRef<number | undefined>(undefined);
  const itemsRef = useRef(items);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!cameraOpen) return;
    let canceled = false;
    setCameraReady(false);
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setCameraError("Camera recording is not supported in this browser. Try a current version of Chrome or Edge.");
      return;
    }
    void navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (canceled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStream.current = stream;
        if (videoPreview.current) videoPreview.current.srcObject = stream;
      })
      .catch((error: unknown) => {
        if (canceled) return;
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        setCameraError(denied
          ? "Camera access was blocked. Allow camera access in your browser settings, then try again."
          : "Could not open the desktop camera. Check that it is connected and not in use by another app.");
      });
    return () => { canceled = true; };
  }, [cameraOpen]);

  useEffect(() => () => {
    window.clearInterval(recordingTimer.current);
    window.clearTimeout(recordingStopTimer.current);
    discardRecording.current = true;
    if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
    cameraStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const changeItems = (update: (previous: UploadItem[]) => UploadItem[]) => {
    const next = update(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  };
  const status = useQuery({
    queryKey: ["batch-status", batchId],
    queryFn: () => api.batchStatus(batchId),
    enabled: true,
    refetchInterval: (query) => {
      const uploading = itemsRef.current.some((item) => item.state === "uploading");
      const pendingServer = (query.state.data?.queued ?? 0) + (query.state.data?.processing ?? 0);
      return uploading || pendingServer > 0 ? 3000 : 10000;
    },
  });
  const serverStates = new Map((status.data?.items ?? []).map((item) => [item.id, item.status]));
  const effectiveState = (item: UploadItem) =>
    item.sampleId ? (serverStates.get(item.sampleId) ?? item.state) : item.state;
  const done = items.filter((item) => effectiveState(item) === "completed").length;
  const errors = items.filter((item) => effectiveState(item) === "failed").length;
  const canceled = items.filter((item) => effectiveState(item) === "canceled").length;
  const pausedCount = items.filter((item) => effectiveState(item) === "paused").length;
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
  const stopRecording = () => {
    window.clearInterval(recordingTimer.current);
    window.clearTimeout(recordingStopTimer.current);
    if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
    setRecording(false);
  };
  const closeCamera = () => {
    discardRecording.current = true;
    stopRecording();
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setCameraReady(false);
    setCameraOpen(false);
  };
  const startRecording = () => {
    const stream = cameraStream.current;
    if (!stream || running) return;
    try {
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingChunks.current = [];
      discardRecording.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunks.current.push(event.data);
      };
      recorder.onerror = () => {
        setCameraError("The camera recording stopped unexpectedly. Try recording again.");
        setRecording(false);
      };
      recorder.onstop = () => {
        if (discardRecording.current || recordingChunks.current.length === 0) return;
        const blob = new Blob(recordingChunks.current, { type: recorder.mimeType || "video/webm" });
        const file = new File([blob], `camera-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`, {
          type: "video/webm",
        });
        addFiles([file]);
      };
      mediaRecorder.current = recorder;
      recordingStartedAt.current = Date.now();
      setRecordingSeconds(0);
      recorder.start(250);
      setRecording(true);
      recordingTimer.current = window.setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt.current) / 1000));
      }, 250);
      recordingStopTimer.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
      setCameraError(null);
    } catch {
      setCameraError("Could not start recording. Check that your camera is available and try again.");
    }
  };
  const patch = (id: number, changes: Partial<UploadItem>) =>
    changeItems((previous) => previous.map((item) => item.id === id ? { ...item, ...changes } : item));

  const resumeHeld = async () => {
    try {
      const result = await api.resumePaused(batchId);
      setNotice(`Resumed ${result.resumed} paused scan(s).${result.failed ? ` ${result.failed} could not be requeued.` : ""}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batch-status", batchId] }),
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not resume paused scans.");
    }
  };

  const cancelQueued = async () => {
    try {
      const result = await api.cancelQueued(batchId);
      await queryClient.invalidateQueries({ queryKey: ["batch-status", batchId] });
      setNotice(`${result.canceled} queued analysis job(s) canceled. Already-running OCR analyses continue.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not cancel queued scans.");
    }
  };

  const runQueue = async (mode: "ready" | "failed" | "canceled" = "ready") => {
    if (running) return;
    pauseRef.current = false;
    setPaused(false);
    setRunning(true);
    const tasks = itemsRef.current.filter((item) =>
      mode === "ready" ? item.state === "ready" : effectiveState(item) === mode
    );
    let cursor = 0;
    const worker = async () => {
      while (cursor < tasks.length && !pauseRef.current) {
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
    if (pauseRef.current) {
      setNotice("Remaining uploads paused. Existing uploads or analyses continue; use Resume uploads when ready.");
    }
    void queryClient.invalidateQueries({ queryKey: ["batch-status", batchId] });
    void queryClient.invalidateQueries({ queryKey: ["samples", batchId] });
    void queryClient.invalidateQueries({ queryKey: ["review-samples", batchId] });
  };

  const visible = showAll ? items : items.slice(0, 30);
  return <Stack gap="md">
    {(status.data?.paused ?? 0) > 0 && <Group gap="sm">
      <Badge color="yellow">{status.data?.paused ?? 0} paused from an earlier run</Badge>
      <Button variant="light" color="orange" size="xs"
        leftSection={<RotateCcw size={14} />} onClick={() => void resumeHeld()}>
        Resume paused analyses
      </Button>
      <Text size="xs" c="dimmed">Requeues previously paused batch records for local OCR.</Text>
    </Group>}
    <Text size="sm" c="dimmed">Add a recording of each sample label. Upload existing videos or use your desktop camera.</Text>
    <Box
      role="button"
      tabIndex={running ? -1 : 0}
      aria-label="Drop sample videos or browse files"
      className={`bulk-dropzone${dragging ? " bulk-dropzone-active" : ""}`}
      onClick={(event) => { if (!running && event.target !== fileInput.current) fileInput.current?.click(); }}
      onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !running) { event.preventDefault(); fileInput.current?.click(); } }}
      onDragOver={(event) => { event.preventDefault(); }}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}
      style={{ cursor: running ? "not-allowed" : "pointer" }}
    >
      <UploadCloud size={32} color="#288647" />
      <Text fw={700} size="sm">Drop MOV, MP4, or WebM videos here</Text>
      <Text c="dimmed" size="xs">Click to browse · Up to 800 videos · 50 MB each</Text>
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
    <Divider label="or record a sample" labelPosition="center" />
    <Group justify="space-between" className="camera-entry">
      <Box><Text fw={600} size="sm">Capture a sample now</Text>
        <Text size="xs" c="dimmed">One tube per recording · Up to 15 seconds</Text></Box>
      <Button variant="light" leftSection={<Camera size={16} />} disabled={running}
        onClick={() => { setCameraError(null); setCameraOpen(true); }}>
        Record with desktop camera
      </Button>
    </Group>
    <Modal opened={cameraOpen} onClose={closeCamera} title="Record a sample video" centered size="lg">
      <Stack gap="sm">
        {cameraError && <Alert color="red" icon={<AlertCircle size={16} />}>{cameraError}</Alert>}
        <Box style={{ background: "#101820", borderRadius: 8, overflow: "hidden", minHeight: 220,
          display: "grid", placeItems: "center" }}>
          <video ref={videoPreview} autoPlay playsInline muted
            onCanPlay={() => setCameraReady(true)}
            aria-label="Desktop camera preview"
            style={{ width: "100%", maxHeight: "55vh", objectFit: "contain" }} />
          {!cameraReady && !cameraError && <Text c="white" size="sm">Opening camera…</Text>}
        </Box>
        <Text size="xs" c="dimmed">
          Record up to 15 seconds while rotating the sample label. The video will be added to the upload list for analysis.
        </Text>
        <Group justify="space-between">
          <Text size="sm" aria-live="polite">
            {recording ? `Recording · 00:${String(recordingSeconds).padStart(2, "0")} / 00:15` : "Ready when you are"}
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={closeCamera}>Cancel</Button>
            {recording
              ? <Button color="red" leftSection={<Square size={14} />} onClick={stopRecording}>Stop & add video</Button>
              : <Button color="green" leftSection={<Camera size={15} />} disabled={!cameraReady || Boolean(cameraError)}
                onClick={startRecording}>Start recording</Button>}
          </Group>
        </Group>
      </Stack>
    </Modal>
    {notice && <Alert color="yellow" icon={<AlertCircle size={16} />}>{notice}</Alert>}
    {status.isError && <Alert color="yellow">Could not refresh batch processing status: {status.error.message}</Alert>}
    {items.length > 0 && <>
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <Badge color="gray">{items.length} selected</Badge>
          <Badge color="green">{done} completed</Badge>
          {inProgress > 0 && <Badge color="blue">{inProgress} active</Badge>}
          {errors > 0 && <Badge color="red">{errors} failed</Badge>}
          {canceled > 0 && <Badge color="gray">{canceled} canceled</Badge>}
          {pausedCount > 0 && <Badge color="yellow">{pausedCount} paused</Badge>}
        </Group>
        <Group gap="xs">
          <Button variant="default" size="xs" disabled={running} onClick={() => {
            changeItems((current) => current.filter((item) => item.sampleId));
            setNotice(null);
          }}>Clear unuploaded</Button>
          <Button size="xs" color="green" leftSection={<Files size={16} />} loading={running}
            disabled={running || paused || !items.some((item) => item.state === "ready")}
            onClick={() => void runQueue()}>Upload & analyze</Button>
          {running && <Button variant="light" color="yellow" size="xs"
            leftSection={<Pause size={14} />}
            onClick={() => { pauseRef.current = true; setPaused(true); }}>
            {paused ? "Pausing…" : "Pause remaining uploads"}
          </Button>}
          {!running && paused && items.some((item) => item.state === "ready") &&
            <Button variant="light" color="green" size="xs" leftSection={<Play size={14} />}
              onClick={() => void runQueue()}>Resume uploads</Button>}
          {(status.data?.queued ?? 0) > 0 &&
            <Button variant="outline" color="red" size="xs" leftSection={<Ban size={14} />}
              onClick={() => void cancelQueued()}>
              Cancel queued analyses ({status.data?.queued ?? 0})
            </Button>}
          {errors > 0 && <Button variant="light" size="xs" color="red" disabled={running}
            onClick={() => void runQueue("failed")}>Retry failed</Button>}
          {canceled > 0 && <Button variant="light" size="xs" color="gray"
            disabled={running} onClick={() => void runQueue("canceled")}>
            Retry canceled
          </Button>}
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
                <Badge size="xs" color={state === "completed" ? "green" : state === "failed" ? "red" : state === "paused" ? "yellow" : state === "ready" ? "gray" : "blue"}>
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
      <Text size="xs" c="dimmed">
        Pause stops starting further uploads after current transfers finish.
        Cancel queued analyses removes work that has not started; it cannot abort an active OCR task.
        Keep this page open while uploads are in progress.
      </Text>
    </>}
  </Stack>;
}
