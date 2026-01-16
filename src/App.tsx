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
} from "@mui/material";
import Grid from "@mui/material/Grid";

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
    // Example endpoint:
    // https://world.openfoodfacts.org/api/v0/product/<barcode>.json
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

    // OFF often gives nutrients per 100g; we’ll store what we can.
    // If calories is in kcal/100g:
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
    const [barcode, setBarcode] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [today, setToday] = useState<TodaySummary | null>(null);
    const [lastScan, setLastScan] = useState<ScanRow | null>(null);

    const canSubmit = useMemo(() => barcode.trim().length > 0 && !loading, [barcode, loading]);

    async function refreshToday() {
        const res = await fetch("/api/summary/today");
        const data = (await res.json()) as TodaySummary;
        if (!data.ok) throw new Error("Failed to load today summary");
        setToday(data);
    }

    async function refreshLastScan() {
        const res = await fetch("/api/scans");
        const data = await res.json();
        if (!data.ok) throw new Error("Failed to load scans");
        const rows = (data.rows || []) as ScanRow[];
        setLastScan(rows.length > 0 ? rows[0] : null);
    }

    useEffect(() => {
        (async () => {
            try {
                setErr(null);
                await Promise.all([refreshToday(), refreshLastScan()]);
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

            // 1) Lookup product + image
            const product = await lookupOpenFoodFacts(code);

            // 2) Save scan to your Flask DB
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

            // 3) Refresh UI cards
            setBarcode("");
            await Promise.all([refreshToday(), refreshLastScan()]);
        } catch (e: any) {
            setErr(e?.message ?? "Something went wrong");
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Barcode Nutrition Tracker
                    </Typography>
                    <Chip label="ESP32: Online" color="success" size="small" />
                </Toolbar>
            </AppBar>

            <Container sx={{ mt: 3 }}>
                <Stack spacing={2}>
                    {err && <Alert severity="error">{err}</Alert>}

                    {/* Manual Barcode Input */}
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 1 }}>
                                Manual Scan (No Scanner)
                            </Typography>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center">
                                <TextField
                                    label="Enter barcode"
                                    value={barcode}
                                    onChange={(e) => setBarcode(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSubmit();
                                    }}
                                    fullWidth
                                />
                                <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit}>
                                    {loading ? (
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <CircularProgress size={18} />
                                            <span>Looking up…</span>
                                        </Stack>
                                    ) : (
                                        "Submit"
                                    )}
                                </Button>
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                                Tip: try a real UPC like 049000044861 (Coca-Cola). Nutrients depend on what the database provides.
                            </Typography>
                        </CardContent>
                    </Card>

                    <Grid container spacing={2}>
                        {/* Today Summary */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Card>
                                <CardContent>
                                    <Typography variant="overline">Today</Typography>
                                    <Typography variant="h4">
                                        {today ? Math.round(today.calories) : "--"}
                                    </Typography>
                                    <Typography color="text.secondary" sx={{ mb: 1 }}>
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

                        {/* Last Scan */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Card>
                                {lastScan?.image_url ? (
                                    <CardMedia
                                        component="img"
                                        height="180"
                                        image={lastScan.image_url}
                                        alt={lastScan.name ?? "Last scanned item"}
                                        sx={{ objectFit: "contain", bgcolor: "background.default" }}
                                    />
                                ) : null}

                                <CardContent>
                                    <Typography variant="h6">Last Scan</Typography>
                                    <Typography color="text.secondary" sx={{ mb: 1 }}>
                                        Item: {lastScan?.name ?? "— (waiting for scan)"}{" "}
                                        {lastScan?.barcode ? `• ${lastScan.barcode}` : ""}
                                    </Typography>

                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                        <Chip label={`Calories: ${lastScan ? roundOrDash(lastScan.calories, 0) : "--"}`} />
                                        <Chip label={`Protein: ${lastScan ? roundOrDash(lastScan.protein) : "--"} g`} />
                                        <Chip label={`Carbs: ${lastScan ? roundOrDash(lastScan.carbs) : "--"} g`} />
                                        <Chip label={`Fat: ${lastScan ? roundOrDash(lastScan.fat) : "--"} g`} />
                                    </Stack>

                                    <Divider sx={{ my: 1.5 }} />

                                    <Typography variant="caption" color="text.secondary">
                                        Note: values shown are typically “per 100g” from Open Food Facts when available.
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </Stack>
            </Container>
        </>
    );
}
