

# 🤖 ChatGPT Assistant

A simple AI assistant web server built using Node.js and Express, leveraging Google Generative AI for natural language responses, plus custom AI agents for software development tasks.

🔐 User Authentication with Couchbase

🧠 Chat Memory using Redis

✨ AI Chat powered by Google Gemini (gemini-2.0-flash)

🛠 Custom AI Agents for developers and testers





## 🚀 Features

User signup, login, logout (with sessions)

Chat with the AI model via /api/chat

Chat memory stored per-user in Redis

Session-based authentication using express-session

Developer AI Agents: generate unit tests, suggest code refactoring, provide stack recommendations, produce design docs, and assist in bug fixing

Tester AI Agents: generate automated test cases, optimize test suites, produce API test plans, and summarize log analysis

Extensible API structure for user preferences, chat history, and AI agent interactions




## 📦 Tech Stack

| Layer         | Tool/Service             |
|---------------|--------------------------|
| Language      | Node.js (ES modules)     |
| Framework     | Express.js               |
| AI            | Google Generative AI (Gemini) |
| Database      | Couchbase (user storage) |
| Memory Store  | Redis (chat session history) |
| Auth          | Sessions (`express-session` + Redis store) |
| Logging       | Custom middleware        |
| CORS & Cookies| `cors`, `cookie-parser`  |





## 📂 Project Structure

```bash
chatgpt-assistant/
│
├── src/
├── ai/agent.js         # AI Agent file
├── routes/
│   ├── agent.js        # AI Agent file
│   ├── chat.js        # Chat file
│   ├── auth.js        # Auth file
│   ├── preference.js        # Preference file
├── db.js           # Couchbase connection helper
├── middleware/auth.js        # Auth middleware
├── index.js        # Main app file
├── .env                # Environment variables
└── README.md           # This file
