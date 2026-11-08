import { useState } from "react";
import { Alert, Box, Button, Grid, Group, Loader, Paper, Select, Stack, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, FlaskConical, Plus, ScanLine } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Batch } from "../../api";
import { useWorkspaceSettings } from "../settings/WorkspaceSettings";
import { BulkUpload } from "./BulkUpload";
import { useActiveBatch } from "../samples/useActiveBatch";

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ScanPage() {
  const { preferences } = useWorkspaceSettings();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => preferences.receivingDate || localDate());

  const batches = useQuery({ queryKey: ["batches"], queryFn: api.batches, retry: false });
  const batchId = useActiveBatch(params.get("batch"), batches.data);
  const create = useMutation({
    mutationFn: () => api.createBatch({
      name: name.trim(), receiving_date: date,
      default_export_filename: preferences.exportFilename,
    }),
    onSuccess: (batch) => {
      client.setQueryData<Batch[]>(["batches"], previous => [batch, ...(previous || []).filter(item => item.id !== batch.id)]);
      void client.invalidateQueries({ queryKey: ["batches"] });
      setParams({ batch: batch.id });
      setCreating(false);
      setName("");
    },
  });

  return <Stack gap="lg" className="scan-page">
    <Group justify="space-between" align="center" className="intake-heading">
      <Box>
        <Text className="eyebrow">SAMPLE INTAKE</Text>
        <Title order={1} mt={6}>Scan samples</Title>
        <Text c="dimmed" mt="xs">Choose a batch, add rotation videos, and review the results in Samples.</Text>
      </Box>
      <ThemeIcon color="green" variant="light" size={48} radius="lg"><ScanLine size={26} /></ThemeIcon>
    </Group>

    <Grid gutter="lg" align="start">
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Stack gap="md">
          <Paper withBorder radius="lg" p="lg" className="intake-panel">
            <Group justify="space-between" mb="sm">
              <Title order={3}>1. Choose a batch</Title>
              <Button variant="subtle" color="green" size="xs" leftSection={<Plus size={14} />}
                onClick={() => setCreating((open) => !open)}>
                {creating ? "Use existing batch" : "New batch"}
              </Button>
            </Group>
            {batches.isLoading && <Group><Loader size="sm" /><Text size="sm">Loading batches…</Text></Group>}
            {batches.isError && <Alert color="red" icon={<AlertCircle size={18} />} title="Batch API unavailable">
              <Text size="sm">{batches.error.message}</Text>
              <Button mt="sm" size="xs" variant="white" onClick={() => void batches.refetch()}>Retry connection</Button>
            </Alert>}
            {creating ? <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
              <Stack gap="sm">
                <TextInput label="Batch name" placeholder="Morning sample intake"
                  value={name} maxLength={200} required
                  onChange={(event) => setName(event.currentTarget.value)} />
                <TextInput label="Date received" type="date" value={date} required
                  onChange={(event) => setDate(event.currentTarget.value)} />
                <Text size="xs" c="dimmed">This receiving date applies to every sample in the new batch.</Text>
                <Button color="green" type="submit" loading={create.isPending}
                  disabled={!name.trim() || !date}>Create batch</Button>
                {create.isError && <Alert color="red">{create.error.message}</Alert>}
              </Stack>
            </form> : <Select label="Active batch" placeholder="Choose a batch" searchable
              data={(batches.data ?? []).map((batch) => ({
                value: batch.id, label: `${batch.name} · ${batch.receiving_date}`,
              }))}
              value={batchId}
              onChange={(value) => setParams(value ? { batch: value } : {})}
              disabled={batches.isLoading || batches.isError}
              nothingFoundMessage="No matching batches" />}
            {batches.isSuccess && !batches.data.length && !creating &&
              <Text size="sm" c="dimmed" mt="sm">No batches yet. Create one to start scanning.</Text>}
          </Paper>

          <Paper withBorder radius="lg" p="lg" className="intake-panel intake-media-panel">
            <Group justify="space-between" align="center" mb="sm">
              <Title order={3}>2. Add videos</Title>
              {batchId && <Button component={Link} to={`/samples?batch=${encodeURIComponent(batchId)}`}
                color="green" variant="subtle" size="xs"
                rightSection={<ArrowRight size={14} />}>View batch samples</Button>}
            </Group>
            {batchId ? <BulkUpload key={batchId} batchId={batchId} /> :
              <Alert icon={<FlaskConical size={18} />} color="gray">
                Select or create a batch above to upload sample videos.
              </Alert>}
          </Paper>
        </Stack>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Paper withBorder radius="lg" p="lg" className="scan-guide">
          <Text className="eyebrow">A CLEAR LABEL STARTS HERE</Text>
          <Title order={4} mt="xs" mb="md">Video checklist</Title>
          <Stack gap="sm">
            {[
              "Use even lighting; keep the label in focus.",
              "Rotate each tube through one full turn.",
              "Keep the entire label inside the frame.",
              "Check the recording before uploading.",
            ].map((tip, index) => <Group key={tip} gap="sm" align="flex-start" wrap="nowrap">
              <ThemeIcon color="green" variant="light" size={24} radius="xl">{index + 1}</ThemeIcon>
              <Text size="sm" style={{ flex: 1 }}>{tip}</Text>
            </Group>)}
          </Stack>
          <Text size="xs" c="dimmed" mt="lg">
            One tube per video · MOV, MP4, WebM · 50 MB maximum per video.
            Analysis runs in the background after upload.
          </Text>
        </Paper>
      </Grid.Col>
    </Grid>
  </Stack>;
}
