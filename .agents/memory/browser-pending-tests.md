---
name: Browser pending-state verification
description: Avoid false duplicate-request failures when browser tools wait between actions.
---

Verify loading and duplicate-request guards with a deferred network-response barrier, not a short fixed mock delay across separate browser actions.

**Why:** Browser action/observation calls can consume a short fixed delay before the next click. A legitimately completed response then looks like a missing loading state, and a valid subsequent request is mistaken for a duplicate.

**How to apply:** In a single script, hold the response unresolved, confirm the handler is waiting, inspect loading/disabled controls, and attempt a repeat action before releasing the barrier. Count requests before release. Do not infer pending state from a request counter alone.
