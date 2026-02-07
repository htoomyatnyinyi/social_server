import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const API_BASE = "https://api.x.ai/v1";
const API_KEY = process.env.XAI_API_KEY;

if (!API_KEY) {
  throw new Error("XAI_API_KEY is not set yet.");
}

export async function moderateContent(content: string): Promise<boolean> {
  try {
    const response = await axios.post(
      `${API_BASE}/chat/completions`,
      {
        stream: false,
        // Update to 'grok-4' or latest from https://docs.x.ai/docs/models
        // model: "grok-4-latest",
        model: "grok-beta",
        messages: [
          {
            role: "system",
            content:
              'You are a content moderator. Respond only with "Yes" if harmful (hate, violence, illegal), else "No".',
          },
          { role: "user", content: `Content: ${content}` },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const result = response.data.choices[0].message.content
      .trim()
      .toLowerCase();
    return result === "yes";
  } catch (error) {
    console.error("Moderation error:", error);
    return false; // Fail open; adjust to fail closed if preferred
  }
}

export async function generateAIResponse(prompt: string): Promise<string> {
  try {
    const response = await axios.post(
      `${API_BASE}/chat/completions`,
      {
        model: "grok-beta", // Same as above
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("AI generation error:", error);
    return "Sorry, AI response unavailable.";
  }
}

// import axios from "axios";
// export async function callGrokAI(prompt: string): Promise<string> {
//   const response = await axios.post(
//     "https://api.x.ai/v1/chat/completions",
//     {
//       // Or actual endpoint
//       model: "grok-beta",
//       messages: [{ role: "user", content: prompt }],
//     },
//     { headers: { Authorization: `Bearer ${process.env.GROK_API_KEY}` } },
//   );
//   return response.data.choices[0].message.content;
// }
