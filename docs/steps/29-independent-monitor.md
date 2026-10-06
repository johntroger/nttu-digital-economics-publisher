# Bước 29 — giám sát độc lập qua GitHub Actions

Owner approved this step on 2026-10-06 after the enabled staging schedule and UI follow-up were verified. This step keeps Tập Viết and the daily 10:00 Vietnam schedule intact. It does not authorize publishing to the official Page.

## Operation

The independent workflow runs on main at UTC minutes 17 and 47, or by manual dispatch. It has no npm dependency installation, deploy, Facebook adapter or cloud mutation. It reads public health, private staging status and one fixed SELECT through the Cloudflare D1 API. That SELECT reads heartbeat, schedule controls and aggregates of daily publication/unknown jobs for the configured connection. Manual posts, other Pages and prior-day successes cannot satisfy today's daily publication. Unknown prior-day jobs still block the Page and must be reconciled.

Heartbeat older than 20 minutes, cloud identity/unavailability, private status/D1 failures and conflicting schedule controls are observed. Infrastructure incidents need two checks at least five minutes apart before Telegram. A day past its due time plus 20 minutes without a confirmed automatic publication raises a late/unknown incident immediately. The one-time test override is respected. User-paused schedules and future start dates do not generate overdue alerts. A probe outage cannot falsely clear unresolved incidents whose source was unavailable.

GitHub scheduled execution is best effort; queue delay or dropped runs can delay alerts. An hourly boundary is avoided but no maximum alert latency is promised. The monitor does not monitor GitHub from a third provider. 48 Linux runs/day can consume a substantial share of a free account's Actions minutes; inspect account usage and adjust the cadence if necessary. No paid service is activated.

## Durable incident delivery

A single pinned issue in the private repository stores only schema version, fixed incident codes, counters, timestamps and Telegram message IDs. The Actions token has contents:read and issues:write, no Cloudflare deployment or code-write permission through that token. A concurrency group serializes runs. The configured bot/chat, repository, account, database and staging origin are fixed to the existing project.

Before sending Telegram, all selected incidents are saved as intent in the issue. A success stores delivered; timeout/crash leaves unknown/intent; a definite Telegram rejection leaves rejected. None of these is automatically re-sent during the same incident. A checkpoint failure prevents sending. If delivery is uncertain the workflow fails visibly; inspect the bot conversation and checkpoint before any deliberate reset to pending. Do not edit the checkpoint while a run is active. A failed monitor can report neither its own complete loss of GitHub nor a total outage of both GitHub and Telegram.

Resolved incidents are removed on successful observation and a later recurrence starts a new episode. Healthy runs send nothing. Manual send_test adds a clearly labeled test incident; re-running while that test episode remains does not send it again. A normal healthy run clears the test episode.

## Setup and acceptance

Existing deployment secrets are reused for health and D1 reading; store the existing bot token separately as repository Secret MONITOR_TELEGRAM_BOT_TOKEN. Never put it into a variable, issue, commit or chat. Repository variables MONITOR_STATE_ISSUE, MONITOR_TELEGRAM_CHAT_ID and MONITOR_ENABLED control the external workflow. Start disabled, pass code/CI checks, enable, then dispatch one labeled monitor test and verify its checkpoint/message ID. Run normally afterward and verify no new message, no change in schedule, and no new Facebook publication.

Deployment preflight allows only these exact external monitor files and their tests/runbook while publishing is active. They are outside the Worker bundle. Backend, schema, build and dependency changes remain blocked. Active deployment preserves the existing state, skips migrations and session secret initialization, and verifies the same enabled/paused pair.

Local tests cover Vietnam due/grace/test/future/paused behavior, infrastructure and config failures, confirmed vs unknown daily outcomes, two observations, deduplication, unobserved-incident retention, invalid checkpoints, the actual SELECT against SQLite, intent-before-send, timeout/rejection/crash/checkpoint failure, fixed destinations and private request headers. CI runs these on Windows/Linux plus the existing Workers/D1 suite.

Sources: [GitHub scheduling limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [D1 SELECT via query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/), [GitHub issue update permissions](https://docs.github.com/en/rest/issues/issues).
