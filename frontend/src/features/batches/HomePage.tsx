import { useState } from "react";
import { Box, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { ArrowRight, Check, FileSpreadsheet, Pause, Play, ScanLine, ShieldCheck, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspaceSettings } from "../settings/WorkspaceSettings";
import "./WelcomePage.css";

const steps = [
  { number: "01", icon: ScanLine, title: "Capture", description: "Upload your sample videos.", link: "/scan", action: "Open Scan" },
  { number: "02", icon: ShieldCheck, title: "Verify", description: "Check details against the label.", link: "/samples", action: "View samples" },
  { number: "03", icon: FileSpreadsheet, title: "Export", description: "Prepare your seven-column CSV.", link: "/templates", action: "Open Export" },
];

function LabelVisual() {
  return <div className="welcome-visual" aria-hidden="true">
    <div className="welcome-video-card"><div className="welcome-visual-heading"><Video size={16} /><span>LABEL CAPTURE</span><span className="welcome-video-dot" /></div><div className="welcome-video-frame"><div className="welcome-sample-label"><span className="welcome-label-kicker">MRG LABORATORIES</span><strong>Sample label</strong><div className="welcome-label-lines"><i /><i /><i /></div><div className="welcome-label-barcode" /></div><span className="welcome-play"><Play size={15} fill="currentColor" /></span></div><div className="welcome-video-track"><span /><Video size={12} /></div></div>
    <div className="welcome-transfer"><ArrowRight size={20} /></div>
    <div className="welcome-record-card"><div className="welcome-visual-heading"><FileSpreadsheet size={17} /><span>STRUCTURED DATA</span></div><div className="welcome-record-row"><span>Sample ID</span><i /></div><div className="welcome-record-row"><span>Machine</span><i /></div><div className="welcome-record-row"><span>Component</span><i /></div><div className="welcome-record-footer"><Check size={14} /><span>Ready for verification</span></div></div>
    <span className="welcome-visual-caption">VIDEO → EXTRACTED FIELDS → HUMAN REVIEW</span>
  </div>;
}

export function HomePage() {
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const { preferences } = useWorkspaceSettings();
  const staticMode = reducedMotion || preferences.reduceMotion;
  return <Stack gap={22} className="lab-welcome premium-welcome" data-static={staticMode}>
    <Group justify="space-between" className="welcome-page-top"><Text className="eyebrow">MRG LABORATORIES</Text><Text className="welcome-workspace-label"><span />Sample intake workspace</Text></Group>
    <Paper component="section" className="lab-welcome-hero premium-hero" radius="lg" withBorder aria-labelledby="welcome-title" data-running={!staticMode && !paused}>
      <div className="lab-gradient premium-gradient" aria-hidden="true" />
      <Box className="lab-welcome-copy premium-copy"><Text className="eyebrow">PRECISION BEGINS WITH THE DETAILS</Text><Title order={1} id="welcome-title">Less transcription.<br />More time for research.</Title><Text className="lab-welcome-description">Turn oil and grease sample labels into structured records. One focused workspace, from capture to verification.</Text><Group gap={12} className="welcome-actions"><Button component={Link} to="/scan" size="md" color="green" rightSection={<ArrowRight size={17} />}>Start sample intake</Button><Button component={Link} to="/samples" size="md" variant="default">Browse samples</Button></Group><Text className="welcome-label-support"><Check size={14} /> Large & Small labels <span>·</span> Seven-column CSV</Text></Box>
      <LabelVisual />
      <div className="welcome-hero-bottom"><span>YOUR LABELS. YOUR EXPERTISE. LESS MANUAL ENTRY.</span>{!staticMode && <Button className="lab-motion-control premium-motion-control" size="compact-sm" variant="subtle" color="dark" leftSection={paused ? <Play size={12} /> : <Pause size={12} />} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "Resume background" : "Pause background"}</Button>}</div>
    </Paper>
    <section className="welcome-workflow" aria-labelledby="workflow-title"><Group justify="space-between" mb={14}><Title order={2} id="workflow-title">A clear path from label to record.</Title><Text className="welcome-workflow-note">THREE SIMPLE STEPS</Text></Group><div className="welcome-workflow-strip">{steps.map(({ number, icon: Icon, title, description, link, action }) => <Link to={link} className="welcome-step" key={number} aria-label={action}><span className="welcome-step-icon"><Icon size={20} /></span><div><span className="welcome-step-title"><span>{number}</span>{title}</span><p>{description}</p></div><ArrowRight className="welcome-step-arrow" size={16} /></Link>)}</div></section>
    <div className="welcome-care-note"><ShieldCheck size={19} aria-hidden="true" /><Text size="sm"><strong>Human expertise, always in the loop.</strong> Verify uncertain AI readings against the original label before using exported records.</Text></div>
  </Stack>;
}
