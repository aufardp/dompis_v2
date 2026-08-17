// app/libs/services/rca-suggestion.service.ts
// RCA AI-Assisted (PRD 5.4) — co-occurrence lookup, bukan ML.
// Saran RCA berdasarkan tiket closed historis dengan device_name + gejala yang sama.

import prisma from '@/app/libs/prisma';
import { isTicketClosed } from '@/app/libs/ticket-utils';

export const RCA_SUGGESTION_LOOKBACK_DAYS = 180;
export const RCA_SUGGESTION_MIN_CLOSED = 50;
export const RCA_SUGGESTION_MAX_SUGGESTIONS = 3;

export type RcaSuggestionInput = {
  deviceName?: string | null;
  symptom?: string | null;
};

export type RcaSuggestionItem = {
  rca: string;
  subRca: string | null;
  descriptionSolutionDompis: string | null;
  count: number;
  matchRate: number;
  likely: boolean;
};

export type RcaSuggestionResult =
  | {
      deviceName: string | null;
      symptom: string | null;
      suggestions: RcaSuggestionItem[];
      totalClosedAnalysed: number;
      reason: 'ok';
    }
  | {
      deviceName: string | null;
      symptom: string | null;
      suggestions: [];
      totalClosedAnalysed: number;
      reason: 'insufficient_data';
    };

function normalizeSymptom(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function symptomMatches(query: string, candidate: string): boolean {
  const q = normalizeSymptom(query);
  const c = normalizeSymptom(candidate);
  if (!q || !c) return false;
  if (q === c) return true;
  if (q.length >= 4 && c.includes(q)) return true;
  if (c.length >= 4 && q.includes(c)) return true;

  const qTokens = new Set(q.split(' ').filter((t) => t.length >= 3));
  const cTokens = new Set(c.split(' ').filter((t) => t.length >= 3));
  if (qTokens.size === 0 || cTokens.size === 0) return false;

  let shared = 0;
  for (const token of qTokens) {
    if (cTokens.has(token)) shared += 1;
  }
  return shared > 0 && shared / qTokens.size >= 0.5;
}

export async function getRcaSuggestions({
  deviceName,
  symptom,
}: RcaSuggestionInput): Promise<RcaSuggestionResult> {
  const device = (deviceName ?? '').trim();
  if (!device) {
    return {
      deviceName: null,
      symptom: symptom ?? null,
      suggestions: [],
      totalClosedAnalysed: 0,
      reason: 'insufficient_data',
    };
  }

  const since = new Date(
    Date.now() - RCA_SUGGESTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await prisma.ticket.findMany({
    where: {
      device_name: device,
      rca: { not: null, notIn: ['', '-'] },
      OR: [{ closed_at: { gte: since } }, { closed_at: null }],
    },
    select: {
      symptom: true,
      rca: true,
      sub_rca: true,
      description_solution_dompis: true,
      status_update: true,
      status: true,
      closed_at: true,
    },
    take: 2000,
    orderBy: { closed_at: 'desc' },
  });

  const analysisWindow = rows.filter(
    (r) => isTicketClosed(r.status_update) && (r.closed_at ?? null) !== null,
  );

  const matchedSymptom = symptom && symptom.trim().length > 0;
  const withMatchedSymptom = matchedSymptom
    ? analysisWindow.filter((r) => symptomMatches(symptom, r.symptom ?? ''))
    : analysisWindow;

  const totalClosedAnalysed = withMatchedSymptom.length;

  if (totalClosedAnalysed < RCA_SUGGESTION_MIN_CLOSED) {
    return {
      deviceName: device,
      symptom: symptom ?? null,
      suggestions: [],
      totalClosedAnalysed,
      reason: 'insufficient_data',
    };
  }

  const groups = new Map<string, RcaSuggestionItem>();
  for (const row of withMatchedSymptom) {
    const key = `${row.rca}::${row.sub_rca ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        rca: row.rca!,
        subRca: row.sub_rca ?? null,
        descriptionSolutionDompis: row.description_solution_dompis ?? null,
        count: 1,
        matchRate: 0,
        likely: false,
      });
    }
  }

  const suggestions = Array.from(groups.values())
    .map((item) => ({
      ...item,
      matchRate: item.count / totalClosedAnalysed,
      likely: item.count / totalClosedAnalysed >= 0.5,
    }))
    .sort((a, b) => b.count - a.count || b.matchRate - a.matchRate)
    .slice(0, RCA_SUGGESTION_MAX_SUGGESTIONS);

  return {
    deviceName: device,
    symptom: symptom ?? null,
    suggestions,
    totalClosedAnalysed,
    reason: 'ok',
  };
}