// chunks.js：引用计数增减（加一落地新计数；减一到零删条目并返回零）
export function addRef(refs, chunk) {
  const count = (refs[chunk] || 0) + 1;
  refs[chunk] = count;
  return count;
}

export function releaseRef(refs, chunk) {
  const count = (refs[chunk] || 0) - 1;
  if (count <= 0) {
    delete refs[chunk];
    return 0;
  }
  refs[chunk] = count;
  return count;
}
