// gcrun.js：按回收预算清账（基线：一律给空表）
import { addRef, releaseRef } from "./chunks.js";

export function step(spec) {
  return { state: spec.state, gc: 0, garbage_before: 0, pending_chunks: [],
           judged: 0, judged_bound: 0 };
}

export function close(spec) {
  return { state: spec.state, catchup: 0 };
}
