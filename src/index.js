import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { createClient } from "redis";
import RedisStore from 'connect-redis';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { connectCouchbase } from "./db.js";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const app = express();
const PORT = process.env.PORT || 5000;
const SESSION_KEY = "chat_session";
const MODEL = "gemini-1.5-flash";
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5000',
      'http://localhost:8080'
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(process.cwd(), 'public')));

// Response formatter middleware
app.use((req, res, next) => {
  res.apiSuccess = (data = {}, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  };

  res.apiError = (message = 'Internal Server Error', statusCode = 500) => {
    return res.status(statusCode).json({
      success: false,
      message
    });
  };

  next();
});

let redisClient;
let collection;

const startServer = async () => {
  try {
    console.log("🚀 Starting server...");

    // Redis setup
    // Create Redis client without connecting yet
    const isRedisTls = process.env.REDIS_TLS === 'true';
    redisClient = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      socket: {
        tls: isRedisTls,
        connectTimeout: 15000,
        reconnectStrategy: (retries) => {
          if (retries > 5) {
            console.error("Too many Redis retries. Exiting...");
            process.exit(1);
          }
          return Math.min(retries * 100, 5000);
        },
      },
    });

    // Handle Redis client events
    redisClient.on("error", (err) => console.error("Redis Client Error:", err));
    redisClient.on("connect", () => console.log("✅ Redis connected"));

    // Connect to Redis
    await redisClient.connect();

    // Initialize Redis store with the connected client
    const sessionStore = new RedisStore({
      client: redisClient,
      prefix: "sess:",
      ttl: 86400,
      disableTouch: true
    });
    
    // Session configuration
    app.use(session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || "supersecret",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      name: 'connect.sid',
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000
      }
    }));

    // Couchbase
    console.log("🔌 Connecting to Couchbase...");
    collection = await connectCouchbase();
    console.log("✅ Couchbase connected");

    // Routes
    defineRoutes();

    app.listen(PORT, () => {
      console.log(`🌟 Server running at http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
};

const defineRoutes = () => {
  const isAuthenticated = (req, res, next) => {
    if (req.session?.user) return next();
    return res.status(401).json({ error: "Unauthorized" });
  };

  app.get("/ping", (req, res) => res.json({ message: "pong" }));

  // Check authentication status
  app.get("/api/check-auth", (req, res) => {
    if (req.session?.user) {
      return res.apiSuccess({ user: req.session.user }, 'User is authenticated');
    }
    return res.apiError('Not authenticated', 401);
  });

  // User registration
  app.post("/api/signup", async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.apiError('Username, email and password are required', 400);
    }

    try {
      try {
        await collection.get(`user::${username}`);
        return res.apiError('Username already exists', 409);
      } catch (err) {
        if (!err.message.includes('document not found')) {
          throw err;
        }
      }

      const hash = await bcrypt.hash(password, 10);
      const userDoc = {
        type: "user",
        username,
        email,
        passwordHash: hash,
        preferences: { theme: 'light' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await collection.insert(`user::${username}`, userDoc);
      req.session.user = { username, email };
      
      return res.apiSuccess(
        { username, email, preferences: { theme: 'light' } },
        'Registration successful',
        201
      );

    } catch (error) {
      console.error('Signup error:', error);
      return res.apiError('Registration failed');
    }
  });

  // User login
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.apiError('Username and password are required', 400);
    }

    try {
      const result = await collection.get(`user::${username}`);
      const user = result.content;

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.apiError('Invalid username or password', 401);
      }

      req.session.user = { username: user.username, email: user.email };

      return res.apiSuccess({
        user: { 
          username: user.username, 
          email: user.email,
          preferences: user.preferences || { theme: 'light' }
        }
      }, 'Login successful');

    } catch (error) {
      if (error.message.includes('document not found')) {
        return res.apiError('Invalid username or password', 401);
      }
      console.error('Login error:', error);
      return res.apiError('Login failed');
    }
  });

  // User logout
  app.post("/api/logout", async (req, res) => {
    try {
      const username = req.session?.user?.username;
      
      if (username) {
        const chatKey = `${SESSION_KEY}:${username}`;
        try {
          await redisClient.del(chatKey);
        } catch (redisError) {
          console.error('Error clearing chat history:', redisError);
        }
      }

      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
          return res.apiError('Logout failed');
        }

        res.clearCookie("connect.sid");
        return res.apiSuccess(null, 'Logout successful');
      });

    } catch (error) {
      console.error('Logout error:', error);
      return res.apiError('Logout failed');
    }
  });

  // Enhanced chat endpoint for developer technologies
  app.post("/api/chat", isAuthenticated, async (req, res) => {
    const { message, context = "general" } = req.body;
    if (!message) return res.apiError("Message required", 400);

    const chatKey = `${SESSION_KEY}:${req.session.user.username}`;
    try {
      let historyData = await redisClient.get(chatKey);
      let history = historyData ? JSON.parse(historyData) : [];

      const systemPrompt = `You are a specialized ChatGPT clone designed to help developers learn and grow their concepts and ideas in technology. 
      Focus on providing detailed explanations about:
      - Programming languages and frameworks (JavaScript, Python, React, Node.js, etc.)
      - Software architecture and design patterns
      - Development tools and best practices
      - Technology trends and innovations
      - Code examples and practical implementations
      - Database technologies and data management
      - Cloud services and DevOps practices
      - Mobile and web development
      - AI/ML technologies and integration
      
      Context: ${context}
      Provide clear, actionable advice with examples when possible. Be concise but comprehensive.`;

      const model = genAI.getGenerativeModel({ 
        model: MODEL,
        systemInstruction: systemPrompt
      });
      
      const chat = model.startChat({
        history: history.map(h => ({ role: h.role, parts: h.parts })),
        generationConfig: { 
          maxOutputTokens: 800,
          temperature: 0.7
        },
      });

      const result = await chat.sendMessage(message);
      const reply = await result.response.text();

      const userMessage = {
        role: "user",
        parts: [{ text: message }],
        timestamp: new Date().toISOString(),
        context,
        id: Date.now() + Math.random()
      };
      
      const modelMessage = {
        role: "model",
        parts: [{ text: reply }],
        timestamp: new Date().toISOString(),
        context,
        id: Date.now() + Math.random() + 1
      };

      history.push(userMessage, modelMessage);

      if (history.length > 100) {
        history = history.slice(-100);
      }

      await redisClient.set(chatKey, JSON.stringify(history));
      res.apiSuccess({ reply, context }, "Chat response generated");
    } catch (err) {
      console.error("Chat API error:", err);
      res.apiError("Chat failed", 500);
    }
  });

  // Get chat history
  app.get("/api/chat/history", isAuthenticated, async (req, res) => {
    const chatKey = `${SESSION_KEY}:${req.session.user.username}`;
    console.log("Chat key:", chatKey);
    try {
      const historyData = await redisClient.get(chatKey);
      const history = historyData ? JSON.parse(historyData) : [];
      res.apiSuccess({ history }, "Chat history retrieved");
    } catch (error) {
      console.error("Get history error:", error);
      res.apiError("Failed to fetch history", 500);
    }
  });

  // Search chat history
  app.get("/api/chat/search", isAuthenticated, async (req, res) => {
    const { query } = req.query;
    if (!query) return res.apiError("Search query required", 400);
    
    const chatKey = `${SESSION_KEY}:${req.session.user.username}`;
    try {
      const historyData = await redisClient.get(chatKey);
      const history = historyData ? JSON.parse(historyData) : [];
      
      const searchResults = history.filter(msg => 
        msg.parts[0].text.toLowerCase().includes(query.toLowerCase())
      );
      
      res.apiSuccess({ results: searchResults }, `Found ${searchResults.length} results`);
    } catch (error) {
      console.error("Search history error:", error);
      res.apiError("Search failed", 500);
    }
  });

  // Delete chat history
  app.delete("/api/chat/history", isAuthenticated, async (req, res) => {
    const chatKey = `${SESSION_KEY}:${req.session.user.username}`;
    try {
      await redisClient.del(chatKey);
      res.apiSuccess(null, "Chat history deleted");
    } catch (error) {
      console.error("Delete history error:", error);
      res.apiError("Failed to delete history", 500);
    }
  });

  // New chat (clear current session)
  app.post("/api/chat/new", isAuthenticated, async (req, res) => {
    const chatKey = `${SESSION_KEY}:${req.session.user.username}`;
    try {
      await redisClient.del(chatKey);
      res.apiSuccess(null, "New chat started");
    } catch (error) {
      console.error("New chat error:", error);
      res.apiError("Failed to start new chat", 500);
    }
  });

  // Save user preferences (theme toggle)
  app.put("/api/user/preferences", isAuthenticated, async (req, res) => {
    const { theme } = req.body;
    const username = req.session.user.username;
    
    if (!theme || !['light', 'dark'].includes(theme)) {
      return res.apiError("Valid theme (light/dark) required", 400);
    }
    
    try {
      const userDoc = await collection.get(`user::${username}`);
      const userData = userDoc.content;
      
      userData.preferences = { 
        ...userData.preferences,
        theme, 
        updatedAt: new Date().toISOString() 
      };
      userData.updatedAt = new Date().toISOString();
      
      await collection.replace(`user::${username}`, userData);
      res.apiSuccess(
        { preferences: userData.preferences }, 
        "Preferences updated"
      );
    } catch (error) {
      console.error("Update preferences error:", error);
      res.apiError("Failed to update preferences", 500);
    }
  });

  // Get user preferences
  app.get("/api/user/preferences", isAuthenticated, async (req, res) => {
    const username = req.session.user.username;
    
    try {
      const userDoc = await collection.get(`user::${username}`);
      const userData = userDoc.content;
      
      res.apiSuccess({ 
        preferences: userData.preferences || { theme: 'light' }
      }, "Preferences retrieved");
    } catch (error) {
      console.error("Get preferences error:", error);
      res.apiError("Failed to fetch preferences", 500);
    }
  });

  // Get technology categories for specialized help
  app.get("/api/technologies", (req, res) => {
    const categories = {
      "frontend": {
        name: "Frontend Development",
        technologies: ["React", "Vue.js", "Angular", "JavaScript", "TypeScript", "CSS", "HTML", "Svelte", "Next.js", "Nuxt.js"]
      },
      "backend": {
        name: "Backend Development", 
        technologies: ["Node.js", "Python", "Java", "Go", "Rust", "PHP", "C#", "Ruby", "Express.js", "FastAPI"]
      },
      "databases": {
        name: "Databases",
        technologies: ["MongoDB", "PostgreSQL", "MySQL", "Redis", "Couchbase", "Elasticsearch", "SQLite", "Cassandra"]
      },
      "devops": {
        name: "DevOps & Cloud",
        technologies: ["Docker", "Kubernetes", "AWS", "Azure", "GCP", "CI/CD", "Terraform", "Jenkins", "GitHub Actions"]
      },
      "mobile": {
        name: "Mobile Development",
        technologies: ["React Native", "Flutter", "Swift", "Kotlin", "Xamarin", "Ionic", "Cordova"]
      },
      "ai_ml": {
        name: "AI & Machine Learning",
        technologies: ["TensorFlow", "PyTorch", "Scikit-learn", "OpenAI", "Hugging Face", "LangChain", "Pandas", "NumPy"]
      },
      "tools": {
        name: "Development Tools",
        technologies: ["Git", "VS Code", "IntelliJ", "Postman", "Figma", "Jira", "Slack", "Notion", "Docker Desktop"]
      }
    };
    
    res.apiSuccess({ categories }, "Technology categories retrieved");
  });

  // Get user info
  app.get("/api/user", isAuthenticated, async (req, res) => {
    try {
      const userDoc = await collection.get(`user::${req.session.user.username}`);
      const userData = userDoc.content;
      res.apiSuccess({
        username: userData.username,
        email: userData.email,
        createdAt: userData.createdAt,
        preferences: userData.preferences || { theme: 'light' }
      }, "User info retrieved");
    } catch (error) {
      console.error("Fetch user error:", error);
      res.apiError("Failed to fetch user", 500);
    }
  });
};

startServer();


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

// async function main() {
//   try {
//     const redis = createClient({
//       url: "redis://default:ut1TiasmsmsIqs4wxe11ja4hEMebaCK8@redis-14028.c10.us-east-1-2.ec2.redns.redis-cloud.com:14028"
//     });

//     redis.on("error", (err) => console.error("Redis Error:", err));
//     await redis.connect();

//     const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

//     // Load history from Redis
//     let historyData = await redis.get(SESSION_KEY);
//     let history = historyData ? JSON.parse(historyData) : [];

//     console.log("Loaded history:", history);

//     const chat = model.startChat({
//       history,
//       generationConfig: { maxOutputTokens: 200 },
//     });

//     const rl = readline.createInterface({
//       input: process.stdin,
//       output: process.stdout,
//     });

//     console.log("🤖 AI Chatbot started. Type 'exit' to quit.\n");

//     const ask = () => {
//       rl.question("You: ", async (message) => {
//         if (message.toLowerCase() === "exit") {
//           console.log("👋 Goodbye!");
//           rl.close();
//           await redis.quit();
//           return;
//         }

//         try {
//           // 1️⃣ Add user message to history
//           // history.push({ role: "user", parts: [{ text: message }] });

//           // 2️⃣ Send message
//           const result = await chat.sendMessage(message);
//           const reply = result.response.text();

//           // 3️⃣ Add AI response to history
//           //history.push({ role: "model", parts: [{ text: reply }] });

//           console.log("AI:", reply, "\n");

//           // 4️⃣ Save updated history back into Redis
//           await redis.set(SESSION_KEY, JSON.stringify(history));
//         } catch (err) {
//           console.error("Error:", err);
//         }

//         ask();
//       });
//     };

//     ask();
//   } catch (error) {
//     console.error("Error:", error);
//   }
// }

// main();