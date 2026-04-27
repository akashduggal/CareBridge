/**
 * Mock event emitter for Demo Mode (Task 17.6).
 *
 * When `?demo=true` is active, the WebSocketProvider subscribes to this emitter
 * instead of opening a real WebSocket connection. The DemoPanel fires scenario
 * events through this emitter so they flow through the same handleEvent pipeline
 * as real WebSocket messages, updating the TanStack Query cache identically.
 *
 * Requirements 8.11, 8.12 (Demo Mode network isolation)
 */

import type { WebSocketEvent } from '@/types'

type EventHandler = (event: WebSocketEvent) => void

/**
 * A minimal pub/sub emitter that mimics the message-delivery surface of a
 * WebSocket without making any network connections.
 *
 * Usage:
 *   mockEventEmitter.on(handler)   — subscribe
 *   mockEventEmitter.off(handler)  — unsubscribe
 *   mockEventEmitter.emit(event)   — dispatch to all subscribers
 */
class MockEventEmitter {
  private handlers: Set<EventHandler> = new Set()

  /** Subscribe a handler to receive WebSocket-like events. */
  on(handler: EventHandler): void {
    this.handlers.add(handler)
  }

  /** Unsubscribe a previously registered handler. */
  off(handler: EventHandler): void {
    this.handlers.delete(handler)
  }

  /**
   * Dispatch an event to all registered handlers.
   * Errors thrown by individual handlers are caught and logged so one bad
   * handler cannot prevent others from receiving the event.
   */
  emit(event: WebSocketEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event)
      } catch (err) {
        console.error('[MockEventEmitter] Handler threw an error:', err)
      }
    }
  }

  /** Remove all handlers (useful for cleanup in tests). */
  clear(): void {
    this.handlers.clear()
  }

  /** Returns the number of currently registered handlers (useful for tests). */
  get listenerCount(): number {
    return this.handlers.size
  }
}

/**
 * Singleton mock emitter shared between WebSocketProvider and DemoPanel.
 * Both modules import this same instance so events fired by DemoPanel are
 * received by WebSocketProvider's handleEvent pipeline.
 */
export const mockEventEmitter = new MockEventEmitter()

// ─── Scenario event factories ─────────────────────────────────────────────────
// Each factory returns a WebSocketEvent appropriate for the given demo scenario.
// These are fired by DemoPanel when a scenario is activated.

import type { DemoScenario } from '@/components/DemoPanel'
import { DEMO_SCENARIOS } from '@/mocks/demoScenarios'

/**
 * Build the WebSocket event(s) that represent the "live" activity for a given
 * demo scenario. Returns an array so scenarios can emit multiple events.
 */
export function buildScenarioEvents(scenario: DemoScenario): WebSocketEvent[] {
  const data = DEMO_SCENARIOS[scenario]

  switch (scenario) {
    case 'happy-path-chf':
      // Simulate a completed low-risk call
      return [
        {
          type: 'call_completed',
          id: `demo-evt-chf-${Date.now()}`,
          callId: data.call.id,
          dischargeId: data.discharge.id,
          outcome: data.call.outcome,
          riskScore: data.call.riskScore ?? 2,
          confidence: data.call.confidence ?? 0.91,
          riskTier: 1,
          timestamp: new Date().toISOString(),
        },
      ]

    case 'medium-risk-copd':
      // Simulate a completed medium-risk call
      return [
        {
          type: 'call_completed',
          id: `demo-evt-copd-${Date.now()}`,
          callId: data.call.id,
          dischargeId: data.discharge.id,
          outcome: data.call.outcome,
          riskScore: data.call.riskScore ?? 5,
          confidence: data.call.confidence ?? 0.78,
          riskTier: 2,
          timestamp: new Date().toISOString(),
        },
      ]

    case 'emergency-chest-pain': {
      // Simulate a completed high-risk call followed by an escalation
      const escalation = data.escalation!
      return [
        {
          type: 'call_completed',
          id: `demo-evt-ami-call-${Date.now()}`,
          callId: data.call.id,
          dischargeId: data.discharge.id,
          outcome: data.call.outcome,
          riskScore: data.call.riskScore ?? 9,
          confidence: data.call.confidence ?? 0.85,
          riskTier: 3,
          timestamp: new Date().toISOString(),
        },
        {
          type: 'escalation_triggered',
          id: `demo-evt-ami-esc-${Date.now()}`,
          escalation,
          timestamp: new Date().toISOString(),
        },
      ]
    }

    default:
      return []
  }
}
