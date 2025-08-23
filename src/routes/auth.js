import express from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getUsersCollection } from "../db.js";

const router = express.Router();

/**
 * POST /api/auth/signup
 */
router.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.apiError("Missing fields", 400);
        }

        const users = await getUsersCollection();

        const existing = await users.get(email).catch(() => null);
        if (existing) {
            return res.apiError("Email already exists", 400);
        }

        const hash = await bcrypt.hash(password, 10);
        const user = {
            id: uuidv4(), username, email, password: hash, "preferences": {
                "theme": "light",
                "font": "default"
            }
        };

        await users.upsert(email, user);
        req.session.user = { username, email };

        res.apiSuccess({ user: { username, email } }, "Signup successful");
    } catch (err) {
        res.apiError(err.message || "Signup failed");
    }
});

/**
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.apiError("Missing fields", 400);
        }
        const users = await getUsersCollection();

        const doc = await users.get(email).catch(() => null);
        if (!doc) return res.apiError("Invalid credentials", 400);

        const user = doc.content;
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.apiError("Invalid password", 400);

        req.session.user = { username: user.username, email: user.email };
        res.apiSuccess({ user: req.session.user }, "Login successfully. Welcome to AI World for Developer & Tester");
    } catch (err) {
        res.apiError(err.message || "OOPS!!! Login failed");
    }
});

/**
 * POST /api/auth/logout
 */
router.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.apiSuccess({}, "Logged out");
    });
});

/**
 * GET /api/auth/me
 */
router.get("/me", (req, res) => {
    if (!req.session.user) return res.apiError("Not logged in", 401);
    res.apiSuccess({ user: req.session.user }, "User retrieved");
});

export default router;
