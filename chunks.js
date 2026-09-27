// chunks.js：块引用计数增减（同一块被多处引用只存一份计数）
export function addRef(refs, chunk) {
  const next = (Object.prototype.hasOwnProperty.call(refs, chunk) ? refs[chunk] : 0) + 1;
  refs[chunk] = next;
  return next;
}

export function releaseRef(refs, chunk) {
  if (!Object.prototype.hasOwnProperty.call(refs, chunk)) return 0;
  const next = refs[chunk] - 1;
  if (next <= 0) {
    delete refs[chunk];
    return 0;
  }
  refs[chunk] = next;
  return next;
}
