import { useState } from "react";
import { Alert, Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Switch, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { Check, Database, FileSpreadsheet, RefreshCw, Save, Settings, Sparkles } from "lucide-react";
import { api } from "../../api";
import { defaultPreferences, useWorkspaceSettings } from "./WorkspaceSettings";

export function SettingsPage() {
  const { preferences, save } = useWorkspaceSettings();
  const [draft, setDraft] = useState(preferences);
  const [notice, setNotice] = useState<"saved" | "error" | null>(null);
  const invalidFilename = (filename: string) =>
    [...filename].some((char) => char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char));
  const filenameError = !draft.exportFilename.trim() || invalidFilename(draft.exportFilename.trim()) || !/\.csv$/i.test(draft.exportFilename.trim()) ? "Enter a filename ending in .csv, without folder paths." : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(preferences);
  const connection = useMutation({ mutationFn: async () => {
    const response = await fetch(`${api.baseUrl}/api/health`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Health check failed (${response.status})`);
    const body = await response.json();
    if (body.status !== "ok") throw new Error("The API did not report a healthy status.");
    return body;
  } });
  const change = (value: Partial<typeof draft>) => { setDraft({ ...draft, ...value }); setNotice(null); };
  return <Stack gap="xl" className="workspace-page"><Group justify="space-between"><Box><Text className="eyebrow">WORKSPACE PREFERENCES</Text><Title order={1} mt={6}>Make it work for you.</Title><Text c="dimmed" mt="sm">Set capture defaults and keep your workspace comfortable.</Text></Box><ThemeIcon color="green" variant="light" size={52} radius="lg"><Settings size={26} /></ThemeIcon></Group>
    <form onSubmit={(event) => { event.preventDefault(); if (!filenameError) setNotice(save({ ...draft, exportFilename: draft.exportFilename.trim() }) ? "saved" : "error"); }}><Stack gap="xl"><SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg"><Stack gap="lg"><Paper withBorder p="xl" radius="lg"><Group mb="lg"><ThemeIcon color="green" variant="light"><Sparkles size={20} /></ThemeIcon><Title order={3}>Appearance & motion</Title></Group><Switch color="green" label="Reduce animations" description="Turn off decorative motion and scroll fades. Your system’s reduced-motion preference is always respected." checked={draft.reduceMotion} onChange={(event) => change({ reduceMotion: event.currentTarget.checked })} /><Text c="dimmed" size="xs" mt="lg">Changes apply when you save. Buttons and inputs remain responsive.</Text></Paper>
    <Paper withBorder p="xl" radius="lg"><Group mb="lg"><ThemeIcon color="green" variant="light"><FileSpreadsheet size={20} /></ThemeIcon><Title order={3}>New batch defaults</Title></Group><Stack><TextInput label="Default CSV filename" value={draft.exportFilename} onChange={(event) => change({ exportFilename: event.currentTarget.value })} error={filenameError} description="Used when creating a new batch. Does not change existing batches." required /><Switch color="green" label="Use today as the receiving date" checked={!draft.receivingDate} onChange={(event) => change({ receivingDate: event.currentTarget.checked ? "" : new Date().toLocaleDateString("en-CA") })} />{draft.receivingDate && <TextInput type="date" label="Default receiving date" value={draft.receivingDate} onChange={(event) => change({ receivingDate: event.currentTarget.value })} required />}<Text size="xs" c="dimmed">You can adjust the receiving date on the Scan page before creating each batch.</Text></Stack></Paper></Stack>
    <Stack gap="lg"><Paper withBorder p="xl" radius="lg"><Group justify="space-between" mb="lg"><Group><ThemeIcon color="green" variant="light"><Database size={20} /></ThemeIcon><Title order={3}>Backend connection</Title></Group><Badge color={connection.isSuccess ? "green" : connection.isError ? "red" : "gray"}>{connection.isSuccess ? "Last check passed" : connection.isError ? "Unavailable" : "Not checked"}</Badge></Group><Text size="xs" c="dimmed">Configured API address</Text><Text size="sm" mt={4} style={{ overflowWrap: "anywhere" }}>{api.baseUrl}</Text><Button type="button" mt="lg" variant="default" leftSection={<RefreshCw size={16} />} loading={connection.isPending} onClick={() => connection.mutate()}>Test connection</Button>{connection.isSuccess && <Alert color="green" mt="lg">API responded successfully. This checks service health; it does not verify database, worker, or extraction access.</Alert>}{connection.isError && <Alert color="red" mt="lg">Could not reach a healthy API. {connection.error.message}</Alert>}</Paper>
    <Paper withBorder p="xl" radius="lg"><Title order={3}>About this workspace</Title><Stack mt="md" gap="sm"><Text size="sm">Grease Free Data — greasefreedata.us · Local laboratory workspace</Text><Text size="sm" c="dimmed">Preferences are saved in this browser on this device. Clearing browser data resets them.</Text><Text size="sm" c="dimmed">These settings do not change extraction models, confidence thresholds, or the required seven-column CSV format.</Text></Stack></Paper></Stack></SimpleGrid>
    <Paper withBorder p="lg" radius="lg"><Group justify="space-between"><Text size="sm" c="dimmed">{dirty ? "You have unsaved changes." : "Your preferences are up to date."}</Text><Group><Button type="button" variant="subtle" color="gray" onClick={() => { setDraft(defaultPreferences); setNotice(null); }}>Restore defaults</Button><Button type="submit" color="green" leftSection={<Save size={16} />} disabled={!dirty || Boolean(filenameError)}>Save preferences</Button></Group></Group></Paper>{notice === "saved" && <Alert color="green" icon={<Check size={18} />} role="status">Preferences saved on this device.</Alert>}{notice === "error" && <Alert color="red" role="alert">Could not save preferences. Browser storage may be disabled. Your changes are still in the form.</Alert>}</Stack></form>
  </Stack>;
}
