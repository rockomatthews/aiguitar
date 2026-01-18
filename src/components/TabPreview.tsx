"use client";

import { Card, CardContent, Stack, Typography } from "@mui/material";
import { Song } from "@/lib/songSchema";

type TabPreviewProps = {
  song: Song;
};

export default function TabPreview({ song }: TabPreviewProps) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="subtitle2" color="text.secondary">
            Track Summary
          </Typography>
          {song.tracks.length === 0 ? (
            <Typography color="text.secondary">No tracks yet.</Typography>
          ) : (
            song.tracks.map((track) => (
              <Typography key={track.id}>
                {track.name} — {track.instrument} ({track.measures.length} measures)
              </Typography>
            ))
          )}
          <Typography variant="caption" color="text.secondary">
            AlphaTab preview integration will render tabs here once GP5 export is available.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
