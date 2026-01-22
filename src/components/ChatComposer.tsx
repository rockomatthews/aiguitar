"use client";

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { Song } from "@/lib/songSchema";
import { createEmptySong, summarizeSong } from "@/lib/songModel";
import TabPreview from "@/components/TabPreview";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatComposer() {
  const [song, setSong] = useState<Song>(createEmptySong());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickGenre, setQuickGenre] = useState("metal");
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSend() {
    if (!input.trim()) return;
    setError(null);
    setIsSubmitting(true);

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: input }];
    setMessages(nextMessages);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, song })
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update the song.");
      }

      setSong(data.song);
      setFollowUps(data.followUps ?? []);
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExport() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/export/gp5", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(song)
      });
      if (!response.ok) {
        const text = await response.text();
        const detail = text ? JSON.parse(text) : {};
        throw new Error(detail.error ?? "Failed to export GP5.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${song.metadata.title || "song"}.gp5`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleQuickGenerate() {
    if (!quickTitle.trim()) {
      setError("Please enter a song title.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const userMessage = `Generate full song: ${quickTitle} (${quickGenre})`;
    try {
      const response = await fetch("/api/generate/song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: quickTitle, genre: quickGenre })
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to generate the song.");
      }
      setSong(data.song);
      setFollowUps(data.followUps ?? []);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage },
        { role: "assistant", content: data.reply }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const missingChecklist = [
    {
      label: "At least one track",
      done: song.tracks.length > 0
    },
    {
      label: "At least one measure",
      done: song.tracks.some((track) => track.measures.length > 0)
    },
    {
      label: "At least one beat",
      done: song.tracks.some((track) =>
        track.measures.some((measure) => (measure.beats?.length ?? 0) > 0)
      )
    }
  ];

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Quick Generate</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Song title"
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
                disabled={isSubmitting}
              />
              <TextField
                select
                label="Genre"
                value={quickGenre}
                onChange={(event) => setQuickGenre(event.target.value)}
                disabled={isSubmitting}
                sx={{ minWidth: 200 }}
              >
                {["metal", "rock", "punk", "pop", "blues", "djent", "grunge", "nu metal"].map((genre) => (
                  <MenuItem key={genre} value={genre}>
                    {genre}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="contained" onClick={handleQuickGenerate} disabled={isSubmitting}>
                Generate Full Song
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Conversation</Typography>
            <Stack spacing={1}>
              {messages.map((message, index) => (
                <Box
                  key={`${message.role}-${index}`}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: message.role === "assistant" ? "grey.100" : "primary.50"
                  }}
                >
                  <Typography variant="subtitle2" color="text.secondary">
                    {message.role === "assistant" ? "Assistant" : "You"}
                  </Typography>
                  <Typography>{message.content}</Typography>
                </Box>
              ))}
              {messages.length === 0 && (
                <Typography color="text.secondary">
                  Start by describing your song idea, e.g. “120 bpm rock song with guitar, bass,
                  drums.”
                </Typography>
              )}
            </Stack>
            <Divider />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Your message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isSubmitting}
              />
              <Button variant="contained" onClick={handleSend} disabled={isSubmitting}>
                Send
              </Button>
            </Stack>
            {followUps.length > 0 && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Follow-up questions
                </Typography>
                <ul>
                  {followUps.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Box>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Current Song</Typography>
            <Typography color="text.secondary">{summarizeSong(song)}</Typography>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                GP5 Checklist
              </Typography>
              <ul>
                {missingChecklist.map((item) => (
                  <li key={item.label}>
                    {item.done ? "✅" : "⬜️"} {item.label}
                  </li>
                ))}
              </ul>
            </Box>
            {song.draftText && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Song Draft
                </Typography>
                <Typography whiteSpace="pre-line">{song.draftText}</Typography>
              </Box>
            )}
            {song.chordsBySection && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Chords By Section
                </Typography>
                {Object.entries(song.chordsBySection).map(([section, chords]) => (
                  <Typography key={section}>
                    {section}: {chords.join(" - ")}
                  </Typography>
                ))}
              </Box>
            )}
            <Typography variant="caption" color="text.secondary">
              You can generate a GP5 file at any time. A basic musical draft will be created if
              needed.
            </Typography>
            <TabPreview song={song} />
            <Button variant="outlined" onClick={handleExport} disabled={isSubmitting}>
              Generate .GP5 File
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
