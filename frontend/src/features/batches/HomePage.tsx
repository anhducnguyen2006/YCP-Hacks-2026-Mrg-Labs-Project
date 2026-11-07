import { useState } from "react";
import { Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { ArrowRight, FileSpreadsheet, Pause, Play, ScanLine, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspaceSettings } from "../settings/WorkspaceSettings";

const steps = [
  { number: "01", icon: ScanLine, title: "Capture the label", description: "Create a batch and upload a short rotation video of each sample tube.", link: "/scan", action: "Open Scan" },
  { number: "02", icon: ShieldCheck, title: "Verify the details", description: "Compare extracted values with the original frames. Correct and verify readings in Samples.", link: "/samples", action: "View samples" },
  { number: "03", icon: FileSpreadsheet, title: "Prepare your records", description: "Download completed records in the laboratory’s seven-column CSV format.", link: "/templates", action: "Open Export" },
];

export function HomePage() {
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const { preferences } = useWorkspaceSettings();
  const staticMode = reducedMotion || preferences.reduceMotion;
  return <Stack gap={32} className="lab-welcome">
    <Group justify="space-between"><Text className="eyebrow">MRG LABORATORIES / SAMPLE INTAKE</Text><Badge color="green" variant="light">Local workspace</Badge></Group>
    <Paper component="section" className="lab-welcome-hero" radius="lg" withBorder aria-labelledby="welcome-title" data-running={!staticMode && !paused}>
      <div className="lab-gradient" aria-hidden="true" />
      <Box className="lab-welcome-copy"><Text className="eyebrow">FROM LABEL TO LABORATORY RECORD</Text><Title order={1} id="welcome-title">Less transcription.<br />More time for research.</Title><Text className="lab-welcome-description">Digitize oil and grease sample labels in one focused workspace. Capture a video, verify the extracted details, and prepare your records.</Text><Group gap="md" mt={30}><Button component={Link} to="/scan" size="lg" color="green" rightSection={<ArrowRight size={18} />}>Start sample intake</Button><Button component={Link} to="/samples" size="lg" variant="default">Browse samples</Button></Group><Text size="sm" mt="lg" c="#455867">Supports Large and Small labels · Human verification stays in your hands</Text></Box>
      <Box className="lab-hero-aside"><span className="lab-hero-rule" /><Text className="eyebrow">A CLEAR PATH</Text><Text fw={600} size="lg" c="#102e51">Scan. Verify. Export.</Text><Text size="sm" c="#455867" mt="xs">Your sample records, with the source label always within reach.</Text></Box>
      {!staticMode && <Button className="lab-motion-control" size="sm" variant="default" leftSection={paused ? <Play size={14} /> : <Pause size={14} />} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "Resume background" : "Pause background"}</Button>}
    </Paper>
    <Box><Text className="eyebrow">A SIMPLE, REPEATABLE WORKFLOW</Text><Title order={2} mt="xs">Three steps. One reliable record.</Title></Box>
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">{steps.map(({ number, icon: Icon, title, description, link, action }) => <Paper component="section" key={number} withBorder radius="md" p="xl" className="lab-workflow-card"><Group justify="space-between"><ThemeIcon size={44} radius="md" color="green" variant="light"><Icon size={22} /></ThemeIcon><Text className="lab-step-number">{number}</Text></Group><Title order={3} mt="xl">{title}</Title><Text size="sm" c="#455867" mt="sm">{description}</Text><Button component={Link} to={link} variant="subtle" color="green" mt="lg" rightSection={<ArrowRight size={16} />}>{action}</Button></Paper>)}</SimpleGrid>
    <Paper withBorder p="lg" radius="md"><Group gap="md" align="flex-start" wrap="nowrap"><ShieldCheck size={22} color="#28603c" aria-hidden="true" /><Box><Text fw={600} size="sm">Designed for careful work</Text><Text size="sm" c="#455867" mt={4}>AI readings can contain errors. Verify uncertain handwriting, dates, and identifiers against the source before using exported records.</Text></Box></Group></Paper>
  </Stack>;
}
