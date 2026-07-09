export const ANALYTICS_EVENT_TYPES = [
  "recommendations_generated",
  "feedback_given",
  "spotify_sync_completed",
  "search_performed",
  "search_result_click",
  "reservation_created",
  "price_drop_email_click",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/** Event types safe to log directly from client-side code via
 * `POST /api/analytics/event`. Everything else is logged server-side inline
 * from the route/service that already knows the relevant context (avoids a
 * client being able to forge, say, a `reservation_created` event). */
export const CLIENT_LOGGABLE_EVENT_TYPES: readonly AnalyticsEventType[] = [
  "search_result_click",
];
