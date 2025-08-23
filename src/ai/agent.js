
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

// Reuse existing env vars
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

/**
 * Helper to build a consistent senior persona prompt for each agent family
 */
const persona = {
  tester: `You are a senior software test engineer. You think in terms of risk, coverage, edge cases, automation strategy, and reproducibility. You write crisp, unambiguous steps, include clear pass/fail criteria, and annotate with priorities and tags. Prefer table or JSON outputs that tools can consume. Keep answers actionable and concise.`,
  developer: `You are a senior software engineer. You reason about readability, correctness, performance, security, DX, scalability, and maintainability. You provide diffs or patches when possible, point out smells, and suggest pragmatic improvements with rationale. Prefer JSON structures that tools can consume.`,
};

/** Input & output schemas per tool (consumed by Gemini via responseSchema) */
// ================= SCHEMAS =================

// TestCase schema
const TestCase = {
    type: "object",
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
      tags: { type: "array", items: { type: "string" } },
      steps: { type: "array", items: { type: "string" } },
      expected: { type: "string" },
    },
    required: ["id", "title", "priority", "steps", "expected"],
  };
  
  // TestSuite schema
  const TestSuite = {
    type: "object",
    properties: {
      feature: { type: "string" },
      scope: { type: "string" },
      risk_notes: { type: "string" },
      cases: { type: "array", items: TestCase },
    },
    required: ["feature", "cases"],
  };
  
  // TestScript schema
  const TestScript = {
    type: "object",
    properties: {
      title: { type: "string" },
      setup: { type: "string" },
      actions: { type: "array", items: { type: "string" } },
      expected: { type: "string" },
    },
    required: ["title", "actions", "expected"],
  };
  
  // BugRepro schema
  const BugRepro = {
    type: "object",
    properties: {
      bug: { type: "string" },
      environment: { type: "string" },
      repro_steps: { type: "array", items: { type: "string" } },
      expected: { type: "string" },
      actual: { type: "string" },
      notes: { type: "string" },
    },
    required: ["bug", "repro_steps", "expected", "actual"],
  };
  
  // LogAnalysis schema
  const LogAnalysis = {
    type: "object",
    properties: {
      issue: { type: "string" },
      suspected_causes: { type: "array", items: { type: "string" } },
      anomalies: { type: "array", items: { type: "string" } },
      recommended_fixes: { type: "array", items: { type: "string" } },
    },
    required: ["issue", "suspected_causes"],
  };
  
  // APITestPlan schema
  const APITestPlan = {
    type: "object",
    properties: {
      endpoint: { type: "string" },
      methods: { type: "array", items: { type: "string" } },
      positive: { type: "array", items: { type: "string" } },
      negative: { type: "array", items: { type: "string" } },
      edge: { type: "array", items: { type: "string" } },
    },
    required: ["endpoint", "methods"],
  };
  
  // TestOptimization schema
  const TestOptimization = {
    type: "object",
    properties: {
      redundant: { type: "array", items: { type: "string" } },
      missing: { type: "array", items: { type: "string" } },
      risky_areas: { type: "array", items: { type: "string" } },
      recommended_additions: { type: "array", items: { type: "string" } },
    },
  };
  
  // CodeReview schema
  const CodeReview = {
    type: "object",
    properties: {
      summary: { type: "string" },
      positives: { type: "array", items: { type: "string" } },
      issues: { type: "array", items: { type: "string" } },
      suggestions: { type: "array", items: { type: "string" } },
      security_notes: { type: "array", items: { type: "string" } },
    },
  };
  
  // UnitTests schema
  const UnitTests = {
    type: "object",
    properties: {
      function: { type: "string" },
      language: { type: "string" },
      framework: { type: "string" },
      tests: { type: "array", items: { type: "string" } },
    },
    required: ["function", "language", "tests"],
  };
  
  // BugFix schema
  const BugFix = {
    type: "object",
    properties: {
      bug: { type: "string" },
      root_cause: { type: "string" },
      patch: { type: "string" },
      test_cases: { type: "array", items: { type: "string" } },
    },
    required: ["bug", "root_cause", "patch"],
  };
  
  // RefactorPlan schema
  const RefactorPlan = {
    type: "object",
    properties: {
      scope: { type: "string" },
      motivations: { type: "array", items: { type: "string" } },
      steps: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
    },
    required: ["scope", "steps"],
  };
  
  // DesignDoc schema
  const DesignDoc = {
    type: "object",
    properties: {
      title: { type: "string" },
      problem: { type: "string" },
      goals: { type: "array", items: { type: "string" } },
      non_goals: { type: "array", items: { type: "string" } },
      approach: { type: "string" },
      tradeoffs: { type: "string" },
      diagrams: { type: "array", items: { type: "string" } },
    },
    required: ["title", "problem", "approach"],
  };
  
  // StackAdvice schema
  const StackAdvice = {
    type: "object",
    properties: {
      current_stack: { type: "array", items: { type: "string" } },
      requirements: { type: "array", items: { type: "string" } },
      pain_points: { type: "array", items: { type: "string" } },
      recommendations: { type: "array", items: { type: "string" } },
    },
  };
  
  // Docs schema
  const Docs = {
    type: "object",
    properties: {
      component: { type: "string" },
      usage: { type: "string" },
      examples: { type: "array", items: { type: "string" } },
      faq: { type: "array", items: { type: "string" } },
      references: { type: "array", items: { type: "string" } },
    },
    required: ["component", "usage"],
  };
  
  // ================= EXPORT ALL =================
  export const schemas = {
    TestCase,
    TestSuite,
    TestScript,
    BugRepro,
    LogAnalysis,
    APITestPlan,
    TestOptimization,
    CodeReview,
    UnitTests,
    BugFix,
    RefactorPlan,
    DesignDoc,
    StackAdvice,
    Docs,
  };

/** Agent registry describing tools and their prompts */
export const AGENTS = {
  tester: {
    persona: persona.tester,
    tools: {
      test_case_generator: {
        description: "Generate a test suite (happy + edge + negative) for a feature.",
        inputHints: ["feature", "requirements[]", "platform", "data_samples[]"],
        responseSchema: schemas.TestSuite,
        prompt: ({ feature, requirements = [], platform, data_samples = [] }) => `Feature: ${feature}\nPlatform: ${platform || "unspecified"}\nRequirements: ${requirements.join("; ")}\nSample Data: ${data_samples.join("; ")}\n\nGenerate a comprehensive test suite with priorities (P0-P3), tags, clear steps, and acceptance criteria. Include negative cases and boundary values. Output JSON only.`,
      },
      test_script_generator: {
        description: "Produce ready-to-run automation test scripts (Playwright, Cypress, PyTest, etc.)",
        inputHints: ["framework", "language", "cases[]", "base_url"],
        responseSchema: schemas.TestScript,
        prompt: ({ framework = "Playwright", language = "TypeScript", cases = [], base_url }) => `Framework: ${framework}\nLanguage: ${language}\nBase URL: ${base_url || ""}\nTest Cases: ${JSON.stringify(cases)}\nCreate page objects if helpful. Provide runnable files, minimal setup steps, and a single command to run. Output JSON only with files[].content containing code.`,
      },
      bug_reproduction_agent: {
        description: "Turn fuzzy bug reports into precise, minimal repro steps and env matrix.",
        inputHints: ["bug_report_text", "logs(optional)", "env"],
        responseSchema: schemas.BugRepro,
        prompt: ({ bug_report_text, logs = "", env = "" }) => `Bug Report:\n${bug_report_text}\nEnv:\n${env}\nLogs:\n${logs}\n\nProduce a minimal reproducible example with exact steps, observed vs expected, suspected causes, and additional logs to capture. Output JSON only.`,
      },
      log_analyzer_agent: {
        description: "Summarize errors from text logs and suggest next steps and metrics.",
        inputHints: ["logs_text", "service_name", "time_window"],
        responseSchema: schemas.LogAnalysis,
        prompt: ({ logs_text, service_name = "service", time_window = "" }) => `Analyze logs for ${service_name} ${time_window}. Cluster similar errors, infer root causes, and propose next debugging steps and useful metrics. Logs:\n\n${logs_text}\n\nOutput JSON only.`,
      },
      api_testing_agent: {
        description: "Generate API test plan with positive/negative cases and runner snippet.",
        inputHints: ["base_url", "openapi(optional)", "endpoints[]"],
        responseSchema: schemas.APITestPlan,
        prompt: ({ base_url = "", openapi = "", endpoints = [] }) => `Base URL: ${base_url}\nOpenAPI (optional): ${openapi}\nEndpoints (optional): ${JSON.stringify(endpoints)}\nCreate an API test plan with schema/perf assertions and a runner snippet (for Postman/Newman or k6). Output JSON only.`,
      },
      test_optimizer: {
        description: "De-duplicate tests, fill risk gaps, and suggest execution order & CI hints.",
        inputHints: ["existing_cases[]", "failure_history[]", "flaky[]"],
        responseSchema: schemas.TestOptimization,
        prompt: ({ existing_cases = [], failure_history = [], flaky = [] }) => `Optimize the following test list. Mark duplicates, identify risk gaps, highlight high-value tests, suggest an execution order balancing risk and time, and give CI caching hints.\nExisting: ${JSON.stringify(existing_cases)}\nFailures: ${JSON.stringify(failure_history)}\nFlaky: ${JSON.stringify(flaky)}\nOutput JSON only.`,
      },
    },
  },
  developer: {
    persona: persona.developer,
    tools: {
      code_review_agent: {
        description: "Static review for style, correctness, security, and performance. Emit suggestions and patch.",
        inputHints: ["diff|files[]", "language", "framework"],
        responseSchema: schemas.CodeReview,
        prompt: ({ diff = "", files = [], language = "", framework = "" }) => `Language: ${language}\nFramework: ${framework}\nDiff: ${diff}\nFiles: ${JSON.stringify(files)}\nPerform a senior-level review. Return a concise summary, categorized findings, and unified diff patch if relevant. Output JSON only.`,
      },
      unit_test_generator_agent: {
        description: "Create unit tests aiming for critical-path coverage with clear arrangement/act/assert.",
        inputHints: ["source_code", "language", "framework"],
        responseSchema: schemas.UnitTests,
        prompt: ({ source_code, language = "TypeScript", framework = "Jest" }) => `Generate unit tests for the following code. Cover edge cases and error paths. Return runnable files and a single test command.\nLanguage: ${language}\nFramework: ${framework}\n\nCODE:\n${source_code}\n\nOutput JSON only.`,
      },
      bug_fix_agent: {
        description: "Diagnose and propose a safe fix with a patch and regression tests.",
        inputHints: ["bug_context", "code_fragment"],
        responseSchema: schemas.BugFix,
        prompt: ({ bug_context = "", code_fragment = "" }) => `Context: ${bug_context}\nCode:\n${code_fragment}\n\nProvide diagnosis, a safe minimal patch, and list regression tests. Output JSON only.`,
      },
      refactoring_agent: {
        description: "Refactor for readability, maintainability, and performance, with rationale.",
        inputHints: ["code_fragment", "goals[]"],
        responseSchema: schemas.RefactorPlan,
        prompt: ({ code_fragment = "", goals = [] }) => `Goals: ${goals.join(", ")}\nRefactor the following code. Provide steps, a patch, and tradeoffs. Output JSON only.\n\nCODE:\n${code_fragment}`,
      },
      design_agent: {
        description: "High-level design doc with architecture, API specs, and risks.",
        inputHints: ["problem", "constraints[]", "scale"],
        responseSchema: schemas.DesignDoc,
        prompt: ({ problem, constraints = [], scale = "" }) => `Problem: ${problem}\nConstraints: ${constraints.join(", ")}\nScale: ${scale}\nProduce a design one-pager with architecture, APIs, risks, and alternatives. Output JSON only.`,
      },
      stack_agent: {
        description: "Recommend a pragmatic stack with rationale and migration notes.",
        inputHints: ["use_case", "team_skill", "constraints"],
        responseSchema: schemas.StackAdvice,
        prompt: ({ use_case, team_skill = "", constraints = "" }) => `Use-case: ${use_case}\nTeam skill: ${team_skill}\nConstraints: ${constraints}\nRecommend a stack with rationale and migration notes. Output JSON only.`,
      },
      documentation_agent: {
        description: "Produce developer-facing documentation in Markdown sections with a ToC.",
        inputHints: ["topic", "audience", "code_samples[]"],
        responseSchema: schemas.Docs,
        prompt: ({ topic, audience = "Developers", code_samples = [] }) => `Topic: ${topic}\nAudience: ${audience}\nCode Samples: ${JSON.stringify(code_samples)}\nGenerate structured docs with sections (title + body_md) and a ToC. Output JSON only.`,
      },
    },
  },
};

/**
 * Run a specific tool from an agent with Gemini and return parsed JSON
 */
function safeParseJSON(raw) {
    let cleaned = raw
      .replace(/^```(json)?/g, "")
      .replace(/```$/g, "")
      .trim();
  
    if (!cleaned) throw new Error("Empty JSON string");
  
    try {
      return JSON.parse(cleaned);
    } catch (err) {
      // Attempt salvage if the JSON is an object with "cases"
      if (cleaned.includes('"cases"')) {
        try {
          // Grab everything up to the last complete object
          const match = cleaned.match(/"cases"\s*:\s*\[(.*)\]/s);
          if (match) {
            let inner = match[1].trim();
  
            // Remove the last broken test case (if any)
            const lastComma = inner.lastIndexOf("},");
            if (lastComma !== -1) {
              inner = inner.slice(0, lastComma + 1);
            } else {
              // If no comma, just drop last }
              inner = inner.replace(/},?\s*$/, "");
            }
  
            const repaired = `{"cases":[${inner}]}`;
            return JSON.parse(repaired);
          }
        } catch (repairErr) {
          console.error("❌ JSON salvage failed:", repairErr);
        }
      }
  
      console.error("❌ Could not parse JSON:", cleaned);
      throw new Error("Model returned invalid JSON");
    }
  }
  
  export async function runAgentTool({ agentKey, toolKey, input }) {
    const agent = AGENTS[agentKey];
    if (!agent) throw new Error(`Unknown agent: ${agentKey}`);
    const tool = agent.tools[toolKey];
    if (!tool) throw new Error(`Unknown tool: ${toolKey}`);
  
    const systemInstruction = `${agent.persona}`;
    const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction });
  
    const responseSchema = JSON.parse(JSON.stringify(tool.responseSchema));
    if (responseSchema.definitions) {
      for (const [k, v] of Object.entries(responseSchema.definitions)) {
        if (v === null && schemas[k]) responseSchema.definitions[k] = schemas[k];
      }
    }
  
    const prompt = tool.prompt(input || {});
  
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
        responseSchema,
      },
    });
  
    let text = "";
    try {
      text = result.response.text()?.trim();
    } catch {
      throw new Error("Model did not return a valid response");
    }
  
    // console.log("🔎 Raw model output:", text);
  
    return safeParseJSON(text);
  }
    
  

// =============================

// That's it. Your new endpoints:
//   GET    /api/agents                -> list agents & tools
//   POST   /api/agents/:agent/:tool   -> run a tool with JSON body input
//   GET    /api/agents/history        -> your last 50 agent runs

// Example requests (Tester):
//   POST /api/agents/tester/test_case_generator
//   { "feature": "User Login", "requirements": ["email+password", "lockout after 5 attempts"], "platform": "web" }
//   POST /api/agents/tester/test_script_generator
//   { "framework": "Playwright", "language": "TypeScript", "cases": [ {"summary":"Login success", "steps":["open /login", "enter valid creds", "click login", "assert dashboard"] } ], "base_url": "http://localhost:3000" }

// Example requests (Developer):
//   POST /api/agents/developer/code_review_agent
//   { "language":"TypeScript", "diff":"diff --git a/x.ts b/x.ts ..." }
//   POST /api/agents/developer/unit_test_generator_agent
//   { "language":"TypeScript", "framework":"Jest", "source_code":"export function add(a,b){return a+b}" }
