import { AppShell, Badge, Box, Burger, Group, NavLink, Stack, Text, ThemeIcon, Title, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Activity, FileSliders, FlaskConical, FolderKanban, ScanLine, Settings, ShieldCheck } from "lucide-react";
import { NavLink as RouterLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { HomePage } from "./features/batches/HomePage";
import { ReviewPage } from "./features/review/ReviewPage";
import { ScanPage } from "./features/scan/ScanPage";

const navigation = [
  { label: "Batches", icon: FolderKanban, to: "/" },
  { label: "Scan", icon: ScanLine, to: "/scan" },
  { label: "Samples", icon: FlaskConical, to: "/samples" },
  { label: "Review", icon: ShieldCheck, to: "/review" },
  { label: "Templates & Export", icon: FileSliders, to: "/templates" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

function Page({ title, eyebrow, description }: { title: string; eyebrow: string; description: string }) {
  return (
    <Stack gap="xl">
      <Box>
        <Text className="eyebrow">{eyebrow}</Text>
        <Title order={1} mt={6}>{title}</Title>
        <Text c="dimmed" mt="sm" maw={640}>{description}</Text>
      </Box>
      <Box className="empty-panel">
        <ThemeIcon size={56} radius="xl" variant="light" color="teal"><Activity size={26} /></ThemeIcon>
        <Title order={3} mt="lg">Your workspace is ready</Title>
        <Text c="dimmed" maw={440} ta="center">This foundation is in place. Connect your first batch to begin building the laboratory workflow.</Text>
        <Badge mt="md" variant="light" color="teal">Coming in the next phase</Badge>
      </Box>
    </Stack>
  );
}

function Layout() {
  const [opened, { toggle }] = useDisclosure();
  const location = useLocation();
  return (
    <AppShell header={{ height: 72 }} navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }} padding="xl">
      <AppShell.Header className="header">
        <Group h="100%" px="xl" justify="space-between">
          <Group gap="sm">
            <Burger hiddenFrom="sm" opened={opened} onClick={toggle} size="sm" />
            <UnstyledButton component={RouterLink} to="/" className="brand">
              <img src="/mrg-laboratories.png" alt="MRG Laboratories" className="brand-logo" />
              <Text className="brand-app-name" fw={700}>Sample Scanner</Text>
            </UnstyledButton>
          </Group>
          <Badge color="teal" variant="light" leftSection={<span className="status-dot" />}>Local workspace</Badge>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md" className="navbar">
        <Text className="nav-label">WORKSPACE</Text>
        <Stack gap={4}>
          {navigation.map(({ label, icon: Icon, to }) => (
            <NavLink key={to} component={RouterLink} to={to} label={label} leftSection={<Icon size={18} strokeWidth={1.8} />} active={location.pathname === to} onClick={toggle} />
          ))}
        </Stack>
        <Box mt="auto" className="nav-footer">
          <Text size="xs" fw={700} c="teal">MRG LABORATORIES</Text>
          <Text size="xs" c="dimmed" mt={4}>Sample digitization workspace</Text>
        </Box>
      </AppShell.Navbar>
      <AppShell.Main><Outlet /></AppShell.Main>
    </AppShell>
  );
}

export function App() {
  return <Routes><Route element={<Layout />}>
    <Route index element={<HomePage />} />
    <Route path="scan" element={<ScanPage />} />
    <Route path="samples" element={<Page eyebrow="SAMPLE INVENTORY" title="Samples" description="Inspect extracted fields, edit values, and select samples for export." />} />
    <Route path="review" element={<ReviewPage />} />
    <Route path="templates" element={<Page eyebrow="CONFIGURATION" title="Templates & export" description="Configure label templates and CSV export profiles for your team." />} />
    <Route path="settings" element={<Page eyebrow="WORKSPACE" title="Settings" description="Manage local workspace preferences and processing thresholds." />} />
  </Route></Routes>;
}
