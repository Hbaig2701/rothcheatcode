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

export interface AnalysisResults {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
  keyMoments: KeyMoment[];
  metrics: CallMetrics;
}

export interface KeyMoment {
  description: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface CallMetrics {
  rapportBuilding: number;
  needsDiscovery: number;
  productKnowledge: number;
  objectionHandling: number;
  closingAbility: number;
  complianceAdherence: number;
}
