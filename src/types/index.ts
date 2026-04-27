import type { User } from "firebase/auth";

// ─── Union Types ──────────────────────────────────────────────────────────────

export type UserRole = "nurse" | "physician" | "admin";

export type DiagnosisGroup =
  | "CHF"
  | "COPD"
  | "AMI"
  | "PNEUMONIA"
  | "ORTHO"
  | "OTHER";

export type CallOutcome =
  | "completed"
  | "voicemail"
  | "no_answer"
  | "refused"
  | "wrong_party";

export type RiskTier = 1 | 2 | 3;

// ─── Core Domain Interfaces ───────────────────────────────────────────────────

export interface Patient {
  id: string;
  name: string;
  dateOfBirth: string; // ISO 8601 date
  lastDischargeDate?: string; // ISO 8601 datetime
}

export interface Medication {
  name: string;
  dose: string;
  frequency: string;
  newMed: boolean; // True if prescribed at discharge
}

export interface Discharge {
  id: string;
  patientId: string;
  patientName: string;
  diagnosisGroup: DiagnosisGroup;
  icd10Code: string;
  dischargeDateTime: string; // ISO 8601 datetime
  medications: Medication[];
  riskLevel: "low" | "medium" | "high";
  callStatus: "pending" | "in_progress" | "completed" | "failed";
  riskScore?: number;
  riskTier?: RiskTier;
  confidence?: number;
}

export interface Call {
  id: string;
  dischargeId: string;
  startTime: string; // ISO 8601 datetime
  endTime?: string; // ISO 8601 datetime
  outcome: CallOutcome;
  riskScore?: number;
  confidence?: number;
  transcript?: CallTranscript;
}

// ─── Transcript Interfaces ────────────────────────────────────────────────────

export interface CallTranscript {
  id: string;
  callId: string;
  utterances: Utterance[];
  flaggedPhrases: FlaggedPhrase[];
  riskScore: number;
  confidence: number;
  riskTier: RiskTier;
}

export interface Utterance {
  speaker: "agent" | "patient";
  text: string;
  timestamp: number; // Seconds from call start
}

export interface FlaggedPhrase {
  text: string;
  category: string; // e.g., "medication_adherence", "symptom_worsening"
  reason: string; // Clinical explanation
  utteranceIndex: number; // Index in utterances array
}

// ─── Escalation and Stats Interfaces ─────────────────────────────────────────

export interface Escalation {
  id: string;
  dischargeId: string;
  patientName: string;
  diagnosisGroup: DiagnosisGroup;
  dischargeDateTime: string;
  riskScore: number;
  riskTier: RiskTier;
  confidence: number;
  callId: string;
  createdAt: string; // ISO 8601 datetime
}

export interface DashboardStats {
  todayDischarges: number;
  pendingCalls: number;
  activeEscalations: number;
  tierDistribution: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
  dailyVolume: DailyVolume[]; // Past 7 days
  completedToday: number; // Calls completed today (for tier distribution validation)
}

export interface DailyVolume {
  date: string; // ISO 8601 date
  count: number;
}

// ─── WebSocket Event Discriminated Union ──────────────────────────────────────

export type WebSocketEvent =
  | CallCompletedEvent
  | DischargeCreatedEvent
  | CallStartedEvent
  | EscalationTriggeredEvent;

export interface CallCompletedEvent {
  type: "call_completed";
  id: string; // Event UUID for deduplication
  callId: string;
  dischargeId: string;
  outcome: CallOutcome;
  riskScore: number;
  confidence: number;
  riskTier: RiskTier;
  timestamp: string; // ISO 8601 datetime
}

export interface DischargeCreatedEvent {
  type: "discharge_created";
  id: string;
  discharge: Discharge;
  timestamp: string;
}

export interface CallStartedEvent {
  type: "call_started";
  id: string;
  callId: string;
  dischargeId: string;
  timestamp: string;
}

export interface EscalationTriggeredEvent {
  type: "escalation_triggered";
  id: string;
  escalation: Escalation;
  timestamp: string;
}

// ─── API Envelope Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface ApiError {
  error: {
    message: string;
    code: string;
  };
}

// ─── Context Value Interfaces ─────────────────────────────────────────────────

export interface AuthContextValue {
  user: User | null; // Firebase User
  role: UserRole | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<string>;
}

export interface WebSocketContextValue {
  connected: boolean;
  reconnecting: boolean;
  connectionAttempts: number;
  lastEventId: string | null;
  /** ID of the most recent discharge_created event (changes each time a new discharge arrives) */
  lastDischargeCreatedId: string | null;
}
