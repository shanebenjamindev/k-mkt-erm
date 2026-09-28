const assert = require('node:assert/strict');
const { getFacebookPageReport, listFacebookPages } = require(process.argv[2] + '/meta-pages.js');
const credentials = { token: 'private-user-token', version: 'v25.0', secret: 'test-secret' };
process.env.META_GRAPH_API_VERSION = 'v25.0';
let fullPermissions = false;
let calls = [];
let pagination = false;
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
global.fetch = async (url, options) => {
  const u = new URL(url);
  const resource = u.pathname.split('/').slice(2).join('/');
  const field = u.searchParams.get('fields');
  calls.push({ resource, field, metric: u.searchParams.get('metric') });
  if (resource === 'me/accounts') return reply({ data: [{ id: '123', name: 'Test page', access_token: 'private-page-token' }] });
  if (resource === 'me/permissions') return reply({ data: ['pages_show_list', 'pages_read_engagement', ...(fullPermissions ? ['read_insights', 'pages_read_user_content'] : [])].map(permission => ({ permission, status: 'granted' })) });
  assert.equal(options.headers.Authorization, 'Bearer private-page-token');
  if (resource === '123/insights') {
    if (u.searchParams.get('metric') === 'page_views_total') return reply({ error: { code: 100, message: 'private-page-token' } }, 400);
    if (u.searchParams.get('metric') === 'page_daily_unfollows') return reply({ data: [] });
    return reply({ data: [{ values: [{ value: 0, end_time: '2026-09-28T00:00:00Z' }] }] });
  }
  if (resource === '123/published_posts') {
    assert.equal(u.searchParams.get('since'), String(Date.parse('2026-09-01T00:00:00+07:00') / 1000));
    if (pagination && !u.searchParams.get('after')) return reply({ data: [{ id: '123_1', message: 'Video', full_picture: 'https://example.com/image.jpg', attachments: { data: [{ media_type: 'video' }] } }], paging: { next: 'https://example.com/?access_token=private-page-token', cursors: { after: 'next' } } });
    return reply({ data: [{ id: pagination ? '123_2' : '123_1', message: 'Photo', full_picture: 'https://example.com/image.jpg', attachments: { data: [{ media_type: 'photo' }] } }] });
  }
  if (resource.startsWith('123_')) {
    if (field.startsWith('comments')) return reply({ error: { code: 10, message: 'private-page-token' } }, 403);
    if (field.startsWith('reactions')) return reply({ reactions: { summary: { total_count: 5 } } });
    if (field === 'shares') return reply(resource === '123_2' ? { shares: { count: 3 } } : {});
  }
  return reply({ followers_count: 100, fan_count: 80 });
};
(async () => {
  const pages = await listFacebookPages(credentials);
  assert.ok(!JSON.stringify(pages).includes('private'));
  let report = await getFacebookPageReport('123', '2026-09-01', '2026-09-28', credentials);
  assert.deepEqual(report.missingPermissions, ['read_insights', 'pages_read_user_content']);
  assert.ok(report.metrics.every(m => m.status === 'permission'));
  assert.ok(!calls.some(call => call.resource.endsWith('/insights')));
  assert.equal(report.posts[0].shares, 0);
  assert.equal(report.posts[0].reactions, undefined);
  assert.match(report.posts[0].metricErrors.comments, /pages_read_user_content/);
  assert.equal(report.posts[0].thumbnail, 'https://example.com/image.jpg');
  assert.equal(report.posts[0].mediaType, 'photo');
  fullPermissions = true; pagination = true;
  report = await getFacebookPageReport('123', '2026-09-01', '2026-09-28', credentials);
  assert.equal(report.metrics.find(m => m.key === 'page_views_total').status, 'unsupported');
  assert.equal(report.metrics.find(m => m.key === 'page_daily_unfollows').status, 'empty');
  assert.equal(report.metrics.find(m => m.key === 'page_media_view').status, 'available');
  assert.equal(report.metrics.find(m => m.key === 'page_media_view').values[0].value, 0);
  assert.equal(report.posts.length, 2);
  assert.equal(report.posts[0].mediaType, 'video');
  assert.equal(report.posts[0].reactions, 5);
  assert.equal(report.posts[0].comments, undefined);
  assert.equal(report.posts[0].shares, 0);
  assert.equal(report.posts[1].shares, 3);
  assert.ok(!JSON.stringify(report).includes('private'));
  const before = calls.length;
  await assert.rejects(getFacebookPageReport('999', '2026-09-01', '2026-09-28', credentials), /danh sách/);
  assert.equal(calls.length, before + 1);
  console.log('Meta Pages tests passed: permissions, independent counts, zero vs unavailable, thumbnails, pagination, timezone and token privacy.');
})().catch(error => { console.error(error); process.exitCode = 1; });
