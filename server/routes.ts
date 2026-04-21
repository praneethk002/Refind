import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { parseJdSchema, searchContactsSchema, type ParsedJd, type ContactResult } from "@shared/schema";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const APIFY_API_KEY = process.env.APIFY_API_KEY;
const APIFY_ACTOR = "aeonkosmos~linkedin-employee-search";

// ─── Stage 1: Cheap regex/keyword extraction ──────────────────────────────────

const SENIORITY_MAP: Record<string, string[]> = {
  "Analyst":   ["analyst", "junior", "graduate", "entry"],
  "Associate": ["associate", "avp", "senior analyst"],
  "VP":        ["vice president", "vp", " vp "],
  "Director":  ["director", "executive director", "ed"],
  "MD":        ["managing director", "md", "partner", "head of"],
};

const DEPT_KEYWORDS: Record<string, string[]> = {
  "Credit Risk":           ["credit risk", "credit analysis", "counterparty", "credit underwriting"],
  "Investment Banking":    ["investment banking", "m&a", "mergers", "dcm", "ecm", "advisory"],
  "Fixed Income":          ["fixed income", "rates", "bond", "credit trading", "structured products"],
  "Quantitative Research": ["quant", "quantitative research", "strats", "strategies"],
  "Equity Research":       ["equity research", "equities", "stock"],
  "Risk Management":       ["risk management", "market risk", "operational risk"],
  "Asset Management":      ["asset management", "portfolio management", "fund"],
  "Data Science":          ["data science", "machine learning", "analytics"],
  "Technology":            ["software engineer", "developer", "engineering", "tech"],
  "Compliance":            ["compliance", "regulatory", "legal"],
};

function extractSeniority(text: string): string {
  const lower = text.toLowerCase();
  for (const [level, keywords] of Object.entries(SENIORITY_MAP)) {
    if (keywords.some((k) => lower.includes(k))) return level;
  }
  return "Analyst";
}

function extractDepartment(text: string): string {
  const lower = text.toLowerCase();
  for (const [dept, keywords] of Object.entries(DEPT_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return dept;
  }
  return "Finance";
}

function extractCompanyAndTitle(text: string): { company: string; jobTitle: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // First non-empty line is usually the title, second has company
  const titleLine = lines[0] ?? "";
  const companyLine = lines[1] ?? "";

  // Strip pipe/dash separators: "Credit Risk Analyst | Goldman Sachs | London"
  const titleParts = titleLine.split(/[|–—-]/);
  const jobTitle = titleParts[0].trim();

  // Company is often in second part of title line or second line
  let company = "";
  if (titleParts.length > 1) {
    company = titleParts[1].trim();
  } else {
    // Try second line, strip location suffixes
    company = companyLine.replace(/\|.*$/, "").replace(/,.*$/, "").trim();
  }

  return { jobTitle, company };
}

// ─── Stage 2: Small LLM call — only team name + tier search phrases ───────────

async function extractTeamAndQueries(
  jobTitle: string,
  company: string,
  department: string,
  seniority: string,
  responsibilitiesSnippet: string
): Promise<{ team: string; tier1Titles: string[]; tier2Titles: string[]; tier3Titles: string[] }> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",  // Cheapest model — structured extraction only
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `Extract the specific team/desk name and generate title filters for LinkedIn search.

Job: ${jobTitle} at ${company}
Department: ${department}
Seniority: ${seniority}
Responsibilities snippet: "${responsibilitiesSnippet.slice(0, 300)}"

Return ONLY valid JSON:
{
  "team": "specific desk/team name (e.g. 'Structured Finance', 'DCM', 'Leveraged Buyouts')",
  "tier1Titles": ["exact title filter for same role, e.g. 'Credit Risk Analyst'"],
  "tier2Titles": ["2-3 title filters for different roles on same team, e.g. 'Associate', 'Quantitative Analyst', 'VP'"],
  "tier3Titles": ["2-3 title filters for adjacent teams, e.g. 'Leveraged Finance', 'Credit Analyst']
}`
    }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Failed to extract team info");
  return JSON.parse(match[0]);
}

// ─── Stage 3: Apify LinkedIn search ──────────────────────────────────────────

interface ApifyResult {
  url?: string;
  name?: string;
  headline?: string;
  photoUrl?: string;
  firstName?: string;
  lastName?: string;
}

async function searchLinkedIn(
  company: string,
  titleFilter: string,
  maxResults: number = 5
): Promise<ApifyResult[]> {
  if (!APIFY_API_KEY) {
    throw new Error("APIFY_API_KEY not set in environment");
  }

  const runUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`;

  const response = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: company,
      title: titleFilter,
      employeeMaxResults: maxResults,
      employeePattern: "1",  // Strictest match
      loadAll: false,
    }),
    // Apify sync runs can take up to 2 mins
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Apify error ${response.status}: ${err}`);
  }

  const data = await response.json() as ApifyResult[];
  return data.filter((r) => r.url && r.name); // Only valid results
}

// ─── Stage 4: LLM tiers + outreach for REAL contacts ─────────────────────────

async function tierAndDraftOutreach(
  contacts: Array<{ name: string; headline: string; url: string; tier: number }>,
  jobTitle: string,
  company: string,
  team: string
): Promise<ContactResult[]> {
  if (contacts.length === 0) return [];

  const contactList = contacts.map((c, i) =>
    `${i + 1}. Name: ${c.name} | Headline: ${c.headline} | Tier: ${c.tier}`
  ).join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `You're helping an LBS MAM student (graduating July 2026) who has credit risk / fintech experience (Olyv, data science, Python/SQL) reach out for a referral for this role:

Role: ${jobTitle} at ${company}, team: ${team}

For each contact below, write a short personalised LinkedIn message (3 sentences max):
1. Reference their specific role
2. Mention the applicant's LBS MAM + credit risk background  
3. Make a specific, non-generic ask (e.g. "happy to share my CV" or "15-min call")

Contacts:
${contactList}

Return ONLY a JSON array (same order):
[
  {
    "tierReason": "one-line reason why this tier",
    "outreachDraft": "Hi [Name], ..."
  }
]`
    }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Failed to generate outreach");
  const drafts = JSON.parse(match[0]) as Array<{ tierReason: string; outreachDraft: string }>;

  return contacts.map((c, i) => {
    const draft = drafts[i] ?? { tierReason: "LinkedIn match", outreachDraft: `Hi ${c.name}, ...` };
    const headlineParts = c.headline.split(" at ");
    return {
      name: c.name,
      title: headlineParts[0] ?? c.headline,
      company: headlineParts[1] ?? company,
      department: team,
      linkedinUrl: c.url,
      email: undefined,
      tier: c.tier as 1 | 2 | 3,
      tierReason: draft.tierReason,
      outreachDraft: draft.outreachDraft,
      source: "linkedin",
      tenureYears: undefined,
      location: undefined,
    };
  });
}

// ─── Main parse function ──────────────────────────────────────────────────────

async function parseJobDescription(jdText: string): Promise<ParsedJd> {
  // Stage 1: free regex extraction
  const { jobTitle, company } = extractCompanyAndTitle(jdText);
  const seniority = extractSeniority(jdText);
  const department = extractDepartment(jdText);

  // Extract responsibilities snippet (lines after "responsib" keyword)
  const lines = jdText.split("\n");
  const respIdx = lines.findIndex((l) => /responsib|duties|you will/i.test(l));
  const responsibilitiesSnippet = lines.slice(respIdx, respIdx + 6).join(" ");

  // Stage 2: small Haiku call just for team + search titles
  const { team, tier1Titles, tier2Titles, tier3Titles } = await extractTeamAndQueries(
    jobTitle, company, department, seniority, responsibilitiesSnippet
  );

  return {
    jobTitle,
    company,
    team,
    department,
    seniority,
    keySkills: [],
    teamDescription: `${team} at ${company}`,
    searchQueries: {
      tier1: tier1Titles,
      tier2: tier2Titles,
      tier3: tier3Titles,
    },
  };
}

// ─── Contact search orchestrator ─────────────────────────────────────────────

async function findRealContacts(
  company: string,
  jobTitle: string,
  team: string,
  department: string,
  seniority: string,
  jdText: string
): Promise<ContactResult[]> {
  const { tier1Titles, tier2Titles, tier3Titles } = await extractTeamAndQueries(
    jobTitle, company, department, seniority, jdText.slice(0, 400)
  );

  // Run 3 Apify searches in parallel — one per tier
  const [tier1Raw, tier2Raw, tier3Raw] = await Promise.allSettled([
    searchLinkedIn(company, tier1Titles[0] ?? jobTitle, 4),
    searchLinkedIn(company, tier2Titles[0] ?? team, 4),
    searchLinkedIn(company, tier3Titles[0] ?? department, 3),
  ]);

  const tier1Results = tier1Raw.status === "fulfilled" ? tier1Raw.value : [];
  const tier2Results = tier2Raw.status === "fulfilled" ? tier2Raw.value : [];
  const tier3Results = tier3Raw.status === "fulfilled" ? tier3Raw.value : [];

  // Deduplicate by URL across tiers
  const seen = new Set<string>();
  const tagged: Array<{ name: string; headline: string; url: string; tier: number }> = [];

  for (const [results, tierNum] of [[tier1Results, 1], [tier2Results, 2], [tier3Results, 3]] as const) {
    for (const r of results as ApifyResult[]) {
      if (r.url && r.name && !seen.has(r.url)) {
        seen.add(r.url);
        tagged.push({ name: r.name, headline: r.headline ?? "", url: r.url, tier: tierNum });
      }
    }
  }

  if (tagged.length === 0) {
    throw new Error(
      `No LinkedIn results found for "${company}". Check the company name matches exactly how it appears on LinkedIn (e.g. "Goldman Sachs" not "Goldman"). APIFY_API_KEY must also be set.`
    );
  }

  // Stage 4: draft outreach for real contacts (lazy — only called when results exist)
  return tierAndDraftOutreach(tagged, jobTitle, company, team);
}

// ─── Express routes ───────────────────────────────────────────────────────────

export function registerRoutes(httpServer: Server, app: Express) {

  // Parse a job description
  app.post("/api/parse-jd", async (req, res) => {
    try {
      const { jdText } = parseJdSchema.parse(req.body);
      const parsed = await parseJobDescription(jdText);

      const search = storage.createSearch({
        jobTitle: parsed.jobTitle,
        company: parsed.company,
        team: parsed.team,
        department: parsed.department,
        seniority: parsed.seniority,
        jdText,
        parsedAt: new Date().toISOString(),
      });

      res.json({ search, parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to parse JD";
      res.status(400).json({ error: message });
    }
  });

  // Find real contacts via Apify → LinkedIn
  app.post("/api/find-contacts", async (req, res) => {
    try {
      const data = searchContactsSchema.parse(req.body);
      storage.deleteContactsBySearch(data.searchId);

      const contacts = await findRealContacts(
        data.company,
        data.jobTitle,
        data.team,
        data.department,
        data.seniority,
        data.jdText
      );

      const saved = contacts.map((c) =>
        storage.createContact({
          searchId: data.searchId,
          name: c.name,
          title: c.title,
          company: c.company,
          department: c.department,
          linkedinUrl: c.linkedinUrl ?? null,
          email: c.email ?? null,
          tier: c.tier,
          tierReason: c.tierReason,
          outreachDraft: c.outreachDraft,
          source: c.source,
          tenureYears: c.tenureYears ?? null,
          location: c.location ?? null,
          savedAt: new Date().toISOString(),
        })
      );

      res.json({ contacts: saved });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to find contacts";
      res.status(400).json({ error: message });
    }
  });

  // Get all searches
  app.get("/api/searches", (_req, res) => {
    res.json({ searches: storage.getAllSearches() });
  });

  // Get contacts for a search
  app.get("/api/searches/:id/contacts", (req, res) => {
    const id = parseInt(req.params.id);
    const search = storage.getSearch(id);
    if (!search) return res.status(404).json({ error: "Search not found" });
    res.json({ search, contacts: storage.getContactsBySearch(id) });
  });

  // Delete a search
  app.delete("/api/searches/:id", (req, res) => {
    storage.deleteSearch(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // Health — shows which env vars are configured
  app.get("/api/health", (_req, res) => {
    res.json({
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      apify: !!APIFY_API_KEY,
    });
  });
}
