import { useEffect, useState } from "react";
import { Alert, AppShell, Badge, Box, Burger, Button, Card, FileInput, Group, NavLink, Select, SimpleGrid, Stack, Table, Text, TextInput, ThemeIcon, Title, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertCircle, CheckCircle2, FileSliders, FlaskConical, FolderKanban, ScanLine, Settings, ShieldCheck, UploadCloud } from "lucide-react";
import { NavLink as RouterLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, Batch, Sample } from "./api";

const navigation = [
  { label: "Batches", icon: FolderKanban, to: "/" },
  { label: "Scan", icon: ScanLine, to: "/scan" },
  { label: "Samples", icon: FlaskConical, to: "/samples" },
  { label: "Review", icon: ShieldCheck, to: "/review" },
  { label: "Templates & Export", icon: FileSliders, to: "/templates" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

const fieldLabels: Record<string, string> = {
  sample_id: "Sample ID", date_sampled: "Date Sampled", date_received: "Date Received",
  machine: "Machine", component: "Component", serial_number: "Serial Number", reference_lube: "Refrence Lube",
};

function ErrorState({ error }: { error: Error }) {
  return <Alert color="red" icon={<AlertCircle size={18} />} title="Something went wrong">{error.message}</Alert>;
}

function Page({ title, eyebrow, description }: { title: string; eyebrow: string; description: string }) {
  return <Stack gap="xl"><Box><Text className="eyebrow">{eyebrow}</Text><Title order={1} mt={6}>{title}</Title><Text c="dimmed" mt="sm" maw={640}>{description}</Text></Box><Box className="empty-panel"><ThemeIcon size={56} radius="xl" variant="light" color="teal"><Activity size={26} /></ThemeIcon><Title order={3} mt="lg">Nothing here yet</Title><Text c="dimmed" maw={440} ta="center">This workflow is ready for the next implementation phase.</Text></Box></Stack>;
}

function BatchForm({ onCreated }: { onCreated: (batch: Batch) => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [filename, setFilename] = useState("mrg-samples.csv");
  const mutation = useMutation({ mutationFn: () => api.createBatch({ name, receiving_date: date, default_export_filename: filename }), onSuccess: onCreated });
  return <Card withBorder><Stack><Title order={3}>Create a batch</Title><TextInput label="Batch name" placeholder="November route inspection" value={name} onChange={(event) => setName(event.currentTarget.value)} required /><TextInput type="date" label="Receiving date" value={date} onChange={(event) => setDate(event.currentTarget.value)} required /><TextInput label="Default export filename" value={filename} onChange={(event) => setFilename(event.currentTarget.value)} /><Button loading={mutation.isPending} disabled={!name || !date} onClick={() => mutation.mutate()}>Create batch</Button>{mutation.isError && <ErrorState error={mutation.error} />}</Stack></Card>;
}

function BatchList({ onSelect }: { onSelect: (batch: Batch) => void }) {
  const query = useQuery({ queryKey: ["batches"], queryFn: api.batches });
  if (query.isLoading) return <Text c="dimmed">Loading batches...</Text>;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data?.length) return <Text c="dimmed">No batches yet. Create one to begin scanning.</Text>;
  return <Stack gap="xs">{query.data.map((batch) => <UnstyledButton key={batch.id} onClick={() => onSelect(batch)} className="batch-row"><Group justify="space-between"><Box><Text fw={700}>{batch.name}</Text><Text size="sm" c="dimmed">Receiving {batch.receiving_date}</Text></Box><Badge variant="light" color="teal">Open</Badge></Group></UnstyledButton>)}</Stack>;
}

function BatchesPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState<Batch | null>(null);
  return <Stack gap="xl"><Box><Text className="eyebrow">BATCHES</Text><Title order={1} mt={6}>Good morning, technician.</Title><Text c="dimmed" mt="sm">Create a persistent batch, then upload recorded sample videos for analysis.</Text></Box><SimpleGrid cols={{ base: 1, md: 2 }}><BatchForm onCreated={(batch) => { setActive(batch); navigate("/scan"); }} /><Card withBorder><Title order={3} mb="md">Recent batches</Title><BatchList onSelect={(batch) => { setActive(batch); navigate("/scan"); }} /></Card></SimpleGrid>{active && <Alert color="teal">Active batch: <strong>{active.name}</strong></Alert>}</Stack>;
}

function UploadCard({ batch, onUploaded }: { batch: Batch; onUploaded: (sample: Sample) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const mutation = useMutation({ mutationFn: () => api.uploadSample(batch.id, file as File), onSuccess: onUploaded });
  return <Card withBorder><Stack><Group><ThemeIcon color="teal" variant="light"><UploadCloud size={18} /></ThemeIcon><Box><Title order={3}>Upload a recorded sample</Title><Text size="sm" c="dimmed">MP4, MOV, or WebM · recommended 2–3 seconds · max 50 MB</Text></Box></Group><FileInput accept="video/mp4,video/quicktime,video/webm" label="Sample video" placeholder="Choose a video" value={file} onChange={setFile} clearable /><Button leftSection={<UploadCloud size={16} />} loading={mutation.isPending} disabled={!file} onClick={() => mutation.mutate()}>Upload video</Button>{mutation.isError && <ErrorState error={mutation.error} />}</Stack></Card>;
}

function SampleResult({ sample, onRefresh }: { sample: Sample; onRefresh: () => void }) {
  const [editing, setEditing] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const update = useMutation({ mutationFn: ({ key, value }: { key: string; value: string }) => api.updateField(sample.id, key, value), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["samples", sample.batch_id] }); onRefresh(); } });
  const video = sample.media.find((item) => item.media_type === "video");
  const keyframe = sample.media.find((item) => item.media_type === "keyframe");
  return <Card withBorder><Group justify="space-between" mb="md"><Box><Title order={3}>Sample result</Title><Text size="sm" c="dimmed">Label type: {sample.label_type}</Text></Box><Badge color={sample.processing_status === "completed" ? "teal" : sample.processing_status === "failed" ? "red" : "yellow"}>{sample.processing_status}</Badge></Group>{video && <video className="sample-video" controls src={api.mediaUrl(video.id)} />}<Stack gap="xs" mt="md"><Table verticalSpacing="xs"><Table.Thead><Table.Tr><Table.Th>Field</Table.Th><Table.Th>Predicted</Table.Th><Table.Th>Current value</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{sample.fields.map((field) => <Table.Tr key={field.field_key}><Table.Td fw={600}>{fieldLabels[field.field_key] ?? field.field_key}</Table.Td><Table.Td>{field.predicted_value || "—"}</Table.Td><Table.Td><TextInput size="xs" value={editing[field.field_key] ?? field.current_value ?? ""} onChange={(event) => setEditing({ ...editing, [field.field_key]: event.currentTarget.value })} /></Table.Td><Table.Td><Badge size="sm" color={field.review_required ? "orange" : "gray"}>{field.review_required ? "Review" : field.status}</Badge></Table.Td><Table.Td><Button size="xs" variant="subtle" onClick={() => update.mutate({ key: field.field_key, value: editing[field.field_key] ?? field.current_value ?? "" })}>Save</Button></Table.Td></Table.Tr>)}</Table.Tbody></Table>{keyframe && <img className="keyframe" src={api.mediaUrl(keyframe.id)} alt="Representative extracted label frame" />}</Stack></Card>;
}

function ScanPage() {
  const batches = useQuery({ queryKey: ["batches"], queryFn: api.batches });
  const [batchId, setBatchId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Sample | null>(null);
  const samples = useQuery({ queryKey: ["samples", batchId], queryFn: () => api.samples(batchId as string), enabled: Boolean(batchId), refetchInterval: uploaded && uploaded.processing_status === "processing" ? 1500 : false });
  useEffect(() => { if (samples.data && uploaded) setUploaded(samples.data.find((item) => item.id === uploaded.id) ?? uploaded); }, [samples.data, uploaded]);
  const analyze = useMutation({ mutationFn: () => api.analyze(uploaded?.id as string), onSuccess: (sample) => setUploaded(sample) });
  const batch = batches.data?.find((item) => item.id === batchId);
  return <Stack gap="xl"><Box><Text className="eyebrow">CAPTURE</Text><Title order={1} mt={6}>Scan a sample</Title><Text c="dimmed" mt="sm">Upload a short rotation video, then send the original video to Gemini for structured extraction.</Text></Box>{batches.isLoading && <Text c="dimmed">Loading batches...</Text>}{batches.isError && <ErrorState error={batches.error} />}{batches.data && !batches.data.length && <Alert color="yellow">Create a batch before uploading a sample.</Alert>}{batches.data && batches.data.length > 0 && <Select label="Active batch" placeholder="Choose a batch" data={batches.data.map((item) => ({ value: item.id, label: `${item.name} · ${item.receiving_date}` }))} value={batchId} onChange={setBatchId} />}{batch && <UploadCard batch={batch} onUploaded={setUploaded} />}{uploaded && <Card withBorder><Group justify="space-between"><Box><Text fw={700}>Processing status</Text><Text size="sm" c="dimmed">{uploaded.latest_job?.current_stage ?? uploaded.processing_status}</Text></Box>{uploaded.processing_status === "queued" && <Button onClick={() => analyze.mutate()} loading={analyze.isPending}>Analyze with Gemini</Button>}{uploaded.processing_status === "failed" && <Button color="orange" onClick={() => analyze.mutate()} loading={analyze.isPending}>Retry analysis</Button>}{uploaded.processing_status === "completed" && <CheckCircle2 color="var(--mantine-color-teal-6)" />}</Group>{analyze.isError && <ErrorState error={analyze.error} />}{uploaded.processing_status === "failed" && uploaded.latest_job?.error_message && <Alert mt="md" color="red">{uploaded.latest_job.error_message}</Alert>}</Card>}{uploaded && uploaded.processing_status === "completed" && <SampleResult sample={uploaded} onRefresh={() => samples.refetch()} />}</Stack>;
}

function Layout() {
  const [opened, { toggle }] = useDisclosure();
  const location = useLocation();
  return <AppShell header={{ height: 72 }} navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }} padding="xl"><AppShell.Header className="header"><Group h="100%" px="xl" justify="space-between"><Group gap="sm"><Burger hiddenFrom="sm" opened={opened} onClick={toggle} size="sm" /><UnstyledButton component={RouterLink} to="/" className="brand"><ThemeIcon color="teal" radius="md" size={38}><FlaskConical size={21} /></ThemeIcon><Box><Text fw={800} size="lg" lh={1.1}>MRG</Text><Text size="xs" c="dimmed" fw={600}>SAMPLE SCANNER</Text></Box></UnstyledButton></Group><Badge color="teal" variant="light">Local workspace</Badge></Group></AppShell.Header><AppShell.Navbar p="md" className="navbar"><Text className="nav-label">WORKSPACE</Text><Stack gap={4}>{navigation.map(({ label, icon: Icon, to }) => <NavLink key={to} component={RouterLink} to={to} label={label} leftSection={<Icon size={18} strokeWidth={1.8} />} active={location.pathname === to} onClick={toggle} />)}</Stack><Box mt="auto" className="nav-footer"><Text size="xs" fw={700} c="teal">MRG LABORATORIES</Text><Text size="xs" c="dimmed" mt={4}>Sample digitization workspace</Text></Box></AppShell.Navbar><AppShell.Main><Outlet /></AppShell.Main></AppShell>;
}

export function App() {
  return <Routes><Route element={<Layout />}><Route index element={<BatchesPage />} /><Route path="scan" element={<ScanPage />} /><Route path="samples" element={<Page eyebrow="SAMPLE INVENTORY" title="Samples" description="Inspect extracted fields and edit saved values." />} /><Route path="review" element={<Page eyebrow="QUALITY CONTROL" title="Review queue" description="Resolve questionable extractions." />} /><Route path="templates" element={<Page eyebrow="CONFIGURATION" title="Templates & export" description="Configure future label templates and CSV profiles." />} /><Route path="settings" element={<Page eyebrow="WORKSPACE" title="Settings" description="Manage local processing preferences." />} /></Route></Routes>;
}
