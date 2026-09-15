'use strict';
const { validUrl } = require('../station-config');

async function fetchBounded(url, { origins, headers = {}, maxBytes = 10 * 1024 * 1024,
  timeoutMs = 12000, fetchImpl = fetch, image = false } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let target = validUrl(url, origins, { allowLocal: true });
  for (let redirects = 0; redirects <= 3; redirects++) {
    const res = await fetchImpl(target, { headers, signal, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (res.body) await res.body.cancel();
      if (!location || redirects === 3) throw new Error('Invalid or excessive redirects');
      target = validUrl(new URL(location, target).href, origins, { allowLocal: true });
      continue;
    }
    if (res.status === 304 && !image) {
      if (res.body) await res.body.cancel();
      return { notModified: true };
    }
    if (!res.ok) {
      if (res.body) await res.body.cancel();
      const error = new Error(`Upstream HTTP ${res.status}`);
      const retry = res.headers.get('retry-after');
      const seconds = /^\d+$/.test(retry || '') ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
      error.retryAfterMs = Number.isFinite(seconds) ? Math.min(300000, Math.max(0, seconds * 1000)) : 0;
      throw error;
    }
    const type = res.headers.get('content-type') || '';
    const allowed = image ? /^image\/(?:jpeg|png|webp|gif)(?:;|$)/i.test(type) : /(?:application\/(?:[\w.-]+\+)?json)(?:;|$)/i.test(type);
    if (!allowed) { if (res.body) await res.body.cancel(); throw new Error('Unexpected upstream content type'); }
    if (!res.body) throw new Error('Empty upstream response');
    const chunks = [], reader = res.body.getReader(); let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error('Upstream body exceeds size limit');
        chunks.push(Buffer.from(value));
      }
    } catch (e) { await reader.cancel().catch(() => {}); throw e; }
    const body = Buffer.concat(chunks);
    return { raw: image ? body : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)), contentType: type,
      validators: { etag: res.headers.get('etag') || '', lastModified: res.headers.get('last-modified') || '' } };
  }
  throw new Error('Redirect limit exceeded');
}
module.exports = { fetchBounded };
