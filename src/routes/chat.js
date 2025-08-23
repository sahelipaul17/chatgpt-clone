import express from "express";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { isAuthenticated } from "../middleware/auth.js";
import { runAgentTool, AGENTS } from "../ai/agent.js";
import dotenv from "dotenv";

dotenv.config();


const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const router = express.Router();


// Protect all chat routes
router.use(isAuthenticated);

/**
 * POST /api/chat
 */
router.post("/", async (req, res) => {
  if (!req.session.user) return res.apiError("Not logged in", 401);

  const { message } = req.body;
  const redis = req.app.get("redis");
  const username = req.session.user.username;
  const key = `chat_history:${username}`;

  const history = await redis.lRange(key, 0, -1).then((arr) => arr.map(JSON.parse));

  const chat = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }).startChat({
    history: history.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    })),
  });

  const reply = await chat.sendMessage(message);
  const responseText = reply.response.text();

  const userMsg = { role: "user", content: message };
  const botMsg = { role: "model", content: responseText };

  await redis.rPush(key, JSON.stringify(userMsg));
  await redis.rPush(key, JSON.stringify(botMsg));
  await redis.expire(key, 60 * 60 * 24); // 1 day

  res.apiSuccess({ reply: responseText }, "Your response");
});

/**
 * GET /api/chat/history
 */
router.get("/history", async (req, res) => {
  const redis = req.app.get("redis");
  const username = req.session.user.username;
  if (!username) return res.apiError("Not logged in", 401);

  const key = `chat_history:${username}`;
  const history = await redis.lRange(key, 0, -1).then((arr) => arr.map(JSON.parse));

  res.apiSuccess({ history }, "Chat history retrieved");
});

/**
 * GET /api/chat/search?q=keyword
 */
router.get("/search", async (req, res) => {
    const redis = req.app.get("redis");
  const username = req.session.user.username;
  const { search } = req.query;
  if (!search) return res.apiError("Search query required", 400);

  const key = `chat_history:${username}`;
  const history = await redis.lRange(key, 0, -1).then((arr) => arr.map(JSON.parse));

  const results = history.filter((m) =>
    m.content.toLowerCase().includes(search.toLowerCase())
  );

  res.apiSuccess({ results }, "Search complete");
});

/**
 * DELETE /api/chat/history
 */
router.delete("/history", async (req, res) => {
    const redis = req.app.get("redis");
  const username = req.session.user.username;
  const key = `chat_history:${username}`;
  await redis.del(key);
  res.apiSuccess({}, "Chat history cleared");
});

/**
 * DELETE /api/chat/message/:index
 */
router.delete("/message/:index", async (req, res) => {
    const redis = req.app.get("redis");
  const username = req.session.user.username;
  const index = parseInt(req.params.index, 10);

  const key = `chat_history:${username}`;
  let history = await redis.lRange(key, 0, -1).then((arr) => arr.map(JSON.parse));

  if (index < 0 || index >= history.length) {
    return res.apiError("Invalid index", 400);
  }

  history.splice(index, 1);

  await redis.del(key);
  if (history.length > 0) {
    await redis.rPush(key, history.map((m) => JSON.stringify(m)));
  }

  res.apiSuccess({ history }, "Message deleted");
});

/**
 * POST /api/chat/agent/:agent/:tool
 * -> bridge to agent execution from chat
 */
router.post("/agent/:agent/:tool", async (req, res) => {
    const redis = req.app.get("redis");
  if (!req.session.user) return res.apiError("Not logged in", 401);

  const { agent, tool } = req.params;
  const { input } = req.body;
  const username = req.session.user.username;

  if (!agent) return res.apiError("Unknown agent", 400);
  if (!tool) return res.apiError("Unknown tool", 400);

  try {
    const result = await runAgentTool({
        agentKey: agent,
        toolKey: tool,
        input
      });
    const entry = {
      agent,
      tool,
      prompt: input,
      result,
      timestamp: new Date().toISOString(),
    };

    // store in agent_history
    await redis.rPush(`agent_history:${username}`, JSON.stringify(entry));
    await redis.expire(`agent_history:${username}`, 60 * 60 * 24);

    res.apiSuccess(result, "Agent executed successfully");
  } catch (err) {
    console.error(err);
    res.apiError("Agent execution failed", 500);
  }
});

export default router;
