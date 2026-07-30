import test from 'node:test';
import assert from 'node:assert/strict';
import { metaBrowserIdentifiers } from '../src/lib/funnelAnalytics.js';

test('Meta browser identifiers use canonical first-party cookie values', () => {
  assert.deepEqual(metaBrowserIdentifiers({
    cookieSource: '_fbp=fb.1.1785332985000.browser; _fbc=fb.1.1785332985000.MetaClick_ABC-123',
    search: '?fbclid=ignored-because-cookie-wins',
    now: 1785332999000
  }), {
    fbp: 'fb.1.1785332985000.browser',
    fbc: 'fb.1.1785332985000.MetaClick_ABC-123'
  });
});

test('Meta click identifier is derived from a valid fbclid before the Pixel cookie is ready', () => {
  assert.deepEqual(metaBrowserIdentifiers({
    cookieSource: '',
    search: '?fbclid=MetaClick_ABC-123',
    now: 1785332985000
  }), {
    fbc: 'fb.1.1785332985000.MetaClick_ABC-123'
  });
});

test('malformed Meta browser and click identifiers are omitted', () => {
  assert.deepEqual(metaBrowserIdentifiers({
    cookieSource: '_fbp=invalid; _fbc=%3Cscript%3E',
    search: '?fbclid=bad!'
  }), {});
});
