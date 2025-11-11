/* ========== CONFIG ========== */
const API_URL = 'https://844aace9e015.ngrok-free.app/push';
const SECRET_TOKEN = 'MY_SECRET_TOKEN_ChangeMe';
const MAX_ROWS = 18;
const LEFT_COUNT = 9;
const TIMER_SECONDS = 180;

/* ========== state ========== */
let rowData = [];
let pasteCounts = [];
let copyCounts = [];
let uniqueLinks = [];
let timers = [];

function storageKey(){ return 'textManager_2col_v1' }
function isValidUrl(s){ return /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i.test(String(s||'').trim()) }

function saveState(){
  const payload = {
    rowData,
    pasteCounts,
    copyCounts,
    uniqueLinks,
    timers: timers.map(t => t ? { timeLeft: t.timeLeft, waitingForFocus: !!t.waitingForFocus } : null),
    ts: new Date().toISOString()
  };
  localStorage.setItem(storageKey(), JSON.stringify(payload));
}
function loadState(){
  const raw = localStorage.getItem(storageKey());
  if(!raw){
    rowData = Array(MAX_ROWS).fill(0).map(()=>({ text:'', note:'', agent:'', stt: null, lastPasteTimestamp: null }));
    pasteCounts = Array(MAX_ROWS).fill(0);
    copyCounts = Array(MAX_ROWS).fill(0);
    uniqueLinks = [];
    timers = Array(MAX_ROWS).fill(null);
    renderAll(); updateTotals(); return;
  }
  try{
    const obj = JSON.parse(raw);
    rowData = obj.rowData && obj.rowData.length===MAX_ROWS ? obj.rowData.map(r => ({
      text: r.text||'',
      note: r.note||'',
      agent: r.agent||'',
      stt: r.stt || null,
      lastPasteTimestamp: r.lastPasteTimestamp || null
    })) : Array(MAX_ROWS).fill(0).map(()=>({ text:'', note:'', agent:'', stt: null, lastPasteTimestamp: null }));
    pasteCounts = obj.pasteCounts && obj.pasteCounts.length===MAX_ROWS ? obj.pasteCounts : Array(MAX_ROWS).fill(0);
    copyCounts = obj.copyCounts && obj.copyCounts.length===MAX_ROWS ? obj.copyCounts : Array(MAX_ROWS).fill(0);
    uniqueLinks = obj.uniqueLinks || [];
    timers = Array(MAX_ROWS).fill(null);
    if(obj.timers && Array.isArray(obj.timers)){
      obj.timers.forEach((t,i)=>{
        if(t && typeof t.timeLeft === 'number'){
          timers[i] = { timeLeft: t.timeLeft, intervalId: null, waitingForFocus: !!t.waitingForFocus };
        }
      });
    }
  }catch(e){
    console.error('Load state error', e);
    rowData = Array(MAX_ROWS).fill(0).map(()=>({ text:'', note:'', agent:'', stt: null, lastPasteTimestamp: null }));
    pasteCounts = Array(MAX_ROWS).fill(0);
    copyCounts = Array(MAX_ROWS).fill(0);
    uniqueLinks = [];
    timers = Array(MAX_ROWS).fill(null);
  }
  renderAll(); updateTotals();
  timers.forEach((t,i)=>{
    if(t && !t.waitingForFocus && t.timeLeft > 0){
      startTimer(i+1);
    }
  });
}

/* UI render */
function buildAgentSelect(selected){
  let s = '<select class="agent-select">';
  for(let i=1;i<=MAX_ROWS;i++) s += `<option value="${i}" ${String(i)===String(selected)?'selected':''}>Agent ${i}</option>`;
  s += '</select>';
  return s;
}

function formatTimerText(timeLeft){
  if(timeLeft <= 0) return 'Sẵn sàng';
  const m = Math.floor(timeLeft/60);
  const s = timeLeft % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function makeRowHtml(index){
  const id = index+1;
  const data = rowData[index] || { text:'', note:'', agent:'', stt:null, lastPasteTimestamp: null };
  const displayStt = (data.stt !== null && data.stt !== undefined && String(data.stt).trim() !== '') ? data.stt : id;
  const textEsc = (data.text||'').replace(/"/g,'&quot;');
  const agentHtml = buildAgentSelect(data.agent || '');
  const timer = timers[index];
  const timerText = timer ? formatTimerText(timer.timeLeft) : '';
  const timerClass = (timer && timer.timeLeft <= 0) ? 'timer ready' : 'timer';

  const rightHtml = `
    <div class="row-right">
      <div class="controls">
        <button class="button paste-btn" onclick="pasteText(${id})">Dán</button>
        <button class="button send-btn" onclick="sendToAgent(${id})">Gửi</button>
        <button class="button copy-btn" onclick="copyText(${id})">Copy</button>
        <button class="button delete-btn" onclick="deleteText(${id})">Delete</button>
      </div>

      <div style="display:flex;flex-direction:column;align-items:flex-start;margin-left:6px">
        <div class="paste-count">Dán: ${pasteCounts[id-1]||0} lần</div>
        <div class="copy-count ${copyCounts[id-1] >= 5 ? 'copy-warning' : ''}">Copy: ${copyCounts[id-1] || 0} lần</div>
      </div>

      <div class="spinner-col">
        <button onclick="changeCopy(${id}, 1)">▲</button>
        <button onclick="changeCopy(${id}, -1)">▼</button>
      </div>

      ${agentHtml}

      <textarea class="note-input" placeholder="Ghi chú...">${data.note||''}</textarea>
    </div>
  `;

  return `
    <div class="row" data-id="${id}">
      <div class="${timerClass}">${timerText}</div>
      <div class="row-number" title="Double-click để sửa STT">${displayStt}</div>
      <input class="text-input" value="${textEsc}" placeholder="Nhập link hoặc văn bản..." />
      ${rightHtml}
    </div>
  `;
}

function renderAll(){
  const left = document.getElementById('left-rows');
  const right = document.getElementById('right-rows');
  left.innerHTML = ''; right.innerHTML = '';

  for(let i=0;i<LEFT_COUNT;i++){
    const wrap = document.createElement('div');
    wrap.innerHTML = makeRowHtml(i);
    left.appendChild(wrap.firstElementChild);
  }
  for(let i=LEFT_COUNT;i<MAX_ROWS;i++){
    const wrap = document.createElement('div');
    wrap.innerHTML = makeRowHtml(i);
    right.appendChild(wrap.firstElementChild);
  }

  document.querySelectorAll('.row').forEach(rowEl => {
    const id = parseInt(rowEl.getAttribute('data-id'));
    const idx = id-1;
    const input = rowEl.querySelector('.text-input');
    input.addEventListener('input', e => { rowData[idx].text = e.target.value; saveState(); });
    input.title = rowData[idx].text || '';

    const select = rowEl.querySelector('.agent-select');
    select.addEventListener('change', e => { rowData[idx].agent = e.target.value; saveState(); });

    const note = rowEl.querySelector('.note-input');
    note.addEventListener('input', e => { rowData[idx].note = e.target.value; saveState(); });

    const rn = rowEl.querySelector('.row-number');
    rn.addEventListener('dblclick', ()=> startEditSTTinline(rowEl));

    updateTimerDisplay(id);
  });
}

function updateTotals(){
  const totalPaste = pasteCounts.reduce((s,c)=>s+(c||0),0);
  document.getElementById('total-paste').textContent = totalPaste;
  document.getElementById('total-links').textContent = (uniqueLinks||[]).length;
}

/* ========== Timer functions ========== */
function updateTimerDisplay(rowId){
  const idx = rowId-1;
  const row = document.querySelector(`.row[data-id="${rowId}"]`);
  if(!row) return;
  const el = row.querySelector('.timer');
  const t = timers[idx];
  if(!t){ el.textContent = ''; el.classList.remove('ready'); return; }
  if(t.timeLeft > 0){
    el.textContent = formatTimerText(t.timeLeft);
    el.classList.remove('ready');
  } else {
    el.textContent = 'Sẵn sàng';
    el.classList.add('ready');
    if(t.intervalId) { clearInterval(t.intervalId); t.intervalId = null; }
  }
}

function resetTimer(rowId){
  const idx = rowId-1;
  if(timers[idx]){
    if(timers[idx].intervalId) { clearInterval(timers[idx].intervalId); }
    timers[idx] = null;
    updateTimerDisplay(rowId);
  }
}

function startTimer(rowId){
  const idx = rowId-1;
  if(!timers[idx]) return;
  timers[idx].waitingForFocus = false;
  if(timers[idx].intervalId) clearInterval(timers[idx].intervalId);
  timers[idx].intervalId = setInterval(()=>{
    timers[idx].timeLeft--;
    updateTimerDisplay(rowId);
    saveState();
    if(timers[idx].timeLeft <= 0){
      clearInterval(timers[idx].intervalId);
      timers[idx].intervalId = null;
    }
  },1000);
}

/* ========== Actions (paste/copy/send/delete) ========== */
async function pasteText(rowId){
  const idx = rowId-1;
  try{
    const txt = await navigator.clipboard.readText();
    rowData[idx].text = txt;
    pasteCounts[idx] = (pasteCounts[idx]||0)+1;

    if(isValidUrl(txt)){
      const t = txt.trim();
      if(!uniqueLinks.some(l=>l.url===t)) uniqueLinks.push({ url:t, timestamp: new Date().toISOString() });
      rowData[idx].lastPasteTimestamp = new Date().toISOString();
      updateTotals();
    } else {
      rowData[idx].lastPasteTimestamp = new Date().toISOString();
    }

    if(pasteCounts[idx] > 1) { copyCounts[idx] = 0; }
    copyCounts[idx] = (copyCounts[idx]||0)+1;

    resetTimer(rowId);
    timers[idx] = { timeLeft: TIMER_SECONDS, intervalId: null, waitingForFocus: true };
    updateTimerDisplay(rowId);

    saveState();
    renderAll();
    updateTotals();
    showToast('Đã dán');
  }catch(e){
    console.error('Lỗi dán', e);
    alert('Lỗi dán. Kiểm tra quyền clipboard hoặc chạy trên https/localhost.');
  }
}

function copyText(rowId){
  const idx = rowId-1;
  const text = rowData[idx].text || '';
  navigator.clipboard.writeText(text).then(()=>{
    copyCounts[idx] = (copyCounts[idx]||0)+1;

    resetTimer(rowId);
    timers[idx] = { timeLeft: TIMER_SECONDS, intervalId: null, waitingForFocus: true };
    updateTimerDisplay(rowId);

    saveState();
    renderAll();
    updateTotals();
    showToast('Đã copy');
  }).catch(e=>{
    console.error('Lỗi copy', e);
    alert('Lỗi copy: '+e);
  });
}

function deleteText(rowId){
  const idx = rowId-1;
  rowData[idx].text = '';
  rowData[idx].note = '';
  rowData[idx].agent = '';
  rowData[idx].stt = null;
  rowData[idx].lastPasteTimestamp = null;
  pasteCounts[idx] = 0;
  copyCounts[idx] = 0;
  resetTimer(rowId);
  saveState();
  renderAll();
  updateTotals();
  showToast('Đã xóa');
}

async function sendToAgent(rowId){
  const idx = rowId-1;
  const link = (rowData[idx].text||'').trim();
  if(!link){ showToast('Chưa có link để gửi', true); return; }
  if(!isValidUrl(link) && !confirm('Link có vẻ không chuẩn http(s). Vẫn gửi?')) return;

  const chosen = rowData[idx].agent && rowData[idx].agent.trim() ? rowData[idx].agent.trim() : null;
  const fallback = localStorage.getItem('nreer_agent_id') || null;
  const agentTo = chosen || fallback || '1';

  const payload = { token: SECRET_TOKEN, targetAgent: agentTo, link };
  try{
    const resp = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const j = await resp.json().catch(()=>({ ok:false, error:'invalid_json' }));
    if(resp.ok && j.ok){
      showToast(`Đã gửi tới Agent ${agentTo}`);
    } else {
      showToast('Gửi thất bại: ' + (j.error || JSON.stringify(j)), true);
    }
  }catch(e){
    console.error(e);
    showToast('Lỗi khi gửi', true);
  }
}

/* ========== Inline STT edit (no reorder) ========== */
function startEditSTTinline(rowEl){
  const rn = rowEl.querySelector('.row-number');
  const id = parseInt(rowEl.getAttribute('data-id'));
  const idx = id-1;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = (rowData[idx] && rowData[idx].stt !== null && rowData[idx].stt !== undefined && String(rowData[idx].stt).trim() !== '') ? String(rowData[idx].stt) : String(id);
  inp.style.width = '46px';
  inp.style.height = '34px';
  inp.style.fontWeight = '700';
  inp.style.borderRadius = '6px';
  inp.style.textAlign = 'center';
  inp.className = 'stt-edit-input';
  rn.replaceWith(inp);
  inp.focus();
  inp.select();

  function finish(){
    const raw = inp.value.trim();
    if(raw === '') rowData[idx].stt = null;
    else rowData[idx].stt = raw.slice(0, 6);
    saveState();
    renderAll();
  }
  inp.addEventListener('blur', finish);
  inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter') inp.blur(); if(e.key==='Escape') renderAll(); });
}

/* ========== Links modal ========== */
function showLinksModal(){
  const list = document.getElementById('links-list');
  list.innerHTML = '';
  if((uniqueLinks||[]).length===0) list.innerHTML = '<li>Chưa có link nào</li>';
  else {
    uniqueLinks.forEach(u => {
      const li = document.createElement('li');
      li.style.padding = '6px 0';
      li.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px"><div style="width:78%">${u.url}</div><small style="color:#666">${new Date(u.timestamp).toLocaleTimeString()}</small><div><button style="margin-left:8px;padding:6px 10px;background:#dc3545;color:#fff;border:none;border-radius:6px;cursor:pointer" onclick="removeLink('${u.url.replace(/'/g,"\\'")}')">Xóa</button></div></div>`;
      list.appendChild(li);
    });
  }
  document.getElementById('links-modal').style.display = 'block';
}
function closeLinksModal(){ document.getElementById('links-modal').style.display = 'none' }
function removeLink(url){ uniqueLinks = uniqueLinks.filter(u=>u.url!==url); saveState(); showLinksModal(); updateTotals(); }
function deleteAllLinks(){ uniqueLinks = []; saveState(); showLinksModal(); updateTotals(); }

function showToast(msg, isError=false){
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; }, 1200);
  setTimeout(()=> t.remove(), 1700);
}

/* ========== Visibility & resume timers ========== */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    timers.forEach((timer, index) => {
      if (timer && timer.waitingForFocus && timer.timeLeft > 0) {
        startTimer(index + 1);
        saveState();
      }
    });
  }
});

/* ========== Reset / init ========== */
function resetToDefault(){
  if(!confirm('Reset toàn bộ dữ liệu về 18 hàng trống?')) return;
  localStorage.removeItem(storageKey());
  loadState();
  showToast('Đã reset');
}
function changeCopy(rowId, delta) {
  const idx = rowId - 1;
  const current = copyCounts[idx] || 0;
  const next = Math.max(0, current + delta);
  copyCounts[idx] = next;
  saveState();
  renderAll();
}

/* init */
window.addEventListener('load', ()=>{ loadState(); setInterval(()=>updateTotals(),1000); });
window.__textTwoCol = { loadState, saveState, sendToAgent, deleteAllLinks };
