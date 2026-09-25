const assert = require('node:assert/strict');
const path = require('node:path');
const compiled = process.argv[2];
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://notification-test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
const admin = require(path.join(compiled, 'supabase-admin.js'));
const repository = require(path.join(compiled, 'workspace-repository.js'));
const rows = Array.from({length: 45}, (_, index) => ({
  id: String(index), user_id: 'owner-1', task_id: null, kind: 'task_assigned',
  title: `Thông báo ${index}`, body: 'Kiểm thử', event_key: `task-${index}`,
  read_at: null, created_at: new Date(2026, 8, 25, 0, index).toISOString()
}));
let queries = 0;
admin.supabaseAdmin.rpc = () => { throw new Error('The optional RPC must not be needed to load notifications'); };
admin.supabaseAdmin.from = table => {
  assert.equal(table, 'workspace_notifications');
  return {
    select(columns, options = {}) {
      queries++;
      assert.equal(columns, options.head ? 'id' : '*');
      const query = {
        eq(column, value) { assert.equal(column, 'user_id'); assert.equal(value, 'owner-1'); return query; },
        order() { return query; },
        limit(value) { assert.equal(value, 40); return Promise.resolve({data: rows.slice(-40).reverse(), error: null}); },
        is(column, value) { assert.equal(column, 'read_at'); assert.equal(value, null); return Promise.resolve({count: rows.length, error: null}); }
      };
      return query;
    }
  };
};
(async () => {
  const feed = await repository.getNotificationFeed('owner-1');
  assert.equal(queries, 2);
  assert.equal(feed.notifications.length, 40);
  assert.equal(feed.unreadCount, 45);
  assert.equal(feed.notifications[0].title, 'Thông báo 44');
  console.log('Remote notification feed passed without the optional Supabase RPC; total unread includes older rows.');
})().catch(error => { console.error(error); process.exitCode = 1; });
