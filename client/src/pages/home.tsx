import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Target, History, Trash2, ChevronRight, Briefcase, Users, Building2, ArrowRight } from "lucide-react";
import type { Search } from "@shared/schema";

const EXAMPLE_JD = `Credit Risk Analyst – Structured Finance
Goldman Sachs | London

The Structured Finance Credit Risk team is responsible for assessing and monitoring credit exposure across ABS, CLO, and RMBS portfolios. You will work directly with the credit risk desk and coverage bankers to evaluate counterparty risk on complex structured transactions.

Responsibilities:
• Analyse credit risk on structured finance deals including ABS, CLO, RMBS
• Build and maintain quantitative models for portfolio-level risk assessment
• Collaborate with origination and structuring desks on new transactions
• Prepare credit committee memos and risk reports for senior management

Requirements:
• Strong quantitative background; Python/SQL proficiency
• 0-2 years in credit risk, fixed income, or structured finance
• CFA Part I preferred; MSc/MA in Finance, Engineering or Economics
• Excellent written and verbal communication skills`;

export default function Home() {
  const [jdText, setJdText] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: historyData } = useQuery<{ searches: Search[] }>({
    queryKey: ["/api/searches"],
  });

  const parseMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/parse-jd", { jdText: text });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/searches"] });
      navigate(`/results/${data.search.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to parse JD", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/searches/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/searches"] });
    },
  });

  const searches = historyData?.searches ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <svg aria-label="RefFind logo" viewBox="0 0 32 32" fill="none" className="w-7 h-7 flex-shrink-0">
              <circle cx="16" cy="16" r="14" stroke="hsl(var(--primary))" strokeWidth="2.5"/>
              <path d="M10 16 L14 20 L22 12" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="24" cy="9" r="3" fill="hsl(var(--primary))"/>
              <circle cx="8" cy="23" r="3" fill="hsl(var(--primary))" opacity="0.4"/>
              <circle cx="8" cy="9" r="3" fill="hsl(var(--primary))" opacity="0.2"/>
            </svg>
            <span className="font-semibold text-base tracking-tight">RefFind</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-auto">Beta</Badge>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block">Strategic referral outreach for job seekers</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Target className="w-3.5 h-3.5" />
            <span>Smart referral targeting</span>
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2 leading-snug">
            Find the right people to ask for a referral
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
            Paste a job description and get a tiered list of contacts at the company — ranked by how close they are to the role. Same team beats same company every time.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Main input */}
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-sm font-semibold">Paste Job Description</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-7"
                  onClick={() => setJdText(EXAMPLE_JD)}
                  data-testid="button-load-example"
                >
                  Load example
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Paste the full job description here — including role title, company, team, and responsibilities..."
                  className="min-h-[280px] text-sm font-mono resize-none"
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  data-testid="textarea-jd"
                />
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {jdText.length > 0 ? `${jdText.length} characters` : "Minimum 50 characters"}
                  </span>
                  <Button
                    onClick={() => parseMutation.mutate(jdText)}
                    disabled={jdText.length < 50 || parseMutation.isPending}
                    data-testid="button-find-contacts"
                    className="gap-2"
                  >
                    {parseMutation.isPending ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Analysing JD...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Find Contacts
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* How it works */}
            <Card className="bg-muted/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">How tiering works</p>
                <div className="space-y-2.5">
                  {[
                    { tier: "T1", label: "Same role, same team", desc: "Exact match — they know the hiring manager personally", color: "tier-1-badge" },
                    { tier: "T2", label: "Different role, same team", desc: "Works on the desk — can speak to team culture and workflow", color: "tier-2-badge" },
                    { tier: "T3", label: "Adjacent team or similar firm", desc: "Related function — warm connection, softer referral", color: "tier-3-badge" },
                  ].map((t) => (
                    <div key={t.tier} className="flex items-start gap-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5 ${t.color}`}>
                        {t.tier}
                      </span>
                      <div>
                        <p className="text-xs font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar: history */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center gap-2 space-y-0">
                <History className="w-3.5 h-3.5 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Recent Searches</CardTitle>
              </CardHeader>
              <CardContent>
                {searches.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No searches yet</p>
                    <p className="text-xs opacity-70 mt-1">Paste a JD to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2" data-testid="list-searches">
                    {searches.slice().reverse().map((s) => (
                      <div
                        key={s.id}
                        className="group flex items-start gap-2 p-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/results/${s.id}`)}
                        data-testid={`card-search-${s.id}`}
                      >
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{s.jobTitle}</p>
                          <p className="text-xs text-muted-foreground truncate">{s.company} · {s.team}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {new Date(s.parsedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(s.id); }}
                            data-testid={`button-delete-search-${s.id}`}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Data sources */}
            <Card className="mt-4 bg-muted/20">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Data Sources</p>
                <div className="space-y-1.5">
                  {[
                    { name: "LinkedIn", desc: "Profile search via browser", status: "active" },
                    { name: "Apollo.io", desc: "Free tier · 50 exports/mo", status: "active" },
                    { name: "RocketReach", desc: "Email + LI lookup", status: "active" },
                  ].map((src) => (
                    <div key={src.name} className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium">{src.name}</p>
                        <p className="text-[10px] text-muted-foreground">{src.desc}</p>
                      </div>
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { icon: Target, label: "Avg. Tier 1 contacts", value: "3" },
            { icon: Users, label: "Total contacts per search", value: "9+" },
            { icon: Sparkles, label: "Personalised messages", value: "100%" },
          ].map((stat) => (
            <Card key={stat.label} className="text-center">
              <CardContent className="pt-4 pb-4">
                <stat.icon className="w-4 h-4 text-primary mx-auto mb-1.5" />
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
