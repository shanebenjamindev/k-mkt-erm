const assert = require('node:assert/strict');
const base = process.argv[2];
if (!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw Error('Use an empty isolated local preview server only.');
let cookie = '';
async function call(path, method = 'GET', body) {
  const response = await fetch(base + path, {method, headers: {'Content-Type':'application/json', Cookie:cookie}, body:body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json();
  const cookies = response.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map(value=>value.split(';')[0]).join('; ');
  return {status:response.status,data};
}
(async () => {
  assert.equal((await call('/api/auth/setup')).data.setupRequired, true, 'Refuse to test a workspace that already has users');
  assert.equal((await call('/api/tasks')).status,401);
  assert.equal((await call('/api/auth/setup','POST',{name:'QA Preview',role:'Tester',username:'qa.preview',password:'preview-test-123'})).status,200);
  assert.equal((await call('/api/tasks')).status,403);
  assert.equal((await call('/api/profile','PATCH',{name:'QA Preview',role:'Tester',username:'qa.preview',newPassword:'preview-test-456',confirmPassword:'preview-test-456'})).status,200);
  const created = await call('/api/tasks','POST',{title:'Kiểm thử badge',owner:'QA Preview',workType:'inhouse',status:'todo',startDate:'2026-09-25',deadline:'2026-09-25',startTime:'09:00',endTime:'11:00',format:'QA',brief:'Dữ liệu kiểm thử riêng'});
  assert.equal(created.status,201);
  assert.equal((await call('/api/tasks')).data.tasks.filter(t=>t.status!=='completed').length,1);
  assert.equal((await call('/api/tasks/'+created.data.task.id,'PATCH',{status:'completed'})).status,200);
  assert.equal((await call('/api/tasks')).data.tasks.filter(t=>t.status!=='completed').length,0);
  const feed = (await call('/api/notifications')).data;
  assert.equal(feed.unreadCount,1);
  const id = feed.notifications[0].id;
  assert.equal((await call('/api/notifications','PATCH',{id})).data.unreadCount,0);
  assert.equal((await call('/api/notifications/'+id+'/remind','POST')).data.unreadCount,1);
  assert.equal((await call('/api/notifications/'+id+'/remind','POST')).status,429);
  assert.equal((await call('/api/notifications','PATCH',{all:true})).data.unreadCount,0);
  assert.equal((await call('/api/tasks','POST',null)).status,400);
  assert.equal((await call('/api/auth/logout','POST')).status,200);
  assert.equal((await call('/api/tasks')).status,401);
  console.log('HTTP integration passed: auth, forced password, task counts, completion, notification read/remind/cooldown/read-all, invalid input, logout.');
})().catch(error=>{console.error(error);process.exitCode=1;});
