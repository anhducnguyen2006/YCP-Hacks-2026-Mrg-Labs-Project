import { Badge, Group, Text, Tooltip } from "@mantine/core";
import type { Sample } from "../../api";

type Props = { sample: Pick<Sample, "ai_confidence" | "ai_confidence_reason">; compact?: boolean };

const COLORS = { high: "green", medium: "yellow", low: "red" } as const;

export function SampleConfidence({ sample, compact = false }: Props) {
  if (!sample.ai_confidence) return <Badge size={compact ? "xs" : "sm"} variant="light" color="gray">Not rated</Badge>;
  const label = sample.ai_confidence[0].toUpperCase() + sample.ai_confidence.slice(1);
  return <Tooltip label={sample.ai_confidence_reason || "AI-reported visual certainty, not a calibrated probability"} multiline maw={340}>
    <Badge size={compact ? "xs" : "sm"} variant="light" color={COLORS[sample.ai_confidence]}>
      {compact ? label : `${label} confidence`}
    </Badge>
  </Tooltip>;
}

export function ConfidenceExplanation() {
  return <Group gap="xs" wrap="wrap">
    <Text size="xs" c="dimmed">AI-reported reading confidence:</Text>
    <Badge color="green" variant="light" size="xs">High</Badge>
    <Badge color="yellow" variant="light" size="xs">Medium</Badge>
    <Badge color="red" variant="light" size="xs">Low</Badge>
    <Text size="xs" c="dimmed">Subjective assessment, not a measured accuracy percentage. Unrated older scans remain unchanged.</Text>
  </Group>;
}
