import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// Try 127.0.0.1. If you are in Docker, use 'host.docker.internal'
const API_BASE = "http://127.0.0.1:11434/api/chat";

export async function moderateContent(content: string): Promise<boolean> {
  try {
    const response = await axios.post(API_BASE, {
      model: "lfm2.5-thinking:latest", // Using your available model
      stream: false,
      messages: [
        {
          role: "system",
          content: 'Respond only with "Yes" if harmful, else "No".',
        },
        { role: "user", content: content },
      ],
    });

    // PATH CHANGE: Ollama native uses .message.content
    const result = response.data.message.content.trim().toLowerCase();
    return result.includes("yes");
  } catch (error: any) {
    console.error("Moderation error:", error.message);
    return false;
  }
}

export async function generateAIResponse(prompt: string): Promise<string> {
  try {
    console.log("Sending request to Ollama..."); // Debug log

    const response = await axios.post(
      API_BASE,
      {
        model: "lfm2.5-thinking:latest",
        stream: false,
        messages: [{ role: "user", content: prompt }],
      },
      {
        timeout: 60000, // Increase timeout to 60 seconds (thinking models are slow!)
        headers: { "Content-Type": "application/json" },
      },
    );

    // Verify we have the expected data structure
    if (response.data && response.data.message) {
      return response.data.message.content.trim();
    }

    throw new Error("Unexpected response format from Ollama");
  } catch (error: any) {
    // THIS IS THE MOST IMPORTANT PART:
    // Check your terminal/console where the server is running to see this output:
    if (error.code === "ECONNREFUSED") {
      console.error("CRITICAL: Cannot connect to Ollama. Is it running?");
    } else {
      console.error(
        "Ollama Error Detail:",
        error.response?.data || error.message,
      );
    }

    return "Sorry, AI response unavailable.";
  }
}

// Keep your moderateContent similar to this pattern
// import axios from "axios";
// import dotenv from "dotenv";
// dotenv.config();

// // Use 127.0.0.1 to avoid potential localhost resolution issues in Node.js
// const API_BASE = "http://127.0.0.1:11434/api/chat";

// export async function moderateContent(content: string): Promise<boolean> {
//   try {
//     const response = await axios.post(API_BASE, {
//       model: "lfm2.5-thinking:latest", // Using your available model
//       stream: false,
//       messages: [
//         {
//           role: "system",
//           content: 'Respond only with "Yes" if harmful, else "No".',
//         },
//         { role: "user", content: content },
//       ],
//     });

//     // PATH CHANGE: Ollama native uses .message.content
//     const result = response.data.message.content.trim().toLowerCase();
//     return result.includes("yes");
//   } catch (error: any) {
//     console.error("Moderation error:", error.message);
//     return false;
//   }
// }

// export async function generateAIResponse(prompt: string): Promise<string> {
//   try {
//     const response = await axios.post(API_BASE, {
//       model: "lfm2.5-thinking:latest",
//       stream: false,
//       messages: [{ role: "user", content: prompt }],
//     });

//     // PATH CHANGE: Matches your successful curl output
//     return response.data.message.content.trim();
//   } catch (error: any) {
//     // This will help you see the exact error in your console if it fails again
//     console.error(
//       "AI Response Error Details:",
//       error.response?.data || error.message,
//     );
//     return "Sorry, AI response unavailable.";
//   }
// }

// // v3
// // import axios from "axios";
// // import dotenv from "dotenv";
// // dotenv.config();

// // // Using the native Ollama endpoint for better reliability
// // const API_BASE = "http://127.0.0.1:11434/api/chat";

// // export async function moderateContent(content: string): Promise<boolean> {
// //   try {
// //     const response = await axios.post(API_BASE, {
// //       model: "glm-ocr:q8_0", // Your installed model
// //       stream: false,
// //       messages: [
// //         {
// //           role: "system",
// //           content: 'Respond only with "Yes" if harmful, else "No".',
// //         },
// //         { role: "user", content: content },
// //       ],
// //     });

// //     // Native Ollama response structure: response.data.message.content
// //     const result = response.data.message.content.trim().toLowerCase();
// //     return result.includes("yes");
// //   } catch (error: any) {
// //     console.error("Moderation error:", error.response?.data || error.message);
// //     return false;
// //   }
// // }

// // export async function generateAIResponse(prompt: string): Promise<string> {
// //   try {
// //     const response = await axios.post(API_BASE, {
// //       // Using your "thinking" model for general responses
// //       model: "lfm2.5-thinking:latest",
// //       stream: false,
// //       messages: [{ role: "user", content: prompt }],
// //     });

// //     // Accessing content via the Ollama native API path
// //     return response.data.message.content.trim();
// //   } catch (error: any) {
// //     console.error(
// //       "AI generation error:",
// //       error.response?.data || error.message,
// //     );
// //     return "Sorry, AI response unavailable. Make sure Ollama is running.";
// //   }
// // }
// // // v2
// // // // import axios from "axios";
// // // import axios from "axios";
// // // import dotenv from "dotenv";
// // // dotenv.config();

// // // // Ollama's default local address
// // // const API_BASE = "http://localhost:11434/v1";

// // // // Ollama doesn't require a key locally, but we'll keep the logic
// // // // in case you have a reverse proxy or auth layer.
// // // const API_KEY = process.env.XAI_API_KEY || "ollama";

// // // export async function moderateContent(content: string): Promise<boolean> {
// // //   try {
// // //     const response = await axios.post(
// // //       `${API_BASE}/chat/completions`,
// // //       {
// // //         stream: false,
// // //         model: "glm-ocr:q8_0",
// // //         // model: "llama3", // Change this to your local model (e.g., "mistral", "phi3")
// // //         messages: [
// // //           {
// // //             role: "system",
// // //             content:
// // //               'You are a content moderator. Respond only with "Yes" if harmful (hate, violence, illegal), else "No".',
// // //           },
// // //           { role: "user", content: `Content: ${content}` },
// // //         ],
// // //       },
// // //       {
// // //         headers: {
// // //           "Content-Type": "application/json",
// // //           // Authorization is usually ignored by local Ollama but included for compatibility
// // //           Authorization: `Bearer ${API_KEY}`,
// // //         },
// // //       },
// // //     );

// // //     const result = response.data.choices[0].message.content
// // //       .trim()
// // //       .toLowerCase();

// // //     // Some local models might get wordy; we check if "yes" is in the string
// // //     return result.includes("yes");
// // //   } catch (error) {
// // //     console.error("Moderation error:", error);
// // //     return false;
// // //   }
// // // }

// // // export async function generateAIResponse(prompt: string): Promise<string> {
// // //   try {
// // //     const response = await axios.post(
// // //       `${API_BASE}/chat/completions`,
// // //       {
// // //         model: "llama3", // Ensure you have pulled this model: 'ollama pull llama3'
// // //         messages: [{ role: "user", content: prompt }],
// // //       },
// // //       {
// // //         headers: {
// // //           "Content-Type": "application/json",
// // //         },
// // //       },
// // //     );

// // //     return response.data.choices[0].message.content.trim();
// // //   } catch (error) {
// // //     console.error("AI generation error:", error);
// // //     return "Sorry, AI response unavailable.";
// // //   }
// // // }

// // // // import axios from "axios";
// // // // import dotenv from "dotenv";
// // // // dotenv.config();

// // // // // const API_BASE = "https://api.x.ai/v1";
// // // // const API_BASE = "http://localhost:11434";
// // // // const API_KEY = process.env.XAI_API_KEY;

// // // // if (!API_KEY) {
// // // //   throw new Error("XAI_API_KEY is not set yet.");
// // // // }

// // // // export async function moderateContent(content: string): Promise<boolean> {
// // // //   try {
// // // //     const response = await axios.post(
// // // //       `${API_BASE}/chat/completions`,
// // // //       {
// // // //         stream: false,
// // // //         // Update to 'grok-4' or latest from https://docs.x.ai/docs/models
// // // //         // model: "grok-4-latest",
// // // //         model: "grok-beta",
// // // //         messages: [
// // // //           {
// // // //             role: "system",
// // // //             content:
// // // //               'You are a content moderator. Respond only with "Yes" if harmful (hate, violence, illegal), else "No".',
// // // //           },
// // // //           { role: "user", content: `Content: ${content}` },
// // // //         ],
// // // //       },
// // // //       {
// // // //         headers: {
// // // //           Authorization: `Bearer ${API_KEY}`,
// // // //           "Content-Type": "application/json",
// // // //         },
// // // //       },
// // // //     );

// // // //     const result = response.data.choices[0].message.content
// // // //       .trim()
// // // //       .toLowerCase();
// // // //     return result === "yes";
// // // //   } catch (error) {
// // // //     console.error("Moderation error:", error);
// // // //     return false; // Fail open; adjust to fail closed if preferred
// // // //   }
// // // // }

// // // // export async function generateAIResponse(prompt: string): Promise<string> {
// // // //   try {
// // // //     const response = await axios.post(
// // // //       `${API_BASE}/chat/completions`,
// // // //       {
// // // //         model: "grok-beta", // Same as above
// // // //         messages: [{ role: "user", content: prompt }],
// // // //       },
// // // //       {
// // // //         headers: {
// // // //           Authorization: `Bearer ${API_KEY}`,
// // // //           "Content-Type": "application/json",
// // // //         },
// // // //       },
// // // //     );

// // // //     return response.data.choices[0].message.content.trim();
// // // //   } catch (error) {
// // // //     console.error("AI generation error:", error);
// // // //     return "Sorry, AI response unavailable.";
// // // //   }
// // // // }

// // // // // import axios from "axios";
// // // // // export async function callGrokAI(prompt: string): Promise<string> {
// // // // //   const response = await axios.post(
// // // // //     "https://api.x.ai/v1/chat/completions",
// // // // //     {
// // // // //       // Or actual endpoint
// // // // //       model: "grok-beta",
// // // // //       messages: [{ role: "user", content: prompt }],
// // // // //     },
// // // // //     { headers: { Authorization: `Bearer ${process.env.GROK_API_KEY}` } },
// // // // //   );
// // // // //   return response.data.choices[0].message.content;
// // // // // }
