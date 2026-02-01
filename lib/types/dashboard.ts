import type { Client } from './client';

/**
 * Slim projection data for dashboard (excludes large JSONB arrays)
 */
export interface ProjectionSummary {
  client_id: string;
  baseline_final_net_worth: number;  // cents
  blueprint_final_net_worth: number; // cents
  blueprint_final_roth: number;      // cents
  total_tax_savings: number;         // cents
  heir_benefit: number;              // cents
}

/**
 * Pre-computed conversion pipeline item (computed server-side from blueprint_years)
 */
export interface ConversionPipelineItem {
  clientId: string;
  clientName: string;
  productLabel: string;
  currentYear: number;
  totalYears: number;
  remainingAmount: number;  // cents - EOY traditional IRA balance at current conversion year
  percentComplete: number;  // 0-100
  isComplete: boolean;
}

/**
 * Response from GET /api/dashboard
 */
export interface DashboardData {
  clients: Client[];
  projections: ProjectionSummary[];
  pipeline: ConversionPipelineItem[];
}

/**
 * Computed dashboard metrics (derived client-side from DashboardData)
 */
export interface DashboardMetrics {
  // Top metrics
  totalClients: number;
  newClientsThisMonth: number;
  totalAUM: number;            // cents
  aumChangeThisMonth: number;  // cents
  avgWealthIncrease: number;   // percentage
  cheatCodesThisMonth: number;
  cheatCodesChangePercent: number; // percentage

  // Value delivered
  totalLifetimeWealth: number;    // cents
  totalTaxSavings: number;        // cents
  totalLegacyProtected: number;   // cents

  // Product mix
  productMix: { name: string; value: number; color: string }[];

  // Recent cheatcodes (first 5 clients sorted by created_at DESC)
  recentCheatCodes: {
    id: string;
    clientName: string;
    productLabel: string;
    percentChange: number;
    createdAt: string;
  }[];

  // Client insights
  avgClientAge: number;
  avgDeposit: number;  // cents
  filingStatusBreakdown: { single: number; mfj: number; mfs: number; hoh: number };
  approachingRMDCount: number;
  approachingRMDClients: { id: string; name: string; age: number }[];

  // Pipeline (passed through from API)
  pipeline: ConversionPipelineItem[];
  activePipelineCount: number;
  totalPipelineValue: number;  // cents
}
