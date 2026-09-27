// gcrun.js：写文档先减旧引用再加新引用，零引用块入待回收账，
// 按整批共用的回收预算回收；预算用尽则把账压到下一轮，收尾不限预算清账。
import { addRef, releaseRef } from "./chunks.js";

function gcError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cloneState(state) {
  const src = state || {};
  return {
    docs: Object.assign({}, src.docs),
    refs: Object.assign({}, src.refs),
    dead: Array.isArray(src.dead) ? src.dead.slice() : [],
    garbage: Array.isArray(src.garbage) ? src.garbage.slice() : [],
    applied: Array.isArray(src.applied) ? src.applied.slice() : []
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// 校验事件形状；不合法一律 E_BAD_EVENT（错误对象带 code）。
function validateEvent(event) {
  if (!isPlainObject(event)) return false;
  if (event.id === undefined || event.id === null) return false;
  if (event.kind === "put") {
    return typeof event.doc === "string" && Array.isArray(event.chunks);
  }
  if (event.kind === "drop") {
    return typeof event.doc === "string";
  }
  return false;
}

function uniqChunks(chunks) {
  const seen = new Set();
  const out = [];
  chunks.forEach(function (chunk) {
    if (!seen.has(chunk)) {
      seen.add(chunk);
      out.push(chunk);
    }
  });
  return out;
}

function enqueueGarbage(garbage, chunk) {
  if (garbage.indexOf(chunk) === -1) garbage.push(chunk);
}

// 账上的块若在回收前重新被引用，则放回存活，不进已回收序列。
function collectOne(state) {
  const chunk = state.garbage.shift();
  if (!Object.prototype.hasOwnProperty.call(state.refs, chunk)) {
    state.dead.push(chunk);
    return 1;
  }
  return 0;
}

export function step(spec) {
  const state = cloneState(spec.state);
  const events = Array.isArray(spec.events) ? spec.events : [];
  let budgetLeft = Number.isFinite(spec.budget) ? Math.max(0, Math.floor(spec.budget)) : 0;
  let gc = 0;
  let judged = 0;

  events.forEach(function (event) {
    if (!validateEvent(event)) {
      throw gcError("E_BAD_EVENT", "不合法的事件：" + JSON.stringify(event));
    }
    if (state.applied.indexOf(event.id) !== -1) return;

    if (event.kind === "put") {
      // 重写文档：先把旧块的引用减掉，再把新块的引用加上。
      const oldChunks = state.docs[event.doc] || [];
      oldChunks.forEach(function (chunk) {
        if (releaseRef(state.refs, chunk) === 0) enqueueGarbage(state.garbage, chunk);
      });
      const nextChunks = uniqChunks(event.chunks);
      nextChunks.forEach(function (chunk) { addRef(state.refs, chunk); });
      state.docs[event.doc] = nextChunks;
    } else {
      // drop：文档不存在由文档表推出，报 E_NO_DOC。
      if (!Object.prototype.hasOwnProperty.call(state.docs, event.doc)) {
        throw gcError("E_NO_DOC", "文档不存在：" + event.doc);
      }
      state.docs[event.doc].forEach(function (chunk) {
        if (releaseRef(state.refs, chunk) === 0) enqueueGarbage(state.garbage, chunk);
      });
      delete state.docs[event.doc];
    }

    state.applied.push(event.id);
    judged += 1;

    // 每条事件后按共用预算回收；用尽后剩下的块压在账上带出下一轮。
    while (budgetLeft > 0 && state.garbage.length > 0) {
      gc += collectOne(state);
      budgetLeft -= 1;
    }
  });

  return {
    state: state,
    gc: gc,
    garbage_before: state.garbage.length,
    pending_chunks: state.garbage.slice(),
    judged: judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.garbage.length > 0) {
    catchup += collectOne(state);
  }
  return { state: state, catchup: catchup };
}
