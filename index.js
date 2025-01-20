import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import dotenv from "dotenv";

dotenv.config();
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    console.error("❌ Missing API_KEY in .env file!");
    process.exit(1);
  }
export async function transcribeAudioWithGroq(audioPath) {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found at path: ${audioPath}`);
    }
    console.log(`Api_key:${API_KEY}`);

    console.log("Transcribing audio with Groq:", audioPath);
    const form = new FormData();
    form.append("file", fs.createReadStream(audioPath));
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "en");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0.0");
  
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      body: form,
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${API_KEY}`,
      },
    });
  
    if (!response.ok) {
      throw new Error(`Error transcribing audio: ${response.statusText}`);
    }
  
    const transcription = await response.json();
    if (!transcription || !transcription.text) {
      throw new Error("Invalid transcription response.");
    }
  
    
    const topics = await getTopics(transcription);
    const textSrt = await generateSRT(transcription.segments);

    return {Topic:topics ,Content:textSrt};
  }
export async function getTopics(transcription) {
    try {
      console.log("Getting topics...");
  
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      });
  
      const rawResponse = await response.json();
      console.log("Raw API Response:", JSON.stringify(rawResponse, null, 2));
  
      
      const topicsString = rawResponse.choices[0].message.content.trim().replace(/^```json\n|\n```$/g, "");
  
      
      const topicsJson = JSON.parse(topicsString);
      console.log("Extracted Topics JSON:", topicsJson);
      return topicsJson.topics; 
  
    } catch (error) {
      console.error("Error in getTopics:", error);
      throw new Error("Failed to parse JSON from Groq API.");
    }
  }
export async function fillGapWithAI(transcription, gaps, outputDir) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are an AI that helps to fill gaps in transcripts."
        },
        {
          role: "user",
          content: "The following transcription contains gaps:" + transcription +
          " Fill in the missing contents based on the context and fill the pace of the timestamp." +
          " For each gap:" +
          " 1. Consider the **duration of the gap**. The longer the gap, the longer the generated suggestion should be. Shorter gaps should result in more concise suggestions, while longer gaps should allow for more detailed or expanded content." +
          " 2. If the gap duration is **long enough** (e.g., more than 5 seconds), **divide the suggestion into multiple parts**, evenly distributed across the gap. Each part should have its own start and end time, and the content should flow naturally across these parts." +
          " 3. If the gap is **short**, return a **single, brief sentence**." +
          " 4. Ensure that the content fits within the context and pacing of the surrounding transcription, maintaining a natural flow." +
          " Here are the gaps:" + JSON.stringify(gaps) +
          " Return ONLY a JSON object formatted as follows:\n\n```json\n{\n  \"suggestions\": [\n    {\n      \"suggestion\": \"Topic sentence\",\n      \"start\": start_time_in_seconds,\n      \"end\": end_time_in_seconds\n    }\n  ]\n}\n```" +
          " Ensure timestamps are in seconds and numbers are correctly formatted as floats."
                  }
      ]
    }),
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json();
  const suggest = data.choices[0].message.content.trim().replace(/^```json\n|\n```$/g, "");
  const suggestJson=JSON.parse(suggest);
  const srtFile = generateGapSRT(suggestJson.suggestions,outputDir);
  return srtFile;
}
  async function generateSRT(segments) {
    let textContent = ""; 
  
    segments.forEach((segment) => {
      const startTime = formatSRTTime(segment.start);
      const endTime = formatSRTTime(segment.end);
      textContent += `${startTime} --> ${endTime}\n${segment.text}\n\n`;
    });
  
    return textContent.trim();
  }

  function formatTime(seconds) {
    const date = new Date(0);
    date.setSeconds(seconds);
    const time = date.toISOString().substr(11, 12); // HH:mm:ss,SSS
    return time.replace(".", ",");
  }
  function formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    const millis = Math.floor((seconds % 1) * 1000).toString().padStart(3, "0");
    return `${hours}:${minutes}:${secs},${millis}`;
  }