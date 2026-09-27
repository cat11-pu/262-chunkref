import assert from "node:assert";
import { addRef, releaseRef } from "../chunks.js";
import { step, close } from "../gcrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { docs: {}, refs: {}, dead: [], garbage: [], applied: [] },
  events: [],
  doc_error_code: "E_NO_DOC", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("addRef returns a number", () => {
  assert.strictEqual(typeof addRef({}, "A"), "number");
});

check("releaseRef returns a number", () => {
  assert.strictEqual(typeof releaseRef({}, "A"), "number");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
