import { Container, Stack, Typography } from "@mui/material";
import ChatComposer from "@/components/ChatComposer";

export default function HomePage() {
  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Typography variant="h3" component="h1">
            AI Guitar Pro Builder
          </Typography>
          <Typography color="text.secondary">
            Describe the song you want and refine it through conversation. Export a GP5 file
            when you are ready.
          </Typography>
        </Stack>
        <ChatComposer />
      </Stack>
    </Container>
  );
}
