import express from "express";
import { getUsersCollection } from "../db.js";

const router = express.Router();

// Allowed preference values
const ALLOWED_THEMES = ["light", "dark"];
const ALLOWED_FONTS = ["default", "serif", "mono"];

/**
 * GET /api/preferences
 * Returns saved user preferences (with defaults if not set).
 */
router.get("/preferences", async (req, res) => {
  if (!req.session.user) return res.apiError("Not logged in", 401);

  try {
    const users = await getUsersCollection();
    const doc = await users.get(req.session.user.email).catch(() => null);

    const preferences = doc?.content?.preferences || {
      theme: "light",
      font: "default",
    };

    res.apiSuccess({ preferences }, "Preferences retrieved");
  } catch (err) {
    console.error("GET /preferences error:", err);
    res.apiError("Failed to fetch preferences", 500);
  }
});

/**
 * POST /api/preferences
 * Updates user preferences.
 */
router.post("/preferences", async (req, res) => {
  if (!req.session.user) return res.apiError("Not logged in", 401);

  try {
    const { preferences } = req.body;
    if (!preferences) return res.apiError("Preferences missing", 400);

    let { theme, font } = preferences;

    // Validate
    if (!ALLOWED_THEMES.includes(theme)) theme = "light";
    if (!ALLOWED_FONTS.includes(font)) font = "default";

    const users = await getUsersCollection();
    const doc = await users.get(req.session.user.email);
    const user = doc.content;

    user.preferences = { theme, font };

    await users.upsert(req.session.user.email, user);

    res.apiSuccess({ preferences: user.preferences }, "Preferences updated");
  } catch (err) {
    console.error("POST /preferences error:", err);
    res.apiError("Failed to update preferences", 500);
  }
});

export default router;
