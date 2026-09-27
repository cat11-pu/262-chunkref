// gcrun.js：按回收预算去重与回收（预算整批共用；重放靠 applied 幂等）
import { addRef, releaseRef } from "./chunks.js";

function cloneState(state) {
  state = state || {};
  const docs = {};
  Object.keys(state.docs || {}).forEach(function (doc) {
    docs[doc] = state.docs[doc].slice();
  });
  return {
    docs: docs,
    refs: Object.assign({}, state.refs || {}),
    dead: (state.dead || []).slice(),
    garbage: (state.garbage || []).slice(),
    applied: (state.applied || []).slice()
  };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validateEvent(spec, event) {
  const bad = spec.event_error_code || "E_BAD_EVENT";
  if (!event || typeof event !== "object") fail(bad, "event is not an object");
  if (event.kind === "put") {
    if (typeof event.doc !== "string" || !Array.isArray(event.chunks)) fail(bad, "bad put event");
    return;
  }
  if (event.kind === "drop") {
    if (typeof event.doc !== "string") fail(bad, "bad drop event");
    return;
  }
  fail(bad, "unknown event kind");
}

function enqueueGarbage(state, chunk) {
  if (state.garbage.indexOf(chunk) === -1) state.garbage.push(chunk);
}

function applyEvent(spec, state, event) {
  if (event.kind === "put") {
    const old = state.docs[event.doc];
    if (old) {
      old.forEach(function (chunk) {
        if (releaseRef(state.refs, chunk) === 0) enqueueGarbage(state, chunk);
      });
    }
    const fresh = [];
    event.chunks.forEach(function (chunk) {
      if (fresh.indexOf(chunk) !== -1) return;
      fresh.push(chunk);
      const bin = state.garbage.indexOf(chunk);
      if (bin !== -1) state.garbage.splice(bin, 1);
      addRef(state.refs, chunk);
    });
    state.docs[event.doc] = fresh;
    return;
  }
  const chunks = state.docs[event.doc];
  if (!chunks) fail(spec.doc_error_code || "E_NO_DOC", "no such doc: " + event.doc);
  chunks.forEach(function (chunk) {
    if (releaseRef(state.refs, chunk) === 0) enqueueGarbage(state, chunk);
  });
  delete state.docs[event.doc];
}

function sweep(state, remaining) {
  let freed = 0;
  while (freed < remaining && state.garbage.length > 0) {
    const chunk = state.garbage.shift();
    if ((state.refs[chunk] || 0) > 0) continue;
    state.dead.push(chunk);
    freed += 1;
  }
  return freed;
}

export function step(spec) {
  const state = cloneState(spec.state);
  const events = spec.events || [];
  const applied = new Set(state.applied);
  let remaining = Math.max(0, Math.floor(Number(spec.budget) || 0));
  let gc = 0;
  let judged = 0;
  events.forEach(function (event) {
    if (event && typeof event === "object" && applied.has(event.id)) return;
    validateEvent(spec, event);
    applyEvent(spec, state, event);
    if (event.id !== undefined) {
      applied.add(event.id);
      state.applied.push(event.id);
    }
    judged += 1;
    const freed = sweep(state, remaining);
    remaining -= freed;
    gc += freed;
  });
  return { state: state, gc: gc, garbage_before: state.garbage.length,
           pending_chunks: state.garbage.slice(), judged: judged,
           judged_bound: events.length };
}

export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.garbage.length > 0) {
    const chunk = state.garbage.shift();
    if ((state.refs[chunk] || 0) > 0) continue;
    state.dead.push(chunk);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
