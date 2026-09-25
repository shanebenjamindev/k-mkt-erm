const assert = require('node:assert/strict');
const path = require('node:path');
const webpush = require('web-push');
const filename = path.join(process.argv[2], 'web-push.js');
const keys = webpush.generateVAPIDKeys();
function configuration(publicKey, privateKey, subject = 'https://k-mkt-workspace.vercel.app') {
  if (publicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
  else process.env.VAPID_PUBLIC_KEY = publicKey;
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (privateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
  else process.env.VAPID_PRIVATE_KEY = privateKey;
  process.env.VAPID_SUBJECT = subject;
  delete require.cache[require.resolve(filename)];
  return require(filename).pushConfiguration();
}
assert.equal(configuration(undefined, undefined).configured, false);
assert.equal(configuration('not-a-key', keys.privateKey).configured, false);
assert.equal(configuration(keys.publicKey, webpush.generateVAPIDKeys().privateKey).configured, false);
assert.equal(configuration(keys.publicKey, keys.privateKey, 'not-a-contact').configured, false);
const valid = configuration(keys.publicKey, keys.privateKey);
assert.equal(valid.configured, true);
assert.equal(valid.publicKey, keys.publicKey);
console.log('Push configuration passed: missing, malformed, mismatched and valid VAPID keys.');
