/**
 * Federal Tax Bracket Options
 * Used for selecting client's federal tax bracket in the form
 */

export interface FederalBracket {
  value: string;
  label: string;
  rate: number;
}

export const FEDERAL_BRACKETS: FederalBracket[] = [
  { value: "auto", label: "Auto-detect", rate: 0 },
  { value: "10", label: "10%", rate: 10 },
  { value: "12", label: "12%", rate: 12 },
  { value: "22", label: "22%", rate: 22 },
  { value: "24", label: "24%", rate: 24 },
  { value: "32", label: "32%", rate: 32 },
  { value: "35", label: "35%", rate: 35 },
  { value: "37", label: "37%", rate: 37 },
];
