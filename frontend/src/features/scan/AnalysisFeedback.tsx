import { useEffect, useRef, useState } from "react";
import { Button, Group, Portal, Progress, Stack, Text, Transition } from "@mantine/core";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import type { BatchStatus } from "../../api";
import "./analysis-feedback.css";
import { playCompletionChime } from "../../components/uiSounds";

export function AnalysisFeedback({batchId, status, knownIds = [], progress}: {
  batchId: string; status?: BatchStatus; knownIds?: string[];
  progress?: {total: number; completed: number; failed: number; canceled: number; active: number; uploading: number; paused?: number};
}) {
  const previous = useRef<Map<string, string> | null>(null);
  const reported = useRef(new Set<string>());
  const [message, setMessage] = useState<{completed: number; failed: number} | null>(null);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!status) return;
    let completed = 0, failed = 0;
    for (const item of status.items) {
      const before = previous.current?.get(item.id);
      if (["queued", "processing"].includes(item.status)) reported.current.delete(item.id);
      const newlyFinished = (before && before !== item.status && ["queued", "processing", "paused"].includes(before))
        || (!before && knownIds.includes(item.id));
      if (newlyFinished && !reported.current.has(item.id) && ["completed", "failed"].includes(item.status)) {
        reported.current.add(item.id);
        if (item.status === "completed") completed++; else failed++;
      }
    }
    previous.current = new Map(status.items.map(item => [item.id, item.status]));
    if (completed || failed) {
      setMessage({completed, failed}); setOpened(true);
      if (completed && !failed) playCompletionChime();
    }
  }, [status, knownIds]);
  const counts = progress || (status ? {total: status.total, completed: status.completed,
    failed: status.failed, canceled: status.canceled || 0, active: status.queued + status.processing, uploading: 0, paused: status.paused || 0} : null);
  const finished = counts ? counts.completed + counts.failed + counts.canceled : 0;
  const percentage = counts?.total ? Math.round(finished / counts.total * 100) : 0;
  return <>
    {counts && counts.total > 0 && <Stack gap={8} className="analysis-progress-panel">
      <Group justify="space-between"><Text fw={700} size="sm">{counts.active > 0 ? counts.uploading > 0 ? "Uploading & scanning" : "Scanning sample labels" : counts.paused ? "Analysis paused — waiting for capacity" : finished === counts.total ? "Analysis finished" : "Ready for analysis"}</Text>
        <Text size="sm">{finished} / {counts.total} finished · {percentage}%</Text></Group>
      <Progress.Root size="lg" aria-label="Sample processing progress" aria-valuemin={0} aria-valuemax={counts.total} aria-valuenow={finished} role="progressbar">
        <Progress.Section value={counts.completed / counts.total * 100} color="var(--lab-accent)" />
        <Progress.Section value={counts.failed / counts.total * 100} color="red" />
        <Progress.Section value={counts.canceled / counts.total * 100} color="gray" />
      </Progress.Root>
      {counts.active > 0 && <div className="analysis-activity-track" aria-hidden="true"><span /></div>}
      <Text size="xs" c="dimmed" role="status">{counts.completed} analyzed{counts.failed ? ` · ${counts.failed} failed` : ""}{counts.canceled ? ` · ${counts.canceled} canceled` : ""}{counts.active ? ` · ${counts.active} uploading, queued or scanning` : ""}.
        {counts.active > 0 && " Progress counts finished samples; the moving indicator means analysis is active."}</Text>
    </Stack>}
    <Portal><Transition mounted={opened} transition="slide-left" duration={380} exitDuration={260}>
      {styles => <aside style={styles} className="analysis-glass-toast" data-tone={message?.failed ? "attention" : "success"} aria-label="Analysis notification">
        <div className="analysis-toast-icon">{message?.failed ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}</div>
        <Stack gap={6} style={{minWidth: 0, flex: 1}}>
          <div role="status" aria-live="polite" aria-atomic="true"><Text fw={700}>{message?.failed ? "Analysis needs attention" : "Analysis complete"}</Text>
            <Text size="sm">{message?.completed ? `${message.completed} sample${message.completed === 1 ? " is" : "s are"} ready to review.` : ""}{message?.failed ? ` ${message.failed} failed; check the scan details.` : ""}</Text></div>
          <Text size="xs">Check extracted values against the original labels before export.</Text>
          <Button component="a" href={`/samples?batch=${encodeURIComponent(batchId)}`} size="xs" variant="default" onClick={() => setOpened(false)}>Review samples</Button>
        </Stack>
        <button type="button" className="analysis-toast-close" aria-label="Dismiss analysis notification" onClick={() => setOpened(false)}><X size={18} /></button>
      </aside>}
    </Transition></Portal>
  </>;
}
