import { useEffect, useMemo, useState } from "react";
import {
    AppBar,
    Toolbar,
    Typography,
    Container,
    Card,
    CardContent,
    Chip,
    Stack,
    TextField,
    Button,
    Alert,
    CircularProgress,
    CardMedia,
    Divider,
    Box,
    IconButton,
    CssBaseline,
    Tooltip,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import WifiIcon from "@mui/icons-material/Wifi";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import LocalDiningIcon from "@mui/icons-material/LocalDining";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

type ScanRow = {
    id: number;
    ts: string;
    barcode: string;
    name: string | null;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    image_url?: string | null;
};

type TodaySummary = {
    ok: boolean;
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    scans: number;
};

function roundOrDash(v: number | null | undefined, digits = 1) {
    if (v === null || v === undefined) return "--";
    const p = Math.pow(10, digits);
    return String(Math.round(v * p) / p);
}

/**
 * Fetch product info from Open Food Facts.
 * Returns a normalized object your backend expects.
 */
async function lookupOpenFoodFacts(barcode: string) {
    const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(
        barcode
    )}.json`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Open Food Facts request failed");

    const data = await res.json();

    if (!data || data.status !== 1 || !data.product) {
        throw new Error("Product not found in Open Food Facts");
    }

    const p = data.product;

    const kcal = p?.nutriments?.["energy-kcal_100g"];
    const protein = p?.nutriments?.["proteins_100g"];
    const carbs = p?.nutriments?.["carbohydrates_100g"];
    const fat = p?.nutriments?.["fat_100g"];

    return {
        name: p.product_name || p.generic_name || "Unknown item",
        calories: typeof kcal === "number" ? kcal : null,
        protein: typeof protein === "number" ? protein : null,
        carbs: typeof carbs === "number" ? carbs : null,
        fat: typeof fat === "number" ? fat : null,
        image_url: p.image_front_url || p.image_url || null,
    };
}

export default function App() {
    const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
    const [mode, setMode] = useState<"light" | "dark">(() => {
        const saved = localStorage.getItem("themeMode");
        if (saved === "light" || saved === "dark") return saved;
        return prefersDark ? "dark" : "light";
    });

    useEffect(() => {
        localStorage.setItem("themeMode", mode);
    }, [mode]);

    const theme = useMemo(
        () =>
            createTheme({
                palette: {
                    mode,
                    primary: { main: "#6C63FF" },
                    secondary: { main: "#00D4FF" },
                    background: {
                        default: mode === "dark" ? "#0B0F19" : "#F6F7FB",
                        paper: mode === "dark" ? "#121A2A" : "#FFFFFF",
                    },
                },
                shape: { borderRadius: 16 },
                typography: {
                    fontFamily: `"Inter", system-ui, -apple-system, Segoe UI, Roboto, Arial`,
                    h4: { fontWeight: 900, letterSpacing: -0.8 },
                    h6: { fontWeight: 800, letterSpacing: -0.2 },
                    overline: { letterSpacing: 1.5, fontWeight: 800 },
                },
                components: {
                    MuiAppBar: {
                        styleOverrides: {
                            root: {
                                backgroundImage: "none",
                            },
                        },
                    },
                    MuiCard: {
                        styleOverrides: {
                            root: {
                                borderRadius: 20,
                                border:
                                    mode === "dark"
                                        ? "1px solid rgba(255,255,255,0.08)"
                                        : "1px solid rgba(0,0,0,0.06)",
                                boxShadow:
                                    mode === "dark"
                                        ? "0 10px 30px rgba(0,0,0,0.35)"
                                        : "0 10px 30px rgba(0,0,0,0.08)",
                            },
                        },
                    },
                    MuiButton: {
                        styleOverrides: {
                            root: { borderRadius: 14, textTransform: "none", fontWeight: 800 },
                        },
                    },
                    MuiChip: {
                        styleOverrides: {
                            root: { borderRadius: 999 },
                        },
                    },
                },
            }),
        [mode]
    );

    // ---- your existing state ----
    const [barcode, setBarcode] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [today, setToday] = useState<TodaySummary | null>(null);
    const [lastScan, setLastScan] = useState<ScanRow | null>(null);
    const [scans, setScans] = useState<ScanRow[]>([]);


    // NEW: Online / Offline badge (basic)
    const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);

    useEffect(() => {
        const on = () => setIsOnline(true);
        const off = () => setIsOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);

    const canSubmit = useMemo(
        () => barcode.trim().length > 0 && !loading,
        [barcode, loading]
    );

    async function refreshToday() {
        const res = await fetch("/api/summary/today");
        const data = (await res.json()) as TodaySummary;
        if (!data.ok) throw new Error("Failed to load today summary");
        setToday(data);
    }

    async function refreshScans() {
        const res = await fetch("/api/scans");
        const data = await res.json();
        if (!data.ok) throw new Error("Failed to load scans");
        const rows = (data.rows || []) as ScanRow[];
        setScans(rows);
        setLastScan(rows.length > 0 ? rows[0] : null);
    }


    useEffect(() => {
        (async () => {
            try {
                setErr(null);
                await Promise.all([refreshToday(), refreshScans()]);

            } catch (e: any) {
                setErr(e?.message ?? "Failed to load data");
            }
        })();
    }, []);

    async function handleSubmit() {
        const code = barcode.trim();
        if (!code) return;

        try {
            setLoading(true);
            setErr(null);

            const product = await lookupOpenFoodFacts(code);

            const saveRes = await fetch("/api/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    barcode: code,
                    ...product,
                }),
            });

            const saveData = await saveRes.json();
            if (!saveRes.ok || !saveData.ok) {
                throw new Error(saveData?.error || "Failed to save scan");
            }

            setBarcode("");
            await Promise.all([refreshToday(), refreshScans()]);
        } catch (e: any) {
            setErr(e?.message ?? "Something went wrong");
        } finally {
            setLoading(false);
        }
    }

    function toCsvValue(v: any) {
        if (v === null || v === undefined) return "";
        const s = String(v);
        // Escape quotes by doubling them, wrap in quotes if needed
        const needsQuotes = /[",\n]/.test(s);
        const escaped = s.replace(/"/g, '""');
        return needsQuotes ? `"${escaped}"` : escaped;
    }

    function downloadTextFile(filename: string, text: string, mime: string) {
        const blob = new Blob([text], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function exportScansCsv() {
        const headers = [
            "id",
            "ts",
            "barcode",
            "name",
            "calories",
            "protein",
            "carbs",
            "fat",
            "image_url",
        ];

        const lines: string[] = [];
        lines.push(headers.join(","));

        for (const r of scans) {
            const row = [
                r.id,
                r.ts,
                r.barcode,
                r.name ?? "",
                r.calories ?? "",
                r.protein ?? "",
                r.carbs ?? "",
                r.fat ?? "",
                r.image_url ?? "",
            ].map(toCsvValue);

            lines.push(row.join(","));
        }

        const dateTag = today?.date ?? new Date().toISOString().slice(0, 10);
        downloadTextFile(`fridgesense_scans_${dateTag}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
    }

    function exportScansJson() {
        const dateTag = today?.date ?? new Date().toISOString().slice(0, 10);
        downloadTextFile(
            `fridgesense_scans_${dateTag}.json`,
            JSON.stringify({ ok: true, rows: scans }, null, 2),
            "application/json;charset=utf-8"
        );
    }

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />

            <AppBar
                position="sticky"
                elevation={0}
                color="transparent"
                sx={{
                    backdropFilter: "blur(10px)",
                    borderBottom: (t) =>
                        `1px solid ${
                            t.palette.mode === "dark"
                                ? "rgba(255,255,255,0.06)"
                                : "rgba(0,0,0,0.06)"
                        }`,
                }}
            >
                <Toolbar sx={{ gap: 1.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box
                            sx={{
                                width: 36,
                                height: 36,
                                borderRadius: 2,
                                display: "grid",
                                placeItems: "center",
                                background: (t) =>
                                    t.palette.mode === "dark"
                                        ? "linear-gradient(135deg, rgba(108,99,255,0.35), rgba(0,212,255,0.18))"
                                        : "linear-gradient(135deg, rgba(108,99,255,0.18), rgba(0,212,255,0.10))",
                                border: (t) =>
                                    `1px solid ${
                                        t.palette.mode === "dark"
                                            ? "rgba(255,255,255,0.08)"
                                            : "rgba(0,0,0,0.06)"
                                    }`,
                            }}
                        >
                            <LocalDiningIcon fontSize="small" />
                        </Box>

                        <Box>
                            <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                                FridgeSense
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Barcode nutrition + inventory (local-first)
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{ flexGrow: 1 }} />

                    <Chip
                        icon={isOnline ? <WifiIcon /> : <WifiOffIcon />}
                        label={isOnline ? "Online • Sync ready" : "Offline • Local DB"}
                        color={isOnline ? "success" : "warning"}
                        variant={isOnline ? "filled" : "outlined"}
                        size="small"
                    />

                    <Tooltip title="Toggle dark mode">
                        <IconButton
                            onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}
                            aria-label="toggle theme"
                        >
                            {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
                        </IconButton>
                    </Tooltip>
                </Toolbar>
            </AppBar>

            <Container sx={{ mt: 3, pb: 6 }}>
                <Stack spacing={2.25}>
                    {err && (
                        <Alert
                            severity="error"
                            sx={{
                                borderRadius: 3,
                                border: (t) =>
                                    `1px solid ${
                                        t.palette.mode === "dark"
                                            ? "rgba(255,255,255,0.08)"
                                            : "rgba(0,0,0,0.06)"
                                    }`,
                            }}
                        >
                            {err}
                        </Alert>
                    )}

                    {/* HERO PANEL */}
                    <Box
                        sx={{
                            p: { xs: 2, md: 2.5 },
                            borderRadius: 4,
                            background: (t) =>
                                t.palette.mode === "dark"
                                    ? "linear-gradient(135deg, rgba(108,99,255,0.22), rgba(0,212,255,0.10))"
                                    : "linear-gradient(135deg, rgba(108,99,255,0.14), rgba(0,212,255,0.08))",
                            border: (t) =>
                                `1px solid ${
                                    t.palette.mode === "dark"
                                        ? "rgba(255,255,255,0.10)"
                                        : "rgba(0,0,0,0.06)"
                                }`,
                        }}
                    >
                        <Stack
                            direction={{ xs: "column", md: "row" }}
                            spacing={2}
                            alignItems={{ xs: "stretch", md: "center" }}
                            justifyContent="space-between"
                        >
                            <Box>
                                <Typography variant="overline">Dashboard</Typography>
                                <Typography variant="h4" sx={{ mt: 0.25 }}>
                                    Today’s Intake
                                </Typography>
                                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                                    Scan items to track calories and macros. Works offline with local storage.
                                </Typography>
                            </Box>

                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip
                                    icon={<InfoOutlinedIcon />}
                                    label={`Date: ${today?.date ?? "—"}`}
                                    variant="outlined"
                                />
                                <Chip
                                    icon={<QrCodeScannerIcon />}
                                    label={`Scans: ${today?.scans ?? "—"}`}
                                    variant="outlined"
                                />
                                <Chip
                                    icon={<TrendingUpIcon />}
                                    label={`Calories: ${today ? Math.round(today.calories) : "—"}`}
                                    variant="outlined"
                                />
                            </Stack>
                        </Stack>
                    </Box>

                    {/* INPUT CARD (still here; restyled) */}
                    <Card>
                        <CardContent sx={{ p: 2.5 }}>
                            <Stack spacing={1.5}>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <QrCodeScannerIcon fontSize="small" />
                                    <Typography variant="h6">Manual Barcode Entry</Typography>
                                    <Chip
                                        size="small"
                                        label="Kiosk friendly"
                                        variant="outlined"
                                        sx={{ ml: "auto" }}
                                    />
                                </Stack>

                                <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    spacing={1}
                                    alignItems="center"
                                >
                                    <TextField
                                        label="Enter barcode"
                                        value={barcode}
                                        onChange={(e) => setBarcode(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleSubmit();
                                        }}
                                        fullWidth
                                    />

                                    <Button
                                        size="large"
                                        variant="contained"
                                        onClick={handleSubmit}
                                        disabled={!canSubmit}
                                        startIcon={!loading ? <QrCodeScannerIcon /> : undefined}
                                        sx={{ minWidth: { xs: "100%", sm: 180 } }}
                                    >
                                        {loading ? (
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <CircularProgress size={18} />
                                                <span>Looking up…</span>
                                            </Stack>
                                        ) : (
                                            "Scan"
                                        )}
                                    </Button>
                                </Stack>

                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: "block" }}
                                >
                                    Tip: try a UPC like 049000044861 (Coca-Cola). Nutrients are typically per 100g.
                                </Typography>
                            </Stack>
                        </CardContent>
                    </Card>

                    {/* KPI CARDS (Today + Last Scan) */}
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Card>
                                <CardContent sx={{ p: 2.5 }}>
                                    <Typography variant="overline">Today</Typography>
                                    <Typography variant="h4" sx={{ mt: 0.25 }}>
                                        {today ? Math.round(today.calories) : "--"}
                                    </Typography>
                                    <Typography color="text.secondary" sx={{ mb: 1.5 }}>
                                        Calories • {today ? `${today.scans} scans` : "—"}
                                    </Typography>

                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                        <Chip label={`Protein: ${today ? roundOrDash(today.protein) : "--"} g`} />
                                        <Chip label={`Carbs: ${today ? roundOrDash(today.carbs) : "--"} g`} />
                                        <Chip label={`Fat: ${today ? roundOrDash(today.fat) : "--"} g`} />
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid size={{ xs: 12, md: 6 }}>
                            <Card sx={{ overflow: "hidden" }}>
                                {lastScan?.image_url ? (
                                    <CardMedia
                                        component="img"
                                        height="180"
                                        image={lastScan.image_url}
                                        alt={lastScan.name ?? "Last scanned item"}
                                        sx={{
                                            objectFit: "contain",
                                            bgcolor: "background.default",
                                            borderBottom: (t) =>
                                                `1px solid ${
                                                    t.palette.mode === "dark"
                                                        ? "rgba(255,255,255,0.08)"
                                                        : "rgba(0,0,0,0.06)"
                                                }`,
                                        }}
                                    />
                                ) : null}

                                <CardContent sx={{ p: 2.5 }}>
                                    <Typography variant="h6">Last Scan</Typography>
                                    <Typography color="text.secondary" sx={{ mb: 1.25 }}>
                                        {lastScan?.name ?? "— (waiting for scan)"}{" "}
                                        {lastScan?.barcode ? `• ${lastScan.barcode}` : ""}
                                    </Typography>

                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                        <Chip label={`Calories: ${lastScan ? roundOrDash(lastScan.calories, 0) : "--"}`} />
                                        <Chip label={`Protein: ${lastScan ? roundOrDash(lastScan.protein) : "--"} g`} />
                                        <Chip label={`Carbs: ${lastScan ? roundOrDash(lastScan.carbs) : "--"} g`} />
                                        <Chip label={`Fat: ${lastScan ? roundOrDash(lastScan.fat) : "--"} g`} />
                                    </Stack>

                                    <Divider sx={{ my: 1.75 }} />

                                    <Typography variant="caption" color="text.secondary">
                                        Note: values shown are typically “per 100g” when available.
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                    <Grid container spacing={2}>
                        {/* RECENT SCANS + ACTIONS (Batch 3) */}
                        <Grid container spacing={2}>
                            {/* RECENT SCANS FEED */}
                            <Grid size={{ xs: 12, md: 8 }}>
                                <Card>
                                    <CardContent sx={{ p: 2.5 }}>
                                        <Stack spacing={1.5}>
                                            <Stack
                                                direction={{ xs: "column", sm: "row" }}
                                                alignItems={{ xs: "stretch", sm: "center" }}
                                                spacing={1}
                                            >
                                                <Typography variant="h6">Recent Scans</Typography>

                                                <Box sx={{ flexGrow: 1 }} />

                                                <Chip
                                                    size="small"
                                                    label={`Showing ${scans.length} / 200`}
                                                    variant="outlined"
                                                />
                                            </Stack>

                                            {scans.length === 0 ? (
                                                <Box
                                                    sx={{
                                                        p: 3,
                                                        borderRadius: 3,
                                                        textAlign: "center",
                                                        color: "text.secondary",
                                                        border: (t) =>
                                                            `1px dashed ${
                                                                t.palette.mode === "dark"
                                                                    ? "rgba(255,255,255,0.12)"
                                                                    : "rgba(0,0,0,0.12)"
                                                            }`,
                                                    }}
                                                >
                                                    <Typography>No scans yet</Typography>
                                                    <Typography variant="caption">
                                                        Scan a barcode to see your activity history here.
                                                    </Typography>
                                                </Box>
                                            ) : (
                                                <Box
                                                    sx={{
                                                        // Touch-friendly scrolling region for kiosk
                                                        maxHeight: { xs: 520, md: 560 },
                                                        overflowY: "auto",
                                                        pr: 0.5,
                                                    }}
                                                >
                                                    <Stack spacing={1}>
                                                        {scans.map((scan) => (
                                                            <Box
                                                                key={scan.id}
                                                                onClick={() => {
                                                                    // touch-friendly: tap row to copy barcode
                                                                    if (scan.barcode) navigator.clipboard?.writeText(scan.barcode);
                                                                }}
                                                                sx={{
                                                                    display: "grid",
                                                                    gridTemplateColumns: "72px 1fr auto",
                                                                    gap: 1.5,
                                                                    p: 1.5,
                                                                    borderRadius: 2.5,
                                                                    alignItems: "center",
                                                                    cursor: "pointer",
                                                                    userSelect: "none",
                                                                    border: (t) =>
                                                                        `1px solid ${
                                                                            t.palette.mode === "dark"
                                                                                ? "rgba(255,255,255,0.08)"
                                                                                : "rgba(0,0,0,0.06)"
                                                                        }`,
                                                                }}
                                                            >
                                                                {/* Thumbnail */}
                                                                <Box
                                                                    sx={{
                                                                        width: 72,
                                                                        height: 72,
                                                                        borderRadius: 2,
                                                                        overflow: "hidden",
                                                                        bgcolor: "background.default",
                                                                        display: "grid",
                                                                        placeItems: "center",
                                                                        border: (t) =>
                                                                            `1px solid ${
                                                                                t.palette.mode === "dark"
                                                                                    ? "rgba(255,255,255,0.08)"
                                                                                    : "rgba(0,0,0,0.06)"
                                                                            }`,
                                                                    }}
                                                                >
                                                                    {scan.image_url ? (
                                                                        <img
                                                                            src={scan.image_url}
                                                                            alt={scan.name ?? "Scanned item"}
                                                                            style={{
                                                                                width: "100%",
                                                                                height: "100%",
                                                                                objectFit: "contain",
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <QrCodeScannerIcon fontSize="small" />
                                                                    )}
                                                                </Box>

                                                                {/* Info */}
                                                                <Box sx={{ minWidth: 0 }}>
                                                                    <Typography fontWeight={800} sx={{ lineHeight: 1.2 }} noWrap>
                                                                        {scan.name ?? "Unknown item"}
                                                                    </Typography>

                                                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                                                                        {scan.barcode} • {new Date(scan.ts).toLocaleString()}
                                                                    </Typography>

                                                                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                                                                        <Chip size="small" label={`${roundOrDash(scan.protein)}g protein`} />
                                                                        <Chip size="small" label={`${roundOrDash(scan.carbs)}g carbs`} />
                                                                        <Chip size="small" label={`${roundOrDash(scan.fat)}g fat`} />
                                                                    </Stack>

                                                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: "block" }}>
                                                                        Tap row to copy barcode
                                                                    </Typography>
                                                                </Box>

                                                                {/* Calories */}
                                                                <Chip
                                                                    label={`${roundOrDash(scan.calories, 0)} kcal`}
                                                                    color="primary"
                                                                    variant="outlined"
                                                                    sx={{ fontWeight: 800 }}
                                                                />
                                                            </Box>
                                                        ))}
                                                    </Stack>
                                                </Box>
                                            )}
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* ACTIONS / EXPORT */}
                            <Grid size={{ xs: 12, md: 4 }}>
                                <Card>
                                    <CardContent sx={{ p: 2.5 }}>
                                        <Stack spacing={1.5}>
                                            <Typography variant="h6">Actions</Typography>

                                            <Button
                                                fullWidth
                                                size="large"
                                                variant="contained"
                                                startIcon={<QrCodeScannerIcon />}
                                                disabled
                                                sx={{ py: 1.2 }}
                                            >
                                                Start Scanner (ESP32)
                                            </Button>

                                            <Divider />

                                            <Button
                                                fullWidth
                                                size="large"
                                                variant="outlined"
                                                onClick={exportScansCsv}
                                                disabled={scans.length === 0}
                                                sx={{ py: 1.15 }}
                                            >
                                                Export CSV
                                            </Button>

                                            <Button
                                                fullWidth
                                                size="large"
                                                variant="outlined"
                                                onClick={exportScansJson}
                                                disabled={scans.length === 0}
                                                sx={{ py: 1.15 }}
                                            >
                                                Export JSON
                                            </Button>

                                            <Typography variant="caption" color="text.secondary">
                                                Exports include up to 200 recent scans.
                                            </Typography>

                                            <Divider />

                                            {/* Touch-friendly mode hints */}
                                            <Box
                                                sx={{
                                                    p: 1.5,
                                                    borderRadius: 3,
                                                    bgcolor: (t) =>
                                                        t.palette.mode === "dark"
                                                            ? "rgba(255,255,255,0.04)"
                                                            : "rgba(0,0,0,0.03)",
                                                    border: (t) =>
                                                        `1px solid ${
                                                            t.palette.mode === "dark"
                                                                ? "rgba(255,255,255,0.08)"
                                                                : "rgba(0,0,0,0.06)"
                                                        }`,
                                                }}
                                            >
                                                <Typography fontWeight={800} sx={{ mb: 0.5 }}>
                                                    Touch Mode
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Large buttons, scrollable list, tap a row to copy a barcode.
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>

                    </Grid>

                </Stack>
            </Container>
        </ThemeProvider>
    );
}
