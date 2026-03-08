import axios from "axios";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434/api/generate";

const MODEL = process.env.OLLAMA_MODEL || "qwen3.5:0.8b";

interface OllamaGenerateResponse {
  response?: string;
  done?: boolean;
}

// async function callOllama(prompt: string): Promise<string> {
//   const { data } = await axios.post<OllamaGenerateResponse>(
//     OLLAMA_URL,
//     {
//       model: MODEL,
//       prompt,
//       stream: false,
//     },
//     { timeout: 120_000 },
//   );

//   if (!data?.response) {
//     console.error("Raw Ollama response:", data);
//     throw new Error("Invalid Ollama response format");
//   }

//   return data.response.trim();
// }

async function callOllama(prompt: string): Promise<string> {
  const { data } = await axios.post(
    "http://ollama:11434/api/generate",
    {
      model: MODEL,
      prompt,
      stream: false,
      think: false,
      options: {
        num_predict: 128,
        temperature: 0,
        top_k: 10,
        top_p: 0.9,
        seed: 42,
        // stop: ["\n"],
        repeat_penalty: 1.1,
        // num_ctx: 2048,
      },
    },
    { timeout: 60000 },
  );

  if (!data?.response) {
    console.error("Raw Ollama response:", data);
    throw new Error("Empty Ollama response");
  }

  return data.response.trim();
}

export async function moderateContent(content: string): Promise<boolean> {
  try {
    const prompt = `
            Respond ONLY with "Yes" if the content is harmful.
            Respond ONLY with "No" if the content is safe.
            Content: ${content}
    `;

    const result = await callOllama(prompt);
    return result.toLowerCase().startsWith("yes");
  } catch (err: any) {
    console.error("Moderation error:", err.message);
    return false;
  }
}

export async function generateAIResponse(prompt: string): Promise<string> {
  try {
    return await callOllama(prompt);
  } catch (err: any) {
    console.error("AI Error:", err.message);
    return "AI is temporarily unavailable.";
  }
}
// import axios from "axios";

// const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434/api/chat";

// const MODEL = "qwen3.5:0.8b";

// interface OllamaChatResponse {
//   message?: {
//     role: string;
//     content: string;
//   };
// }

// async function callOllama(prompt: string): Promise<string> {
//   const response = await axios.post<OllamaChatResponse>(
//     OLLAMA_URL,
//     {
//       model: MODEL,
//       messages: [
//         {
//           role: "user",
//           content: prompt,
//         },
//       ],
//       stream: false,
//     },
//     { timeout: 120_000 },
//   );

//   if (!response.data?.message?.content) {
//     console.error("Ollama raw response:", response.data);
//     throw new Error("Invalid Ollama response format");
//   }

//   return response.data.message.content.trim();
// }

// export async function moderateContent(content: string): Promise<boolean> {
//   try {
//     const prompt = `
// Respond ONLY with "Yes" if the content is harmful.
// Respond ONLY with "No" if the content is safe.

// Content:
// ${content}
// `;

//     const result = await callOllama(prompt);
//     return result.toLowerCase() === "yes";
//   } catch (error: any) {
//     console.error("Moderation error:", error.message);
//     return false;
//   }
// }

// export async function generateAIResponse(prompt: string): Promise<string> {
//   try {
//     return await callOllama(prompt);
//   } catch (error: any) {
//     console.error("AI Error:", error.message);
//     return "AI is temporarily unavailable.";
//   }
// }
// // import axios from "axios";

// // const API_BASE = process.env.OLLAMA_URL || "http://ollama:11434/api/generate";

// // const MODEL = "qwen3.5:0.8b";

// // interface OllamaGenerateResponse {
// //   response: string;
// // }

// // async function callOllama(prompt: string): Promise<string> {
// //   const response = await axios.post<OllamaGenerateResponse>(
// //     API_BASE,
// //     {
// //       model: MODEL,
// //       prompt,
// //       stream: false,
// //     },
// //     { timeout: 90_000 },
// //   );

// //   if (!response.data?.response) {
// //     throw new Error("Invalid Ollama response format");
// //   }

// //   return response.data.response.trim();
// // }

// // export async function moderateContent(content: string): Promise<boolean> {
// //   try {
// //     const prompt = `
// // Respond ONLY with "Yes" if the content is harmful.
// // Respond ONLY with "No" if the content is safe.

// // Content:
// // ${content}
// // `;

// //     const aiText = await callOllama(prompt);
// //     return aiText.toLowerCase() === "yes";
// //   } catch (error: any) {
// //     console.error("Moderation error:", error.message);
// //     return false;
// //   }
// // }

// // export async function generateAIResponse(prompt: string): Promise<string> {
// //   try {
// //     return await callOllama(prompt);
// //   } catch (error: any) {
// //     console.error("AI Error:", error.message);
// //     return "AI is temporarily unavailable.";
// //   }
// // }

// // // ai is temporary not avialable.
// // // import axios from "axios";

// // // const API_BASE = process.env.OLLAMA_URL || "http://ollama:11434/api/chat";

// // // const MODEL = "qwen3.5:0.8b";

// // // interface OllamaChatResponse {
// // //   message?: {
// // //     role: string;
// // //     content: string;
// // //   };
// // // }

// // // async function callOllama(messages: any[]) {
// // //   const response = await axios.post<OllamaChatResponse>(
// // //     API_BASE,
// // //     {
// // //       model: MODEL,
// // //       stream: false,
// // //       messages,
// // //     },
// // //     {
// // //       timeout: 90_000,
// // //     },
// // //   );

// // //   if (!response.data?.message?.content) {
// // //     throw new Error("Invalid Ollama response format");
// // //   }

// // //   return response.data.message.content.trim();
// // // }

// // // export async function moderateContent(content: string): Promise<boolean> {
// // //   try {
// // //     const aiText = await callOllama([
// // //       {
// // //         role: "system",
// // //         content:
// // //           'Respond with ONLY "Yes" if the content is harmful. Respond with ONLY "No" if safe.',
// // //       },
// // //       {
// // //         role: "user",
// // //         content,
// // //       },
// // //     ]);

// // //     const normalized = aiText.toLowerCase().trim();

// // //     // Strict equality prevents false positives
// // //     return normalized === "yes";
// // //   } catch (error: any) {
// // //     console.error("Moderation error:", error.message);

// // //     // Fail-open policy (allow content if AI fails)
// // //     return false;
// // //   }
// // // }

// // // export async function generateAIResponse(prompt: string): Promise<string> {
// // //   try {
// // //     const aiText = await callOllama([
// // //       {
// // //         role: "user",
// // //         content: prompt,
// // //       },
// // //     ]);

// // //     return aiText;
// // //   } catch (error: any) {
// // //     console.error("AI Error:", error.message);

// // //     return "AI is temporarily unavailable.";
// // //   }
// // // }

// // // // import axios from "axios";

// // // // const API_BASE = "http://172.17.0.1:11434/api/chat";

// // // // export async function moderateContent(content: string): Promise<boolean> {
// // // //   try {
// // // //     const response = await axios.post(API_BASE, {
// // // //       model: "qwen3.5:0.8b",
// // // //       stream: false,
// // // //       messages: [
// // // //         {
// // // //           role: "system",
// // // //           content: 'Respond with "Yes" if harmful, else "No".',
// // // //         },
// // // //         { role: "user", content: content },
// // // //       ],
// // // //     });

// // // //     const aiText = response.data.message.content.trim().toLowerCase();
// // // //     // Return true if the AI thinks it's harmful
// // // //     return aiText.includes("yes");
// // // //   } catch (error) {
// // // //     console.error("Moderation error:", error);
// // // //     return false; // Allow if AI check fails
// // // //   }
// // // // }

// // // // export async function generateAIResponse(prompt: string): Promise<string> {
// // // //   try {
// // // //     const response = await axios.post(
// // // //       API_BASE,
// // // //       {
// // // //         model: "qwen3.5:0.8b",
// // // //         stream: false,
// // // //         messages: [{ role: "user", content: prompt }],
// // // //       },
// // // //       { timeout: 90000 }, // Increased to 90s for slower CPU processing
// // // //     );

// // // //     // Ensure we return the content string
// // // //     if (response.data?.message?.content) {
// // // //       return response.data.message.content.trim();
// // // //     }

// // // //     return "AI processed the request but returned no text.";
// // // //   } catch (error: any) {
// // // //     console.error("AI Error:", error.message);
// // // //     return "Sorry, I'm having trouble thinking right now.";
// // // //   }
// // // // }

// // // // // // // working one.
// // // // // // // import axios from "axios";
// // // // // // // import dotenv from "dotenv";
// // // // // // // dotenv.config();

// // // // // // // // Use the Gateway IP we found earlier
// // // // // // // const API_BASE = "http://172.17.0.1:11434/api/chat";

// // // // // // // export async function moderateContent(content: string): Promise<boolean> {
// // // // // // //   try {
// // // // // // //     const response = await axios.post(API_BASE, {
// // // // // // //       model: "lfm2.5-thinking:latest",
// // // // // // //       stream: false,
// // // // // // //       messages: [
// // // // // // //         {
// // // // // // //           role: "system",
// // // // // // //           content:
// // // // // // //             'Respond only with "Yes" if the content is harmful, else "No".',
// // // // // // //         },
// // // // // // //         { role: "user", content: content },
// // // // // // //       ],
// // // // // // //     });

// // // // // // //     // Check the response from Ollama
// // // // // // //     const aiText = response.data.message.content.trim().toLowerCase();
// // // // // // //     console.log("Moderation Response:", aiText);

// // // // // // //     // FIX: Convert the AI's "Yes/No" text into a Boolean true/false
// // // // // // //     return aiText.includes("yes");
// // // // // // //   } catch (error: any) {
// // // // // // //     console.error("Moderation error:", error.message);
// // // // // // //     return false; // Fail safe
// // // // // // //   }
// // // // // // // }

// // // // // // // export async function generateAIResponse(prompt: string): Promise<string> {
// // // // // // //   try {
// // // // // // //     const response = await axios.post(
// // // // // // //       API_BASE,
// // // // // // //       {
// // // // // // //         model: "lfm2.5-thinking:latest",
// // // // // // //         stream: false,
// // // // // // //         messages: [{ role: "user", content: prompt }],
// // // // // // //       },
// // // // // // //       { timeout: 60000 }, // 60s timeout for "thinking" models
// // // // // // //     );

// // // // // // //     return response.data.message.content.trim();
// // // // // // //   } catch (error: any) {
// // // // // // //     console.error("AI Response Error:", error.response?.data || error.message);
// // // // // // //     return "Sorry, AI response unavailable.";
// // // // // // //   }
// // // // // // // }
// // // // // // // // import axios from "axios";
// // // // // // // // import dotenv from "dotenv";
// // // // // // // // dotenv.config();

// // // // // // // // // Try 127.0.0.1. If you are in Docker, use 'host.docker.internal'
// // // // // // // // // const API_BASE = "http://127.0.0.1:11434/api/chat";

// // // // // // // // // Replace http://127.0.0.1:11434/api/chat with this:
// // // // // // // // // const API_BASE = "http://host.docker.internal:11434/api/chat";
// // // // // // // // // const API_BASE = "http://192.168.1.144:11434/api/chat";

// // // // // // // // // This will now correctly route out of the container to your Fedora OS
// // // // // // // // // const API_BASE = "http://host.docker.internal:11434/api/chat";

// // // // // // // // const API_BASE = "http://172.17.0.1:11434/api/chat";

// // // // // // // // export async function moderateContent(content: string): Promise<boolean> {
// // // // // // // //   try {
// // // // // // // //     const response = await axios.post(API_BASE, {
// // // // // // // //       model: "lfm2.5-thinking:latest", // Using your available model
// // // // // // // //       stream: false,
// // // // // // // //       messages: [
// // // // // // // //         {
// // // // // // // //           role: "system",
// // // // // // // //           content: 'Respond only with "Yes" if harmful, else "No".',
// // // // // // // //         },
// // // // // // // //         { role: "user", content: content },
// // // // // // // //       ],
// // // // // // // //     });

// // // // // // // //     console.log(response.data, "check at ai");

// // // // // // // //     // 3. For /api/chat, Ollama returns { message: { content: "..." } }
// // // // // // // //     return response.data.message.content.trim();

// // // // // // // //     // // PATH CHANGE: Ollama native uses .message.content
// // // // // // // //     // const result = response.data.message.content.trim().toLowerCase();
// // // // // // // //     // return result.includes("yes");
// // // // // // // //   } catch (error: any) {
// // // // // // // //     console.error("Moderation error:", error.message);
// // // // // // // //     return false;
// // // // // // // //   }
// // // // // // // // }

// // // // // // // // // // This will now correctly route out of the container to your Fedora OS
// // // // // // // // // const API_BASE = "http://host.docker.internal:11434/api/chat";

// // // // // // // // export async function generateAIResponse(prompt: string): Promise<string> {
// // // // // // // //   try {
// // // // // // // //     const response = await axios.post(
// // // // // // // //       API_BASE,
// // // // // // // //       {
// // // // // // // //         model: "lfm2.5-thinking:latest",
// // // // // // // //         stream: false,
// // // // // // // //         messages: [{ role: "user", content: prompt }],
// // // // // // // //       },
// // // // // // // //       { timeout: 60000 }, // Keep the long timeout for the thinking model
// // // // // // // //     );

// // // // // // // //     return response.data.message.content.trim();
// // // // // // // //   } catch (error: any) {
// // // // // // // //     console.error("Connection Error:", error.message);
// // // // // // // //     return "Sorry, AI response unavailable.";
// // // // // // // //   }
// // // // // // // // }
// // // // // // // // // export async function generateAIResponse(prompt: string): Promise<string> {
// // // // // // // // //   try {
// // // // // // // // //     console.log("Sending request to Ollama..."); // Debug log

// // // // // // // // //     const response = await axios.post(
// // // // // // // // //       API_BASE,
// // // // // // // // //       {
// // // // // // // // //         model: "lfm2.5-thinking:latest",
// // // // // // // // //         stream: false,
// // // // // // // // //         messages: [{ role: "user", content: prompt }],
// // // // // // // // //       },
// // // // // // // // //       {
// // // // // // // // //         timeout: 60000, // Increase timeout to 60 seconds (thinking models are slow!)
// // // // // // // // //         headers: { "Content-Type": "application/json" },
// // // // // // // // //       },
// // // // // // // // //     );

// // // // // // // // //     // Verify we have the expected data structure
// // // // // // // // //     if (response.data && response.data.message) {
// // // // // // // // //       return response.data.message.content.trim();
// // // // // // // // //     }

// // // // // // // // //     throw new Error("Unexpected response format from Ollama");
// // // // // // // // //   } catch (error: any) {
// // // // // // // // //     // THIS IS THE MOST IMPORTANT PART:
// // // // // // // // //     // Check your terminal/console where the server is running to see this output:
// // // // // // // // //     if (error.code === "ECONNREFUSED") {
// // // // // // // // //       console.error("CRITICAL: Cannot connect to Ollama. Is it running?");
// // // // // // // // //     } else {
// // // // // // // // //       console.error(
// // // // // // // // //         "Ollama Error Detail:",
// // // // // // // // //         error.response?.data || error.message,
// // // // // // // // //       );
// // // // // // // // //     }

// // // // // // // // //     return "Sorry, AI response unavailable.";
// // // // // // // // //   }
// // // // // // // // // }

// // // // // // // // // Keep your moderateContent similar to this pattern
// // // // // // // // // import axios from "axios";
// // // // // // // // // import dotenv from "dotenv";
// // // // // // // // // dotenv.config();

// // // // // // // // // // Use 127.0.0.1 to avoid potential localhost resolution issues in Node.js
// // // // // // // // // const API_BASE = "http://127.0.0.1:11434/api/chat";

// // // // // // // // // export async function moderateContent(content: string): Promise<boolean> {
// // // // // // // // //   try {
// // // // // // // // //     const response = await axios.post(API_BASE, {
// // // // // // // // //       model: "lfm2.5-thinking:latest", // Using your available model
// // // // // // // // //       stream: false,
// // // // // // // // //       messages: [
// // // // // // // // //         {
// // // // // // // // //           role: "system",
// // // // // // // // //           content: 'Respond only with "Yes" if harmful, else "No".',
// // // // // // // // //         },
// // // // // // // // //         { role: "user", content: content },
// // // // // // // // //       ],
// // // // // // // // //     });

// // // // // // // // //     // PATH CHANGE: Ollama native uses .message.content
// // // // // // // // //     const result = response.data.message.content.trim().toLowerCase();
// // // // // // // // //     return result.includes("yes");
// // // // // // // // //   } catch (error: any) {
// // // // // // // // //     console.error("Moderation error:", error.message);
// // // // // // // // //     return false;
// // // // // // // // //   }
// // // // // // // // // }

// // // // // // // // // export async function generateAIResponse(prompt: string): Promise<string> {
// // // // // // // // //   try {
// // // // // // // // //     const response = await axios.post(API_BASE, {
// // // // // // // // //       model: "lfm2.5-thinking:latest",
// // // // // // // // //       stream: false,
// // // // // // // // //       messages: [{ role: "user", content: prompt }],
// // // // // // // // //     });

// // // // // // // // //     // PATH CHANGE: Matches your successful curl output
// // // // // // // // //     return response.data.message.content.trim();
// // // // // // // // //   } catch (error: any) {
// // // // // // // // //     // This will help you see the exact error in your console if it fails again
// // // // // // // // //     console.error(
// // // // // // // // //       "AI Response Error Details:",
// // // // // // // // //       error.response?.data || error.message,
// // // // // // // // //     );
// // // // // // // // //     return "Sorry, AI response unavailable.";
// // // // // // // // //   }
// // // // // // // // // }

// // // // // // // // // // v3
// // // // // // // // // // import axios from "axios";
// // // // // // // // // // import dotenv from "dotenv";
// // // // // // // // // // dotenv.config();

// // // // // // // // // // // Using the native Ollama endpoint for better reliability
// // // // // // // // // // const API_BASE = "http://127.0.0.1:11434/api/chat";

// // // // // // // // // // export async function moderateContent(content: string): Promise<boolean> {
// // // // // // // // // //   try {
// // // // // // // // // //     const response = await axios.post(API_BASE, {
// // // // // // // // // //       model: "glm-ocr:q8_0", // Your installed model
// // // // // // // // // //       stream: false,
// // // // // // // // // //       messages: [
// // // // // // // // // //         {
// // // // // // // // // //           role: "system",
// // // // // // // // // //           content: 'Respond only with "Yes" if harmful, else "No".',
// // // // // // // // // //         },
// // // // // // // // // //         { role: "user", content: content },
// // // // // // // // // //       ],
// // // // // // // // // //     });

// // // // // // // // // //     // Native Ollama response structure: response.data.message.content
// // // // // // // // // //     const result = response.data.message.content.trim().toLowerCase();
// // // // // // // // // //     return result.includes("yes");
// // // // // // // // // //   } catch (error: any) {
// // // // // // // // // //     console.error("Moderation error:", error.response?.data || error.message);
// // // // // // // // // //     return false;
// // // // // // // // // //   }
// // // // // // // // // // }

// // // // // // // // // // export async function generateAIResponse(prompt: string): Promise<string> {
// // // // // // // // // //   try {
// // // // // // // // // //     const response = await axios.post(API_BASE, {
// // // // // // // // // //       // Using your "thinking" model for general responses
// // // // // // // // // //       model: "lfm2.5-thinking:latest",
// // // // // // // // // //       stream: false,
// // // // // // // // // //       messages: [{ role: "user", content: prompt }],
// // // // // // // // // //     });

// // // // // // // // // //     // Accessing content via the Ollama native API path
// // // // // // // // // //     return response.data.message.content.trim();
// // // // // // // // // //   } catch (error: any) {
// // // // // // // // // //     console.error(
// // // // // // // // // //       "AI generation error:",
// // // // // // // // // //       error.response?.data || error.message,
// // // // // // // // // //     );
// // // // // // // // // //     return "Sorry, AI response unavailable. Make sure Ollama is running.";
// // // // // // // // // //   }
// // // // // // // // // // }
// // // // // // // // // // // v2
// // // // // // // // // // // // import axios from "axios";
// // // // // // // // // // // import axios from "axios";
// // // // // // // // // // // import dotenv from "dotenv";
// // // // // // // // // // // dotenv.config();

// // // // // // // // // // // // Ollama's default local address
// // // // // // // // // // // const API_BASE = "http://localhost:11434/v1";

// // // // // // // // // // // // Ollama doesn't require a key locally, but we'll keep the logic
// // // // // // // // // // // // in case you have a reverse proxy or auth layer.
// // // // // // // // // // // const API_KEY = process.env.XAI_API_KEY || "ollama";

// // // // // // // // // // // export async function moderateContent(content: string): Promise<boolean> {
// // // // // // // // // // //   try {
// // // // // // // // // // //     const response = await axios.post(
// // // // // // // // // // //       `${API_BASE}/chat/completions`,
// // // // // // // // // // //       {
// // // // // // // // // // //         stream: false,
// // // // // // // // // // //         model: "glm-ocr:q8_0",
// // // // // // // // // // //         // model: "llama3", // Change this to your local model (e.g., "mistral", "phi3")
// // // // // // // // // // //         messages: [
// // // // // // // // // // //           {
// // // // // // // // // // //             role: "system",
// // // // // // // // // // //             content:
// // // // // // // // // // //               'You are a content moderator. Respond only with "Yes" if harmful (hate, violence, illegal), else "No".',
// // // // // // // // // // //           },
// // // // // // // // // // //           { role: "user", content: `Content: ${content}` },
// // // // // // // // // // //         ],
// // // // // // // // // // //       },
// // // // // // // // // // //       {
// // // // // // // // // // //         headers: {
// // // // // // // // // // //           "Content-Type": "application/json",
// // // // // // // // // // //           // Authorization is usually ignored by local Ollama but included for compatibility
// // // // // // // // // // //           Authorization: `Bearer ${API_KEY}`,
// // // // // // // // // // //         },
// // // // // // // // // // //       },
// // // // // // // // // // //     );

// // // // // // // // // // //     const result = response.data.choices[0].message.content
// // // // // // // // // // //       .trim()
// // // // // // // // // // //       .toLowerCase();

// // // // // // // // // // //     // Some local models might get wordy; we check if "yes" is in the string
// // // // // // // // // // //     return result.includes("yes");
// // // // // // // // // // //   } catch (error) {
// // // // // // // // // // //     console.error("Moderation error:", error);
// // // // // // // // // // //     return false;
// // // // // // // // // // //   }
// // // // // // // // // // // }

// // // // // // // // // // // export async function generateAIResponse(prompt: string): Promise<string> {
// // // // // // // // // // //   try {
// // // // // // // // // // //     const response = await axios.post(
// // // // // // // // // // //       `${API_BASE}/chat/completions`,
// // // // // // // // // // //       {
// // // // // // // // // // //         model: "llama3", // Ensure you have pulled this model: 'ollama pull llama3'
// // // // // // // // // // //         messages: [{ role: "user", content: prompt }],
// // // // // // // // // // //       },
// // // // // // // // // // //       {
// // // // // // // // // // //         headers: {
// // // // // // // // // // //           "Content-Type": "application/json",
// // // // // // // // // // //         },
// // // // // // // // // // //       },
// // // // // // // // // // //     );

// // // // // // // // // // //     return response.data.choices[0].message.content.trim();
// // // // // // // // // // //   } catch (error) {
// // // // // // // // // // //     console.error("AI generation error:", error);
// // // // // // // // // // //     return "Sorry, AI response unavailable.";
// // // // // // // // // // //   }
// // // // // // // // // // // }

// // // // // import axios from "axios";
// // // // // import dotenv from "dotenv";
// // // // // dotenv.config();

// // // // // // const API_BASE = "https://api.x.ai/v1";
// // // // // // const API_BASE = "http://localhost:11434";
// // // // // const API_BASE = process.env.XAI_API_KEY;
// // // // // // const API_BASE = process.env.OPENROUTER_API_KEY;

// // // // // if (!API_BASE) {
// // // // //   throw new Error("OPENROUTER_API_KEY is not set yet.");
// // // // // }

// // // // // export async function moderateContent(content: string): Promise<boolean> {
// // // // //   try {
// // // // //     const response = await axios.post(
// // // // //       `${API_BASE}/chat/completions`,
// // // // //       {
// // // // //         stream: false,
// // // // //         // Update to 'grok-4' or latest from https://docs.x.ai/docs/models
// // // // //         // model: "grok-4-latest",
// // // // //         model: "grok-beta",
// // // // //         messages: [
// // // // //           {
// // // // //             role: "system",
// // // // //             content:
// // // // //               'You are a content moderator. Respond only with "Yes" if harmful (hate, violence, illegal), else "No".',
// // // // //           },
// // // // //           { role: "user", content: `Content: ${content}` },
// // // // //         ],
// // // // //       },
// // // // //       {
// // // // //         headers: {
// // // // //           Authorization: `Bearer ${API_BASE}`,
// // // // //           "Content-Type": "application/json",
// // // // //         },
// // // // //       },
// // // // //     );

// // // // //     const result = response.data.choices[0].message.content
// // // // //       .trim()
// // // // //       .toLowerCase();
// // // // //     return result === "yes";
// // // // //   } catch (error) {
// // // // //     console.error("Moderation error:", error);
// // // // //     return false; // Fail open; adjust to fail closed if preferred
// // // // //   }
// // // // // }

// // // // // export async function generateAIResponse(prompt: string): Promise<string> {
// // // // //   try {
// // // // //     const response = await axios.post(
// // // // //       `${API_BASE}/chat/completions`,
// // // // //       {
// // // // //         model: "grok-beta", // Same as above
// // // // //         messages: [{ role: "user", content: prompt }],
// // // // //       },
// // // // //       {
// // // // //         headers: {
// // // // //           Authorization: `Bearer ${API_BASE}`,
// // // // //           "Content-Type": "application/json",
// // // // //         },
// // // // //       },
// // // // //     );

// // // // //     return response.data.choices[0].message.content.trim();
// // // // //   } catch (error) {
// // // // //     console.error("AI generation error:", error);
// // // // //     return "Sorry, AI response unavailable.";
// // // // //   }
// // // // // }

// // // // // // import axios from "axios";
// // // // // // export async function callGrokAI(prompt: string): Promise<string> {
// // // // // //   const response = await axios.post(
// // // // // //     "https://api.x.ai/v1/chat/completions",
// // // // // //     {
// // // // // //       // Or actual endpoint
// // // // // //       model: "grok-beta",
// // // // // //       messages: [{ role: "user", content: prompt }],
// // // // // //     },
// // // // // //     { headers: { Authorization: `Bearer ${process.env.GROK_API_KEY}` } },
// // // // // //   );
// // // // // //   return response.data.choices[0].message.content;
// // // // // // }
