import fs from "node:fs";
import { addRef, releaseRef } from "./chunks.js";
import { step, close } from "./gcrun.js";

// 验收断言：上面每条值收进 emit，最后与期望值逐项比对，不符就非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/chunks.json", "utf8"));
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

emit("收尾后存活块 =", JSON.stringify(Object.keys(closed.state.refs).sort()));
emit("收尾后引用计数 =", JSON.stringify(Object.keys(closed.state.refs).sort().map(function (chunk) {
  return [chunk, closed.state.refs[chunk]];
})));
emit("收尾后已回收序列 =", JSON.stringify(closed.state.dead));
emit("首轮回收条数 =", first.gc);
emit("二档回收条数 =", wide.gc);
emit("两个预算档回收不同 =", first.gc !== wide.gc);
emit("收尾前待回收账 =", first.garbage_before);
emit("压在账上的块 =", JSON.stringify(first.pending_chunks));
emit("收尾补齐条数 =", closed.catchup);
emit("收尾后待回收账 =", closed.state.garbage.length);
emit("拆两轮中间态不同 =", fingerprint(r2.state) !== fingerprint(first.state));
emit("拆两轮收尾态一致 =", fingerprint(closedTwo.state) === fingerprint(closed.state));
emit("重放新回收 =", replay.gc);
emit("工作计数未超上界 =", first.judged <= first.judged_bound);
emit("与全量对照差异 =", fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1);


// ---- 异常路径探针：真调用实现，看它报出什么码（不是从样例里抄）----
let probeNoDoc = null;
let probeBadEvent = null;
try {
  step(Object.assign({}, { budget: 1,
    state: { docs: {}, refs: {}, dead: [], garbage: [], applied: [] },
    events: [{ id: 1, kind: "drop", doc: "d9" }] }));
  emit("删未知文档报码", "没有报错");
} catch (error) {
  probeNoDoc = error && error.code ? error.code : String(error.message);
  emit("删未知文档报码", probeNoDoc);
}
try {
  step(Object.assign({}, { budget: 1, state: { docs: {}, refs: {}, dead: [], garbage: [], applied: [] },
    events: [{ id: 1, kind: "peek", doc: "d1" }] }));
  emit("事件不合法报码", "没有报错");
} catch (error) {
  probeBadEvent = error && error.code ? error.code : String(error.message);
  emit("事件不合法报码", probeBadEvent);
}


// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "收尾后存活块": [
    "C",
    "D",
    "E"
  ],
  "收尾后引用计数": [
    [
      "C",
      1
    ],
    [
      "D",
      1
    ],
    [
      "E",
      1
    ]
  ],
  "收尾后已回收序列": [
    "A",
    "B"
  ],
  "首轮回收条数": 1,
  "二档回收条数": 2,
  "两个预算档回收不同": true,
  "收尾前待回收账": 1,
  "压在账上的块": [
    "B"
  ],
  "收尾补齐条数": 1,
  "收尾后待回收账": 0,
  "拆两轮中间态不同": true,
  "拆两轮收尾态一致": true,
  "重放新回收": 0,
  "工作计数未超上界": true,
  "与全量对照差异": 0,
  "删未知文档报码": "E_NO_DOC",
  "事件不合法报码": "E_BAD_EVENT"
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");

// ---- 七条机检断言：布尔结论逐条过堂，任意一条不成立即非零退出 ----
const machineChecks = [
  ["两档回收条数不同", first.gc !== wide.gc],
  ["收尾前账大于零而收尾后归零", first.garbage_before > 0 && closed.state.garbage.length === 0],
  ["拆两轮中间态不同而收尾态一致",
    fingerprint(r2.state) !== fingerprint(first.state)
    && fingerprint(closedTwo.state) === fingerprint(closed.state)],
  ["重放不再回收", replay.gc === 0],
  ["工作计数不超事件条数", first.judged >= 0 && first.judged <= events.length],
  ["与全量对照为零", fingerprint(closed.state) === fingerprint(fullClosed.state)],
  ["异常探针真调", probeNoDoc === "E_NO_DOC" && probeBadEvent === "E_BAD_EVENT"]
];
let machineBad = 0;
for (const [name, ok] of machineChecks) {
  if (ok) { console.log("机检通过 " + name); }
  else { machineBad += 1; console.log("机检失败 " + name); }
}
console.log("机检断言 " + (machineChecks.length - machineBad) + "/" + machineChecks.length + " 通过");
__bad += machineBad;
process.exit(__bad === 0 ? 0 : 1);
