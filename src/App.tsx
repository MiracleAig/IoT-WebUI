import {
    AppBar,
    Toolbar,
    Typography,
    Container,
    Card,
    CardContent,
    Chip,
    Stack,
} from "@mui/material";
import Grid from '@mui/material/Grid';


export default function App() {
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
                <Grid container spacing={2}>
                    <Grid size={{xs: 12, md: 6}}>
                        <Card>
                            <CardContent>
                                <Typography variant="overline">Today</Typography>
                                <Typography variant="h4">1,245</Typography>
                                <Typography color="text.secondary">Calories</Typography>
                            </CardContent>
                        </Card>
                    </Grid>

                    <Grid>
                        <Card>
                            <CardContent>
                                <Typography variant="h6">Last Scan</Typography>
                                <Typography color="text.secondary" sx={{ mb: 1 }}>
                                    Item: — (waiting for scan)
                                </Typography>
                                <Stack direction="row" spacing={1}>
                                    <Chip label="Protein: -- g" />
                                    <Chip label="Carbs: -- g" />
                                    <Chip label="Fat: -- g" />
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </Container>
        </>
    );
}
