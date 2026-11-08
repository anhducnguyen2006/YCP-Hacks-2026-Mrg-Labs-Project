import { useState } from "react";
import { Badge, Box, Image, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { ImageOff } from "lucide-react";
import { api, type SampleMedia } from "../../api";

type FrameGalleryProps = {
  frames: SampleMedia[];
};

function frameTime(frame: SampleMedia): string | null {
  const value = frame.metadata_json.timestamp_seconds;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? `${value.toFixed(2)}s`
    : null;
}

export function FrameGallery({ frames }: FrameGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const sorted = [...frames]
    .filter((frame) => frame.media_type === "keyframe")
    .sort((a, b) => {
      const aRank = a.metadata_json.frame_rank;
      const bRank = b.metadata_json.frame_rank;
      if (typeof aRank === "number" && typeof bRank === "number") {
        return aRank - bRank || a.id.localeCompare(b.id);
      }
      const aTime = a.metadata_json.timestamp_seconds;
      const bTime = b.metadata_json.timestamp_seconds;
      if (typeof aTime === "number" && typeof bTime === "number") {
        return aTime - bTime || a.id.localeCompare(b.id);
      }
      return a.id.localeCompare(b.id);
    });
  const selected = sorted.find((frame) => frame.id === selectedId) ?? sorted[0];
  const activeIndex = sorted.findIndex((frame) => frame.id === selected?.id);
  const failed = selected ? failedIds.includes(selected.id) : false;

  const markFailed = (id: string) => {
    setFailedIds((previous) => previous.includes(id) ? previous : [...previous, id]);
  };

  if (sorted.length === 0) {
    return <Box className="review-image-empty">
      <ImageOff size={30} />
      <Text size="sm">No selected frames available yet.</Text>
    </Box>;
  }

  return <Stack gap="sm">
    {selected && !failed
      ? <a
          href={api.mediaUrl(selected.id)}
          target="_blank"
          rel="noreferrer"
          className="review-image-link"
          aria-label={`Open selected frame ${activeIndex + 1} in full size`}
        >
          <Image
            src={api.mediaUrl(selected.id)}
            alt={`Selected sample label frame ${activeIndex + 1} of ${sorted.length}`}
            fit="contain"
            h={320}
            onError={() => markFailed(selected.id)}
          />
          <Text size="xs" ta="center" mt="xs">Open full image ↗</Text>
        </a>
      : <Box className="review-image-empty">
          <ImageOff size={30} />
          <Text size="sm">This frame could not be loaded. Choose another frame.</Text>
        </Box>}
    <Text size="xs" c="dimmed" role="status">
      Frame {activeIndex + 1} of {sorted.length}
      {selected && frameTime(selected) ? ` · ${frameTime(selected)} into rotation` : ""}
    </Text>
    <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="xs">
      {sorted.map((frame, index) =>
        <Paper
          component="button"
          key={frame.id}
          type="button"
          withBorder
          radius="sm"
          p={4}
          onClick={() => setSelectedId(frame.id)}
          aria-pressed={frame.id === selected?.id}
          aria-label={`View frame ${index + 1}${frameTime(frame) ? ` at ${frameTime(frame)}` : ""}`}
          style={{
            cursor: "pointer",
            borderColor: frame.id === selected?.id ? "var(--mantine-color-green-6)" : undefined,
            borderWidth: frame.id === selected?.id ? 2 : 1,
            backgroundColor: frame.id === selected?.id ? "var(--mantine-color-green-0)" : undefined,
            minWidth: 0,
          }}
        >
          <Box style={{ width: "100%", height: 72, overflow: "hidden", borderRadius: 4 }}>
            {failedIds.includes(frame.id)
              ? <Text size="xs" c="dimmed" ta="center" pt="sm">Unavailable</Text>
              : <img
                  src={api.mediaUrl(frame.id)}
                  alt=""
                  loading="lazy"
                  onError={() => markFailed(frame.id)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />}
          </Box>
          <Badge size="xs" variant="transparent" color="gray" fullWidth>
            {frameTime(frame) ?? `Frame ${index + 1}`}
          </Badge>
        </Paper>
      )}
    </SimpleGrid>
  </Stack>;
}
