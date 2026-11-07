import { AppShell, Badge, Box, Burger, Group, NavLink, Stack, Text, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { FileSliders, FlaskConical, FolderKanban, ScanLine, Settings, ShieldCheck } from "lucide-react";
import { NavLink as RouterLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { HomePage } from "./features/batches/HomePage";
import { ReviewPage } from "./features/review/ReviewPage";
import { ScanPage } from "./features/scan/ScanPage";
import { SamplesPage } from "./features/samples/SamplesPage";
import { TemplatesPage } from "./features/templates/TemplatesPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { WorkspaceSettingsProvider } from "./features/settings/WorkspaceSettings";

const navigation = [
  { label: "Batches", icon: FolderKanban, to: "/" },
  { label: "Scan", icon: ScanLine, to: "/scan" },
  { label: "Samples", icon: FlaskConical, to: "/samples" },
  { label: "Review", icon: ShieldCheck, to: "/review" },
  { label: "Templates & Export", icon: FileSliders, to: "/templates" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

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
  return <WorkspaceSettingsProvider><Routes><Route element={<Layout />}>
    <Route index element={<HomePage />} />
    <Route path="scan" element={<ScanPage />} />
    <Route path="samples" element={<SamplesPage />} />
    <Route path="review" element={<ReviewPage />} />
    <Route path="templates" element={<TemplatesPage />} />
    <Route path="settings" element={<SettingsPage />} />
  </Route></Routes></WorkspaceSettingsProvider>;
}
