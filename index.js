import express from "express";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

const app = express();
const PORT = 5000;

app.use(express.json());
async function transcribeAudio(audioPath) {
  const form = new FormData();
  form.append("file", fs.createReadStream(audioPath));
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "en");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    body: form,
    headers: { Authorization: `Bearer ${API_KEY}`, ...form.getHeaders() },
  });
  if (!response.ok) throw new Error("Transcription failed");
  return await response.json();
}

async function extractTopics(transcription) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions",{
        method: "POST",
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "You are an AI that extracts structured topic-based segments from transcripts."
            },
            {
              role: "user",
              content: "Analyze the following transcript and segment it into topics. Return ONLY a JSON object formatted as follows:\n\n```json\n{\n  \"topics\": [\n    {\n      \"topic\": \"Topic Name\",\n      \"start\": start_time_in_seconds,\n      \"end\": end_time_in_seconds\n    }\n  ]\n}\n```\n\nEnsure timestamps are in seconds and numbers are correctly formatted as floats. Do not include any explanations or extra text." + JSON.stringify(transcription),
            }
          ]
        }),

      });
  }


app.post("/transcribe", async (req, res) => {
    const { audioPath } = req.body;
    try {
        const transcription = await transcribeAudio(audioPath);
        res.json({ transcription });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
  });

  app.listen(PORT, () => console.log(`AI server running on port ${PORT}`));
