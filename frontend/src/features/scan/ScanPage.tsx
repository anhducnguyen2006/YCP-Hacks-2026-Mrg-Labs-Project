import { useEffect, useState } from "react";
import { Alert, Badge, Box, Button, FileInput, Group, Loader, Paper, Select, SimpleGrid, Stack, Stepper, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CheckCircle2, FileVideo, Plus, RefreshCw, ScanLine, UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type Sample } from "../../api";

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ScanPage() {
  const client = useQueryClient();
  const [batchId, setBatchId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(localDate);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const batches = useQuery({ queryKey: ["batches"], queryFn: api.batches, retry: false });
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const record = (sample: Sample) => {
    client.setQueryData(["sample", sample.id], sample);
    setSampleId(sample.id);
  };
  const create = useMutation({ mutationFn: () => api.createBatch({ name: name.trim(), receiving_date: date, default_export_filename: "mrg-samples.csv" }), onSuccess: (batch) => { void client.invalidateQueries({ queryKey: ["batches"] }); setBatchId(batch.id); setCreating(false); setName(""); } });
  const upload = useMutation({ mutationFn: () => api.uploadSample(batchId!, file!), onSuccess: record });
  const analyze = useMutation({ mutationFn: () => api.analyze(sampleId!), onSuccess: record });
  const sample = useQuery({ queryKey: ["sample", sampleId], queryFn: () => api.sample(sampleId!), enabled: Boolean(sampleId), retry: false, refetchInterval: (query) => ["queued", "processing"].includes(query.state.data?.processing_status ?? "") ? 2000 : false });
  const data = sample.data;
  const busy = upload.isPending || analyze.isPending || data?.processing_status === "processing";
  const fileError = file && file.size > 50 * 1024 * 1024 ? "Choose a video under 50 MB." : null;
  const completed = data?.processing_status === "completed";
  const failed = data?.processing_status === "failed";
  const activeStep = completed ? 3 : sampleId ? 2 : batchId ? 1 : 0;
  const next = () => { setSampleId(null); setFile(null); upload.reset(); analyze.reset(); };

  return <Stack gap="xl" className="scan-page"><Group justify="space-between"><Box><Text className="eyebrow">CAPTURE WORKSPACE</Text><Title order={1} mt={6}>Scan a sample</Title><Text c="dimmed" mt="sm">Upload a rotation video. Analyze the label. Verify the extracted details.</Text></Box><ThemeIcon color="green" variant="light" size={52} radius="lg"><ScanLine size={27} /></ThemeIcon></Group>
    <Stepper active={activeStep} color="green" size="sm" allowNextStepsSelect={false}><Stepper.Step label="Choose batch" /><Stepper.Step label="Upload video" /><Stepper.Step label="Analyze label" /><Stepper.Step label="Review data" /></Stepper>
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl"><Stack gap="lg"><Paper withBorder radius="lg" p="xl"><Group justify="space-between" mb="lg"><Title order={3}>1. Choose a batch</Title><Button variant="subtle" color="green" size="xs" leftSection={<Plus size={14} />} disabled={busy || Boolean(sampleId)} onClick={() => setCreating(!creating)}>{creating ? "Use existing" : "New batch"}</Button></Group>
      {batches.isLoading && <Group><Loader size="sm" /><Text size="sm">Loading batches…</Text></Group>}
      {batches.isError && <Alert color="red" icon={<AlertCircle size={18} />} title="Batch API unavailable"><Text size="sm">Start the latest backend to create batches and upload samples. {batches.error.message}</Text><Button mt="sm" size="xs" variant="white" onClick={() => void batches.refetch()}>Retry connection</Button></Alert>}
      {creating ? <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><Stack><TextInput label="Batch name" placeholder="Morning sample intake" value={name} maxLength={200} required onChange={(event) => setName(event.currentTarget.value)} /><TextInput label="Date received" type="date" value={date} required onChange={(event) => setDate(event.currentTarget.value)} /><Text size="xs" c="dimmed">This receiving date is used for the sample records.</Text><Button color="green" type="submit" loading={create.isPending} disabled={!name.trim() || !date}>Create batch</Button>{create.isError && <Alert color="red">{create.error.message}</Alert>}</Stack></form> : <Select label="Active batch" placeholder="Choose a batch" searchable data={(batches.data ?? []).map((batch) => ({ value: batch.id, label: `${batch.name} · ${batch.receiving_date}` }))} value={batchId} onChange={setBatchId} disabled={busy || Boolean(sampleId) || batches.isLoading} nothingFoundMessage="No matching batches" />}
      {batches.isSuccess && !batches.data.length && !creating && <Text size="sm" c="dimmed" mt="md">No batches yet. Select New batch to create your first one.</Text>}
    </Paper><Paper withBorder radius="lg" p="xl"><Title order={3} mb="md">2. Upload a sample video</Title><Text size="sm" c="dimmed" mb="lg">One tube per video · MP4, MOV, or WebM · Up to 50 MB</Text><FileInput label="Recorded rotation video" placeholder="Choose a video file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" leftSection={<FileVideo size={18} />} value={file} onChange={(value) => { setFile(value); upload.reset(); }} disabled={!batchId || busy || Boolean(sampleId)} clearable error={fileError} />{!batchId && <Text size="xs" c="dimmed" mt="sm">Choose or create a batch first.</Text>}{preview && <video className="scan-video" src={preview} controls preload="metadata" aria-label="Selected sample video preview" />}<Button mt="lg" color="green" fullWidth leftSection={<UploadCloud size={18} />} disabled={!batchId || !file || Boolean(fileError) || Boolean(sampleId)} loading={upload.isPending} onClick={() => upload.mutate()}>Upload to batch</Button>{upload.isError && <Alert color="red" mt="md">Upload failed. {upload.error.message} Your selected file is kept so you can retry.</Alert>}</Paper></Stack>
    <Stack gap="lg"><Paper withBorder radius="lg" p="xl" className="scan-guide"><Text className="eyebrow">A CLEAR LABEL STARTS HERE</Text><Title order={3} mt="sm">Before you upload</Title><Stack gap="lg" mt="xl">{["Use even lighting and keep the label in focus.", "Rotate one tube slowly through a full turn.", "Keep every part of the label in frame.", "Play the video back and check that the text is readable."].map((tip, index) => <Group key={tip} wrap="nowrap" align="flex-start"><ThemeIcon color="green" variant="light" radius="xl" size={28}>{index + 1}</ThemeIcon><Text size="sm">{tip}</Text></Group>)}</Stack><Text size="xs" c="dimmed" mt="xl">This screen accepts recorded videos. Live camera recording is not connected yet.</Text></Paper>
    <Paper withBorder radius="lg" p="xl"><Title order={3}>3. Analyze & review</Title>{!sampleId ? <Stack align="center" gap="sm" py="xl"><ThemeIcon size={48} color="gray" variant="light" radius="xl"><ScanLine size={24} /></ThemeIcon><Text size="sm" c="dimmed" ta="center">Your uploaded sample and processing status will appear here.</Text></Stack> : <Stack mt="lg"><Group justify="space-between"><Text size="sm" fw={600}>Sample {sampleId.slice(0, 8)}</Text><Badge color={completed ? "green" : failed ? "red" : "blue"}>{data?.processing_status ?? "Loading"}</Badge></Group>{data?.latest_job?.current_stage && <Text size="sm" c="dimmed">Stage: {data.latest_job.current_stage}</Text>}{sample.isError && <Alert color="red">Could not refresh the sample. {sample.error.message}<Button size="xs" variant="white" mt="sm" onClick={() => void sample.refetch()}>Retry status check</Button></Alert>}{data?.processing_status === "queued" && <><Text size="sm" c="dimmed">Video uploaded. Start analysis to extract the label fields.</Text><Button color="green" loading={analyze.isPending} onClick={() => analyze.mutate()}>Analyze label</Button></>}{data?.processing_status === "processing" && <Group role="status"><Loader color="green" size="sm" /><Text size="sm">Analyzing label… This page updates automatically.</Text></Group>}{failed && <><Alert color="red">{data.latest_job?.error_message ?? "Analysis failed. You can retry this sample."}</Alert><Button color="green" leftSection={<RefreshCw size={16} />} loading={analyze.isPending} onClick={() => analyze.mutate()}>Retry analysis</Button></>}{analyze.isError && <Alert color="red">{analyze.error.message}</Alert>}{completed && <><Alert color="green" icon={<CheckCircle2 size={18} />}>Label analyzed. Check the extracted fields in Review before exporting.</Alert><Button component={Link} to="/review" color="green" rightSection={<ArrowRight size={16} />}>Open Review</Button><Text size="xs" c="dimmed">Select this batch on the Review page to see its records.</Text></>}{!busy && <Button variant="default" onClick={next}>{completed ? "Add next sample" : "Upload another sample"}</Button>}</Stack>}</Paper></Stack></SimpleGrid>
  </Stack>;
}
