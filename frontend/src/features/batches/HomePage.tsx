import { Badge, Box, Button, Group, Modal, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ArrowRight, BookOpen, CheckCircle2, FileSpreadsheet, FlaskConical, FolderOpen, Layers, Plus, ScanLine, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export function HomePage() {
  const [instructionsOpen, instructions] = useDisclosure();
  const [batchOpen, batch] = useDisclosure();

  return (
    <Stack gap="xl" className="home-page">
      <Group justify="space-between" align="flex-start">
        <Box><Text className="eyebrow">YOUR LABORATORY WORKSPACE</Text><Title order={1} mt={6}>Sample digitization, simplified.</Title><Text c="dimmed" mt="sm">From sample tube to structured data, with you in control.</Text></Box>
        <Badge variant="outline" color="gray">Foundation preview</Badge>
      </Group>

      <Paper className="welcome-panel" p="xl" radius="lg">
        <div className="welcome-content">
          <Text className="eyebrow">MRG SAMPLE SCANNER</Text>
          <Title order={2} mt="sm">Less typing.<br />More time for the lab.</Title>
          <Text mt="md" c="dimmed" maw={480}>A guided workspace for capturing sample labels, checking extracted information, and preparing your CSV.</Text>
          <Group mt="xl"><Button color="green" size="md" leftSection={<Plus size={18} />} onClick={batch.open}>New Batch</Button><Button variant="default" size="md" leftSection={<BookOpen size={18} />} onClick={instructions.open}>Capture instructions</Button></Group>
          <Text size="xs" c="dimmed" mt="md">Capture, processing, and export will be connected in the next phase.</Text>
        </div>
        <div className="workflow-visual" aria-hidden="true">
          <div className="label-preview"><div className="label-preview-top"><FlaskConical size={20} /><span>SAMPLE LABEL</span></div><strong>OIL & GREASE</strong><div className="label-line" /><div className="label-line short" /><div className="barcode" /><span>Ready for a closer look</span></div>
          <div className="visual-arrow"><ArrowRight size={24} /></div><div className="csv-preview"><FileSpreadsheet size={36} /><strong>CSV</strong><span>Structured records</span></div>
        </div>
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        {[{ icon: Layers, title: "Samples processed", detail: "No processing data yet", color: "green" }, { icon: ShieldCheck, title: "Needs review", detail: "No review data yet", color: "yellow" }, { icon: FileSpreadsheet, title: "Ready for export", detail: "No export data yet", color: "blue" }].map(({ icon: Icon, title, detail, color }) => <Paper key={title} withBorder radius="md" p="lg"><Group wrap="nowrap"><ThemeIcon size={46} radius="md" variant="light" color={color}><Icon size={23} /></ThemeIcon><Box><Text size="sm" fw={600}>{title}</Text><Text fw={800} size="xl" c="navy">—</Text><Text size="xs" c="dimmed">{detail}</Text></Box></Group></Paper>)}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper withBorder radius="lg" p="xl"><Group justify="space-between"><Title order={3}>Recent batches</Title><Badge color="gray" variant="light">Not connected</Badge></Group><Stack align="center" gap="sm" className="batch-empty"><ThemeIcon size={54} radius="xl" variant="light" color="gray"><FolderOpen size={27} /></ThemeIcon><Text fw={700}>Your batches will appear here</Text><Text size="sm" c="dimmed" ta="center" maw={330}>Once batch saving is connected, you can return here to resume unfinished work.</Text><Button variant="subtle" color="green" rightSection={<ArrowRight size={16} />} onClick={batch.open}>Explore the next step</Button></Stack></Paper>
        <Paper withBorder radius="lg" p="xl"><Title order={3}>From label to record</Title><Stack gap="lg" mt="xl">{[{ icon: ScanLine, title: "1. Capture", text: "Record a short video while rotating a sample tube." }, { icon: ShieldCheck, title: "2. Review", text: "Compare extracted fields with the label and correct uncertain readings." }, { icon: CheckCircle2, title: "3. Export", text: "Prepare selected samples in the laboratory’s CSV format." }].map(({ icon: Icon, title, text }) => <Group key={title} wrap="nowrap" align="flex-start"><ThemeIcon variant="light" color="green" radius="md" size={38}><Icon size={20} /></ThemeIcon><Box><Text fw={700} size="sm">{title}</Text><Text c="dimmed" size="sm" mt={3}>{text}</Text></Box></Group>)}</Stack><Text size="xs" c="dimmed" mt="xl">Planned workflow · Large and Small sample labels</Text></Paper>
      </SimpleGrid>

      <Modal opened={instructionsOpen} onClose={instructions.close} title="Capture instructions" centered><Stack><Text size="sm">For the planned capture workflow:</Text><ol className="capture-steps"><li>Choose the correct Large or Small label type.</li><li>Place one tube in even lighting with its label facing the camera.</li><li>Rotate it slowly through a full turn, keeping the label in frame.</li><li>Check that the text is readable; retake if it is blurred or obscured.</li></ol><Text size="sm" c="dimmed">Keep the physical sample available for checking uncertain readings. Camera recording is not connected in this preview.</Text><Button color="green" onClick={instructions.close}>Got it</Button></Stack></Modal>
      <Modal opened={batchOpen} onClose={batch.close} title="Start a new batch" centered><Stack><Text>Batch creation is the next implementation step.</Text><Text size="sm" c="dimmed">This preview establishes the workspace. Saving batches and recording samples are not available yet.</Text><Button component={Link} to="/scan" color="green" rightSection={<ArrowRight size={16} />}>View capture workspace</Button></Stack></Modal>
    </Stack>
  );
}
