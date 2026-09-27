// chunks.js：引用计数增减（基线：加一不落地、减一到不了零）
export function addRef(refs, chunk) {
  return 0;
}

export function releaseRef(refs, chunk) {
  return 1;
}
