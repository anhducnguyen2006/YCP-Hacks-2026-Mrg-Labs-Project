import { useDeferredValue, useState } from "react";
import { Alert, Badge, Box, Button, Checkbox, Group, Loader, Modal, Paper, Select, Stack, Table, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FlaskConical, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { sampleColumns } from "./columns";
import { ConfidenceExplanation, SampleConfidence } from "./SampleConfidence";

const SORT_OPTIONS = [
  { value: "created_at", label: "Date added" },
  { value: "sample_id", label: "Sample ID" },
  { value: "date_sampled", label: "Date sampled" },
  { value: "date_received", label: "Date received" },
  { value: "machine", label: "Machine" },
  { value: "component", label: "Component" },
  { value: "serial_number", label: "Serial number" },
  { value: "reference_lube", label: "Reference lube" },
  { value: "confidence", label: "AI confidence" },
];

export function SamplesPage() {
  const client = useQueryClient();
  const [batchId, setBatchId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<string | null>("all");
  const [confidence, setConfidence] = useState<string | null>("all");
  const [sortBy, setSortBy] = useState<string | null>("created_at");
  const [direction, setDirection] = useState<string | null>("desc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const batches = useQuery({ queryKey: ["batches"], queryFn: api.batches, retry: false });
  const inventory = useQuery({
    queryKey: ["inventory", batchId, deferredSearch, status, confidence, sortBy, direction, offset],
    queryFn: () => api.inventory(batchId!, {
      search: deferredSearch,
      status: status ?? "all",
      confidence: confidence ?? "all",
      sortBy: sortBy ?? "created_at",
      descending: direction !== "asc",
      offset,
    }),
    enabled: Boolean(batchId),
    retry: false,
  });
  const rows = inventory.data?.items ?? [];
  const total = inventory.data?.total ?? 0;
  const pageIds = rows.map((sample) => sample.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const someOnPage = pageIds.some((id) => selectedIds.includes(id));
  const resetList = () => { setOffset(0); setSelectedIds([]); setNotice(null); };
  const toggleSelection = (id: string, checked: boolean) =>
    setSelectedIds((previous) => checked ? [...new Set([...previous, id])] : previous.filter((item) => item !== id));

  const removal = useMutation({
    mutationFn: () => api.deleteSamples(batchId!, selectedIds),
    onSuccess: async (result) => {
      setConfirmOpen(false);
      setSelectedIds([]);
      setNotice(`${result.deleted} sample record(s) removed.`);
      await client.invalidateQueries({ queryKey: ["inventory", batchId] });
      await client.invalidateQueries({ queryKey: ["samples", batchId] });
      await client.invalidateQueries({ queryKey: ["review-samples", batchId] });
      await client.invalidateQueries({ queryKey: ["batch-status", batchId] });
    },
  });

  return <Stack gap="xl" className="workspace-page">
    <Group justify="space-between">
      <Box>
        <Text className="eyebrow">SAMPLE INVENTORY</Text>
        <Title order={1} mt={6}>Every sample, in one place.</Title>
        <Text c="dimmed" mt="sm">Search, sort, select, and inspect records from your laboratory batches.</Text>
      </Box>
      <Button component={Link} to="/scan" color="green" leftSection={<Plus size={16} />}>Add samples</Button>
    </Group>

    <Paper withBorder radius="lg" p="lg">
      <Select label="Choose batch" searchable placeholder="Choose a batch to browse"
        data={(batches.data ?? []).map((batch) => ({ value: batch.id, label: batch.name }))}
        value={batchId} onChange={(value) => { setBatchId(value); resetList(); setSearch(""); }}
        disabled={batches.isLoading || batches.isError}
      />
      <Text size="xs" c="dimmed" mt="xs">The controls below search and sort records within this selected batch.</Text>
    </Paper>

    {batches.isError && <Alert color="red">Unable to load batches: {batches.error.message}</Alert>}
    {batchId && <Paper withBorder radius="lg" p="lg">
      <Group align="flex-end" gap="md" wrap="wrap">
        <TextInput style={{ flex: "1 1 230px" }} label="Search all samples in this batch"
          placeholder="ID, date, machine, component, lube..."
          leftSection={<Search size={16} />} value={search}
          onChange={(event) => { setSearch(event.currentTarget.value); resetList(); }} />
        <Select label="Status" value={status} onChange={(value) => { setStatus(value); resetList(); }}
          data={[
            { value: "all", label: "All statuses" },
            { value: "queued", label: "Queued" },
            { value: "processing", label: "Processing" },
            { value: "completed", label: "Completed" },
            { value: "failed", label: "Failed" },
            { value: "review", label: "Needs review" },
          ]} />
        <Select label="AI confidence" value={confidence} onChange={(value) => { setConfidence(value); resetList(); }}
          data={[
            { value: "all", label: "Any confidence" },
            { value: "low", label: "Low — investigate" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "unrated", label: "Not rated (older scans)" },
          ]} />
        <Select label="Sort by" value={sortBy} onChange={(value) => { setSortBy(value); resetList(); }} data={SORT_OPTIONS} />
        <Select label="Order" value={direction} onChange={(value) => { setDirection(value); resetList(); }}
          data={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]} />
        <Button variant="default" loading={inventory.isFetching} leftSection={<RefreshCw size={16} />}
          onClick={() => void inventory.refetch()}>Refresh</Button>
      </Group>
    </Paper>}

    <Paper withBorder radius="lg" className="review-table-panel">
      <Group p="lg" justify="space-between" wrap="wrap">
        <Group>
          <ThemeIcon color="green" variant="light"><FlaskConical size={19} /></ThemeIcon>
          <Title order={3}>Sample records</Title>
          <Badge color="gray" variant="light">{total} matching</Badge>
        </Group>
        <Group>
          {selectedIds.length > 0 && <>
            <Text size="xs" c="dimmed">{selectedIds.length} selected</Text>
            <Button variant="default" size="xs" onClick={() => setSelectedIds([])}>Clear selection</Button>
            <Button color="red" size="xs" leftSection={<Trash2 size={14} />}
              onClick={() => { removal.reset(); setConfirmOpen(true); }}>Delete selected</Button>
          </>}
        </Group>
      </Group>
      <Box px="lg" pb="sm"><ConfidenceExplanation /></Box>
      <Table.ScrollContainer minWidth={1450}>
        <Table className="review-table" verticalSpacing="md" horizontalSpacing="lg">
          <Table.Thead><Table.Tr>
            <Table.Th>
              <Checkbox aria-label="Select all samples on this page" color="green"
                checked={allOnPage} indeterminate={someOnPage && !allOnPage}
                disabled={!pageIds.length}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setSelectedIds((previous) => checked ? [...new Set([...previous, ...pageIds])] : previous.filter((id) => !pageIds.includes(id)));
                }} />
            </Table.Th>
            {sampleColumns.map(({ key, label }) => <Table.Th key={key}>{label}</Table.Th>)}
            <Table.Th>AI confidence</Table.Th>
            <Table.Th>Processing</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>{rows.map((sample) => <Table.Tr key={sample.id}>
            <Table.Td>
              <Checkbox color="green" aria-label={`Select sample ${sample.external_sample_id || sample.id}`}
                checked={selectedIds.includes(sample.id)}
                onChange={(event) => toggleSelection(sample.id, event.currentTarget.checked)} />
            </Table.Td>
            {sampleColumns.map(({ key }) => <Table.Td key={key}>
              {sample.fields.find((field) => field.field_key === key)?.current_value ?? ""}
            </Table.Td>)}
            <Table.Td><SampleConfidence sample={sample} /></Table.Td>
            <Table.Td><Badge color={sample.processing_status === "completed" ? "green" : sample.processing_status === "failed" ? "red" : "blue"}
              variant="light">{sample.processing_status}</Badge></Table.Td>
            <Table.Td><Button component={Link} size="compact-xs" color="green" variant="subtle"
              to={`/review?batch=${encodeURIComponent(sample.batch_id)}&sample=${encodeURIComponent(sample.id)}&offset=0`}
              rightSection={<ArrowRight size={14} />}>Inspect / edit</Button></Table.Td>
          </Table.Tr>)}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {(batches.isLoading || inventory.isLoading) && <Group justify="center" p="lg"><Loader size="sm" /><Text size="sm">Loading records…</Text></Group>}
      {inventory.isError && <Alert color="red" m="lg">Unable to load sample records: {inventory.error.message}</Alert>}
      {!batchId && <Text c="dimmed" size="sm" ta="center" p="xl">Choose a batch to see its samples.</Text>}
      {batchId && inventory.isSuccess && rows.length === 0 && <Text c="dimmed" size="sm" ta="center" p="xl">No samples match the current filters.</Text>}
      <Group justify="space-between" p="lg">
        <Text size="xs" c="dimmed">{batchId ? `Showing ${total === 0 ? 0 : offset + 1}–${Math.min(offset + 50, total)} of ${total} records` : "50 records per page"}</Text>
        <Group>
          <Button size="xs" variant="default" disabled={!offset || inventory.isFetching}
            onClick={() => { setOffset(Math.max(0, offset - 50)); setSelectedIds([]); }}>Previous</Button>
          <Button size="xs" variant="default" disabled={!batchId || offset + 50 >= total || inventory.isFetching}
            onClick={() => { setOffset(offset + 50); setSelectedIds([]); }}>Next</Button>
        </Group>
      </Group>
    </Paper>
    {notice && <Alert color="green" role="status">{notice}</Alert>}

    <Modal opened={confirmOpen} onClose={() => !removal.isPending && setConfirmOpen(false)}
      title="Delete selected samples?" centered closeOnEscape={!removal.isPending}
      closeOnClickOutside={!removal.isPending} withCloseButton={!removal.isPending}>
      <Stack gap="md">
        <Alert color="red">This permanently removes {selectedIds.length} selected record(s), including associated saved media. This action cannot be undone.</Alert>
        <Text size="sm" c="dimmed">Samples with active or queued analysis jobs cannot be deleted. Deletion does not remove records from any CSV files that were already downloaded.</Text>
        {removal.isError && <Alert color="red">{removal.error.message}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" disabled={removal.isPending} onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button color="red" loading={removal.isPending} onClick={() => removal.mutate()}>Permanently delete</Button>
        </Group>
      </Stack>
    </Modal>
  </Stack>;
}
