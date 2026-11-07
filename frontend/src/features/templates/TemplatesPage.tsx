import { useState } from "react";
import {
  Accordion, Alert, Badge, Box, Button, Divider, Group, Paper, SegmentedControl,
  Select, SimpleGrid, Stack, Switch, Table, Text, ThemeIcon, Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FlaskConical, ShieldCheck } from "lucide-react";
import { api } from "../../api";
import { labelMappings, sampleColumns } from "../samples/columns";

export function TemplatesPage() {
  const [type, setType] = useState<"large" | "small">("large");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [reviewedOnly, setReviewedOnly] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const batches = useQuery({ queryKey: ["batches"], queryFn: api.batches, retry: false });
  const batchStatus = useQuery({
    queryKey: ["batch-status", batchId],
    queryFn: () => api.batchStatus(batchId!),
    enabled: Boolean(batchId),
    retry: false,
  });
  const selectedBatch = batches.data?.find((batch) => batch.id === batchId);
  const blankTemplate = `data:text/csv;charset=utf-8,${encodeURIComponent(sampleColumns.map((column) => column.label).join(",") + "\r\n")}`;

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

  return <Stack gap="xl" className="workspace-page export-page">
    <Group justify="space-between">
      <Box>
        <Text className="eyebrow">EXPORT</Text>
        <Title order={1} mt={6}>Download sample records</Title>
        <Text c="dimmed" mt="sm">Choose a batch and export the extracted data as a laboratory-ready CSV.</Text>
      </Box>
      <ThemeIcon color="green" variant="light" size={52} radius="lg"><FileSpreadsheet size={26} /></ThemeIcon>
    </Group>

    <Paper withBorder p="xl" radius="lg">
      <Group justify="space-between" align="center" mb="xs">
        <Title order={3}>Export analyzed samples</Title>
        <Badge color="green" variant="light">Live records</Badge>
      </Group>
      <Text size="sm" c="dimmed">Includes all completed samples in the batch, even those on later pages.
        Any corrections saved in Samples will be reflected in the download.</Text>
      <SimpleGrid cols={{ base: 1, md: 2 }} mt="lg" spacing="lg">
        <Stack gap="md">
          <Select label="Batch to export" placeholder="Select a batch" searchable
            data={(batches.data ?? []).map((batch) => ({ value: batch.id, label: batch.name }))}
            value={batchId} onChange={(value) => { setBatchId(value); setExportError(null); }}
            disabled={batches.isLoading || batches.isError} />
          <Switch color="green" label="Export only samples with no outstanding field reviews"
            description="Otherwise includes every completed sample, even those not yet verified."
            checked={reviewedOnly} onChange={(event) => setReviewedOnly(event.currentTarget.checked)} />
        </Stack>
        <Stack gap="sm" justify="center">
          {batchStatus.data
            ? <Group gap="xs">
                <Badge color="green" variant="light">{batchStatus.data.completed} completed</Badge>
                <Badge color="yellow" variant="light">{batchStatus.data.needs_review} need review</Badge>
                {batchStatus.data.failed > 0 && <Badge color="red" variant="light">{batchStatus.data.failed} failed</Badge>}
              </Group>
            : <Text size="sm" c="dimmed">Select a batch to see its processing summary.</Text>}
          <Button color="green" size="md" fullWidth leftSection={<Download size={18} />}
            disabled={!batchId} loading={downloading} onClick={() => void download()}>
            Download batch CSV
          </Button>
          <Text size="xs" c="dimmed">The file contains exactly seven columns with the required names and order.</Text>
        </Stack>
      </SimpleGrid>
      {batches.isError && <Alert color="red" mt="md">Unable to load batches: {batches.error.message}</Alert>}
      {batchStatus.isError && <Alert color="red" mt="md">Unable to load batch status: {batchStatus.error.message}</Alert>}
      {exportError && <Alert color="red" mt="md">{exportError}</Alert>}
      {batchStatus.data && batchStatus.data.needs_review > 0 && !reviewedOnly &&
        <Alert color="yellow" mt="lg">This export includes unverified AI readings. Review them in Samples before using the data.</Alert>}
    </Paper>

    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      <Paper withBorder p="lg" radius="lg">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="green"><FileSpreadsheet size={19} /></ThemeIcon>
          <Title order={3}>CSV format</Title>
        </Group>
        <Text size="sm" c="dimmed" mb="md">Required seven-column format. The header spelling is preserved exactly.</Text>
        <Stack gap="xs">
          {sampleColumns.map((column, index) => <Group key={column.key} gap="sm" wrap="nowrap">
            <Badge color="gray" circle variant="light" size="sm">{index + 1}</Badge>
            <Text size="sm">{column.label}</Text>
          </Group>)}
        </Stack>
        <Divider my="lg" />
        <Button component="a" href={blankTemplate} download="mrg-empty-template.csv"
          variant="light" color="green" leftSection={<Download size={16} />} fullWidth>
          Download blank CSV template
        </Button>
      </Paper>
      <Paper withBorder p="lg" radius="lg">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="green"><ShieldCheck size={19} /></ThemeIcon>
          <Title order={3}>Record rules</Title>
        </Group>
        <Stack gap="sm">
          <Text size="sm">Blank or inapplicable values remain empty, never N/A.</Text>
          <Text size="sm">Sample IDs and serial numbers are preserved as text, including leading zeros.</Text>
          <Text size="sm">Date Received always comes from the batch settings.</Text>
          <Text size="sm">Verify uncertain handwritten values inside Samples before exporting.</Text>
          <Text size="sm">The column header “Reference Lube” intentionally follows the laboratory template.</Text>
        </Stack>
      </Paper>
    </SimpleGrid>

    <Accordion variant="contained" radius="lg">
      <Accordion.Item value="mapping">
        <Accordion.Control>Label mapping reference (large / small labels)</Accordion.Control>
        <Accordion.Panel>
          <Group gap="sm" mb="md"><FlaskConical size={17} /><Text size="sm" c="dimmed">This guide does not change extraction settings.</Text></Group>
          <SegmentedControl color="green" fullWidth value={type}
            onChange={(value) => setType(value as "large" | "small")}
            data={[{ value: "large", label: "Large sample" }, { value: "small", label: "Small sample" }]} />
          <Table mt="md" verticalSpacing="sm">
            <Table.Thead><Table.Tr><Table.Th>CSV column</Table.Th><Table.Th>Read from label</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{sampleColumns.map((column, index) =>
              <Table.Tr key={column.key}><Table.Td>{column.label}</Table.Td><Table.Td>{labelMappings[type][index]}</Table.Td></Table.Tr>
            )}</Table.Tbody>
          </Table>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  </Stack>;
}
