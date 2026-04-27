/**
 * Demo Mode scenario mock data.
 *
 * Three pre-configured scenarios used by DemoPanel (Task 17.3):
 *   - "Happy Path CHF":      Tier 1, Risk Score 2, completed call
 *   - "Medium Risk COPD":    Tier 2, Risk Score 5, completed call
 *   - "Emergency Chest Pain": Tier 3, Risk Score 9, completed call, active escalation
 *
 * Requirements 8.4–8.8 (Demo Mode scenarios)
 */

import type {
  Patient,
  Discharge,
  Call,
  CallTranscript,
  Escalation,
  DashboardStats,
  DailyVolume,
  ApiResponse,
} from '@/types'
import type { DemoScenario } from '@/components/DemoPanel'

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Fixed reference date used throughout mock data so values stay consistent. */
const BASE_DATE = '2026-04-24'

function isoDate(offsetDays: number): string {
  const d = new Date(`${BASE_DATE}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

function isoDateTime(offsetDays: number, hour = 10, minute = 0): string {
  const d = new Date(`${BASE_DATE}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString()
}

/** Builds a 7-day daily-volume array ending on BASE_DATE. */
function buildDailyVolume(counts: [number, number, number, number, number, number, number]): DailyVolume[] {
  return counts.map((count, i) => ({
    date: isoDate(i - 6),
    count,
  }))
}

// ─── Scenario: Happy Path CHF ─────────────────────────────────────────────────
// Tier 1 · Risk Score 2 · Completed call · No escalation

const happyPathPatient: Patient = {
  id: 'demo-patient-chf-001',
  name: 'Margaret Thompson',
  dateOfBirth: '1948-03-15',
  lastDischargeDate: isoDateTime(-1, 8, 30),
}

const happyPathDischarge: Discharge = {
  id: 'demo-discharge-chf-001',
  patientId: 'demo-patient-chf-001',
  patientName: 'Margaret Thompson',
  diagnosisGroup: 'CHF',
  icd10Code: 'I50.9',
  dischargeDateTime: isoDateTime(-1, 8, 30),
  medications: [
    { name: 'Furosemide', dose: '40 mg', frequency: 'Once daily', newMed: false },
    { name: 'Lisinopril', dose: '10 mg', frequency: 'Once daily', newMed: false },
    { name: 'Carvedilol', dose: '6.25 mg', frequency: 'Twice daily', newMed: true },
  ],
  riskLevel: 'low',
  callStatus: 'completed',
  riskScore: 2,
  riskTier: 1,
  confidence: 0.91,
}

const happyPathCallTranscript: CallTranscript = {
  id: 'demo-transcript-chf-001',
  callId: 'demo-call-chf-001',
  utterances: [
    { speaker: 'agent', text: 'Hello, may I speak with Margaret Thompson?', timestamp: 0 },
    { speaker: 'patient', text: 'Yes, this is Margaret.', timestamp: 4 },
    { speaker: 'agent', text: 'Hi Margaret, I\'m calling to check in after your recent hospital stay. How are you feeling today?', timestamp: 6 },
    { speaker: 'patient', text: 'I\'m feeling much better, thank you. I\'ve been taking all my medications as prescribed.', timestamp: 14 },
    { speaker: 'agent', text: 'That\'s great to hear. Have you noticed any swelling in your legs or ankles?', timestamp: 22 },
    { speaker: 'patient', text: 'No, the swelling has gone down quite a bit since I started the new water pill.', timestamp: 28 },
    { speaker: 'agent', text: 'Excellent. Are you following the low-sodium diet your care team recommended?', timestamp: 38 },
    { speaker: 'patient', text: 'Yes, my daughter has been helping me with meals. We\'ve been very careful about salt.', timestamp: 44 },
    { speaker: 'agent', text: 'Wonderful. Do you have a follow-up appointment scheduled with your cardiologist?', timestamp: 54 },
    { speaker: 'patient', text: 'Yes, I have an appointment next Tuesday at 2 PM.', timestamp: 60 },
    { speaker: 'agent', text: 'Perfect. Is there anything else you\'d like to discuss or any concerns you have?', timestamp: 68 },
    { speaker: 'patient', text: 'No, I think I\'m doing well. Thank you for calling.', timestamp: 74 },
    { speaker: 'agent', text: 'You\'re very welcome, Margaret. Take care and don\'t hesitate to call if anything changes.', timestamp: 80 },
  ],
  flaggedPhrases: [
    {
      text: 'new water pill',
      category: 'medication_adherence',
      reason: 'Patient refers to Furosemide informally; confirms adherence to new diuretic therapy.',
      utteranceIndex: 5,
    },
  ],
  riskScore: 2,
  confidence: 0.91,
  riskTier: 1,
}

const happyPathCall: Call = {
  id: 'demo-call-chf-001',
  dischargeId: 'demo-discharge-chf-001',
  startTime: isoDateTime(0, 9, 0),
  endTime: isoDateTime(0, 9, 2),
  outcome: 'completed',
  riskScore: 2,
  confidence: 0.91,
  transcript: happyPathCallTranscript,
}

const happyPathStats: DashboardStats = {
  todayDischarges: 4,
  pendingCalls: 2,
  activeEscalations: 1,
  tierDistribution: { tier1: 3, tier2: 1, tier3: 0 },
  dailyVolume: buildDailyVolume([3, 5, 4, 6, 3, 5, 4]),
  completedToday: 4,
}

// ─── Scenario: Medium Risk COPD ───────────────────────────────────────────────
// Tier 2 · Risk Score 5 · Completed call · No escalation

const mediumRiskPatient: Patient = {
  id: 'demo-patient-copd-001',
  name: 'Robert Nguyen',
  dateOfBirth: '1955-07-22',
  lastDischargeDate: isoDateTime(-2, 14, 0),
}

const mediumRiskDischarge: Discharge = {
  id: 'demo-discharge-copd-001',
  patientId: 'demo-patient-copd-001',
  patientName: 'Robert Nguyen',
  diagnosisGroup: 'COPD',
  icd10Code: 'J44.1',
  dischargeDateTime: isoDateTime(-2, 14, 0),
  medications: [
    { name: 'Tiotropium', dose: '18 mcg', frequency: 'Once daily (inhaled)', newMed: false },
    { name: 'Albuterol', dose: '90 mcg', frequency: 'As needed', newMed: false },
    { name: 'Prednisone', dose: '40 mg', frequency: 'Once daily (taper)', newMed: true },
    { name: 'Azithromycin', dose: '250 mg', frequency: 'Once daily × 5 days', newMed: true },
  ],
  riskLevel: 'medium',
  callStatus: 'completed',
  riskScore: 5,
  riskTier: 2,
  confidence: 0.78,
}

const mediumRiskCallTranscript: CallTranscript = {
  id: 'demo-transcript-copd-001',
  callId: 'demo-call-copd-001',
  utterances: [
    { speaker: 'agent', text: 'Hello, may I speak with Robert Nguyen?', timestamp: 0 },
    { speaker: 'patient', text: 'Speaking.', timestamp: 4 },
    { speaker: 'agent', text: 'Hi Robert, I\'m calling to follow up after your recent hospital stay for COPD. How are you breathing today?', timestamp: 6 },
    { speaker: 'patient', text: 'Still a bit short of breath when I walk around, but better than when I was admitted.', timestamp: 16 },
    { speaker: 'agent', text: 'I understand. Are you using your inhalers as prescribed?', timestamp: 26 },
    { speaker: 'patient', text: 'I\'ve been using the rescue inhaler more than usual, maybe three or four times a day.', timestamp: 32 },
    { speaker: 'agent', text: 'Have you been able to complete the steroid taper as directed?', timestamp: 44 },
    { speaker: 'patient', text: 'I think so, but I sometimes forget the morning dose.', timestamp: 50 },
    { speaker: 'agent', text: 'Are you experiencing any increased cough or change in sputum color?', timestamp: 58 },
    { speaker: 'patient', text: 'The cough is still there. The mucus has been yellowish.', timestamp: 64 },
    { speaker: 'agent', text: 'Do you have a follow-up appointment scheduled?', timestamp: 74 },
    { speaker: 'patient', text: 'I have one in two weeks, but I\'m not sure I can make it — I don\'t have a ride.', timestamp: 80 },
    { speaker: 'agent', text: 'I\'ll flag that for your care team so they can help arrange transportation.', timestamp: 92 },
    { speaker: 'patient', text: 'That would be helpful, thank you.', timestamp: 98 },
  ],
  flaggedPhrases: [
    {
      text: 'rescue inhaler more than usual, maybe three or four times a day',
      category: 'symptom_worsening',
      reason: 'Increased rescue inhaler use (>2×/day) indicates worsening bronchospasm and potential COPD exacerbation.',
      utteranceIndex: 5,
    },
    {
      text: 'sometimes forget the morning dose',
      category: 'medication_adherence',
      reason: 'Inconsistent steroid taper adherence increases risk of rebound inflammation and readmission.',
      utteranceIndex: 7,
    },
    {
      text: 'mucus has been yellowish',
      category: 'symptom_worsening',
      reason: 'Purulent sputum suggests possible bacterial infection requiring clinical evaluation.',
      utteranceIndex: 9,
    },
    {
      text: 'not sure I can make it — I don\'t have a ride',
      category: 'social_determinants',
      reason: 'Transportation barrier may prevent follow-up appointment attendance, increasing readmission risk.',
      utteranceIndex: 11,
    },
  ],
  riskScore: 5,
  confidence: 0.78,
  riskTier: 2,
}

const mediumRiskCall: Call = {
  id: 'demo-call-copd-001',
  dischargeId: 'demo-discharge-copd-001',
  startTime: isoDateTime(0, 10, 15),
  endTime: isoDateTime(0, 10, 17),
  outcome: 'completed',
  riskScore: 5,
  confidence: 0.78,
  transcript: mediumRiskCallTranscript,
}

const mediumRiskStats: DashboardStats = {
  todayDischarges: 6,
  pendingCalls: 3,
  activeEscalations: 1,
  tierDistribution: { tier1: 2, tier2: 3, tier3: 1 },
  dailyVolume: buildDailyVolume([4, 6, 5, 7, 4, 6, 6]),
  completedToday: 6,
}

// ─── Scenario: Emergency Chest Pain ──────────────────────────────────────────
// Tier 3 · Risk Score 9 · Completed call · Active escalation

const emergencyPatient: Patient = {
  id: 'demo-patient-ami-001',
  name: 'James Okafor',
  dateOfBirth: '1962-11-08',
  lastDischargeDate: isoDateTime(-1, 16, 45),
}

const emergencyDischarge: Discharge = {
  id: 'demo-discharge-ami-001',
  patientId: 'demo-patient-ami-001',
  patientName: 'James Okafor',
  diagnosisGroup: 'AMI',
  icd10Code: 'I21.9',
  dischargeDateTime: isoDateTime(-1, 16, 45),
  medications: [
    { name: 'Aspirin', dose: '81 mg', frequency: 'Once daily', newMed: false },
    { name: 'Clopidogrel', dose: '75 mg', frequency: 'Once daily', newMed: true },
    { name: 'Atorvastatin', dose: '80 mg', frequency: 'Once daily at bedtime', newMed: true },
    { name: 'Metoprolol succinate', dose: '25 mg', frequency: 'Once daily', newMed: true },
    { name: 'Lisinopril', dose: '5 mg', frequency: 'Once daily', newMed: true },
  ],
  riskLevel: 'high',
  callStatus: 'completed',
  riskScore: 9,
  riskTier: 3,
  confidence: 0.85,
}

const emergencyCallTranscript: CallTranscript = {
  id: 'demo-transcript-ami-001',
  callId: 'demo-call-ami-001',
  utterances: [
    { speaker: 'agent', text: 'Hello, may I speak with James Okafor?', timestamp: 0 },
    { speaker: 'patient', text: 'Yeah, that\'s me.', timestamp: 4 },
    { speaker: 'agent', text: 'Hi James, I\'m calling to check in after your recent hospital stay. How are you feeling?', timestamp: 6 },
    { speaker: 'patient', text: 'Not great, honestly. I\'ve been having chest tightness since this morning.', timestamp: 14 },
    { speaker: 'agent', text: 'I\'m sorry to hear that. Can you describe the chest tightness — is it constant or does it come and go?', timestamp: 24 },
    { speaker: 'patient', text: 'It comes and goes. It\'s not as bad as when I had the heart attack, but it\'s worrying me.', timestamp: 32 },
    { speaker: 'agent', text: 'Are you taking all five of your new medications as prescribed?', timestamp: 44 },
    { speaker: 'patient', text: 'I stopped taking the blood thinner yesterday because I read online it can cause bleeding.', timestamp: 50 },
    { speaker: 'agent', text: 'Have you experienced any shortness of breath or dizziness along with the chest tightness?', timestamp: 62 },
    { speaker: 'patient', text: 'Yes, I got dizzy when I stood up this morning and I\'ve been short of breath walking to the bathroom.', timestamp: 68 },
    { speaker: 'agent', text: 'James, these symptoms are serious. I\'m going to flag this for immediate clinical review. Do you have someone with you right now?', timestamp: 82 },
    { speaker: 'patient', text: 'My wife is here.', timestamp: 94 },
    { speaker: 'agent', text: 'Good. Please do not drive yourself. Your care team will be contacting you very shortly. If symptoms worsen, call 911 immediately.', timestamp: 98 },
    { speaker: 'patient', text: 'Okay, I understand. Thank you.', timestamp: 114 },
  ],
  flaggedPhrases: [
    {
      text: 'chest tightness since this morning',
      category: 'symptom_worsening',
      reason: 'New onset chest tightness within 24 hours of AMI discharge is a high-risk indicator for re-infarction or unstable angina.',
      utteranceIndex: 3,
    },
    {
      text: 'not as bad as when I had the heart attack',
      category: 'symptom_worsening',
      reason: 'Patient self-compares current symptoms to prior MI event, suggesting possible recurrent ischemia.',
      utteranceIndex: 5,
    },
    {
      text: 'stopped taking the blood thinner yesterday',
      category: 'medication_adherence',
      reason: 'Clopidogrel discontinuation within 30 days of AMI significantly increases stent thrombosis and re-infarction risk.',
      utteranceIndex: 7,
    },
    {
      text: 'dizzy when I stood up this morning',
      category: 'symptom_worsening',
      reason: 'Orthostatic dizziness may indicate hemodynamic instability or medication side effect requiring evaluation.',
      utteranceIndex: 9,
    },
    {
      text: 'short of breath walking to the bathroom',
      category: 'symptom_worsening',
      reason: 'Dyspnea on minimal exertion post-AMI suggests possible acute heart failure or reduced ejection fraction.',
      utteranceIndex: 9,
    },
  ],
  riskScore: 9,
  confidence: 0.85,
  riskTier: 3,
}

const emergencyCall: Call = {
  id: 'demo-call-ami-001',
  dischargeId: 'demo-discharge-ami-001',
  startTime: isoDateTime(0, 11, 30),
  endTime: isoDateTime(0, 11, 32),
  outcome: 'completed',
  riskScore: 9,
  confidence: 0.85,
  transcript: emergencyCallTranscript,
}

const emergencyEscalation: Escalation = {
  id: 'demo-escalation-ami-001',
  dischargeId: 'demo-discharge-ami-001',
  patientName: 'James Okafor',
  diagnosisGroup: 'AMI',
  dischargeDateTime: isoDateTime(-1, 16, 45),
  riskScore: 9,
  riskTier: 3,
  confidence: 0.85,
  callId: 'demo-call-ami-001',
  createdAt: isoDateTime(0, 11, 33),
}

const emergencyStats: DashboardStats = {
  todayDischarges: 7,
  pendingCalls: 4,
  activeEscalations: 2,
  tierDistribution: { tier1: 2, tier2: 2, tier3: 3 },
  dailyVolume: buildDailyVolume([5, 7, 6, 8, 5, 7, 7]),
  completedToday: 7,
}

// ─── Scenario Data Shape ──────────────────────────────────────────────────────

export interface ScenarioData {
  /** Primary patient record */
  patient: Patient
  /** Primary discharge record */
  discharge: Discharge
  /** Primary call record (with embedded transcript) */
  call: Call
  /** Active escalation — only present for "Emergency Chest Pain" */
  escalation?: Escalation
  /** Dashboard stats reflecting this scenario's state */
  stats: DashboardStats
  /** All patients for the patient list page */
  patients: ApiResponse<Patient[]>
  /** All discharges for the discharge queue */
  discharges: ApiResponse<Discharge[]>
  /** All escalations for the escalation page */
  escalations: ApiResponse<Escalation[]>
  /** Discharge history for the primary patient (PatientDetailPage) */
  patientDischarges: ApiResponse<Discharge[]>
  /** Calls for the primary discharge (DischargeQueuePage drawer) */
  dischargeCalls: ApiResponse<Call[]>
}

// ─── Escalation entries for non-emergency scenarios ──────────────────────────

/**
 * Happy Path CHF — Tier 1, low confidence (0.48).
 * Confidence below 0.6 routes this to the Human Review section so clinical
 * staff can verify the low-risk assessment before closing the case.
 */
const happyPathEscalation: Escalation = {
  id: 'demo-escalation-chf-001',
  dischargeId: 'demo-discharge-chf-001',
  patientName: 'Margaret Thompson',
  diagnosisGroup: 'CHF',
  dischargeDateTime: isoDateTime(-1, 8, 30),
  riskScore: 2,
  riskTier: 1,
  confidence: 0.48,
  callId: 'demo-call-chf-001',
  createdAt: isoDateTime(0, 9, 5),
}

/**
 * Medium Risk COPD — Tier 2, confidence 0.78.
 * Routes to the Tier 2 Callback Queue for nurse follow-up.
 */
const mediumRiskEscalation: Escalation = {
  id: 'demo-escalation-copd-001',
  dischargeId: 'demo-discharge-copd-001',
  patientName: 'Robert Nguyen',
  diagnosisGroup: 'COPD',
  dischargeDateTime: isoDateTime(-2, 14, 0),
  riskScore: 5,
  riskTier: 2,
  confidence: 0.78,
  callId: 'demo-call-copd-001',
  createdAt: isoDateTime(0, 10, 20),
}

// ─── Scenario Registry ────────────────────────────────────────────────────────

export const DEMO_SCENARIOS: Record<DemoScenario, ScenarioData> = {
  'happy-path-chf': {
    patient: happyPathPatient,
    discharge: happyPathDischarge,
    call: happyPathCall,
    escalation: happyPathEscalation,
    stats: happyPathStats,
    patients: {
      data: [happyPathPatient],
      meta: { page: 1, limit: 25, total: 1 },
    },
    discharges: {
      data: [happyPathDischarge],
      meta: { page: 1, limit: 25, total: 1 },
    },
    escalations: {
      data: [happyPathEscalation],
      meta: { page: 1, limit: 25, total: 1 },
    },
    patientDischarges: {
      data: [happyPathDischarge],
      meta: { page: 1, limit: 25, total: 1 },
    },
    dischargeCalls: {
      data: [happyPathCall],
      meta: { page: 1, limit: 25, total: 1 },
    },
  },

  'medium-risk-copd': {
    patient: mediumRiskPatient,
    discharge: mediumRiskDischarge,
    call: mediumRiskCall,
    escalation: mediumRiskEscalation,
    stats: mediumRiskStats,
    patients: {
      data: [mediumRiskPatient],
      meta: { page: 1, limit: 25, total: 1 },
    },
    discharges: {
      data: [mediumRiskDischarge],
      meta: { page: 1, limit: 25, total: 1 },
    },
    escalations: {
      data: [mediumRiskEscalation],
      meta: { page: 1, limit: 25, total: 1 },
    },
    patientDischarges: {
      data: [mediumRiskDischarge],
      meta: { page: 1, limit: 25, total: 1 },
    },
    dischargeCalls: {
      data: [mediumRiskCall],
      meta: { page: 1, limit: 25, total: 1 },
    },
  },

  'emergency-chest-pain': {
    patient: emergencyPatient,
    discharge: emergencyDischarge,
    call: emergencyCall,
    escalation: emergencyEscalation,
    stats: emergencyStats,
    patients: {
      data: [emergencyPatient],
      meta: { page: 1, limit: 25, total: 1 },
    },
    discharges: {
      data: [emergencyDischarge],
      meta: { page: 1, limit: 25, total: 1 },
    },
    escalations: {
      data: [emergencyEscalation],
      meta: { page: 1, limit: 25, total: 1 },
    },
    patientDischarges: {
      data: [emergencyDischarge],
      meta: { page: 1, limit: 25, total: 1 },
    },
    dischargeCalls: {
      data: [emergencyCall],
      meta: { page: 1, limit: 25, total: 1 },
    },
  },
}
