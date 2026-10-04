// Small helpers shared by every route.

export class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const now = () => Date.now();

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

// Random 128-bit id.
export const newId = () => hex(crypto.getRandomValues(new Uint8Array(16)));

// Random 256-bit token, as sent to the browser.
export const newToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));

export async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(new Uint8Array(d));
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function errorResponse(err) {
  return json({ error: { code: err.code, message: err.message, ...err.extra } }, err.status);
}

export function cookie(req, name) {
  const header = req.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
