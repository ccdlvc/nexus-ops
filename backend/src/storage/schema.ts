/**
 * @module storage/schema
 * @description Drizzle ORM PostgreSQL schema: table definitions, enums, and inferred types.
 *
 * Tables:
 *   incidents   – AI-generated incident cards with root cause, fixes, correlations.
 *   alert_rules – Configurable threshold rules evaluated every 2 minutes.
 *   alerts      – Triggered alert instances; resolvedAt IS NULL = active.
 *                 alert.incidentId FK links each alert to its incident so that
 *                 resolving an incident can cascade to close its alerts.
 *
 * Indexes speed up the most common queries: createdAt (list order), status
 * (filter), triggeredAt (recency check), ruleId (dedup), resolvedAt (active set).
 */
import {
  pgTable,
  pgEnum,
  text,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const severityEnum  = pgEnum('severity',  ['critical', 'high', 'medium', 'low', 'info']);
export const statusEnum    = pgEnum('status',    ['open', 'investigating', 'resolved', 'suppressed']);
export const conditionEnum = pgEnum('condition', ['gt', 'gte', 'lt', 'lte', 'eq']);
export const sourceEnum    = pgEnum('source',    ['jenkins', 'kibana', 'github', 'portainer', 'aws', 'gcp', 'azure', 'grafana']);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const incidents = pgTable('incidents', {
  id:              text('id').primaryKey(),
  title:           text('title').notNull(),
  summary:         text('summary').notNull(),
  severity:        severityEnum('severity').notNull(),
  status:          statusEnum('status').notNull().default('open'),
  rootCause:       text('root_cause').notNull(),
  fixes:           jsonb('fixes').notNull().default([]),
  correlations:    jsonb('correlations').notNull().default([]),
  affectedServices:jsonb('affected_services').notNull().default([]),
  tags:            jsonb('tags').notNull().default([]),
  rawData:         jsonb('raw_data'),
  githubIssueUrl:  text('github_issue_url'),
  slackThreadUrl:  text('slack_thread_url'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_incidents_created').on(t.createdAt),
  index('idx_incidents_status').on(t.status),
]);

export const alertRules = pgTable('alert_rules', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  source:    sourceEnum('source').notNull(),
  metric:    text('metric').notNull(),
  condition: conditionEnum('condition').notNull(),
  threshold: real('threshold').notNull(),
  severity:  severityEnum('severity').notNull(),
  message:   text('message').notNull(),
  enabled:   boolean('enabled').notNull().default(true),
});

export const alerts = pgTable('alerts', {
  id:           text('id').primaryKey(),
  ruleId:       text('rule_id').notNull(),
  ruleName:     text('rule_name').notNull(),
  severity:     severityEnum('severity').notNull(),
  source:       sourceEnum('source').notNull(),
  message:      text('message').notNull(),
  value:        real('value').notNull(),
  threshold:    real('threshold').notNull(),
  triggeredAt:  timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt:   timestamp('resolved_at',  { withTimezone: true }),
  acknowledged: boolean('acknowledged').notNull().default(false),
  incidentId:   text('incident_id').references(() => incidents.id),
}, (t) => [
  index('idx_alerts_triggered').on(t.triggeredAt),
  index('idx_alerts_rule_id').on(t.ruleId),
  index('idx_alerts_resolved').on(t.resolvedAt),
]);

// ─── Inferred row types ───────────────────────────────────────────────────────

export type Incident  = typeof incidents.$inferSelect;
export type AlertRule = typeof alertRules.$inferSelect;
export type AlertRow  = typeof alerts.$inferSelect;
