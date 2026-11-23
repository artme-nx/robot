// Preuzimanje s napretkom (bajtovi), za stvarni napredak na ekranu za učitavanje.

/**
 * @param {string} url
 * @param {(loaded: number) => void} [onProgress] preuzeti bajtovi (nakon dekompresije)
 * @returns {Promise<Uint8Array>}
 */
export async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const reader = res.body?.getReader?.();
  if (!reader) {
    const all = new Uint8Array(await res.arrayBuffer());
    onProgress?.(all.byteLength);
    return all;
  }
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded);
  }
  const all = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return all;
}
