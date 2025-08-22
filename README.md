# 🤖 ChatGPT Assistant

A simple AI assistant web server built using **Node.js** and **Express**, leveraging **Google Generative AI** for natural language responses.

- 🔐 **User Authentication** with Couchbase
- 🧠 **Chat Memory** using Redis
- ✨ **AI Chat** powered by Google Gemini (`gemini-1.5-flash`)

---

## 🚀 Features

- User **signup, login, logout** (with sessions)
- Chat with the AI model via `/api/chat`
- Chat memory stored per-user in **Redis**
- Session-based authentication using `express-session`
- Extensible API structure for user preferences, chat history, and more

---

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

---

## 📂 Project Structure

```bash
chatgpt-assistant/
│
├── scripts/setup.js          # Setup file
├── src/
│   ├── index.js        # Main server file
│   └── db.js           # Couchbase connection helper
├── .env                # Environment variables
└── README.md           # This file
