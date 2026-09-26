const assert = require('node:assert/strict');
const path = require('node:path');
const compiled = process.argv[2];
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://brief-test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
const admin = require(path.join(compiled, 'supabase-admin.js'));
const repository = require(path.join(compiled, 'workspace-repository.js'));
const { normalizeBriefImages } = require(path.join(compiled, 'brief-images.js'));
const image = { id: 'image.png', src: '/api/brief-images/image.png', source: 'upload', title: 'Cover', content: 'Caption', createdAt: '2026-09-26T16:58:58.055Z' };
const normalized = normalizeBriefImages([image]);
assert.deepEqual(normalizeBriefImages([JSON.stringify(image)]), normalized);
assert.deepEqual(normalizeBriefImages(JSON.stringify([image])), normalized);
assert.deepEqual(normalizeBriefImages([null, 'broken JSON', {}, { id: 'missing-url' }]), []);
const row = { id: 'task', title: 'Brief', work_type: 'inhouse', status: 'todo', start_date: null, deadline: null, start_time: '09:00', end_time: '11:00', brief: '', format: 'Carousel', brief_images: [JSON.stringify(image)] };
admin.supabaseAdmin.from = table => {
  const query = {
    select() { return query; },
    order() { return query; },
    then(resolve, reject) { return Promise.resolve({ data: table === 'tasks' ? [row] : [], error: null }).then(resolve, reject); }
  };
  return query;
};
(async () => {
  const [task] = await repository.listTasks();
  assert.equal(task.briefImages[0].src, image.src);
  assert.equal(task.briefImages[0].title, image.title);
  assert.equal(typeof task.briefImages[0], 'object');
  console.log('Brief images passed: PostgreSQL JSON strings recover their image URL and metadata on task fetch.');
})().catch(error => { console.error(error); process.exitCode = 1; });
