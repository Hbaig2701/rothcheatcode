export interface SalesCall {
  id: string;
  user_id: string;
  title: string | null;
  transcript_text: string | null;
  duration_seconds: number | null;
  status: 'uploading' | 'transcribing' | 'analyzing' | 'complete' | 'failed';
  error_message: string | null;
  analysis_results: AnalysisResults | null;
  overall_score: number | null;
  call_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CallStage =
  | 'prospecting'
  | 'discovery'
  | 'pain_presentation'
  | 'solution_presentation'
  | 'objection_handling'
  | 'close';

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface DimensionScore {
  score: number;        // 1-10
  rationale: string;    // One sentence explaining the score
  coachingNote: string; // Specific, actionable coaching note
}

export interface CallMetrics {
  problemFraming: DimensionScore;
  discoveryQuality: DimensionScore;
  painDelivery: DimensionScore;
  solutionClarity: DimensionScore;
  objectionHandling: DimensionScore;
  socialProof: DimensionScore;
  processNextSteps: DimensionScore;
  talkTimeListening: DimensionScore;
}

export interface MomentDoneWell {
  quote: string;         // Advisor's exact words or timestamp reference
  explanation: string;   // Why this worked
}

export interface MissedOpportunity {
  quote: string;            // Advisor's exact words or timestamp reference
  explanation: string;      // What was missed
  betterLanguage: string;   // Exact suggested replacement phrasing
}

export interface ComplianceFlag {
  issue: string;       // Brief label
  quote: string;       // The problematic quote
  concern: string;     // Why it's a concern and suggested correction
}

export interface AnalysisResults {
  callStage: CallStage;
  overallScore: number;       // 1-10 (average of 8 dimensions)
  letterGrade: LetterGrade;
  summary: string;            // 2-3 sentence overall summary

  metrics: CallMetrics;

  momentsDoneWell: MomentDoneWell[];       // Top 3
  missedOpportunities: MissedOpportunity[]; // Top 3
  complianceFlags: ComplianceFlag[];        // 0+, only if present
  priorityActions: string[];                // Top 3 action items

  // Legacy compatibility
  score: number;
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
}
