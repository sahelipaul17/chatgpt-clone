import { GoogleGenerativeAI } from "@google/generative-ai";
import readline from "readline";
import { createClient } from "redis";

// import dotenv from "dotenv";

// dotenv.config();

//set up for redis 
const SESSION_KEY = "chat:history";

// set up for gemini api key
let GGOGLE_GEMINI_API_KEY = "AIzaSyAxDezcHE0tjn9_M-A-nusD7flE3tkeY8E"

const genAI = new GoogleGenerativeAI(GGOGLE_GEMINI_API_KEY);

// async function run() {
//   try {
//     // Get the model (Gemini 1.5 Flash)
//     const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

//     // Ask a question
//     const result = await model.generateContent("Hello, how are you?");

//     console.log(result.response.text());
//   } catch (error) {
//     console.error("Error:", error);
//   }
// }

// run();

// async function runChat() {
//   try {
//     const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

//     // Start role-based chat with history
//     const chat = model.startChat({
//       history: [
//         {
//           role: "user",
//           parts: [{ text: "Hello, who are you?" }],
//         },
//         {
//           role: "model",
//           parts: [{ text: "I'm Gemini, your helpful AI assistant." }],
//         },
//       ],
//       generationConfig: {
//         maxOutputTokens: 200,
//       },
//     });

//     // Now send new user messages (with role = user automatically handled)
//     let response1 = await chat.sendMessage("What can you do?");
//     console.log("User: What can you do?");
//     console.log("AI:", response1.response.text());

//     let response2 = await chat.sendMessage("Explain like I'm 5.");
//     console.log("\nUser: Explain like I'm 5.");
//     console.log("AI:", response2.response.text());

//   } catch (error) {
//     console.error("Error:", error);
//   }
// }

// runChat();

async function main() {
  try {
    const redis = createClient({
      url: "redis://default:ut1TiasmsmsIqs4wxe11ja4hEMebaCK8@redis-14028.c10.us-east-1-2.ec2.redns.redis-cloud.com:14028"
    });

    redis.on("error", (err) => console.error("Redis Error:", err));
    await redis.connect();

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Load history from Redis
    let historyData = await redis.get(SESSION_KEY);
    let history = historyData ? JSON.parse(historyData) : [];

    console.log("Loaded history:", history);

    const chat = model.startChat({
      history,
      generationConfig: { maxOutputTokens: 200 },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("🤖 AI Chatbot started. Type 'exit' to quit.\n");

    const ask = () => {
      rl.question("You: ", async (message) => {
        if (message.toLowerCase() === "exit") {
          console.log("👋 Goodbye!");
          rl.close();
          await redis.quit();
          return;
        }

        try {
          // 1️⃣ Add user message to history
          // history.push({ role: "user", parts: [{ text: message }] });

          // 2️⃣ Send message
          const result = await chat.sendMessage(message);
          const reply = result.response.text();

          // 3️⃣ Add AI response to history
          //history.push({ role: "model", parts: [{ text: reply }] });

          console.log("AI:", reply, "\n");

          // 4️⃣ Save updated history back into Redis
          await redis.set(SESSION_KEY, JSON.stringify(history));
        } catch (err) {
          console.error("Error:", err);
        }

        ask();
      });
    };

    ask();
  } catch (error) {
    console.error("Error:", error);
  }
}

main();



