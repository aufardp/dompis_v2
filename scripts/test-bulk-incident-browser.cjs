const { spawn } = require('node:child_process');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createHmac } = require('node:crypto');
const assert = require('node:assert/strict');

const checks = [];
const runtimeErrors = [];
const requests = [];
const reports = new Map();
let complete = false;
let partialNext = false;
const origin = process.env.BULK_UI_BASE_URL ?? 'http://127.0.0.1:3109';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Browser fixtures require a local test server.');
const profile = mkdtempSync(join(tmpdir(), 'dompis-bulk-ui-'));
const chrome = spawn(process.env.CHROME_BINARY ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let cdp;

async function main() {
  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    chrome.stderr.on('data', data => { stderr += data; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    chrome.on('error', reject);
    setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
  });
  cdp = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { cdp.onopen = resolve; cdp.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const handlers = new Map();
  cdp.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const callback = pending.get(message.id); pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    } else handlers.get(message.method)?.(message.params);
  };
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); cdp.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => call(method, params, sessionId);
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  handlers.set('Runtime.exceptionThrown', params => runtimeErrors.push(params.exceptionDetails.exception?.description || params.exceptionDetails.text));
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression, timeout = 20000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { try { if (await evaluate(expression)) return; } catch (error) { if (!/null|context|navigation/i.test(error.message)) throw error; } await new Promise(resolve => setTimeout(resolve, 150)); }
    throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`);
  };
  const click = async label => {
    const rect = await evaluate(`(() => { const b = [...document.querySelectorAll('[data-incident-ingestion] button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}); if(!b||b.disabled) throw new Error('Button unavailable: '+${JSON.stringify(label)}); b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...rect });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...rect });
  };
  const fill = async text => {
    await evaluate("document.querySelector('#incident-ids').focus(); document.querySelector('#incident-ids').select()");
    await send('Input.insertText', { text });
  };
  const finishReport = entry => {
    const items = entry.incidents.map((incident, i) => ({
      incident, jobId: `fixture-${i}`, state: complete ? 'completed' : i === 0 ? 'active' : 'waiting',
      terminal: complete, success: complete && (entry.incidents.length === 1 || i === 0), attemptsMade: complete ? 1 : 0,
      message: complete ? (entry.incidents.length === 1 || i === 0 ? 'Data incident berhasil diperbarui.' : 'Insiden tidak ditemukan. Periksa ID lalu coba kembali.') : 'Menunggu pemrosesan.',
    }));
    if (entry.partial) { items[items.length - 1] = { ...items.at(-1), jobId: null, terminal: false, success: false, state: 'pending_enqueue', message: 'Belum masuk antrean. Lanjutkan pengiriman.' }; }
    const completed = items.filter(item=>item.terminal).length;
    return { requestId: entry.requestId, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+86400000).toISOString(), total: items.length, completed, succeeded: items.filter(item=>item.success).length, failed: items.filter(item=>item.terminal&&!item.success).length, pendingEnqueue: items.filter(item=>item.state==='pending_enqueue').length, terminal: completed===items.length, items };
  };
  handlers.set('Fetch.requestPaused', async params => {
    try {
      const url = new URL(params.request.url);
      let body = { success: true, data: [], notifications: [], count: 0, unreadCount: 0 };
      let status = 200;
      if (url.pathname === '/api/users/me') body = { success: true, data: { id_user: 7, nama: 'UI test fixture', jabatan: 'superadmin', role_name: 'superadmin', role_key: 'superadmin', priority_access: true, branch_ids: [] } };
      if (url.pathname === '/api/admin/ingest-incidents') {
        if (params.request.method === 'POST') {
          const submission = JSON.parse(params.request.postData); requests.push(submission);
          const entry = { ...submission, partial: partialNext }; reports.set(submission.requestId, entry);
          await new Promise(resolve=>setTimeout(resolve, 600));
          if (partialNext) { partialNext = false; status = 524; body = '<html>fixture timeout</html>'; }
          else body = { success: true, report: finishReport(entry) };
        } else {
          const entry = reports.get(url.searchParams.get('requestId'));
          if (entry) body = { success: true, report: finishReport(entry) };
          else { status = 404; body = { success: false, message: 'Permintaan tidak ditemukan atau sudah kedaluwarsa.' }; }
        }
      }
      await send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: status, responsePhrase: status === 524 ? 'Fixture timeout' : undefined, responseHeaders: [{name:'Content-Type',value:typeof body === 'string' ? 'text/html':'application/json'}], body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
    } catch (error) { if (!error.message.includes('Invalid InterceptionId')) { runtimeErrors.push(error.stack); console.error('Mock request error',error.message); } }
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ id_user: 7, role: 'superadmin', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url');
  const signature = createHmac('sha256','dompis-local-ui-fixture-secret').update(`${header}.${payload}`).digest('base64url');
  await send('Network.setCookie', { name: 'token', value: `${header}.${payload}.${signature}`, url: origin, httpOnly: true, sameSite: 'Lax' });
  await send('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate', { url: `${origin}/admin/ingest-incident` });
  await until("!!document.querySelector('#incident-ids')", 90000);
  assert.match(await evaluate('document.body.innerText'), /Belum ada permintaan/); checks.push('empty state');
  await fill('invalid INC52661271');
  await until("document.querySelector('#incident-ids').getAttribute('aria-invalid')==='true'");
  assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"),true); checks.push('invalid IDs block submission');
  await fill('inc52661271,INC52661271; INC51123643');
  await until("document.querySelector('#incident-count').textContent.includes('2 ID unik, 1 duplikat')");
  await click('Tarik 2 incident');
  await until("document.body.innerText.includes('Mengirim daftar incident')");
  await until("document.body.innerText.includes('0 dari 2 incident selesai')");
  assert.deepEqual(requests[0].incidents,['INC52661271','INC51123643']); checks.push('normalized deduplicated submission and loading/pending state');
  complete=true;
  await until("document.body.innerText.includes('2 dari 2 incident selesai')"); checks.push('automatic polling updates progress and business failure');
  const firstId=requests[0].requestId;
  await send('Page.reload');
  await until("document.body.innerText.includes('2 dari 2 incident selesai')");
  assert.equal(requests.length,1); assert.equal(await evaluate("new URL(location.href).searchParams.get('requestId')"),firstId); checks.push('reload recovers report without new POST');
  await evaluate("document.querySelector('#result-filter').value='failed'; document.querySelector('#result-filter').dispatchEvent(new Event('change',{bubbles:true}))");
  await until("document.querySelectorAll('[aria-label=\"Hasil per incident\"] li').length===1");
  assert.match(await evaluate("document.querySelector('[aria-label=\"Hasil per incident\"]').innerText"),/INC51123643/);
  await evaluate("document.querySelector('#result-filter').value='pending'; document.querySelector('#result-filter').dispatchEvent(new Event('change',{bubbles:true}))");
  await until("document.body.innerText.includes('Tidak ada incident pada filter ini')"); checks.push('filters and filtered empty state');
  await evaluate("document.querySelector('#result-filter').value='success'; document.querySelector('#result-filter').dispatchEvent(new Event('change',{bubbles:true}))");
  await until("document.querySelectorAll('[aria-label=\"Hasil per incident\"] li').length===1");
  await evaluate("document.querySelector('#result-filter').value='all'; document.querySelector('#result-filter').dispatchEvent(new Event('change',{bubbles:true}))");
  await until("document.querySelectorAll('[aria-label=\"Hasil per incident\"] li').length===2");
  await click('Coba ulang 1 yang gagal');
  await until("document.body.innerText.includes('1 dari 1 incident selesai')");
  assert.deepEqual(requests[1].incidents,['INC51123643']); assert.notEqual(requests[1].requestId,firstId); checks.push('retry only failed IDs with new request');
  await click('Daftar baru');
  assert.equal(await evaluate('document.activeElement.id'),'incident-ids');
  partialNext=true; complete=false;
  await fill('INC52661271 INC51123643');
  await click('Tarik 2 incident');
  await until("document.body.innerText.includes('524')");
  await until("document.body.innerText.includes('1 incident belum masuk antrean')");
  await click('Lanjutkan pengiriman');
  await until("document.body.innerText.includes('0 dari 2 incident selesai') && !document.body.innerText.includes('1 incident belum masuk antrean')");
  assert.equal(requests[2].requestId,requests[3].requestId); assert.deepEqual(requests[2].incidents,requests[3].incidents); checks.push('HTML 524 and partial enqueue resume with same request');
  complete=true; await click('Periksa status');
  await until("document.body.innerText.includes('2 dari 2 incident selesai')"); checks.push('manual status refresh');
  const layout=[];
  const contrast=[];
  for (const theme of ['light','dark']) {
    await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);
    for(const width of [320,375,768,1024,1440]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await new Promise(resolve=>setTimeout(resolve,100));
      const metrics=await evaluate(`(() => {const root=document.querySelector('[data-incident-ingestion]');const r=root.getBoundingClientRect();return {pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,rootWidth:r.width,escaped:[...root.querySelectorAll('*')].filter(e=>{const x=e.getBoundingClientRect();return x.width>0&&(x.right>innerWidth+1||x.left<0)}).map(e=>e.tagName),targets:[...root.querySelectorAll('button,select,a')].map(e=>({label:e.textContent.trim(),height:e.getBoundingClientRect().height})),colors:[...root.querySelectorAll('h1,p,label,button,textarea,select,a')].filter(e=>!e.disabled).map(e=>({text:e.textContent.slice(0,35),fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}))};})()`);
      assert.equal(metrics.escaped.length,0,`${theme} ${width}: ${metrics.escaped}`); assert.ok(metrics.pageWidth<=width,JSON.stringify(metrics));
      assert.ok(metrics.targets.every(target=>target.height>=44));layout.push({theme,width,...metrics});
    }
    const colors=await evaluate(`(() => { const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]};return [...document.querySelectorAll('[data-incident-ingestion] h1,[data-incident-ingestion] p,[data-incident-ingestion] label,[data-incident-ingestion] button,[data-incident-ingestion] textarea,[data-incident-ingestion] select,[data-incident-ingestion] a')].map(e=>{let p=e;let bg;while(p){bg=rgba(getComputedStyle(p).backgroundColor);if(bg[3]===255)break;p=p.parentElement;}return {text:e.textContent.trim().slice(0,35),fg:rgba(getComputedStyle(e).color).slice(0,3),bg:bg?.slice(0,3)??[255,255,255]};});})()`);
    const luminance=rgb=>rgb.map(c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    for(const pair of colors){const a=luminance(pair.fg),b=luminance(pair.bg);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,JSON.stringify({theme,...pair,ratio}));contrast.push({theme,...pair,ratio});}
    await evaluate("window.scrollTo(0,0); document.querySelector('[data-incident-ingestion]').parentElement.scrollTop=0");
    await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(result=>writeFileSync(`/private/tmp/dompis-bulk-ui-${theme}.png`,Buffer.from(result.data,'base64')));
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(result=>writeFileSync(`/private/tmp/dompis-bulk-ui-${theme}-mobile.png`,Buffer.from(result.data,'base64')));
  }
  await send('Emulation.setDeviceMetricsOverride',{width:640,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate("document.documentElement.style.zoom='2'");
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);checks.push('200% layout zoom reflows without horizontal overflow');
  await evaluate("document.documentElement.style.zoom=''");
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:600,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
  assert.match(await evaluate("document.querySelector('meta[name=viewport]').content"),/user-scalable=yes/);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true); checks.push('320/375/768/1024/1440 layout in both themes, 44px targets, zoom enabled');
  await send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
  await click('Daftar baru');
  await fill(Array.from({length:201},(_,i)=>'INC'+(90000000+i)).join('\n'));
  await until("document.body.innerText.includes('Maksimal 200 incident per permintaan.') && document.querySelector('button[type=submit]').disabled");checks.push('201 unique IDs rejected by form');
  await fill('INC52661271');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  const focus = await evaluate("({text:document.activeElement.textContent,outline:getComputedStyle(document.activeElement).outlineWidth})");
  assert.match(focus.text,/Tarik 1 incident/);assert.equal(focus.outline,'2px');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'char',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until("document.body.innerText.includes('1 dari 1 incident selesai')"); checks.push('keyboard Tab focus and Enter submission');
  await evaluate("document.querySelector('[data-incident-ingestion] a').click()");
  await until("location.pathname==='/admin/tools'");checks.push('Alat admin link navigates to existing route');
  assert.equal(runtimeErrors.length,0,JSON.stringify(runtimeErrors)); checks.push('no uncaught browser exceptions');
  writeFileSync('/private/tmp/dompis-bulk-ui-evidence.json',JSON.stringify({checks,requests,layout,contrast,runtimeErrors},null,2));
  console.log(JSON.stringify({checks,posts:requests.length,evidence:'/private/tmp/dompis-bulk-ui-evidence.json'},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{cdp?.send(JSON.stringify({id:999999,method:'Browser.close'})); cdp?.close();chrome.kill('SIGTERM');setTimeout(()=>process.exit(process.exitCode??0),1000);});
