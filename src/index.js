import { GoogleGenerativeAI } from "@google/generative-ai";
// import dotenv from "dotenv";

// dotenv.config();

// Use environment variable instead of hardcoding
let GGOGLE_GEMINI_API_KEY = "AIzaSyAxDezcHE0tjn9_M-A-nusD7flE3tkeY8E"

const genAI = new GoogleGenerativeAI(GGOGLE_GEMINI_API_KEY);

async function run() {
  try {
    // Get the model (Gemini 1.5 Flash)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Ask a question
    const result = await model.generateContent("Hello, how are you?");

    console.log(result.response.text());
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
