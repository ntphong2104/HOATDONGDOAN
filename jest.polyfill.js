// Complete Fetch API Polyfill for Jest (JSDOM environment)
class PolyfillHeaders {
  constructor(init = {}) {
    this._map = new Map();
    this._setCookies = [];
    if (init) {
      if (typeof init.forEach === 'function') {
        init.forEach((v, k) => this.append(k, v));
      } else if (Array.isArray(init)) {
        init.forEach(([k, v]) => this.append(k, v));
      } else {
        Object.entries(init).forEach(([k, v]) => this.append(k, v));
      }
    }
  }
  get(key) {
    const k = key.toLowerCase();
    if (k === 'set-cookie') {
      return this._setCookies.length > 0 ? this._setCookies.join(', ') : null;
    }
    return this._map.get(k) || null;
  }
  set(key, val) {
    const k = key.toLowerCase();
    const s = String(val);
    if (k === 'set-cookie') {
      this._setCookies = [s];
    }
    this._map.set(k, s);
  }
  append(key, val) {
    const k = key.toLowerCase();
    const s = String(val);
    if (k === 'set-cookie') {
      this._setCookies.push(s);
      this._map.set(k, this._setCookies.join(', '));
      return;
    }
    this._map.set(k, s);
  }
  has(key) {
    return this._map.has(key.toLowerCase());
  }
  getSetCookie() {
    return [...this._setCookies];
  }
  forEach(cb) {
    this._map.forEach((v, k) => cb(v, k, this));
  }
}

function parseCookieHeader(headerVal) {
  const map = new Map();
  if (!headerVal) return map;
  for (const part of String(headerVal).split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (name) map.set(name, { name, value: decodeURIComponent(val) });
  }
  return map;
}

class PolyfillRequest {
  constructor(input, init = {}) {
    this.url = typeof input === 'string' ? input : (input ? input.url : '');
    this.method = (init.method || 'GET').toUpperCase();
    this.headers = new PolyfillHeaders(init.headers || {});
    this._body = init.body;
    const cookieStore = parseCookieHeader(this.headers.get('cookie'));
    this.cookies = {
      get: (name) => cookieStore.get(name),
      getAll: () => Array.from(cookieStore.values()),
      has: (name) => cookieStore.has(name),
    };
  }
  async json() {
    return typeof this._body === 'string' ? JSON.parse(this._body) : (this._body || {});
  }
  async text() {
    return typeof this._body === 'string' ? this._body : JSON.stringify(this._body || '');
  }
}

function formatSetCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value ?? ''))}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

class PolyfillResponse {
  constructor(body, init = {}) {
    this._body = body;
    this.status = init.status !== undefined ? init.status : 200;
    this.headers = new PolyfillHeaders(init.headers || {});
    this._cookies = new Map();
    const syncHeader = () => {
      const serialized = [];
      for (const c of this._cookies.values()) {
        serialized.push(formatSetCookie(c.name, c.value, c.options));
      }
      this.headers._setCookies = serialized;
      if (serialized.length > 0) {
        this.headers._map.set('set-cookie', serialized.join(', '));
      } else {
        this.headers._map.delete('set-cookie');
      }
    };
    this.cookies = {
      set: (name, value, options = {}) => {
        if (typeof name === 'object' && name) {
          this._cookies.set(name.name, { name: name.name, value: name.value, options: name });
        } else {
          this._cookies.set(name, { name, value, options });
        }
        syncHeader();
      },
      get: (name) => this._cookies.get(name),
      getAll: () => Array.from(this._cookies.values()),
      delete: (name) => {
        this._cookies.set(name, { name, value: '', options: { maxAge: 0, path: '/' } });
        syncHeader();
      },
    };
  }
  static json(data, init) {
    return new PolyfillResponse(JSON.stringify(data), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  }
  static redirect(url, statusOrInit = 307) {
    const status = typeof statusOrInit === 'number' ? statusOrInit : (statusOrInit?.status || 307);
    const extraHeaders = typeof statusOrInit === 'object' ? (statusOrInit?.headers || {}) : {};
    return new PolyfillResponse(null, {
      status,
      headers: { Location: typeof url === 'string' ? url : url.toString(), ...extraHeaders },
    });
  }
  static next(init = {}) {
    return new PolyfillResponse(null, { status: 200, ...init });
  }
  async json() {
    return typeof this._body === 'string' ? JSON.parse(this._body) : (this._body || {});
  }
  async text() {
    return typeof this._body === 'string' ? this._body : JSON.stringify(this._body || '');
  }
}

global.Headers = PolyfillHeaders;
global.Request = PolyfillRequest;
global.Response = PolyfillResponse;

if (typeof global.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}
