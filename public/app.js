// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const GRADES = [
  {c:'G',   d:'Poor. Heavy wear, complete.'},
  {c:'G+',  d:'Good. Significant wear, all pages intact.'},
  {c:'VG',  d:'Very Good. Minor wear, no major defects.'},
  {c:'VG+', d:'Very Good+. Light wear, nearly complete.'},
  {c:'NM',  d:'Near Mint. Almost perfect.'},
  {c:'M',   d:'Mint. Perfect, unread condition.'},
];

const SOURCES = [
  { label:'— Source —', value:'' },
  { label:'Pêle-Mêle — Bd Lemonnier', value:'Pêle-Mêle' },
  { label:'Évasion — Rue du Midi', value:'Évasion' },
  { label:'Nuit de Chine — Fontainas', value:'Nuit de Chine' },
  { label:'Pierre Coumans — Galerie Bortier', value:'Pierre Coumans' },
  { label:"L'Abac — Rue Blaes", value:"L'Abac" },
  { label:"L'Imaginaire — Jeu de Balle", value:"L'Imaginaire" },
  { label:'Bouquinerie Sablon', value:'Bouquinerie Sablon' },
  { label:'Pêle-Mêle Ixelles — Chée Waterloo', value:'Pêle-Mêle Ixelles' },
  { label:'Boekhandel Nijinski — Chée Ixelles', value:'Nijinski' },
  { label:'Oxfam Bookshop — Chée Ixelles', value:'Oxfam Bookshop' },
  { label:'Abelard — Rue François Dons', value:'Abelard' },
  { label:'Pêle-Mêle Waterloo', value:'Pêle-Mêle Waterloo' },
  { label:'A la Source du Livre — Wavre', value:'Source du Livre' },
  { label:'Bibliopolis — Wavre', value:'Bibliopolis' },
  { label:'Jeu de Balle — Marché', value:'Jeu de Balle' },
  { label:'Autre / Autre ville', value:'Autre' },
];

// ─── STATE ────────────────────────────────────────────────────────────────────
let book = null, grade = null, stream = null, scanning = false;
let mktLow = null, mktHigh = null, photo = null, pendingISBN = null;
let currentTab = 'stock', pushItem = null, recognition = null;
let db = { stock:[], history:[] };

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
const S = {
  get ant()    { return localStorage.getItem('sb_ant')      || ''; },
  get ebay()   { return localStorage.getItem('sb_ebay')     || ''; },
  get sDomain(){ return localStorage.getItem('sb_s_domain') || ''; },
  get sToken() { return localStorage.getItem('sb_s_token')  || ''; },
  get syncKey(){ return localStorage.getItem('sb_sync_key') || ''; },
};

function saveSettings() {
  localStorage.setItem('sb_ant',      el('s-anthropic').value.trim());
  localStorage.setItem('sb_ebay',     el('s-ebay').value.trim());
  localStorage.setItem('sb_s_domain', el('s-shopify-domain').value.trim());
  localStorage.setItem('sb_s_token',  el('s-shopify-token').value.trim());
  localStorage.setItem('sb_sync_key', el('s-sync-key').value.trim());
  updateSettingsUI();
}

function updateSettingsUI() {
  const a = S.ant, sh = S.sToken, sk = S.syncKey;
  setStatus('s-anthropic-status', a && a.startsWith('sk-ant'));
  setStatus('s-shopify-status',   !!sh);
  setStatus('s-sync-status',      !!sk, sk ? `Key: ${sk.substring(0,8)}…` : 'Not set');
}

function setStatus(id, ok, label) {
  const e = el(id); if(!e) return;
  e.className = 's-status ' + (ok ? 'ok' : 'no');
  e.textContent = label || (ok ? '✓ Configured' : 'Not configured');
}

function openSettings() {
  el('s-anthropic').value     = S.ant;
  el('s-ebay').value          = S.ebay;
  el('s-shopify-domain').value = S.sDomain;
  el('s-shopify-token').value  = S.sToken;
  el('s-sync-key').value       = S.syncKey;
  updateSettingsUI();
  updateStats();
  el('settings-panel').classList.add('open');
}
function closeSettings() { el('settings-panel').classList.remove('open'); }

function updateStats() {
  el('hdr-count').textContent = db.stock.length + ' item' + (db.stock.length!==1?'s':'');
  el('s-stock-count').textContent = db.stock.length;
  el('s-hist-count').textContent  = db.history.length;
  el('s-total').textContent = '€' + db.stock.reduce((a,b)=>a+(parseFloat(b.price)||0),0).toFixed(0);
}

function clearAll() {
  if(!confirm('Clear all data on all devices?')) return;
  db = { stock:[], history:[] };
  syncToServer();
  updateStats();
  renderLib();
  closeSettings();
  toast('Cleared');
}

// ─── KV SYNC ──────────────────────────────────────────────────────────────────
async function syncFromServer() {
  const key = S.syncKey;
  const bar = el('sync-bar');
  if (!key) { bar.textContent = '⚠ Set a sync key in Settings to sync between devices'; return; }
  bar.textContent = '⟳ Syncing…';
  try {
    const r = await fetch('/api/db', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'get', userId: key })
    });
    const d = await r.json();
    if (d.data) { db = d.data; updateStats(); renderLib(); }
    bar.textContent = '';
  } catch(e) {
    bar.textContent = '⚠ Offline — local data only';
  }
}

async function syncToServer() {
  const key = S.syncKey;
  if (!key) return;
  try {
    await fetch('/api/db', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'set', userId: key, data: db })
    });
  } catch(e) {}
  updateStats();
}

// ─── VOICE ────────────────────────────────────────────────────────────────────
function toggleVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Voice not supported'); return; }
  if (recognition) { recognition.stop(); recognition = null; el('mic-btn').classList.remove('on'); return; }
  recognition = new SR();
  recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'fr-BE';
  recognition.onstart = () => el('mic-btn').classList.add('on');
  recognition.onresult = e => { el('hint').value = e.results[0][0].transcript; };
  recognition.onend = recognition.onerror = () => { recognition = null; el('mic-btn').classList.remove('on'); };
  recognition.start();
}

// ─── CAMERA ───────────────────────────────────────────────────────────────────
async function handleCamTap() { if (!stream) startCam(); }

async function startCam() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:'environment', width:{ideal:1920}, height:{ideal:1080} }
    });
    el('video').srcObject = stream;
    el('cam-idle').classList.add('hidden');
    el('cam-bar').classList.add('show');
    el('scan-controls').style.display = 'none';
    startBarcode();
  } catch(e) {
    showErr('Camera access denied. Use the ISBN field below.');
  }
}

async function startBarcode() {
  if (!('BarcodeDetector' in window)) return;
  scanning = true;
  const det = new BarcodeDetector({ formats:['ean_13','ean_8','code_128'] });
  const v = el('video');
  const loop = async () => {
    if (!scanning || !stream) return;
    try {
      const codes = await det.detect(v);
      if (codes.length) {
        scanning = false;
        captureFrame(v);
        stopCam();
        fetchBook(codes[0].rawValue);
        return;
      }
    } catch(e) {}
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function captureFrame(v) {
  try {
    const c = document.createElement('canvas');
    const M = 800, r = Math.min(M/v.videoWidth, M/v.videoHeight, 1);
    c.width = Math.round(v.videoWidth*r); c.height = Math.round(v.videoHeight*r);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    photo = c.toDataURL('image/jpeg', .75);
  } catch(e) {}
}

function stopCam(e) {
  if (e) e.stopPropagation();
  if (stream) { stream.getTracks().forEach(t=>t.stop()); stream = null; }
  scanning = false;
  el('cam-idle').classList.remove('hidden');
  el('cam-bar').classList.remove('show');
  el('scan-controls').style.display = 'flex';
}

function capturePhoto(e) {
  if (e) e.stopPropagation();
  if (!stream) return;
  const v = el('video');
  const c = document.createElement('canvas');
  const M = 800, r = Math.min(M/v.videoWidth, M/v.videoHeight, 1);
  c.width = Math.round(v.videoWidth*r); c.height = Math.round(v.videoHeight*r);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  photo = c.toDataURL('image/jpeg', .75);
  stopCam();
  identifyAI(photo.split(',')[1], 'image/jpeg');
}

// ─── ISBN ─────────────────────────────────────────────────────────────────────
function lookupISBN() {
  const val = el('isbn').value.replace(/[^0-9]/g,'');
  if (val.length < 10) { showErr('ISBN must be 10 or 13 digits'); return; }
  pendingISBN = val; photo = null;
  fetchBook(val);
}

async function fetchBook(isbn) {
  setLoad('Searching…'); hideErr();
  try {
    const r1 = await fetch('https://openlibrary.org/api/books?bibkeys=ISBN:'+isbn+'&format=json&jscmd=data');
    const d1 = await r1.json();
    if (d1['ISBN:'+isbn]) { const b=fmtOL(d1['ISBN:'+isbn],isbn); addHistory(b); buildFiche(b); return; }
    const r2 = await fetch('https://openlibrary.org/search.json?isbn='+isbn+'&limit=8');
    const d2 = await r2.json();
    if (d2.docs?.length) { const books=d2.docs.map(fmtSearch); if(books.length===1){addHistory(books[0]);buildFiche(books[0]);}else showEditions(books); return; }
    const r3 = await fetch('https://openlibrary.org/isbn/'+isbn+'.json');
    if (r3.ok) { const b=fmtRaw(await r3.json(),isbn); addHistory(b); buildFiche(b); return; }
    if (photo) { setLoad('ISBN not found — asking Claude…', true); await identifyAI(photo.split(',')[1],'image/jpeg',true); return; }
    goTo('scan-screen'); showErr('ISBN not found. Use camera to identify.');
  } catch(e) {
    goTo('scan-screen'); showErr('Connection error.');
  }
}

function fmtOL(b,isbn) { return { title:b.title||'', author:(b.authors||[]).map(a=>a.name).join(', '), publisher:b.publishers?.[0]?.name||'', year:(b.publish_date||'').match(/\d{4}/)?.[0]||'', isbn, cover:b.cover?.large||b.cover?.medium||null, pages:b.number_of_pages||'', editionCount:1 }; }
function fmtSearch(d)  { return { title:d.title||'', author:d.author_name?.[0]||'', publisher:d.publisher?.[0]||'', year:d.first_publish_year||'', isbn:d.isbn?.[0]||'', cover:d.cover_i?'https://covers.openlibrary.org/b/id/'+d.cover_i+'-M.jpg':null, pages:d.number_of_pages_median||'', editionCount:d.edition_count||1 }; }
function fmtRaw(b,isbn){ return { title:b.title||'', author:'', publisher:b.publishers?.[0]||'', year:(b.publish_date||'').match(/\d{4}/)?.[0]||'', isbn, cover:b.covers?'https://covers.openlibrary.org/b/id/'+b.covers[0]+'-M.jpg':null, pages:b.number_of_pages||'', editionCount:1 }; }

// ─── AI ───────────────────────────────────────────────────────────────────────
async function identifyAI(base64, mediaType, fromFallback=false) {
  if (!S.ant) { goTo('scan-screen'); showErr('API key not configured. Go to Settings ⚙.'); return; }
  if (!fromFallback) setLoad('Claude is identifying…', true);
  const hint = el('hint').value;
  try {
    const r = await fetch('/api/identify', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ image:base64, mediaType, apiKey:S.ant, hint, action:'identify' })
    });
    const d = await r.json();
    if (d.error) { goTo('scan-screen'); showErr('API error: '+(d.error.message||'')); return; }
    const txt = d.content?.map(c=>c.text||'').join('')||'';
    let parsed;
    try { parsed = JSON.parse(txt.replace(/```json|```/g,'').trim()); } catch(e) { goTo('scan-screen'); showErr('Parse error. Try a clearer photo.'); return; }
    if (!parsed.identified) { goTo('scan-screen'); showErr('Could not identify. Try a clearer photo.'); return; }
    if (pendingISBN && !parsed.isbn) parsed.isbn = pendingISBN;
    parsed.aiIdentified = true; parsed.bookPhoto = photo;
    addHistory(parsed); buildFiche(parsed);
  } catch(e) { goTo('scan-screen'); showErr('Error: '+e.message); }
}

async function genDesc() {
  if (!pushItem?.bookPhoto) { toast('No photo available'); return; }
  const btn = el('gen-btn'); btn.disabled=true; btn.textContent='Generating…';
  try {
    const r = await fetch('/api/identify', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ image:pushItem.bookPhoto.split(',')[1], mediaType:'image/jpeg', apiKey:S.ant, hint:pushItem.title+' '+pushItem.author, action:'describe' })
    });
    const d = await r.json();
    const txt = d.content?.map(c=>c.text||'').join('').trim()||'';
    if (txt) el('push-desc').value = txt; else toast('Generation failed');
  } catch(e) { toast('Error: '+e.message); }
  btn.disabled=false; btn.textContent='✦ Generate with AI';
}

// ─── EBAY ─────────────────────────────────────────────────────────────────────
async function fetchEbay(b) {
  if (!S.ebay) return;
  const q = [b.title, b.author].filter(Boolean).join(' ').substring(0,100);
  try {
    const r = await fetch('/api/ebay', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ query:q, appId:S.ebay })
    });
    const d = await r.json();
    const sold=d.sold||{}, active=d.active||{};
    let html = '';
    if (sold.count > 0) {
      html += `<div class="ebay-block"><span class="ebay-sold">✓ Sold (${sold.count}) · avg €${sold.avgPrice} · €${sold.minPrice}–€${sold.maxPrice}</span>`;
      if (sold.items?.length) html += `<div class="ebay-items">${sold.items.map(i=>`<div class="ebay-item"><a href="${i.url}" target="_blank">${i.title.substring(0,42)}…</a><span class="ebay-price">€${Math.round(i.price)}</span></div>`).join('')}</div>`;
      html += '</div>';
      if (!mktLow) { mktLow=sold.minPrice; mktHigh=sold.maxPrice; renderMarket('eBay sold'); }
    } else {
      html += `<div class="ebay-block"><span class="ebay-none">No sold listings on eBay</span></div>`;
    }
    if (active.count > 0) {
      html += `<div class="ebay-block" style="border-top:1px solid var(--border)"><span class="ebay-live">🔵 Live (${active.count}) · €${active.minPrice}–€${active.maxPrice}</span>`;
      if (active.items?.length) html += `<div class="ebay-items">${active.items.map(i=>`<div class="ebay-item"><a href="${i.url}" target="_blank">${i.title.substring(0,42)}…</a><span class="ebay-price live">€${Math.round(i.price)}</span></div>`).join('')}</div>`;
      html += '</div>';
    }
    el('ebay-block').innerHTML = html;
  } catch(e) {
    el('ebay-block').innerHTML = `<div class="ebay-block"><span class="ebay-none">eBay error: ${e.message}</span></div>`;
  }
}

// ─── MARKET ───────────────────────────────────────────────────────────────────
async function fetchMarket(b) {
  el('market-top').innerHTML = '<div class="market-loading">Estimating…</div>';
  el('ebay-block').innerHTML = '';
  mktLow=null; mktHigh=null;
  if (b.marketLow && b.marketHigh) { mktLow=parseInt(b.marketLow); mktHigh=parseInt(b.marketHigh); renderMarket('Claude est.'); fetchEbay(b); return; }
  await new Promise(r=>setTimeout(r,300));
  const age = new Date().getFullYear() - (parseInt(b.year)||2000);
  let lo=5, hi=15;
  if (age>40){lo=20;hi=60;}else if(age>25){lo=12;hi=35;}else if(age>15){lo=8;hi=22;}
  if ((b.editionCount||1)<=2){lo=Math.round(lo*1.5);hi=Math.round(hi*2);}
  mktLow=lo; mktHigh=hi;
  renderMarket('Claude est.');
  fetchEbay(b);
}

function renderMarket(src) {
  el('market-top').innerHTML = `<div class="market-range"><div class="market-src">${src.toUpperCase()}</div><div class="market-vals"><span class="market-lo">€${mktLow}</span>&nbsp;→&nbsp;<span class="market-hi">€${mktHigh}</span></div></div>`;
  recalc();
}

function recalc() {
  // FIX: check for empty string, not falsy (allows price = 0)
  const priceVal = el('price').value;
  const buy = priceVal.trim() === '' ? null : parseFloat(priceVal);
  const row = el('return-row');
  if (!grade) { row.className='return-row'; setReturn('👆','Select condition first','Then enter your purchase price'); return; }
  if (buy === null || !mktHigh) { row.className='return-row'; if(mktHigh&&buy===null)setReturn('💰','Enter your purchase price','Market est. €'+mktLow+'–€'+mktHigh); return; }
  const x = buy === 0 ? '∞' : (mktHigh/buy).toFixed(1);
  row.className = 'return-row good';
  const margin = buy === 0 ? mktHigh.toFixed(0) : (mktHigh-buy).toFixed(0);
  setReturn('✓', '×'+x+' return', 'Buy €'+buy+' → up to €'+mktHigh+' · margin €'+margin);
}

function setReturn(icon, text, sub) {
  el('r-icon').textContent=icon; el('r-text').textContent=text; el('r-sub').textContent=sub;
}

function onPriceChange() { recalc(); }

// ─── SEARCH LINKS ─────────────────────────────────────────────────────────────
function buildSearchLinks(b) {
  const q = encodeURIComponent([b.title, b.author].filter(Boolean).join(' '));
  const isbn = b.isbn||'';
  el('google-sale-btn').href  = `https://www.google.com/search?q=${q}+for+sale`;
  el('google-sold-btn').href  = `https://www.google.com/search?q=${q}+sold+price`;
  el('worldcat-btn').href     = isbn ? `https://www.worldcat.org/isbn/${isbn}` : `https://www.worldcat.org/search?q=${q}`;
}

// ─── FICHE ────────────────────────────────────────────────────────────────────
function addHistory(b) {
  if (!db.history.find(i=>i.isbn&&i.isbn===b.isbn)) {
    db.history.unshift({...b, scannedAt:Date.now(), source:el('source-sel').value});
    if (db.history.length > 500) db.history=db.history.slice(0,500);
    syncToServer();
  }
}

function buildFiche(b) {
  book=b; grade=null; mktLow=null; mktHigh=null; pendingISBN=null;
  const inStock = b.isbn && db.stock.find(i=>i.isbn===b.isbn);
  const bar = el('in-stock-bar');
  if (inStock) { bar.className='in-stock-bar show'; bar.textContent='⚡ Already in stock · €'+(inStock.price||'?'); }
  else bar.className='in-stock-bar';

  const iw = el('fiche-img-wrap');
  const src = b.bookPhoto||b.cover||null;
  if (src) iw.innerHTML=`<img class="fiche-img" src="${src}" alt=""><button class="retake-btn" onclick="photo=null;goTo('scan-screen')">📷 Retake</button>`;
  else      iw.innerHTML=`<div class="fiche-img-ph"><span>📖</span><p>No photo</p></div>`;

  el('fiche-hd').innerHTML = `<div class="fiche-title">${b.title}</div>${b.author?`<div class="fiche-author">${b.author}</div>`:''}<div class="fiche-meta">${[b.publisher,b.year,b.pages?b.pages+'p':'',b.isbn?'ISBN '+b.isbn:''].filter(Boolean).join(' · ')}</div>`;

  const grid = el('grade-grid'); grid.innerHTML='';
  GRADES.forEach(g => {
    const btn=document.createElement('button'); btn.className='grade-btn'; btn.textContent=g.c;
    btn.onclick=()=>selectGrade(g); grid.appendChild(btn);
  });

  el('price').value='';
  el('notes').value='';
  el('grade-desc').textContent='Select condition (optional)';
  el('return-row').className='return-row';
  setReturn('👆','Select condition (optional)','Then enter your purchase price');
  buildSearchLinks(b);
  goTo('fiche-screen');
  fetchMarket(b);
}

function selectGrade(g) {
  grade=g;
  document.querySelectorAll('.grade-btn').forEach((b,i)=>b.classList.toggle('sel',GRADES[i].c===g.c));
  el('grade-desc').textContent=g.d;
  recalc();
}

async function saveToStock() {
  if (!book) return;
  // FIX: price can be 0 (free item) — check for empty string, not falsy
  const priceVal = el('price').value.trim();
  if (priceVal === '') { toast('Enter a purchase price (0 for free)'); return; }
  db.stock.push({
    ...book,
    bookPhoto: photo,
    grade: grade?.c || null,
    price: parseFloat(priceVal),
    marketLow: mktLow,
    marketHigh: mktHigh,
    notes: el('notes').value,
    source: el('source-sel').value,
    addedAt: Date.now(),
    shopifyPushed: false
  });
  await syncToServer();
  toast('✓ Added to stock');
  photo=null;
  setTimeout(()=>goTo('scan-screen'), 1200);
}

// ─── EDITIONS ─────────────────────────────────────────────────────────────────
function showEditions(docs) {
  const list = el('ed-list'); list.innerHTML='';
  docs.forEach(d => {
    const c=document.createElement('div'); c.className='ed-card';
    c.innerHTML=`${d.cover?`<img class="ed-thumb" src="${d.cover}" onerror="this.style.display='none'">`:`<div class="ed-ph">♪</div>`}<div><div class="ed-title">${d.title}</div><div class="ed-meta">${[d.author,d.publisher,d.year].filter(Boolean).join(' · ')}</div></div>`;
    c.onclick=()=>{ addHistory(d); buildFiche(d); };
    list.appendChild(c);
  });
  goTo('ed-screen');
}

// ─── LIBRARY ──────────────────────────────────────────────────────────────────
function switchTab(t) {
  currentTab=t;
  el('tab-stock').classList.toggle('active',t==='stock');
  el('tab-hist').classList.toggle('active', t==='history');
  renderLib();
}

function renderLib() {
  const q = (el('lib-search').value||'').toLowerCase();
  const items = (currentTab==='stock'?db.stock:db.history)
    .filter(i=>!q||(i.title||'').toLowerCase().includes(q)||(i.author||'').toLowerCase().includes(q))
    .sort((a,b)=>(b.addedAt||b.scannedAt||0)-(a.addedAt||a.scannedAt||0));
  const list = el('lib-items');
  if (!items.length) { list.innerHTML='<div class="lib-empty">No items yet.</div>'; return; }

  window._items = items;
  list.innerHTML = items.map((item,idx) => {
    const p = item.bookPhoto||item.cover||null;
    const isStock = currentTab==='stock';
    const right = isStock
      ? `<div class="lib-right"><div class="lib-price">€${item.price}</div>${item.grade?`<div class="lib-grade">${item.grade}</div>`:''}<button class="push-btn" data-idx="${idx}">${item.shopifyPushed?'✓ Live':'⬆ Shopify'}</button></div>`
      : `<div class="lib-right"><div class="lib-date">${new Date(item.scannedAt||item.addedAt).toLocaleDateString('fr-BE',{day:'2-digit',month:'2-digit'})}</div></div>`;
    return `<div class="lib-card"><div class="lib-ph"${p?` style="display:none"`:''}>♪</div>${p?`<img class="lib-thumb" src="${p}" onerror="this.style.display='none'">`:''}<div class="lib-info"><div class="lib-title">${item.title}</div><div class="lib-meta">${[item.author,item.year,item.source].filter(Boolean).join(' · ')}</div></div>${right}</div>`;
  }).join('');

  list.querySelectorAll('.push-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = window._items[parseInt(btn.dataset.idx)];
      if (item.shopifyPushed) toast('Already on Shopify');
      else openPush(item);
    });
  });
}

// ─── PUSH SHOPIFY ─────────────────────────────────────────────────────────────
function openPush(item) {
  pushItem = item;
  const p = item.bookPhoto||item.cover||null;
  el('push-photo').innerHTML = p ? `<img class="push-photo" src="${p}" alt="">` : `<div class="push-ph">📖</div>`;
  el('push-title').textContent = item.title;
  el('push-meta').textContent  = [item.author, item.publisher, item.year, item.grade?'Grade: '+item.grade:''].filter(Boolean).join(' · ');
  el('push-price').value   = item.marketHigh || Math.round((item.price||0)*2) || '';
  el('push-weight').value  = '400';
  el('push-desc').value    = item.description||'';
  el('push-cat').value     = item.category||'books-other';
  el('push-modal').classList.add('open');
}

function closePush() { el('push-modal').classList.remove('open'); pushItem=null; }

async function confirmPush() {
  if (!S.sDomain || !S.sToken) { toast('Configure Shopify in Settings first'); return; }
  const price = el('push-price').value;
  if (!price) { toast('Enter a selling price'); return; }
  const btn = el('push-confirm-btn'); btn.disabled=true; btn.textContent='Pushing…';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch('/api/shopify', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          shopDomain: S.sDomain,
          accessToken: S.sToken,
          product: {
            title:       pushItem.title,
            description: el('push-desc').value||'',
            price:       parseFloat(price),
            weight:      parseInt(el('push-weight').value)||400,
            category:    el('push-cat').value,
            author:      pushItem.author||'',
            publisher:   pushItem.publisher||'',
            year:        pushItem.year||'',
            grade:       pushItem.grade||'',
            isbn:        pushItem.isbn||'',
            imageBase64: pushItem.bookPhoto||null,
          }
        }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }

    const d = await res.json();
    if (d.product) {
      const idx = db.stock.findIndex(i=>i.addedAt===pushItem.addedAt);
      if (idx>=0) { db.stock[idx].shopifyPushed=true; db.stock[idx].shopifyId=d.product.id; await syncToServer(); }
      toast('✓ Pushed to Shopify!');
      closePush(); renderLib();
    } else {
      toast('Shopify error — check settings');
      console.error(d);
    }
  } catch(e) {
    toast(e.name==='AbortError' ? 'Timeout — try on a better connection' : 'Error: '+e.message);
  }
  btn.disabled=false; btn.textContent='⬆ Push to Shopify';
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function navTo(sid, nid) {
  goTo(sid);
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  el(nid).classList.add('active');
  if (sid==='lib-screen') { syncFromServer().then(()=>renderLib()); }
}

function goTo(sid) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  el(sid).classList.add('active');
}

function setLoad(msg, ai=false) {
  el('spin').className='spin '+(ai?'ai':'norm');
  el('load-txt').textContent=msg;
  goTo('load-screen');
}

function showErr(msg) { const e=el('scan-err'); e.textContent=msg; e.classList.add('show'); }
function hideErr()    { el('scan-err').classList.remove('show'); }

function toast(msg) {
  const t=el('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

// ─── HELPER ───────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

// ─── INIT ─────────────────────────────────────────────────────────────────────
// Populate source selector
const sel = el('source-sel');
SOURCES.forEach(s => { const o=document.createElement('option'); o.value=s.value; o.textContent=s.label; sel.appendChild(o); });

// Migrate old localStorage keys
(function migrate() {
  const map = { 'sb_apikey':'sb_ant', 'sb_ebayid':'sb_ebay', 'sb_shopify_domain':'sb_s_domain', 'sb_s_id':'sb_s_token', 'sb_s_secret':'sb_s_token_old' };
  Object.entries(map).forEach(([old,nw]) => { const v=localStorage.getItem(old); if(v&&!localStorage.getItem(nw)) localStorage.setItem(nw,v); });
  // Also handle old clientId/clientSecret — not migrated, user must enter token
})();

updateSettingsUI();
syncFromServer();

window.addEventListener('beforeunload', () => { if (stream) stream.getTracks().forEach(t=>t.stop()); });
