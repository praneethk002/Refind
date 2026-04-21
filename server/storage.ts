import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { searches, contacts, type Search, type Contact, type InsertSearch, type InsertContact } from "@shared/schema";

const sqlite = new Database("referral_finder.db");
const db = drizzle(sqlite);

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_title TEXT NOT NULL,
    company TEXT NOT NULL,
    team TEXT NOT NULL,
    department TEXT NOT NULL,
    seniority TEXT NOT NULL,
    jd_text TEXT NOT NULL,
    parsed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    department TEXT NOT NULL,
    linkedin_url TEXT,
    email TEXT,
    tier INTEGER NOT NULL,
    tier_reason TEXT NOT NULL,
    outreach_draft TEXT NOT NULL,
    source TEXT NOT NULL,
    tenure_years TEXT,
    location TEXT,
    saved_at TEXT NOT NULL
  );
`);

export interface IStorage {
  // Searches
  createSearch(data: InsertSearch): Search;
  getSearch(id: number): Search | undefined;
  getAllSearches(): Search[];
  deleteSearch(id: number): void;

  // Contacts
  createContact(data: InsertContact): Contact;
  getContactsBySearch(searchId: number): Contact[];
  deleteContactsBySearch(searchId: number): void;
}

export const storage: IStorage = {
  createSearch(data: InsertSearch): Search {
    return db.insert(searches).values(data).returning().get();
  },

  getSearch(id: number): Search | undefined {
    return db.select().from(searches).where(eq(searches.id, id)).get();
  },

  getAllSearches(): Search[] {
    return db.select().from(searches).all();
  },

  deleteSearch(id: number): void {
    db.delete(contacts).where(eq(contacts.searchId, id)).run();
    db.delete(searches).where(eq(searches.id, id)).run();
  },

  createContact(data: InsertContact): Contact {
    return db.insert(contacts).values(data).returning().get();
  },

  getContactsBySearch(searchId: number): Contact[] {
    return db.select().from(contacts).where(eq(contacts.searchId, searchId)).all();
  },

  deleteContactsBySearch(searchId: number): void {
    db.delete(contacts).where(eq(contacts.searchId, searchId)).run();
  },
};
