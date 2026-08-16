import test from 'node:test';
import assert from 'node:assert/strict';

import { esc, safeUrl, escUrl, linkify, parseAppUrl } from './helpers.js';

test('esc neutralises every HTML metacharacter', () => {
    assert.equal(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(esc('a & b'), 'a &amp; b');
    assert.equal(esc('say "hi"'), 'say &quot;hi&quot;');
    assert.equal(esc("it's"), 'it&#39;s');
    assert.equal(esc(''), '');
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
    assert.equal(esc(42), '42');
});

test('esc closes the attribute-breakout vector', () => {
    // The payload that would escape an unquoted or quoted attribute value.
    const payload = '" onerror="alert(1)';
    assert.ok(!esc(payload).includes('"'));
});

test('safeUrl rejects script-bearing schemes', () => {
    assert.equal(safeUrl('javascript:alert(1)'), '#');
    assert.equal(safeUrl('JaVaScRiPt:alert(1)'), '#');
    assert.equal(safeUrl('vbscript:msgbox(1)'), '#');
    assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '#');
    assert.equal(safeUrl(''), '#');
    assert.equal(safeUrl(null), '#');
});

test('safeUrl keeps the schemes the app actually renders', () => {
    assert.equal(safeUrl('https://example.com/x?a=1'), 'https://example.com/x?a=1');
    assert.equal(safeUrl('http://example.com'), 'http://example.com');
    assert.equal(safeUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
});

test('escUrl both sanitises the scheme and escapes the result', () => {
    assert.equal(escUrl('javascript:alert(1)'), '#');
    assert.equal(escUrl('https://example.com/?a=1&b=2'), 'https://example.com/?a=1&amp;b=2');
});

test('linkify renders markup in post text as literal text', () => {
    const out = linkify('<img src=x onerror=alert(1)>');
    assert.ok(!out.includes('<img'), 'the tag must not survive as markup');
    assert.ok(out.includes('&lt;img'));
});

test('linkify escapes text around a link without breaking the link', () => {
    const out = linkify('veja <b>isto</b> https://example.com/a?x=1&y=2 agora');
    assert.ok(out.includes('&lt;b&gt;isto&lt;/b&gt;'));
    assert.ok(out.includes('data-external-url="https://example.com/a?x=1&amp;y=2"'));
    assert.ok(!out.includes('onclick='), 'external links must use delegation, not inline handlers');
});

test('linkify routes bsky.app URLs internally', () => {
    const out = linkify('https://bsky.app/profile/alice.bsky.social');
    assert.ok(out.includes('class="app-link link-internal"'));
    assert.ok(out.includes('data-route="profile"'));
    assert.ok(out.includes('data-handle="alice.bsky.social"'));
});

test('linkify escapes hashtag payloads', () => {
    const out = linkify('#tag');
    assert.ok(out.includes('data-tag="tag"'));
    assert.ok(out.includes('data-route="hashtag"'));
});

test('linkify handles empty and plain input', () => {
    assert.equal(linkify(''), '');
    assert.equal(linkify('sem nada'), 'sem nada');
});

test('parseAppUrl recognises the supported routes', () => {
    assert.deepEqual(parseAppUrl('https://bsky.app/profile/alice.test'), {
        type: 'profile',
        handle: 'alice.test',
    });
    assert.deepEqual(parseAppUrl('https://bsky.app/profile/alice.test/post/abc123'), {
        type: 'post',
        handle: 'alice.test',
        rkey: 'abc123',
    });
    assert.deepEqual(parseAppUrl('https://bsky.app/profile/alice.test/lists/xyz'), {
        type: 'list',
        handle: 'alice.test',
        rkey: 'xyz',
    });
    assert.deepEqual(parseAppUrl('https://bsky.app/starter-pack/alice.test/pack1'), {
        type: 'starterpack',
        handle: 'alice.test',
        rkey: 'pack1',
    });
});

test('parseAppUrl refuses look-alike hosts', () => {
    assert.equal(parseAppUrl('https://evil.com/profile/alice.test'), null);
    assert.equal(parseAppUrl('https://bsky.app.evil.com/profile/alice.test'), null);
    assert.equal(parseAppUrl('not a url'), null);
    assert.equal(parseAppUrl('https://bsky.app/unknown/thing'), null);
});
