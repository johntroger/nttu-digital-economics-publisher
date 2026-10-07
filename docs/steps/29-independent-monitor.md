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


## External trigger improvement — 2026-10-07

Observed GitHub schedule events at 02:30:35 and 06:14:13 Vietnam were successful but 223.6 minutes apart. Keep the same monitor code and add cron-job.org as an independent source of workflow_dispatch requests. The service sends only a fixed main/monitor payload every 30 minutes; GitHub retains cloud/Telegram credentials and all decision/deduplication logic. The external service requires a dedicated, expiring fine-grained GitHub token with Actions:write on this one repository. GitHub does not scope Actions permission to a single workflow. Do not use the existing Git account credential or grant code/secret administration permissions. The owner creates and enters the new credential directly; no credential is stored in the repository, request body or chat. Provider credential storage must be considered before entering it (cron-job.org documents plaintext authentication storage).

The new workflow inputs record cron-job.org's Unix request timestamp. Source and timestamp are validated; missing/unexpanded/future or more-than-one-day-old timestamps are rejected. Checkpoint/log metadata records request/check times and lag. More than 10 minutes of external queue delay or more than 75 minutes between monitor checks creates an immediate deduplicated Telegram incident. This detects gaps when execution resumes; it cannot report during a complete loss of execution. No external input can approve a Facebook post.

Retain the original GitHub schedule until the independent provider passes acceptance. Set MONITOR_EXTERNAL_PRIMARY=true only afterward: the old half-hour GitHub schedule then skips without allocating a runner, with separate best-effort fallback checks at UTC 02:23 and 14:23. This limits duplicate runs and Actions consumption. The external monitor still uses the shared concurrency group/checkpoint, so overlap does not repeat incident notifications. Keep the external job enabled only while its token is valid; renew/revoke through the owner's GitHub settings and enable provider failure notification to detect a rejected dispatch. No paid quota or service is enabled.

Acceptance requires actual cron-job.org requests and resulting GitHub executions, not a manually forged source label. Verify provider planned/actual times, GitHub source/request/start metadata, delay and checkpoint, and at least consecutive scheduled executions. A dispatch HTTP success alone is not successful monitoring. Preserve the publishing configuration/history and first observe the cadence before claiming stable operation. Cron-job.org scheduling and GitHub runner availability remain best effort.

External request template: node export externalTriggerTemplate from scripts/monitor.mjs; Authorization is intentionally omitted and must be entered privately by the owner. Method POST, JSON body on main with send_test=false, trigger_source=cron-job.org, triggered_at=%cjo:unixtime%. The provider's expanded timestamp is checked in acceptance. Disable response saving and public status pages; do not include credentials in URL/body.

References: https://cron-job.org/en/faq/, https://cron-job.org/en/privacy/, https://docs.cron-job.org/rest-api.html, https://docs.beta.cron-job.org/creating-cron-jobs.html, https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event.
