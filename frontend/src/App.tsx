import { AppShell, Badge, Box, Burger, Button, Group, Modal, NavLink, Stack, Text, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { FileSliders, FlaskConical, HelpCircle, House, ScanLine, Settings } from "lucide-react";
import { NavLink as RouterLink, Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { ScanPage } from "./features/scan/ScanPage";
import { SamplesPage } from "./features/samples/SamplesPage";
import { TemplatesPage } from "./features/templates/TemplatesPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { WorkspaceSettingsProvider } from "./features/settings/WorkspaceSettings";
import { HomePage } from "./features/batches/HomePage";
import { ThemeSwitch } from "./components/ThemeSwitch";

const navigation = [
  { label: "Home", icon: House, to: "/welcome" },
  { label: "Scan", icon: ScanLine, to: "/scan" },
  { label: "Samples", icon: FlaskConical, to: "/samples" },
  { label: "Export", icon: FileSliders, to: "/templates" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

function LegacyReviewRedirect() {
  const [params] = useSearchParams();
  const query = params.toString();
  return <Navigate to={"/samples" + (query ? "?" + query : "")} replace />;
}

function Layout() {
  const [opened, { toggle }] = useDisclosure();
  const [helpOpened, help] = useDisclosure(false);
  const location = useLocation();
  return (
    <AppShell className="lab-shell" header={{ height: 80 }} navbar={{ width: 244, breakpoint: "sm", collapsed: { mobile: !opened } }} padding="xl">
      <AppShell.Header className="header">
        <Group h="100%" px="xl" justify="space-between">
          <Group gap="sm">
            <Burger hiddenFrom="sm" opened={opened} onClick={toggle} size="sm" />
            <UnstyledButton component={RouterLink} to="/welcome" className="brand">
              <span className="brand-logo-pair" role="img" aria-label="MRG Laboratories">
                <img src="/mrg-laboratories.png" alt="" className="brand-logo brand-logo-light" />
                <img src="/mrg-laboratories-dark-clean.svg" alt="" className="brand-logo brand-logo-dark" />
              </span>
              <Text className="brand-app-name" fw={700}>Sample Label Digitizer</Text>
            </UnstyledButton>
          </Group>
          <Group gap="sm">
            <ThemeSwitch />
            <Button variant="subtle" color="gray" size="sm" leftSection={<HelpCircle size={18} />}
              onClick={help.open} aria-label="How to use Sample Scanner">Help</Button>
            <Badge color="green" variant="light" leftSection={<span className="status-dot" />}>Local workspace</Badge>
          </Group>
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
      <Modal opened={helpOpened} onClose={help.close} title="How to use Sample Scanner" centered size="lg">
        <Stack gap="md">
          <Text size="sm"><strong>1. Scan:</strong> Create or select a batch and set its receiving date.
            Drop rotation videos into the upload area, then choose Upload & analyze.</Text>
          <Text size="sm"><strong>2. Samples:</strong> Search, sort, and filter samples by confidence.
            Click a row to compare the original video and extracted frames, edit values, and verify readings.</Text>
          <Text size="sm"><strong>3. Export:</strong> Select a batch and download its completed records
            using the required seven-column CSV format.</Text>
          <Text size="xs" c="dimmed">AI confidence is a subjective reading assessment, not a measured probability.
            Verify uncertain handwritten values against the source recording.</Text>
          <Button color="green" onClick={help.close}>Got it</Button>
        </Stack>
      </Modal>
    </AppShell>
  );
}

export function App() {
  return <WorkspaceSettingsProvider><Routes><Route element={<Layout />}>
    <Route index element={<Navigate to="/scan" replace />} />
    <Route path="welcome" element={<HomePage />} />
    <Route path="scan" element={<ScanPage />} />
    <Route path="samples" element={<SamplesPage />} />
    <Route path="review" element={<LegacyReviewRedirect />} />
    <Route path="templates" element={<TemplatesPage />} />
    <Route path="settings" element={<SettingsPage />} />
  </Route></Routes></WorkspaceSettingsProvider>;
}
