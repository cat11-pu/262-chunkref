// app.js：渲染结果
import { addRef, releaseRef } from "./chunks.js";
import { step, close } from "./gcrun.js";

export function render(spec) {
  const events = spec.events || [];
  const half = Math.ceil(events.length / 2);
  const first = step(spec);
  const closed = close(Object.assign({}, spec, { state: first.state }));
  const r1 = step(Object.assign({}, spec, { events: events.slice(0, half) }));
  const r2 = step(Object.assign({}, spec, { state: r1.state, events: events.slice(half) }));
  const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
  const replay = step(Object.assign({}, spec, { state: closed.state }));
  const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
  const full = step(Object.assign({}, spec, { budget: events.length + 2 }));
  const fullClosed = close(Object.assign({}, spec, { state: full.state }));
  const fingerprint = function (state) {
    return JSON.stringify({
      docs: state.docs, refs: state.refs, dead: state.dead, garbage: state.garbage,
      applied: state.applied.length
    });
  };
  const refs = Object.keys(closed.state.refs).sort().map(function (chunk) {
    return [chunk, closed.state.refs[chunk]];
  });
  return { refs: refs, live_count: refs.length, dead: closed.state.dead.slice(),
           gc_first: first.gc, gc_wide: wide.gc, pair_differs: first.gc !== wide.gc,
           garbage_before: first.garbage_before, garbage: first.pending_chunks,
           catchup: closed.catchup, garbage_after: closed.state.garbage.length,
           mid_differs: fingerprint(r2.state) !== fingerprint(first.state),
           closed_equal: fingerprint(closedTwo.state) === fingerprint(closed.state),
           replay_new: replay.gc, judged: first.judged, judged_bound: first.judged_bound,
           full_diff: fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1,
           count: events.length, tail: addRef({}, "A") + releaseRef({}, "A") };
}
