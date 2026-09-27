const assert = require('node:assert/strict');
const path = require('node:path');
const compiled = process.argv[2];
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://brief-test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
const admin = require(path.join(compiled, 'supabase-admin.js'));
const repository = require(path.join(compiled, 'workspace-repository.js'));
const { normalizeBriefImages } = require(path.join(compiled, 'brief-images.js'));
const { DEFAULT_WORKFLOW, isWorkflow, normalizeWorkflow } = require(path.join(compiled, 'project-settings.js'));
const customWorkflow = [...DEFAULT_WORKFLOW].reverse().map(step => ({ ...step, label: `Tên ${step.status}` }));
assert.equal(isWorkflow(customWorkflow), true);
assert.deepEqual(normalizeWorkflow(customWorkflow), customWorkflow);
assert.equal(isWorkflow([DEFAULT_WORKFLOW[0], DEFAULT_WORKFLOW[0], ...DEFAULT_WORKFLOW.slice(2)]), false);
assert.equal(isWorkflow(DEFAULT_WORKFLOW.map(step => ({ ...step, label: '' }))), false);
assert.deepEqual(normalizeWorkflow(undefined), DEFAULT_WORKFLOW);
assert.equal(isWorkflow(DEFAULT_WORKFLOW.map(step => ({ ...step, color: "invalid" }))), false);
assert.equal(normalizeWorkflow(DEFAULT_WORKFLOW.map(({ color, ...step }) => step))[0].color, DEFAULT_WORKFLOW[0].color);
assert.equal(normalizeWorkflow(DEFAULT_WORKFLOW.map(step => ({ ...step, color: "#123456" })))[0].color, "#123456");
const image = { id: 'image.png', src: '/api/brief-images/image.png', source: 'upload', label: 'Hình 1', feedback: [{ id: 'feedback-1', x: .1, y: .2, width: .3, height: .4, text: 'Chỉnh lại vùng này' }], title: 'Cover', content: 'Caption', createdAt: '2026-09-26T16:58:58.055Z' };
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
  assert.equal(task.briefImages[0].label, image.label);
  assert.deepEqual(task.briefImages[0].feedback, image.feedback);
  assert.deepEqual(normalizeBriefImages([{ ...image, feedback: [{ ...image.feedback[0], x: .9 }] }])[0].feedback, []);
  assert.equal(typeof task.briefImages[0], 'object');
  console.log('Brief images passed: PostgreSQL JSON strings recover their image URL and metadata on task fetch.');
})().catch(error => { console.error(error); process.exitCode = 1; });
