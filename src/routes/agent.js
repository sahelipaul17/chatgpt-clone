import express from "express";
import { runAgentTool, AGENTS } from "../ai/agent.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

/**
 * POST /api/agents/:agent/:tool
 */
router.post("/:agent/:tool", async (req, res) => {
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

    await redis.rPush(`agent_history:${username}`, JSON.stringify(entry));
    await redis.expire(`agent_history:${username}`, 60 * 60 * 24);

    res.apiSuccess(result, "Agent executed successfully");
  } catch (err) {
    console.error(err);
    res.apiError("Agent execution failed", 500);
  }
});

/**
 * GET /api/history
 */
router.get("/history", async (req, res) => {
    const redis = req.app.get("redis");
    if (!req.session.user) return res.apiError("Not logged in", 401);
    const key = `agent_history:${req.session.user.username}`;
    const history = await redis.lRange(key, 0, -1).then((arr) => arr.map(JSON.parse));
    res.apiSuccess({ history }, "Agent history retrieved");
})

export default router;
