import { useState } from "react";
import { Alert, Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { api, type Sample, type SampleField } from "../../api";
import { FrameGallery } from "../review/FrameGallery";
import { SampleConfidence } from "./SampleConfidence";
import { sampleColumns } from "./columns";

function EditableField({ sample, field, label, onSaved }: {
  sample: Sample;
  field: SampleField;
  label: string;
  onSaved: (updated: Sample) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(field.current_value ?? "");
  const save = useMutation({
    mutationFn: () => api.updateField(sample.id, field.field_key, value),
    onSuccess: (updated) => {
      onSaved(updated);
      setEditing(false);
    },
  });

  const startEditing = () => {
    save.reset();
    setValue(field.current_value ?? "");
    setEditing(true);
  };
  const cancelEditing = () => {
    if (!save.isPending) setEditing(false);
  };

  return <Paper withBorder radius="md" p="sm" className="review-field">
    <Group align="flex-start" justify="space-between" wrap="nowrap" gap="xs">
      <Box style={{ minWidth: 0 }}>
        <Text size="xs" fw={700} c="dimmed">{label}</Text>
        {!editing && <Text size="sm" mt={4} style={{ overflowWrap: "anywhere" }}>
          {field.current_value || <Text span c="dimmed" fs="italic">Blank</Text>}
        </Text>}
      </Box>
      {!editing && <Button color="green" variant="subtle" size="compact-xs"
        leftSection={<Pencil size={12} />} onClick={startEditing}>Edit / verify</Button>}
    </Group>
    {editing ? <Stack gap="xs" mt="sm">
      <Text size="xs" c="dimmed">Original AI reading: {field.predicted_value || "Blank"}</Text>
      {field.review_reason && <Text size="xs" c="dimmed">Review note: {field.review_reason}</Text>}
      <TextInput label={label} autoFocus value={value} onChange={(event) => setValue(event.currentTarget.value)}
        description="Leave blank if this field is absent or does not apply." />
      {save.isError && <Alert color="red" role="alert">Could not save this field: {save.error.message}</Alert>}
      <Group justify="flex-end" gap="xs">
        <Button size="xs" variant="default" leftSection={<X size={14} />} disabled={save.isPending}
          onClick={cancelEditing}>Cancel</Button>
        <Button size="xs" color="green" leftSection={<Check size={14} />} loading={save.isPending}
          onClick={() => save.mutate()}>Save & verify field</Button>
      </Group>
    </Stack> : <Text size="xs" c="dimmed" mt="xs">
      {field.reviewed ? "Human verified" : field.review_required ? "Verification pending" : "No review required"}
    </Text>}
  </Paper>;
}

export function SampleInspector({ sample, onSaved }: {
  sample: Sample;
  onSaved: (updated: Sample) => void;
}) {
  const video = sample.media.find((media) => media.media_type === "video");
  return <Stack gap="lg" className="sample-inspector">
    <Group justify="space-between" align="center">
      <Box>
        <Group gap="sm">
          <Title order={3}>Sample {sample.fields.find((field) => field.field_key === "sample_id")?.current_value || "record"}</Title>
          <SampleConfidence sample={sample} />
        </Group>
        <Text size="sm" c="dimmed">Check source frames, then edit or verify each field.</Text>
      </Box>
      <Badge color="gray" variant="light">{sample.label_type} label</Badge>
    </Group>
    {sample.ai_confidence_reason && <Text size="xs" c="dimmed">AI assessment: {sample.ai_confidence_reason}</Text>}
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
      <Stack gap="md">
        <Text size="sm" fw={700}>Source video & selected frames</Text>
        <FrameGallery frames={sample.media} />
        {video && <video key={video.id} className="review-video" controls preload="metadata"
          src={api.mediaUrl(video.id)} aria-label="Original sample rotation video" />}
        <Text size="xs" c="dimmed">Large labels have no Serial Number; small labels have no Reference Lube.
          Date Received always comes from the batch receiving date.</Text>
      </Stack>
      <Stack gap="xs">
        <Text size="sm" fw={700}>Extracted record</Text>
        {sampleColumns.map(({ key, label }) => {
          const field = sample.fields.find((item) => item.field_key === key);
          return field
            ? <EditableField key={field.id} sample={sample} field={field} label={label} onSaved={onSaved} />
            : <Paper key={key} withBorder radius="md" p="sm">
                <Text size="xs" fw={700} c="dimmed">{label}</Text>
                <Text size="sm" c="dimmed">Not extracted yet</Text>
              </Paper>;
        })}
      </Stack>
    </SimpleGrid>
  </Stack>;
}
