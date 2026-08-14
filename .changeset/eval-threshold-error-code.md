---
'@cogenta/core': minor
---

Add one error code for L5's evaluation harness: `EVAL_THRESHOLD_NOT_MET`
(`assertEvalThreshold`'s suite mean score fell below the required
minimum — the mechanism a `*.eval.test.ts` file uses to fail CI on a
prompt or model regression).
