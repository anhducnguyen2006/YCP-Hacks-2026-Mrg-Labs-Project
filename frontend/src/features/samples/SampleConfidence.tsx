import { Badge, Group, Text, Tooltip } from "@mantine/core";
import type { Sample } from "../../api";

type Props = { sample: Pick<Sample, "ai_confidence" | "ai_confidence_reason">; compact?: boolean };

const COLORS = { high: "green", medium: "yellow", low: "red" } as const;

export function SampleConfidence({ sample, compact = false }: Props) {
  if (!sample.ai_confidence) return <Badge size={compact ? "xs" : "sm"} variant="light" color="gray">Not rated</Badge>;
  const label = sample.ai_confidence === "medium" ? "MED" : sample.ai_confidence.toUpperCase();
  return <Tooltip label={sample.ai_confidence_reason || "Subjective visual certainty with date checks, not a calibrated probability"} multiline maw={340}>
    <Badge size={compact ? "xs" : "sm"} variant="light" color={COLORS[sample.ai_confidence]}>
      {label}
    </Badge>
  </Tooltip>;
}

export function ConfidenceExplanation() {
  return <Group gap="xs" wrap="wrap">
    <Text size="xs" c="dimmed">Reading confidence:</Text>
    <Badge color="green" variant="light" size="xs">HIGH</Badge>
    <Badge color="yellow" variant="light" size="xs">MED</Badge>
    <Badge color="red" variant="light" size="xs">LOW</Badge>
    <Text size="xs" c="dimmed">Subjective AI assessment, lowered when date checks identify ambiguity or conflicts; not a measured probability. Older scans remain unchanged.</Text>
  </Group>;
}
