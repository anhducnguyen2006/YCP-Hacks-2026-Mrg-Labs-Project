import { useState } from "react";
import { Alert, Badge, Box, Button, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Switch, Table, Text, ThemeIcon, Title } from "@mantine/core";
import { Download, FileSpreadsheet, FlaskConical, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { labelMappings, sampleColumns } from "../samples/columns";

export function TemplatesPage() {
  const [type, setType] = useState<"large" | "small">("large");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [reviewedOnly, setReviewedOnly] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const batches = useQuery({ queryKey: ["batches"], queryFn: api.batches });
  const batchStatus = useQuery({
    queryKey: ["batch-status", batchId],
    queryFn: () => api.batchStatus(batchId!),
    enabled: Boolean(batchId),
  });
  const selectedBatch = batches.data?.find((batch) => batch.id === batchId);
  const download = async () => {
    if (!batchId || downloading) return;
    setDownloading(true);
    setExportError(null);
    try {
      const csv = await api.exportBatch(batchId, reviewedOnly);
      const url = URL.createObjectURL(csv);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = selectedBatch?.default_export_filename || "mrg-samples.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setDownloading(false);
    }
  };

  const blankTemplate = `data:text/csv;charset=utf-8,${encodeURIComponent(sampleColumns.map((column) => column.label).join(",") + "\r\n")}`;
  return <Stack gap="xl" className="workspace-page"><Group justify="space-between"><Box><Text className="eyebrow">TEMPLATES & EXPORT</Text><Title order={1} mt={6}>A consistent format, every time.</Title><Text c="dimmed" mt="sm">See how each label becomes a laboratory record.</Text></Box><ThemeIcon color="green" variant="light" size={52} radius="lg"><FileSpreadsheet size={26} /></ThemeIcon></Group>
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg"><Paper withBorder p="xl" radius="lg"><Group justify="space-between"><Title order={3}>Label mapping</Title><Badge variant="light" color="green">Default templates</Badge></Group><Text c="dimmed" size="sm" mt="sm">Select a sample type to see where each field comes from.</Text><SegmentedControl mt="lg" color="green" fullWidth value={type} onChange={(value) => setType(value as "large" | "small")} data={[{ value: "large", label: "Large sample" }, { value: "small", label: "Small sample" }]} /><Group mt="lg" gap="sm"><ThemeIcon color="green" variant="light"><FlaskConical size={19} /></ThemeIcon><Text fw={700}>{type === "large" ? "Large label" : "Small label"}</Text></Group><Box key={type} className="template-mapping" mt="md"><Table verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>CSV column</Table.Th><Table.Th>Read from label</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{sampleColumns.map((column, index) => <Table.Tr key={column.key}><Table.Td fw={600}>{column.label}</Table.Td><Table.Td>{labelMappings[type][index]}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Box><Text size="xs" c="dimmed" mt="md">Mappings are read-only in this version. Changing the view does not change extraction settings.</Text></Paper>
    <Stack gap="lg"><Paper withBorder p="xl" radius="lg"><Group><ThemeIcon color="green" variant="light"><FileSpreadsheet size={20} /></ThemeIcon><Title order={3}>CSV format</Title></Group><Text size="sm" c="dimmed" mt="md">Exactly seven columns, in the supplied template order. The blank template contains headers only.</Text><Stack gap="xs" mt="lg">{sampleColumns.map((column, index) => <Group key={column.key} className="template-column"><Badge color="gray" variant="light" circle size="lg">{index + 1}</Badge><Text size="sm" fw={600}>{column.label}</Text></Group>)}</Stack><Button mt="xl" component="a" href={blankTemplate} download="mrg-empty-template.csv" fullWidth color="green" leftSection={<Download size={17} />}>Download blank CSV template</Button><Text size="xs" c="dimmed" mt="sm">“Refrence Lube” matches the required CSV header spelling.</Text></Paper><Paper withBorder radius="lg" p="xl">
      <Group justify="space-between" mb="sm"><Title order={3}>Export analyzed samples</Title><Badge color="green" variant="light">Live data</Badge></Group>
      <Text size="sm" c="dimmed">Download all completed sample records in the selected batch, including records on later pages. Corrections made in Review are included.</Text>
      <Select mt="lg" label="Batch to export" placeholder="Choose a batch" searchable
        data={(batches.data ?? []).map((batch) => ({ value: batch.id, label: batch.name }))}
        value={batchId} onChange={(value) => { setBatchId(value); setExportError(null); }}
        disabled={batches.isLoading || batches.isError} />
      {batches.isError && <Alert color="red" mt="md">Unable to load batches: {batches.error.message}</Alert>}
      {batchStatus.data && <Group mt="md" gap="xs" wrap="wrap">
        <Badge color="green" variant="light">{batchStatus.data.completed} completed</Badge>
        <Badge color="yellow" variant="light">{batchStatus.data.needs_review} need review</Badge>
        {batchStatus.data.failed > 0 && <Badge color="red" variant="light">{batchStatus.data.failed} failed</Badge>}
        {batchStatus.data.queued + batchStatus.data.processing > 0 && <Badge color="blue" variant="light">{batchStatus.data.queued + batchStatus.data.processing} still processing</Badge>}
      </Group>}
      <Switch mt="lg" color="green" label="Only samples with no outstanding field reviews"
        description="Otherwise, include all completed samples—even those needing verification."
        checked={reviewedOnly} onChange={(event) => setReviewedOnly(event.currentTarget.checked)} />
      {batchStatus.data && batchStatus.data.needs_review > 0 && !reviewedOnly &&
        <Alert mt="md" color="yellow">This export will include unverified AI readings. Review them before relying on the CSV.</Alert>}
      {batchStatus.isError && <Alert mt="md" color="red">Unable to retrieve batch status: {batchStatus.error.message}</Alert>}
      {exportError && <Alert mt="md" color="red">{exportError}</Alert>}
      <Button mt="lg" fullWidth color="green" leftSection={<Download size={17} />}
        disabled={!batchId} loading={downloading} onClick={() => void download()}>Download batch CSV</Button>
      <Text mt="xs" size="xs" c="dimmed">CSV columns preserve the required order and the exact “Refrence Lube” spelling. Missing fields remain blank.</Text>
    </Paper><Paper withBorder p="xl" radius="lg"><Group><ShieldCheck size={21} color="#246331" /><Title order={3}>Record rules</Title></Group><Stack mt="md" gap="sm"><Text size="sm">Leave blank or inapplicable values empty.</Text><Text size="sm">Keep IDs and serial numbers as text, including leading zeros.</Text><Text size="sm">Use the batch receiving date for Date Received.</Text><Text size="sm">Verify uncertain readings against the label in Review.</Text></Stack></Paper></Stack></SimpleGrid>
    <Paper withBorder p="lg" radius="lg"><Title order={3} mb="md">Spreadsheet header preview</Title><Table.ScrollContainer minWidth={950}><Table className="review-table" horizontalSpacing="lg" verticalSpacing="md"><Table.Thead><Table.Tr>{sampleColumns.map((column) => <Table.Th key={column.key}>{column.label}</Table.Th>)}</Table.Tr></Table.Thead><Table.Tbody><Table.Tr>{sampleColumns.map((column) => <Table.Td key={column.key} aria-label={`${column.label}: blank`}>&nbsp;</Table.Td>)}</Table.Tr></Table.Tbody></Table></Table.ScrollContainer></Paper>
    
  </Stack>;
}
