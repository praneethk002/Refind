import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, RefreshCw, Copy, Check, Linkedin, Mail,
  MapPin, Clock, Users, Target, ChevronDown, ChevronUp,
  Building2, Briefcase, Star
} from "lucide-react";
import type { Search, Contact } from "@shared/schema";

const TIER_CONFIG = {
  1: { label: "Same role · Same team", color: "tier-1-badge", desc: "Highest referral value", icon: Star },
  2: { label: "Different role · Same team", color: "tier-2-badge", desc: "Strong referral value", icon: Target },
  3: { label: "Adjacent team", color: "tier-3-badge", desc: "Warm connection", icon: Users },
} as const;

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={copy} data-testid="button-copy">
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </Button>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  const [expanded, setExpanded] = useState(false);
  const tier = contact.tier as 1 | 2 | 3;
  const cfg = TIER_CONFIG[tier];

  return (
    <Card className="hover-elevate" data-testid={`card-contact-${contact.id}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3 flex-wrap">
          {/* Avatar initials */}
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary">
              {contact.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-semibold" data-testid={`text-name-${contact.id}`}>{contact.name}</h3>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>
                Tier {tier} · {cfg.desc}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{contact.title}</p>
            <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{contact.company}</span>
              {contact.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{contact.location}</span>}
              {contact.tenureYears && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{contact.tenureYears}y tenure</span>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {contact.linkedinUrl && (
              <Button variant="ghost" size="icon" asChild>
                <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-linkedin-${contact.id}`}>
                  <Linkedin className="w-3.5 h-3.5 text-[#0077b5]" />
                </a>
              </Button>
            )}
            {contact.email && (
              <Button variant="ghost" size="icon" asChild>
                <a href={`mailto:${contact.email}`} data-testid={`link-email-${contact.id}`}>
                  <Mail className="w-3.5 h-3.5 text-primary" />
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setExpanded(!expanded)}
              data-testid={`button-expand-${contact.id}`}
            >
              Message
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        {/* Tier reason */}
        <div className="mt-2 pl-12">
          <p className="text-[11px] text-muted-foreground italic">{contact.tierReason}</p>
        </div>

        {/* Outreach message */}
        {expanded && (
          <div className="mt-3 pl-0 sm:pl-12">
            <div className="rounded-md bg-muted/40 p-3 border border-border">
              <div className="flex items-center justify-between mb-2 gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Suggested outreach</p>
                <CopyButton text={contact.outreachDraft} />
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap" data-testid={`text-outreach-${contact.id}`}>
                {contact.outreachDraft}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ search: Search; contacts: Contact[] }>({
    queryKey: ["/api/searches", id, "contacts"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/searches/${id}/contacts`);
      return res.json();
    },
    enabled: !!id,
  });

  const findMutation = useMutation({
    mutationFn: async () => {
      if (!data) return;
      const res = await apiRequest("POST", "/api/find-contacts", {
        searchId: parseInt(id),
        company: data.search.company,
        jobTitle: data.search.jobTitle,
        team: data.search.team,
        department: data.search.department,
        seniority: data.search.seniority,
        jdText: data.search.jdText,
        sources: ["linkedin", "apollo", "rocketreach"],
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/searches", id, "contacts"] });
      toast({ title: "Contacts refreshed", description: "New contacts found based on your JD." });
    },
    onError: (err: Error) => {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    },
  });

  const contacts = data?.contacts ?? [];
  const search = data?.search;

  const filteredContacts = activeFilter
    ? contacts.filter((c) => c.tier === activeFilter)
    : contacts;

  const tierCounts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
  contacts.forEach((c) => { tierCounts[c.tier] = (tierCounts[c.tier] || 0) + 1; });

  const sortedContacts = [...filteredContacts].sort((a, b) => a.tier - b.tier);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <svg aria-label="RefFind logo" viewBox="0 0 32 32" fill="none" className="w-6 h-6 flex-shrink-0">
              <circle cx="16" cy="16" r="14" stroke="hsl(var(--primary))" strokeWidth="2.5"/>
              <path d="M10 16 L14 20 L22 12" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="24" cy="9" r="3" fill="hsl(var(--primary))"/>
            </svg>
            <span className="font-semibold text-sm">RefFind</span>
          </div>
          {search && (
            <div className="flex-1 min-w-0 hidden sm:block">
              <p className="text-xs font-medium truncate">{search.jobTitle}</p>
              <p className="text-[10px] text-muted-foreground truncate">{search.company} · {search.team}</p>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => findMutation.mutate()}
            disabled={findMutation.isPending || !data}
            data-testid="button-refresh"
          >
            {findMutation.isPending ? (
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {findMutation.isPending ? "Searching..." : contacts.length === 0 ? "Find Contacts" : "Refresh"}
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Search summary */}
        {search && (
          <div className="mb-6">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold mb-1">{search.jobTitle}</h1>
                <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{search.company}</span>
                  <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{search.team}</span>
                  <span className="flex items-center gap-1"><Target className="w-3 h-3" />{search.department}</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{search.seniority} level</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 w-full" />
            ))}
          </div>
        )}

        {/* Empty state — prompt to search */}
        {!isLoading && contacts.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <h2 className="text-sm font-semibold mb-1">No contacts yet</h2>
              <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
                Click "Find Contacts" to search for strategically relevant contacts across LinkedIn, Apollo, and RocketReach.
              </p>
              <Button
                onClick={() => findMutation.mutate()}
                disabled={findMutation.isPending}
                data-testid="button-find-empty"
                className="gap-2"
              >
                {findMutation.isPending ? (
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Target className="w-3.5 h-3.5" />
                )}
                {findMutation.isPending ? "Searching across sources..." : "Find Contacts"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Contacts grid */}
        {!isLoading && contacts.length > 0 && (
          <>
            {/* Tier filter + stats */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Button
                variant={activeFilter === null ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setActiveFilter(null)}
                data-testid="filter-all"
              >
                All <span className="text-[10px] opacity-70">({contacts.length})</span>
              </Button>
              {[1, 2, 3].map((tier) => (
                tierCounts[tier] > 0 && (
                  <Button
                    key={tier}
                    variant={activeFilter === tier ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => setActiveFilter(activeFilter === tier ? null : tier)}
                    data-testid={`filter-tier-${tier}`}
                  >
                    Tier {tier} <span className="text-[10px] opacity-70">({tierCounts[tier]})</span>
                  </Button>
                )
              ))}
              <div className="ml-auto text-xs text-muted-foreground hidden sm:block">
                Sorted by strategic value
              </div>
            </div>

            {/* Tier group headers + cards */}
            {[1, 2, 3].map((tier) => {
              const tierContacts = sortedContacts.filter((c) => c.tier === tier);
              if (tierContacts.length === 0) return null;
              const cfg = TIER_CONFIG[tier as 1 | 2 | 3];
              return (
                <div key={tier} className="mb-6" data-testid={`section-tier-${tier}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${cfg.color}`}>
                      Tier {tier}
                    </span>
                    <span className="text-xs font-medium">{cfg.label}</span>
                    <span className="text-xs text-muted-foreground">· {tierContacts.length} contacts</span>
                  </div>
                  <div className="space-y-2.5">
                    {tierContacts.map((c) => <ContactCard key={c.id} contact={c} />)}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
