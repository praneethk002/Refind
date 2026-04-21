import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Saved searches
export const searches = sqliteTable("searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobTitle: text("job_title").notNull(),
  company: text("company").notNull(),
  team: text("team").notNull(),
  department: text("department").notNull(),
  seniority: text("seniority").notNull(),
  jdText: text("jd_text").notNull(),
  parsedAt: text("parsed_at").notNull(),
});

// Saved contacts
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  searchId: integer("search_id").notNull(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  department: text("department").notNull(),
  linkedinUrl: text("linkedin_url"),
  email: text("email"),
  tier: integer("tier").notNull(), // 1, 2, or 3
  tierReason: text("tier_reason").notNull(),
  outreachDraft: text("outreach_draft").notNull(),
  source: text("source").notNull(), // "linkedin" | "apollo" | "rocketreach"
  tenureYears: text("tenure_years"),
  location: text("location"),
  savedAt: text("saved_at").notNull(),
});

export const insertSearchSchema = createInsertSchema(searches).omit({ id: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true });

export type InsertSearch = z.infer<typeof insertSearchSchema>;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Search = typeof searches.$inferSelect;
export type Contact = typeof contacts.$inferSelect;

// API request/response types
export const parseJdSchema = z.object({
  jdText: z.string().min(50, "Please paste a job description (at least 50 characters)"),
});

export const searchContactsSchema = z.object({
  searchId: z.number(),
  company: z.string(),
  jobTitle: z.string(),
  team: z.string(),
  department: z.string(),
  seniority: z.string(),
  jdText: z.string(),
  sources: z.array(z.enum(["linkedin", "apollo", "rocketreach"])),
});

export type ParseJdRequest = z.infer<typeof parseJdSchema>;
export type SearchContactsRequest = z.infer<typeof searchContactsSchema>;

export interface ParsedJd {
  jobTitle: string;
  company: string;
  team: string;
  department: string;
  seniority: string;
  keySkills: string[];
  teamDescription: string;
  searchQueries: {
    tier1: string[];
    tier2: string[];
    tier3: string[];
  };
}

export interface ContactResult {
  name: string;
  title: string;
  company: string;
  department: string;
  linkedinUrl?: string;
  email?: string;
  tier: 1 | 2 | 3;
  tierReason: string;
  outreachDraft: string;
  source: string;
  tenureYears?: string;
  location?: string;
}
