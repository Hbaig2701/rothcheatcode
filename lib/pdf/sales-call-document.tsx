import type React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { AnalysisResults, CallMetrics, DimensionScore } from '@/lib/types/sales-call';

// Coaching report for the advisor's own sales call — mirrors the sections of
// app/(dashboard)/sales-calls/[id]/page.tsx. Internal document (not client-
// facing), so branding is limited to the advisor's company name + color.

const METRIC_CONFIG: { key: keyof CallMetrics; label: string }[] = [
  { key: 'problemFraming', label: 'Problem Framing' },
  { key: 'discoveryQuality', label: 'Discovery Quality' },
  { key: 'painDelivery', label: 'Pain Delivery' },
  { key: 'solutionClarity', label: 'Solution Clarity' },
  { key: 'objectionHandling', label: 'Objection Handling' },
  { key: 'socialProof', label: 'Social Proof & Credibility' },
  { key: 'processNextSteps', label: 'Process & Next Steps' },
  { key: 'talkTimeListening', label: 'Talk Time & Listening' },
];

const CALL_STAGE_LABELS: Record<string, string> = {
  prospecting: 'Prospecting',
  discovery: 'Discovery',
  pain_presentation: 'Pain Presentation',
  solution_presentation: 'Solution Presentation',
  objection_handling: 'Objection Handling',
  close: 'Close',
};

const GREEN = '#15803d';
const AMBER = '#b45309';
const RED = '#b91c1c';
const INK = '#1f2937';
const MUTED = '#6b7280';
const RULE = '#e5e7eb';

function scoreColor(score: number) {
  if (score >= 8) return GREEN;
  if (score >= 5) return AMBER;
  return RED;
}

// Line spacing lives on each text style, NOT the Page: a Page-level lineHeight
// plus the fixed page-number footer makes react-pdf throw "unsupported number"
// on longer documents (reproduced on 3 of 34 real transcripts).
const s = StyleSheet.create({
  // lineHeight resolves against the element's OWN fontSize (react-pdf's 18pt
  // default when unset), so every style that sets it also sets fontSize.
  body: { fontSize: 10, lineHeight: 1.45 },
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 10, color: INK },
  brandBar: { height: 4, marginBottom: 18 },
  company: { fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 6 },
  meta: { lineHeight: 1.45, fontSize: 10, color: MUTED },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  scoreBox: { alignItems: 'center', borderWidth: 1, borderColor: RULE, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 14, minWidth: 82 },
  scoreNum: { fontSize: 24, fontWeight: 'bold', lineHeight: 1, marginBottom: 4 },
  scoreLabel: { fontSize: 8, lineHeight: 1, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 },
  grade: { fontSize: 12, fontWeight: 'bold', marginTop: 2 },
  section: { marginBottom: 16 },
  h2: { fontSize: 12, fontWeight: 'bold', marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: RULE },
  metricRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: RULE },
  metricScore: { width: 34, fontSize: 12, fontWeight: 'bold' },
  metricBody: { flex: 1 },
  metricLabel: { fontSize: 10, lineHeight: 1.45, fontWeight: 'bold', marginBottom: 2 },
  coach: { fontSize: 10, lineHeight: 1.45, color: MUTED, marginTop: 2 },
  item: { marginBottom: 10 },
  quote: { fontSize: 10, lineHeight: 1.45, fontStyle: 'italic', color: MUTED, borderLeftWidth: 2, paddingLeft: 8, marginBottom: 3 },
  suggestLabel: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  suggest: { fontSize: 10, lineHeight: 1.45, fontStyle: 'italic' },
  flagIssue: { fontWeight: 'bold', color: RED, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  actionRow: { flexDirection: 'row', marginBottom: 6 },
  actionNum: { width: 18, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 24, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED },
  transcript: { fontSize: 9, color: INK, lineHeight: 1.5 },
});

export interface SalesCallPDFProps {
  title: string;
  callDate: string;
  durationSeconds: number | null;
  notes: string | null;
  analysis: AnalysisResults;
  transcript?: string | null;
  companyName?: string | null;
  primaryColor: string;
  generatedAt: string;
  /** IANA zone for formatting callDate — the server renders in UTC. */
  timeZone?: string;
}

// Whisper returns one unbroken block; split at sentence ends into ~700-char
// paragraphs so the PDF can paginate it.
function toParagraphs(text: string, target = 700): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  // Unpunctuated runs (Whisper sometimes drops punctuation) are cut at word
  // boundaries so no single chunk can grow unbounded.
  const pieces = sentences.flatMap((sentence) =>
    sentence.length <= target ? [sentence] : sentence.match(new RegExp(`.{1,${target}}(\\s|$)`, 'g')) ?? [sentence]
  );
  for (const sentence of pieces) {
    if (cur && cur.length + sentence.length > target) { out.push(cur.trim()); cur = ''; }
    cur += sentence;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}m ${seconds % 60}s`;
}

// Heading + first item kept together so a heading is never stranded at the
// bottom of a page (minPresenceAhead doesn't hold across wrap={false} items).
function Section<T>({ title, items, render }: {
  title: string;
  items: T[] | undefined;
  render: (item: T, index: number) => React.ReactElement;
}) {
  if (!items?.length) return null;
  const [first, ...rest] = items;
  return (
    <View style={s.section}>
      <View wrap={false}>
        <Text style={s.h2}>{title}</Text>
        {render(first, 0)}
      </View>
      {rest.map((item, i) => render(item, i + 1))}
    </View>
  );
}

// The built-in Helvetica only has WinAnsi (cp1252) glyphs; anything else (the
// model writes "→" in coaching notes) prints as a garbage glyph. Map common
// symbols to ASCII, fall back to the NFKD base letter, else drop the char.
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const SYMBOL_MAP: Record<string, string> = {
  '→': '->', '←': '<-', '⇒': '=>', '↑': '^', '↓': 'v', '≥': '>=', '≤': '<=', '≠': '!=',
  '✓': '', '✔': '', '✗': 'x', '✘': 'x', '★': '*', '\u2009': ' ', '\u202F': ' ', '\u200B': '',
};
function isWinAnsi(ch: string) {
  const c = ch.codePointAt(0)!;
  return c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.has(ch);
}
export function pdfSafe(text: string): string {
  let out = '';
  for (const ch of text) {
    if (isWinAnsi(ch)) out += ch;
    else if (ch in SYMBOL_MAP) out += SYMBOL_MAP[ch];
    else {
      const base = ch.normalize('NFKD')[0];
      if (base && isWinAnsi(base)) out += base;
    }
  }
  return out;
}
function deepSafe<T>(value: T): T {
  if (typeof value === 'string') return pdfSafe(value) as T;
  if (Array.isArray(value)) return value.map(deepSafe) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepSafe(v)])) as T;
  }
  return value;
}

export function SalesCallPDF(props: SalesCallPDFProps) {
  return <SalesCallPDFInner {...deepSafe(props)} />;
}

function SalesCallPDFInner({
  title, callDate, durationSeconds, notes, analysis, transcript, companyName, primaryColor, generatedAt, timeZone,
}: SalesCallPDFProps) {
  const overall = analysis.overallScore ?? null;
  const meta = [
    new Date(callDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone }),
    durationSeconds ? formatDuration(durationSeconds) : null,
    analysis.callStage ? CALL_STAGE_LABELS[analysis.callStage] ?? analysis.callStage : null,
  ].filter(Boolean).join('  ·  ');

  return (
    <Document title={`Sales Call Analysis - ${title}`}>
      <Page size="LETTER" style={s.page}>
        <View style={[s.brandBar, { backgroundColor: primaryColor }]} fixed />

        <View style={s.headerRow}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.company}>{companyName ? `${companyName} · ` : ''}Sales Call Analysis</Text>
            <Text style={s.title}>{title}</Text>
            <Text style={s.meta}>{meta}</Text>
            {notes ? <Text style={[s.meta, { marginTop: 4 }]}>{notes}</Text> : null}
          </View>
          {overall != null && (
            <View style={s.scoreBox}>
              <Text style={[s.scoreNum, { color: scoreColor(overall) }]}>{Math.round(overall * 10)}</Text>
              <Text style={s.scoreLabel}>Score / 100</Text>
              {analysis.letterGrade ? <Text style={s.grade}>Grade {analysis.letterGrade}</Text> : null}
            </View>
          )}
        </View>

        {analysis.summary ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Summary</Text>
            <Text style={s.body}>{analysis.summary}</Text>
          </View>
        ) : null}

        {analysis.metrics ? (
          <Section
            title="Performance Metrics"
            items={METRIC_CONFIG}
            render={({ key, label }) => {
              const dim = analysis.metrics[key] as DimensionScore | number | undefined;
              // Older analyses stored a bare number per dimension.
              const score = typeof dim === 'number' ? dim : dim?.score ?? 0;
              const rationale = typeof dim === 'object' ? dim?.rationale : null;
              const coaching = typeof dim === 'object' ? dim?.coachingNote : null;
              return (
                <View key={key} style={s.metricRow} wrap={false}>
                  <Text style={[s.metricScore, { color: scoreColor(score) }]}>{score}/10</Text>
                  <View style={s.metricBody}>
                    <Text style={s.metricLabel}>{label}</Text>
                    {rationale ? <Text style={s.body}>{rationale}</Text> : null}
                    {coaching ? <Text style={s.coach}>Coaching: {coaching}</Text> : null}
                  </View>
                </View>
              );
            }}
          />
        ) : null}

        <Section
          title="Top Moments Done Well"
          items={analysis.momentsDoneWell}
          render={(m, i) => (
            <View key={i} style={s.item} wrap={false}>
              <Text style={[s.quote, { borderLeftColor: GREEN }]}>&ldquo;{m.quote}&rdquo;</Text>
              <Text style={s.body}>{m.explanation}</Text>
            </View>
          )}
        />

        <Section
          title="Missed Opportunities"
          items={analysis.missedOpportunities}
          render={(o, i) => (
            <View key={i} style={s.item} wrap={false}>
              <Text style={[s.quote, { borderLeftColor: AMBER }]}>&ldquo;{o.quote}&rdquo;</Text>
              <Text style={s.body}>{o.explanation}</Text>
              <Text style={s.suggestLabel}>Suggested language</Text>
              <Text style={s.suggest}>&ldquo;{o.betterLanguage}&rdquo;</Text>
            </View>
          )}
        />

        <Section
          title="Compliance Flags"
          items={analysis.complianceFlags}
          render={(f, i) => (
            <View key={i} style={s.item} wrap={false}>
              <Text style={s.flagIssue}>{f.issue}</Text>
              <Text style={[s.quote, { borderLeftColor: RED }]}>&ldquo;{f.quote}&rdquo;</Text>
              <Text style={s.body}>{f.concern}</Text>
            </View>
          )}
        />

        {analysis.priorityActions?.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Priority Action Items</Text>
            {analysis.priorityActions.map((a, i) => (
              <View key={i} style={s.actionRow}>
                <Text style={s.actionNum}>{i + 1}.</Text>
                <Text style={[s.body, { flex: 1 }]}>{a}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Paragraph-sized Texts (see toParagraphs) paginate cleanly where one
            transcript-sized <Text> does not. */}
        {transcript ? <Text style={s.h2} break>Transcript</Text> : null}
        {transcript
          ? toParagraphs(transcript).map((para, i) => (
              <Text key={`t${i}`} style={[s.transcript, { marginBottom: 6 }]} wrap={false}>{para}</Text>
            ))
          : null}

        <View style={s.footer} fixed>
          <Text>Generated {generatedAt} · AI-generated coaching analysis — review before relying on it</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
