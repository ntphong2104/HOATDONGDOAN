// Complete Fetch API Polyfill for Jest (JSDOM environment)
class PolyfillHeaders {
  constructor(init = {}) {
    this._map = new Map();
    if (init) {
      if (typeof init.forEach === 'function') {
        init.forEach((v, k) => this.set(k, v));
      } else if (Array.isArray(init)) {
        init.forEach(([k, v]) => this.set(k, v));
      } else {
        Object.entries(init).forEach(([k, v]) => this.set(k, v));
      }
    }
  }
  get(key) {
    return this._map.get(key.toLowerCase()) || null;
  }
  set(key, val) {
    this._map.set(key.toLowerCase(), String(val));
  }
  has(key) {
    return this._map.has(key.toLowerCase());
  }
}

class PolyfillRequest {
  constructor(input, init = {}) {
    this.url = typeof input === 'string' ? input : (input ? input.url : '');
    this.method = (init.method || 'GET').toUpperCase();
    this.headers = new PolyfillHeaders(init.headers || {});
    this._body = init.body;
  }
  async json() {
    return typeof this._body === 'string' ? JSON.parse(this._body) : (this._body || {});
  }
  async text() {
    return typeof this._body === 'string' ? this._body : JSON.stringify(this._body || '');
  }
}

class PolyfillResponse {
  constructor(body, init = {}) {
    this._body = body;
    this.status = init.status !== undefined ? init.status : 200;
    this.headers = new PolyfillHeaders(init.headers || {});
  }
  static json(data, init) {
    return new PolyfillResponse(JSON.stringify(data), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  }
  static redirect(url, status = 307) {
    return new PolyfillResponse(null, {
      status,
      headers: { Location: typeof url === 'string' ? url : url.toString() },
    });
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
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}
