# Bước 28 — chạy lịch thử gần nhất

Owner authorizes one scheduled trial on Tập Viết at the nearest practical cron-aligned time rather than waiting for 10:00. The same daily publisher prepares five minutes before due time and runs on the five-minute cloud heartbeat.

A first-time schedule may contain `testPublishAt`: five-minute aligned, at least ten minutes ahead, within 24 hours, on the selected Vietnam start date. It is restricted to the existing staging test Page. This exception is cleared atomically with a confirmed publication. Subsequent days use the fixed 10:00 Vietnam policy. An ambiguous result retains the exception and existing reconciliation guards; it never permits another blind POST.

The daily selector also includes already published content trials in its used-post history, avoiding a repeat of P01. The first planned P01 slot may therefore consume an approved reserve under the existing fallback rules. Its future prerequisites must be backed by actual publication history before use.

Corrected the existing request UUID validator to recognize the standard five UUID groups. Added tests for one-time timing and return to 10:00, rejection of invalid or insufficiently distant times, and skipping a published content trial. Existing concurrent intent, retry, snapshot and daily dedup tests remain required.

Deployment alone does not enable posting. After CI and deployment checks, open the deployment gate, configure through owner Google session, activate the schedule, verify the cloud job and Facebook readback, then verify Telegram delivery and cleared test override. Never publish to the official Page as part of this test.
