import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const text = (file) => readFileSync(resolve(root, file), 'utf8');

test('native configuration uses local assets and never embeds a remote URL or private credential', () => {
  const config = text('capacitor.config.ts').replace(/\/\/[^\n]*/g, '');
  assert.match(config, /webDir:\s*'dist-mobile'/);
  assert.doesNotMatch(
    config,
    /server\s*:|allowNavigation|Bearer|Authorization|token/,
  );
  const entry = text('mobile/main.tsx');
  assert.match(entry, /Native storage setup pending/);
  assert.match(entry, /native \? \(/);
  assert.doesNotMatch(entry, /Bearer|Authorization|token/);
});

test('mobile build has local entry assets and does not bundle a Cloudflare/server entry', () => {
  const html = text('dist-mobile/index.html');
  assert.match(html, /name="liftline-runtime" content="bundled"/);
  for (const [, url] of html.matchAll(/(?:src|href)="(\.\/assets\/[^\"]+)"/g)) {
    assert.ok(existsSync(resolve(root, 'dist-mobile', url)), url);
    if (url.endsWith('.js'))
      assert.doesNotMatch(
        text('dist-mobile/' + url),
        /cloudflare:workers|siwc_bypass_bearer_token/,
      );
  }
  assert.doesNotMatch(html, /https?:\/\//);
  assert.ok(
    existsSync(resolve(root, 'dist-mobile/fonts/NotoSans-Regular.ttf')),
  );
});

test('iOS app icon retains Liftline artwork as an opaque 1024px native asset', () => {
  const png = readFileSync(
    resolve(
      root,
      'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
    ),
  );
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 2); // RGB without alpha, as required for iOS app icons
});

test('web keeps its service worker while bundled clients skip it, and native uses the scene lifecycle', () => {
  assert.match(text('app/workout-app.tsx'), /isBundledApp\(\) \|\|/);
  assert.match(text('app/workout-app.tsx'), /register\('\/sw\.js'/);
  assert.match(text('mobile/main.tsx'), /appStateChange/);
  assert.match(text('ios/App/App/Info.plist'), /UIApplicationSceneManifest/);
  assert.ok(existsSync(resolve(root, 'ios/App/App/SceneDelegate.swift')));
});
