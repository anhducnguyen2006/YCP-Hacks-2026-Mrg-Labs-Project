import { useMemo, useState } from "react";
import { Alert, Badge, Box, Button, Group, Loader, Paper, Select, Stack, Table, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ArrowRight, FlaskConical, Plus, RefreshCw, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type Sample } from "../../api";
import { sampleColumns } from "./columns";

export function SamplesPage() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>("all");
  const batches = useQuery({ queryKey: ["batches"], queryFn: api.batches, retry: false });
  const samples = useQuery({ queryKey: ["samples", batchId, offset], queryFn: () => api.samples(batchId!, offset), enabled: Boolean(batchId), retry: false });
  const data = useMemo(() => (samples.data ?? []).filter((sample) => {
    const matchesStatus = status === "all" || (status === "review" ? sample.fields.some((field) => field.review_required && !field.reviewed) : sample.processing_status === status);
    const term = search.trim().toLowerCase();
    return matchesStatus && (!term || sample.id.toLowerCase().includes(term) || sample.fields.some((field) => field.current_value?.toLowerCase().includes(term)));
  }), [samples.data, search, status]);
  const columns = useMemo<ColumnDef<Sample>[]>(() => [
    ...sampleColumns.map(({ key, label }) => ({ id: key, header: label, accessorFn: (sample: Sample) => sample.fields.find((field) => field.field_key === key)?.current_value ?? "" })),
    { id: "status", header: "Processing", cell: ({ row }) => <Badge variant="light" color={row.original.processing_status === "completed" ? "green" : row.original.processing_status === "failed" ? "red" : "blue"}>{row.original.processing_status}</Badge> },
    { id: "review", header: "Review", cell: ({ row }) => <Stack gap={4}>{row.original.fields.some((field) => field.review_required && !field.reviewed) && <Text size="xs" c="#805500">Needs review</Text>}<Button component={Link} to={`/review?batch=${encodeURIComponent(row.original.batch_id)}&sample=${encodeURIComponent(row.original.id)}&offset=${offset}`} size="compact-xs" color="green" variant="subtle">Inspect record</Button></Stack> },
  ], [offset]);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  return <Stack gap="xl" className="workspace-page"><Group justify="space-between"><Box><Text className="eyebrow">SAMPLE INVENTORY</Text><Title order={1} mt={6}>Every sample, in one place.</Title><Text c="dimmed" mt="sm">Browse saved records and find the labels that need a closer look.</Text></Box><Button component={Link} to="/scan" color="green" leftSection={<Plus size={16} />}>Add sample</Button></Group>
    <Paper withBorder p="lg" radius="lg"><Group align="flex-end"><Select className="review-batch-select" label="Batch" placeholder="Choose a batch" value={batchId} data={(batches.data ?? []).map((batch) => ({ value: batch.id, label: batch.name }))} onChange={(value) => { setBatchId(value); setOffset(0); }} searchable disabled={batches.isLoading} /><TextInput label="Search this page" placeholder="Sample ID, machine, component…" leftSection={<Search size={16} />} value={search} onChange={(event) => setSearch(event.currentTarget.value)} /><Select label="Status" value={status} onChange={setStatus} data={[{ value: "all", label: "All statuses" }, { value: "queued", label: "Queued" }, { value: "processing", label: "Processing" }, { value: "completed", label: "Completed" }, { value: "failed", label: "Failed" }, { value: "review", label: "Needs review" }]} /><Button variant="default" aria-label="Refresh inventory" loading={batches.isFetching || samples.isFetching} onClick={() => { void batches.refetch(); if (batchId) void samples.refetch(); }}><RefreshCw size={17} /></Button></Group></Paper>
    {(batches.isError || samples.isError) && <Alert color="red" title="Sample records unavailable">{batches.error?.message ?? samples.error?.message}. Check the sample API connection and refresh.</Alert>}
    <Paper withBorder radius="lg" className="review-table-panel"><Group p="lg" justify="space-between"><Group><ThemeIcon color="green" variant="light"><FlaskConical size={19} /></ThemeIcon><Title order={3}>Sample records</Title></Group><Badge color="gray" variant="light">{data.length} on this page</Badge></Group><Table.ScrollContainer minWidth={1350}><Table className="review-table" horizontalSpacing="lg" verticalSpacing="md"><Table.Thead>{table.getHeaderGroups().map((group) => <Table.Tr key={group.id}>{group.headers.map((header) => <Table.Th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</Table.Th>)}</Table.Tr>)}</Table.Thead><Table.Tbody>{table.getRowModel().rows.map((row) => <Table.Tr key={row.original.id}>{row.getVisibleCells().map((cell) => <Table.Td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Td>)}</Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>
      <Stack align="center" p="lg" gap="sm">{batches.isLoading || (batchId && samples.isLoading) ? <Group role="status"><Loader size="sm" color="green" /><Text size="sm">Loading records…</Text></Group> : !data.length && <><Text fw={600}>{!batchId ? "Choose a batch to view its samples" : samples.isError ? "Records could not be loaded" : "No matching samples on this page"}</Text><Text size="sm" c="dimmed">{!batchId ? "The seven data columns stay visible while you get started." : "Try another filter or page, or add a sample in Scan."}</Text></>}</Stack>
      <Group p="lg" justify="space-between"><Text size="xs" c="dimmed">Page {offset / 50 + 1} · 50 records per page · Search and filters apply to this page</Text><Group><Button size="xs" variant="default" disabled={!offset || samples.isFetching} onClick={() => setOffset(offset - 50)}>Previous</Button><Button size="xs" variant="default" disabled={!batchId || (samples.data?.length ?? 0) < 50 || samples.isFetching} onClick={() => setOffset(offset + 50)}>Next</Button></Group></Group></Paper>
    <Paper withBorder radius="lg" p="lg"><Group justify="space-between"><Box><Text fw={700}>Found something that needs checking?</Text><Text size="sm" c="dimmed">Inspect a record to compare its data with the source label.</Text></Box><Button component={Link} to="/review" variant="subtle" color="green" rightSection={<ArrowRight size={16} />}>Go to Review</Button></Group></Paper>
  </Stack>;
}
