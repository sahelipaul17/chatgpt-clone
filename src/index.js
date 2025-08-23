import express from "express";
import session from "express-session";
import { createClient } from "redis";
import RedisStore from "connect-redis";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";


// Routes
import authRouter from "./routes/auth.js";
import chatRouter from "./routes/chat.js";
import agentRouter from "./routes/agent.js";
import preferencesRouter from "./routes/preference.js";



// DB (Couchbase)
import { connectCouchbase } from "./db.js";


dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const PORT = process.env.PORT || 5000;


// --- CORS ---
const corsOptions = {
origin: (origin, cb)=>{
const allowed = [
"http://localhost:8080",
"http://localhost:3000",
"http://localhost:5000",
"http://127.0.0.1:8080",
"http://127.0.0.1:3000",
"http://127.0.0.1:5000"
];
if (!origin || allowed.includes(origin)) return cb(null, true);
return cb(new Error("Not allowed by CORS"));
},
credentials: true,
methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));


// --- Middlewares ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(path.join(process.cwd(), "public")));


// Response helpers
app.use((req, res, next) => {
res.apiSuccess = (data = {}, message = "Success", statusCode = 200) =>
res.status(statusCode).json({ success: true, message, data });
res.apiError = (message = "Internal Server Error", statusCode = 500) =>
res.status(statusCode).json({ success: false, message });
next();
});

app.use((req, res, next) => {
  res.apiSuccess = (data = {}, message = "Success", statusCode = 200) =>
    res.status(statusCode).json({ success: true, message, data });
  res.apiError = (message = "Internal Server Error", statusCode = 500) =>
    res.status(statusCode).json({ success: false, message });
  next();
});
// --- Redis (chat + agent only) ---
const isRedisTls = String(process.env.REDIS_TLS).toLowerCase() === "true";
const redisClient = createClient({
url: process.env.REDIS_URL || "redis://localhost:6379",
socket: {
tls: isRedisTls,
connectTimeout: 15000,
reconnectStrategy: (retries) => (retries > 10 ? new Error("Redis retries exceeded") : Math.min(retries * 250, 5000))
}
});
redisClient.on("error", (e) => console.error("Redis error:", e.message));
redisClient.on("connect", () => console.log("✅ Redis connected"));
await redisClient.connect();

app.set("redis", redisClient)


// Session store in Redis
const sessionStore = new RedisStore({ client: redisClient, prefix: "sess:", ttl: 86400, disableTouch: true });
app.use(
session({
store: sessionStore,
secret: process.env.SESSION_SECRET || "supersecret",
resave: false,
saveUninitialized: false,
rolling: true,
name: "connect.sid",
cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 24 * 60 * 60 * 1000 }
})
);



// Expose redis to routers
app.set("redis", redisClient);


// --- Couchbase (users only) ---
await connectCouchbase();


// --- Health ---
app.get("/ping", (req, res) => res.json({ message: "pong" }));


// --- Routers ---
app.use("/api", authRouter); // /api/signup, /api/login, /api/logout, /api/user
app.use("/api/user", preferencesRouter); // /api/user/preferences
app.use("/api/chat", chatRouter); // /api/chat, /api/chat/history
app.use("/api/agents", agentRouter); // /api/agents/:agent/:tool, /api/agents/history


// --- Error fallback ---
app.use((err, req, res, next) => {
console.error("Unhandled error:", err);
return res.apiError(err.message || "Unhandled error");
});


app.listen(PORT, () => {
console.log(`🌟 Server running at http://localhost:${PORT}`);
});