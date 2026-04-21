import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { parseJdSchema, searchContactsSchema, type ParsedJd, type ContactResult } from "@shared/schema";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function parseJobDescription(jdText: string): Promise<ParsedJd> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are an expert at parsing job descriptions for targeted outreach. Extract the following from this job description and return ONLY valid JSON.

Job Description:
${jdText}

Return this exact JSON structure:
{
  "jobTitle": "exact job title from JD",
  "company": "company name",
  "team": "specific team or desk name (e.g. 'Structured Credit', 'DCM', 'Quantitative Research')",
  "department": "broader department (e.g. 'Credit Risk', 'Investment Banking', 'Fixed Income')",
  "seniority": "Analyst / Associate / VP / Director / MD",
  "keySkills": ["skill1", "skill2", "skill3"],
  "teamDescription": "1-sentence description of what this team does",
  "searchQueries": {
    "tier1": ["search query to find people with same role on same team at this company", "alternative query"],
    "tier2": ["search query to find different roles on same team at this company"],
    "tier3": ["search query for similar teams at this company or same role at similar firms"]
  }
}

For searchQueries, generate LinkedIn-style search phrases like "Credit Analyst Structured Finance [Company]" that someone would use to find relevant contacts.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse job description");
  return JSON.parse(jsonMatch[0]) as ParsedJd;
}

async function generateContacts(
  company: string,
  jobTitle: string,
  team: string,
  department: string,
  seniority: string,
  jdText: string
): Promise<ContactResult[]> {
  // Generate realistic mock contacts with AI-written outreach — in production, this calls Apollo/LinkedIn APIs
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `You are helping a Master's student at London Business School (MAM 2026, graduating July 2026) find strategic referral contacts for a job application. Their background: Data Science + credit risk (worked at Olyv fintech), quantitative finance skills, Python/SQL, seeking analyst/internship roles.

Job they're applying for:
- Company: ${company}
- Role: ${jobTitle}
- Team: ${team}
- Department: ${department}
- Seniority Level Applying For: ${seniority}

Generate 9 realistic contacts that would exist at ${company} — 3 per tier. Return ONLY valid JSON array.

Tiering logic:
- Tier 1 (Same role, same team): Exact same title on this specific team. Most valuable for referral.
- Tier 2 (Different role, same team): Related role on same team (e.g. quant, risk tech, associate on same desk). Strong referral value.
- Tier 3 (Adjacent team or similar firm): Related department or same role at peer firm. Warm connection.

For each contact, write a personalised outreach message (3-4 sentences) that:
1. References their specific role/team
2. Mentions the applicant's relevant background (LBS MAM + credit risk/fintech experience)
3. Makes a specific, genuine ask (not generic "can we connect")
4. Feels human and not templated

Return this JSON array:
[
  {
    "name": "Full Name",
    "title": "Their Job Title",
    "company": "${company}",
    "department": "their department",
    "linkedinUrl": "https://linkedin.com/in/realistic-slug",
    "email": null,
    "tier": 1,
    "tierReason": "Why this tier — specific reason",
    "outreachDraft": "Hi [Name], [personalised message]...",
    "source": "linkedin",
    "tenureYears": "2",
    "location": "London, UK"
  }
]

Make names diverse and realistic. Titles should be authentic to ${company}'s structure (use realistic seniority levels: Analyst, Associate, VP, Director, MD). Mix London and other relevant office locations.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Failed to generate contacts");
  return JSON.parse(jsonMatch[0]) as ContactResult[];
}

export function registerRoutes(httpServer: Server, app: Express) {
  // Parse a job description
  app.post("/api/parse-jd", async (req, res) => {
    try {
      const { jdText } = parseJdSchema.parse(req.body);
      const parsed = await parseJobDescription(jdText);

      // Save search to DB
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

  // Find contacts for a search
  app.post("/api/find-contacts", async (req, res) => {
    try {
      const data = searchContactsSchema.parse(req.body);

      // Clear old contacts for this search
      storage.deleteContactsBySearch(data.searchId);

      // Generate contacts via AI (in production: real API calls to Apollo/LinkedIn/RocketReach)
      const contacts = await generateContacts(
        data.company,
        data.jobTitle,
        data.team,
        data.department,
        data.seniority,
        data.jdText
      );

      // Save to DB
      const savedContacts = contacts.map((c) =>
        storage.createContact({
          searchId: data.searchId,
          name: c.name,
          title: c.title,
          company: c.company,
          department: c.department,
          linkedinUrl: c.linkedinUrl || null,
          email: c.email || null,
          tier: c.tier,
          tierReason: c.tierReason,
          outreachDraft: c.outreachDraft,
          source: c.source,
          tenureYears: c.tenureYears || null,
          location: c.location || null,
          savedAt: new Date().toISOString(),
        })
      );

      res.json({ contacts: savedContacts });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to find contacts";
      res.status(400).json({ error: message });
    }
  });

  // Get all saved searches
  app.get("/api/searches", (_req, res) => {
    const searches = storage.getAllSearches();
    res.json({ searches });
  });

  // Get contacts for a search
  app.get("/api/searches/:id/contacts", (req, res) => {
    const id = parseInt(req.params.id);
    const search = storage.getSearch(id);
    if (!search) return res.status(404).json({ error: "Search not found" });
    const contacts = storage.getContactsBySearch(id);
    res.json({ search, contacts });
  });

  // Delete a search
  app.delete("/api/searches/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteSearch(id);
    res.json({ ok: true });
  });
}
