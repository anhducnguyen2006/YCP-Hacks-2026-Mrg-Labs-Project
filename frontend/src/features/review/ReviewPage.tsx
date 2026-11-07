import { useState } from "react";
import { Alert, Badge, Box, Button, Group, Image, Loader, Modal, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, FileSpreadsheet, ImageOff, RefreshCw, ShieldCheck } from "lucide-react";
import { api, type Sample, type SampleField } from "../../api";
import { useSearchParams } from "react-router-dom";
import { sampleColumns } from "../samples/columns";

export const reviewColumns = sampleColumns;

function needsReview(field: SampleField) {
  return field.review_required && !field.reviewed;
}

function FieldCorrection({ sample, field, label, onSaved }: { sample: Sample; field: SampleField; label: string; onSaved: (sample: Sample) => void }) {
  const [value, setValue] = useState(field.current_value ?? "");
  const [opened, setOpened] = useState(false);
  const save = useMutation({ mutationFn: () => api.updateField(sample.id, field.field_key, value), onSuccess: (updated) => { onSaved(updated); setOpened(false); } });
  const close = () => { if (!save.isPending) setOpened(false); };
  const confidence = field.confidence;
  return <>
    <Paper withBorder p="sm" radius="md" className={needsReview(field) ? "review-field review-field-warning" : "review-field"}>
      <Group justify="space-between" align="flex-start"><Box><Text size="xs" fw={700} c="dimmed">{label}</Text><Text size="sm" mt={4} style={{ overflowWrap: "anywhere" }}>{field.current_value || "Blank"}</Text></Box><Badge size="xs" variant="light" color={needsReview(field) ? "yellow" : field.reviewed ? "green" : "gray"}>{needsReview(field) ? "Needs review" : field.reviewed ? "Reviewed" : "Extracted"}</Badge></Group>
      <Group justify="space-between" mt="xs"><Text size="xs" c="dimmed">{confidence != null ? `Model confidence: ${Math.round(confidence * 100)}%` : "Confidence unavailable"}</Text><Button variant="subtle" size="compact-xs" color="green" onClick={() => { setValue(field.current_value ?? ""); save.reset(); setOpened(true); }}>Edit / verify</Button></Group>
    </Paper>
    <Modal opened={opened} onClose={close} title={`Verify ${label}`} centered closeOnClickOutside={false} closeOnEscape={!save.isPending} withCloseButton={!save.isPending}>
      <Stack><Text size="sm" c="dimmed">Check the label image before saving. Saving marks this field as human-reviewed.</Text><Text size="sm">Original extraction: {field.predicted_value || "Blank"}</Text>{field.review_reason && <Alert color="yellow">{field.review_reason}</Alert>}<TextInput label={label} description="Leave empty if the label is blank or the field does not apply." value={value} onChange={(event) => setValue(event.currentTarget.value)} autoFocus />{save.isError && <Alert color="red" role="alert">Unable to save. Your edit is still here. {save.error.message}</Alert>}<Group justify="flex-end"><Button variant="default" onClick={close} disabled={save.isPending}>Cancel</Button><Button color="green" leftSection={<Check size={16} />} loading={save.isPending} onClick={() => save.mutate()}>Save & verify field</Button></Group></Stack>
    </Modal>
  </>;
}

function SampleInspector({ sample, onSaved }: { sample: Sample; onSaved: (sample: Sample) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = sample.media.find((media) => media.media_type === "keyframe");
  const video = sample.media.find((media) => media.media_type === "video");
  return <Paper withBorder radius="lg" p="xl"><Group justify="space-between" mb="lg"><Box><Title order={3}>Verify sample</Title><Text size="sm" c="dimmed">Compare the source label with the extracted values.</Text></Box><Badge color="gray">{sample.label_type} label</Badge></Group><SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl"><Stack><Text fw={700} size="sm">Source label</Text>{image && !imageFailed ? <a href={api.mediaUrl(image.id)} target="_blank" rel="noreferrer" className="review-image-link"><Image src={api.mediaUrl(image.id)} alt="Extracted frame of the selected sample label. Open full image to inspect." fit="contain" h={320} onError={() => setImageFailed(true)} /><Text size="xs" ta="center" mt="xs">Open full image ↗</Text></a> : <Box className="review-image-empty"><ImageOff size={30} /><Text size="sm">{imageFailed ? "Label image could not be loaded." : "No label image available yet."}</Text></Box>}{video && <video key={video.id} className="review-video" controls preload="metadata" src={api.mediaUrl(video.id)} aria-label="Original sample rotation video" />}<Text size="xs" c="dimmed">Large labels leave Serial Number blank. Small labels leave Refrence Lube blank. Date Received comes from the batch receiving date.</Text></Stack><Stack gap="sm">{reviewColumns.map(({ key, label }) => { const field = sample.fields.find((item) => item.field_key === key); return field ? <FieldCorrection key={`${sample.id}:${field.id}:${field.current_value}:${field.reviewed}`} sample={sample} field={field} label={label} onSaved={onSaved} /> : <Paper key={key} withBorder p="sm" radius="md"><Text size="sm" fw={600}>{label}</Text><Text size="xs" c="dimmed">Not extracted yet</Text></Paper>; })}</Stack></SimpleGrid></Paper>;
}

export function ReviewPage() {
  const [params] = useSearchParams();
  const [batchId, setBatchId] = useState<string | null>(params.get("batch"));
  const requestedOffset = Number(params.get("offset") ?? 0);
  const [offset, setOffset] = useState(Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("sample"));
  const [filter, setFilter] = useState<string | null>("all");
  const [saved, setSaved] = useState(false);
  const client = useQueryClient();
  const batches = useQuery({ queryKey: ["batches"], queryFn: api.batches, retry: false });
  const samples = useQuery({ queryKey: ["review-samples", batchId, offset], queryFn: () => api.samples(batchId!, offset), enabled: Boolean(batchId), retry: false });
  const rows = samples.data ?? [];
  const visible = rows.filter((sample) => filter !== "needs-review" || sample.fields.some(needsReview));
  const selected = visible.find((sample) => sample.id === selectedId) ?? visible[0];
  const onSaved = (sample: Sample) => {
    client.setQueryData<Sample[]>(["review-samples", batchId, offset], (previous) => previous?.map((item) => item.id === sample.id ? sample : item));
    void client.invalidateQueries({ queryKey: ["samples", batchId] });
    void client.invalidateQueries({ queryKey: ["sample", sample.id] });
    setSaved(true);
  };
  return <Stack gap="xl" className="review-page"><Group justify="space-between"><Box><Text className="eyebrow">QUALITY CONTROL</Text><Title order={1} mt={6}>Review sample labels</Title><Text c="dimmed" mt="sm">Check the label. Correct the details. Keep your records accurate.</Text></Box><ThemeIcon color="green" variant="light" size={52} radius="lg"><ShieldCheck size={27} /></ThemeIcon></Group>
    <Paper withBorder radius="lg" p="lg"><Group align="flex-end"><Select className="review-batch-select" label="Batch" placeholder="Choose a batch to review" data={(batches.data ?? []).map((batch) => ({ value: batch.id, label: batch.name }))} value={batchId} onChange={(value) => { setBatchId(value); setOffset(0); setSelectedId(null); setSaved(false); }} searchable disabled={batches.isLoading || batches.isError} /><Select label="Show" data={[{ value: "all", label: "All samples" }, { value: "needs-review", label: "Needs review" }]} value={filter} onChange={setFilter} /><Button variant="default" leftSection={<RefreshCw size={16} />} loading={samples.isFetching || batches.isFetching} onClick={() => { void batches.refetch(); if (batchId) void samples.refetch(); }}>Refresh</Button></Group></Paper>
    {batches.isLoading && <Group role="status"><Loader size="sm" color="green" /><Text>Loading batches…</Text></Group>}
    {batches.isError && <Alert color="red" icon={<AlertCircle size={18} />} title="Cannot connect to sample data">{batches.error.message}. Start the batch/sample API, then select Refresh. No sample data has been loaded.</Alert>}
    {!batches.isLoading && !batches.isError && !batchId && <Box className="empty-panel"><ThemeIcon size={56} radius="xl" variant="light" color="green"><FileSpreadsheet size={26} /></ThemeIcon><Title order={3} mt="lg">{batches.data?.length ? "Choose a batch to get started" : "No batches available yet"}</Title><Text c="dimmed" mt="sm" maw={470}>{batches.data?.length ? "Analyzed labels will appear as rows in the seven-column table." : "Create and analyze samples in the capture workflow, then return here to verify their data."}</Text></Box>}
    {samples.isLoading && batchId && <Group role="status"><Loader color="green" size="sm" /><Text>Loading sample records…</Text></Group>}
    {samples.isError && <Alert color="red" title="Unable to load samples">{samples.error.message}. Use Refresh to try again.</Alert>}
    {batchId && samples.isSuccess && <><Paper withBorder radius="lg" className="review-table-panel"><Group justify="space-between" p="lg"><Box><Title order={3}>Sample records</Title><Text size="xs" c="dimmed" mt={4}>Seven columns in CSV order · Blank values stay empty · Select a Sample ID to inspect</Text></Box><Badge color="green" variant="light">{visible.length} shown</Badge></Group><Table.ScrollContainer minWidth={1000}><Table className="review-table" verticalSpacing="md" horizontalSpacing="lg"><Table.Thead><Table.Tr>{reviewColumns.map(({ key, label }) => <Table.Th key={key}>{label}</Table.Th>)}</Table.Tr></Table.Thead><Table.Tbody>{visible.map((sample) => <Table.Tr key={sample.id} data-selected={sample.id === selected?.id || undefined}>{reviewColumns.map(({ key }) => { const field = sample.fields.find((item) => item.field_key === key); const value = field?.current_value ?? ""; return <Table.Td key={key} className={field && needsReview(field) ? "review-cell-warning" : undefined}>{key === "sample_id" ? <Button variant="subtle" color="green" size="compact-sm" onClick={() => { setSelectedId(sample.id); setSaved(false); }}>{value || `Inspect ${sample.id.slice(0, 8)}`}</Button> : <span>{value}</span>}{field && needsReview(field) && <Text size="xs" c="#805500" mt={4}>Needs review</Text>}{!field && <Text size="xs" c="dimmed">Not extracted</Text>}</Table.Td>; })}</Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>{!visible.length && <Text ta="center" c="dimmed" p="xl">{rows.length ? "No samples on this page need review." : "No sample records on this page yet."}</Text>}<Group justify="space-between" p="lg"><Text size="xs" c="dimmed">Page {offset / 50 + 1} · Up to 50 samples per page{filter === "needs-review" ? " · Filter applies to this page" : ""}</Text><Group><Button variant="default" size="xs" disabled={!offset || samples.isFetching} onClick={() => { setOffset(offset - 50); setSelectedId(null); }}>Previous</Button><Button variant="default" size="xs" disabled={rows.length < 50 || samples.isFetching} onClick={() => { setOffset(offset + 50); setSelectedId(null); }}>Next</Button></Group></Group></Paper>{saved && <Alert color="green" icon={<Check size={18} />} role="status">Field saved to the sample record.</Alert>}{selected && <SampleInspector key={selected.id} sample={selected} onSaved={onSaved} />}</>}
    <Text size="xs" c="dimmed">Corrections are stored through the sample API. CSV download is not connected on this page yet.</Text>
  </Stack>;
}
