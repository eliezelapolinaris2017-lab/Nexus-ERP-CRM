import { authApi, fx, storageApi, auth } from './firebase.js';

/* ===== Utilidades UI ===== */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);
const today = ()=>new Date().toISOString().slice(0,10);
const monthKey = (d)=>{ const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; };
const idLocal = ()=>Math.random().toString(36).slice(2,10);

/* ========= AUTH overlay ========= */
const loginView = $('#loginView');
const appView   = $('#appView');
const msg = (t)=>($('#authMsg').textContent=t);

function lockApp(lock){
  if(lock){ loginView.classList.add('active'); appView.setAttribute('inert',''); appView.setAttribute('aria-hidden','true'); }
  else{ loginView.classList.remove('active'); appView.removeAttribute('inert'); appView.removeAttribute('aria-hidden'); }
}

$('#loginBtn').onclick = async ()=>{
  const email=$('#email').value.trim(), pass=$('#password').value;
  try{ await authApi.login(email,pass); } catch(e){ msg(e.message); }
};
$('#signupBtn').onclick = async ()=>{
  const email=$('#email').value.trim(), pass=$('#password').value;
  try{ await authApi.signup(email,pass); msg('Cuenta creada. Entra con tu clave.'); }
  catch(e){ msg(e.message); }
};
$('#resetBtn').onclick = async ()=>{
  const email=$('#email').value.trim(); if(!email){ msg('Escribe tu email.'); return; }
  try{ await authApi.reset(email); msg('Te enviamos un enlace para restablecer.'); }
  catch(e){ msg(e.message); }
};
$('#logoutBtn').onclick = async ()=>{ await authApi.logout(); };

let uid = null;                   // tenant actual
let unsub = [];                   // listeners activos

authApi.onAuthStateChanged(auth, async (user)=>{
  unsub.forEach(u=>u()); unsub=[];
  if(!user){ uid=null; lockApp(true); return; }
  uid = user.uid; lockApp(false);
  bootLiveData();  // inicia listeners
});

/* ===== Estado en memoria (render) ===== */
const ST = {
  brand: { name:'Oasis • ERP Cloud', logoUrl:'' },
  // finanzas
  accounts:[], txns:[], invoices:[],
  // crm
  clients:[], leads:[], activities:[],
  // inventario
  categories:[], suppliers:[], warehouses:[], items:[], stock:{}, moves:[]
};

/* ========= Live data (Firestore onSnapshot) ========= */
function bootLiveData(){
  // Marca
  unsub.push( fx.on(uid,'settings', snap=>{
    snap.docChanges().forEach(ch=>{
      const d = { id: ch.doc.id, ...ch.doc.data() };
      if(d.key==='brand'){ ST.brand = d.value || ST.brand; applyBrand(); }
    });
  }));

  // Finanzas
  unsub.push( fx.on(uid,'accounts', snap=>{ ST.accounts = snap.docs.map(d=>({id:d.id,...d.data()})); renderFinanzas(); renderDashboard(); }) );
  unsub.push( fx.on(uid,'txns',     snap=>{ ST.txns     = snap.docs.map(d=>({id:d.id,...d.data()})); renderFinanzas(); renderDashboard(); }) );
  unsub.push( fx.on(uid,'invoices', snap=>{ ST.invoices = snap.docs.map(d=>({id:d.id,...d.data()})); renderFinanzas(); }) );

  // CRM
  unsub.push( fx.on(uid,'clients',    snap=>{ ST.clients    = snap.docs.map(d=>({id:d.id,...d.data()})); renderCRM(); renderFinanzas(); }) );
  unsub.push( fx.on(uid,'leads',      snap=>{ ST.leads      = snap.docs.map(d=>({id:d.id,...d.data()})); renderCRM(); }) );
  unsub.push( fx.on(uid,'activities', snap=>{ ST.activities = snap.docs.map(d=>({id:d.id,...d.data()})); renderCRM(); }) );

  // Inventario
  unsub.push( fx.on(uid,'categories', snap=>{ ST.categories = snap.docs.map(d=>({id:d.id,...d.data()})); renderInventario(); }) );
  unsub.push( fx.on(uid,'warehouses', snap=>{ ST.warehouses = snap.docs.map(d=>({id:d.id,...d.data()})); renderInventario(); }) );
  unsub.push( fx.on(uid,'items',      snap=>{ ST.items      = snap.docs.map(d=>({id:d.id,...d.data()})); renderInventario(); renderDashboard(); }) );
  unsub.push( fx.on(uid,'moves',      snap=>{ ST.moves      = snap.docs.map(d=>({id:d.id,...d.data()})); renderInventario(); renderDashboard(); renderAnalytics(); }) );

  // Stock se deriva de moves (compra/venta/transfer/ajuste)
  // Recalcula en cada cambio de moves
}

function ensureStock(){
  const stock = {}; ST.warehouses.forEach(w=>stock[w.id]={});
  ST.moves.sort((a,b)=> (a.date||'').localeCompare(b.date)).forEach(m=>{
    const whFrom = m.fromWh||''; const whTo = m.toWh||''; const q = Number(m.qty||0);
    stock[whFrom] ??={}; stock[whTo] ??={};
    stock[whFrom][m.itemId] = (stock[whFrom][m.itemId]||0) + (m.type==='venta' || (m.type==='transferencia'&&whFrom)? -Math.abs(q):0);
    stock[whTo][m.itemId]   = (stock[whTo][m.itemId]  ||0) + (m.type==='compra' || (m.type==='transferencia'&&whTo)?  Math.abs(q):0);
    if(m.type==='ajuste'){
      if(q>=0){ stock[whTo][m.itemId]=(stock[whTo][m.itemId]||0)+q; }
      else    { stock[whFrom][m.itemId]=(stock[whFrom][m.itemId]||0)+q; }
    }
  });
  ST.stock = stock;
}
function stockTotal(itemId){
  let t=0; Object.values(ST.stock).forEach(m=> t+=(m?.[itemId]||0)); return t;
}
function catName(id){ return ST.categories.find(c=>c.id===id)?.name || '—'; }
function whName(id){ return ST.warehouses.find(w=>w.id===id)?.name || '—'; }

/* ===== Navegación ===== */
$$('.nav-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    $$('.nav-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    const page = b.dataset.nav; $$('.page').forEach(p=>p.classList.remove('active')); $('#'+page).classList.add('active');
    if(page==='dashboard') renderDashboard();
    if(page==='analytics') renderAnalytics();
  });
});

/* ===== Modal simple ===== */
const modal = $('#modal'), modalTitle = $('#modalTitle'), modalBody = $('#modalBody');
const modalOk = $('#modalOk'), modalCancel = $('#modalCancel'), modalClose = $('#modalClose');
function openModal(title, html, okLabel='Guardar', onOk=()=>{}){
  modalTitle.textContent=title; modalBody.innerHTML=html; modalOk.textContent=okLabel; modal.classList.remove('hidden');
  const ok=()=>{ onOk(); closeModal(); }; modalOk.onclick=ok; modalCancel.onclick=closeModal; modalClose.onclick=closeModal;
}
function closeModal(){ modal.classList.add('hidden'); modalBody.innerHTML=''; }

/* ====== BRAND ====== */
function applyBrand(){
  $('.logo').textContent = ST.brand?.name || 'Oasis • ERP Cloud';
  $('#brandName').value  = ST.brand?.name || '';
  if(ST.brand?.logoUrl){ $('#brandImg').src = ST.brand.logoUrl; $('#logoPreview').src = ST.brand.logoUrl; }
}
$('#saveBrandBtn').onclick = async ()=>{
  const name = $('#brandName').value.trim() || 'Oasis • ERP Cloud';
  await fx.set(uid,'settings','brand', { key:'brand', value:{name, logoUrl:ST.brand?.logoUrl||''} });
};
$('#logoFile').onchange = async (e)=>{
  const f=e.target.files?.[0]; if(!f) return;
  const url = await storageApi.uploadLogo(uid, f);
  ST.brand.logoUrl = url;
  await fx.set(uid,'settings','brand',{ key:'brand', value:{name: $('#brandName').value.trim()||ST.brand.name, logoUrl:url} });
  applyBrand();
};

/* ===== DASHBOARD ===== */
function renderDashboard(){
  ensureStock();
  const m = monthKey(new Date());
  const inc = ST.txns.filter(t=>t.type==='ingreso' && monthKey(t.date)===m).reduce((a,t)=>a+Number(t.amount||0),0);
  const exp = ST.txns.filter(t=>t.type==='gasto'   && monthKey(t.date)===m).reduce((a,t)=>a+Number(t.amount||0),0);
  $('#kpiIncome').textContent = `$${inc.toFixed(2)}`;
  $('#kpiExpense').textContent = `$${exp.toFixed(2)}`;
  $('#kpiClients').textContent = ST.clients.length;
  $('#kpiSkus').textContent = ST.items.length;
  const tbody=$('#lowStockTable tbody'); tbody.innerHTML='';
  ST.items.forEach(it=>{
    const st = stockTotal(it.id), min = it.min ?? 1;
    if(st <= min){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${it.sku}</td><td>${it.name}</td><td>${st}</td><td>${min}</td>`;
      tbody.appendChild(tr);
    }
  });
}

/* ===== FINANZAS ===== */
function accName(id){ return ST.accounts.find(a=>a.id===id)?.name || '—'; }
$('#addAccountBtn').onclick=()=>openModal('Nueva Cuenta',`
  <div class="row"><label>Nombre</label><input id="aName"></div>
  <div class="row"><label>Tipo</label><select id="aType"><option>Caja</option><option>Banco</option><option>Crédito</option></select></div>
`,'Guardar', async ()=>{
  await fx.add(uid,'accounts',{ name:$('#aName').value.trim(), type:$('#aType').value, balance:0 });
});
$('#addTxnBtn').onclick=()=>{
  const acc = ST.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  openModal('Nueva Transacción',`
    <div class="row"><label>Fecha</label><input id="tDate" type="date" value="${today()}"></div>
    <div class="row"><label>Cuenta</label><select id="tAcc">${acc}</select></div>
    <div class="row"><label>Tipo</label><select id="tType"><option value="ingreso">Ingreso</option><option value="gasto">Gasto</option></select></div>
    <div class="row"><label>Monto</label><input id="tAmt" type="number" step="0.01" value="0"></div>
    <div class="row"><label>Descripción</label><input id="tDesc"></div>
  `,'Guardar', async ()=>{
    await fx.add(uid,'txns',{ date:$('#tDate').value, accountId:$('#tAcc').value, type:$('#tType').value, amount:Number($('#tAmt').value||0), desc:$('#tDesc').value.trim() });
  });
};
$('#addInvoiceBtn').onclick=()=>{
  const clients = ST.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  openModal('Nueva Factura',`
    <div class="row"><label>Cliente</label><select id="fvClient">${clients}</select></div>
    <div class="row"><label>Fecha</label><input id="fvDate" type="date" value="${today()}"></div>
    <div class="row"><label>Número</label><input id="fvNumber" placeholder="FAC-0001"></div>
    <div class="row"><label>Ítems</label><button id="fvAddItem" class="small">Añadir</button></div>
    <div id="fvItems"></div>
    <div class="row"><strong>Total: $<span id="fvTotal">0.00</span></strong></div>
  `,'Guardar', async ()=>{
    const items = collectInvoiceItems();
    const total = items.reduce((a,it)=>a+(it.qty*it.price),0);
    await fx.add(uid,'invoices',{ number:$('#fvNumber').value.trim()||`FAC-${String(ST.invoices.length+1).padStart(4,'0')}`, clientId:$('#fvClient').value, date:$('#fvDate').value, items, total, status:'emitida' });
  });
  const wrap=document.createElement('div'); $('#fvItems').appendChild(wrap);
  function addItemRow(){
    const row=document.createElement('div'); row.className='row';
    row.innerHTML=`<input class="fvSku" placeholder="SKU" style="max-width:120px">
      <input class="fvName" placeholder="Descripción">
      <input class="fvQty" type="number" value="1" style="max-width:100px">
      <input class="fvPrice" type="number" step="0.01" value="0" style="max-width:140px">
      <button class="small outline fvDel">X</button>`;
    wrap.appendChild(row);
    row.querySelector('.fvDel').onclick=()=>{ row.remove(); recompute(); };
    row.querySelectorAll('input').forEach(i=> i.oninput=recompute);
  }
  function collectInvoiceItems(){
    const rows=wrap.querySelectorAll('.row'), list=[];
    rows.forEach(r=> list.push({ sku:r.querySelector('.fvSku').value.trim(), name:r.querySelector('.fvName').value.trim(),
      qty:Number(r.querySelector('.fvQty').value||0), price:Number(r.querySelector('.fvPrice').value||0) }) );
    return list;
  }
  function recompute(){
    const items = collectInvoiceItems(); const total = items.reduce((a,it)=>a+(it.qty*it.price),0);
    $('#fvTotal').textContent = total.toFixed(2);
  }
  $('#fvAddItem').onclick=()=>{ addItemRow(); }; addItemRow();
};

function renderFinanzas(){
  // cuentas
  const tbodyA = $('#accTable tbody'); if(!tbodyA) return; tbodyA.innerHTML='';
  // recalcula saldos en cliente
  const bal = {}; ST.accounts.forEach(a=>bal[a.id]=0);
  ST.txns.forEach(t=>{ bal[t.accountId] = (bal[t.accountId]||0) + (t.type==='ingreso'?Number(t.amount||0):-Number(t.amount||0)); });
  ST.accounts.forEach(a=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${a.name}</td><td>${a.type}</td><td>$${(bal[a.id]||0).toFixed(2)}</td>
      <td><button class="small outline" data-del="${a.id}">Borrar</button></td>`;
    tbodyA.appendChild(tr);
  });
  tbodyA.querySelectorAll('[data-del]').forEach(b=> b.onclick=async ()=>{
    await fx.del(uid,'accounts',b.dataset.del);
  });

  // transacciones
  const term = ($('#txnSearch')?.value||'').toLowerCase();
  const tbodyT = $('#txnTable tbody'); tbodyT.innerHTML='';
  ST.txns.filter(t=>!term || (t.desc||'').toLowerCase().includes(term))
    .slice().reverse().forEach(t=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${t.date}</td><td>${accName(t.accountId)}</td><td>${t.type}</td><td>$${Number(t.amount||0).toFixed(2)}</td><td>${t.desc||''}</td>
        <td><button class="small outline" data-del="${t.id}">Borrar</button></td>`;
      tbodyT.appendChild(tr);
    });
  tbodyT.querySelectorAll('[data-del]').forEach(b=> b.onclick=async ()=>{ await fx.del(uid,'txns', b.dataset.del); });

  // facturas
  const tbodyF = $('#invTable tbody'); tbodyF.innerHTML='';
  ST.invoices.slice().reverse().forEach(f=>{
    const cli = ST.clients.find(c=>c.id===f.clientId)?.name || '—';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${f.number}</td><td>${cli}</td><td>${f.date}</td><td>$${Number(f.total||0).toFixed(2)}</td><td>${f.status}</td>
      <td><button class="small" data-pdf="${f.id}">PDF</button> <button class="small outline" data-del="${f.id}">Borrar</button></td>`;
    tbodyF.appendChild(tr);
  });
  tbodyF.querySelectorAll('[data-pdf]').forEach(b=> b.onclick=()=> pdfFactura(b.dataset.pdf));
  tbodyF.querySelectorAll('[data-del]').forEach(b=> b.onclick=async ()=>{ await fx.del(uid,'invoices', b.dataset.del); });
}
$('#txnSearch')?.addEventListener('input', renderFinanzas);

/* ===== CRM ===== */
$('#addClientBtn').onclick=()=>openModal('Nuevo Cliente',`
  <div class="row"><label>Nombre</label><input id="cName"></div>
  <div class="row"><label>Teléfono</label><input id="cPhone"></div>
  <div class="row"><label>Email</label><input id="cEmail"></div>
  <div class="row"><label>Notas</label><input id="cNotes"></div>
`,'Guardar', async ()=>{
  await fx.add(uid,'clients',{ name:$('#cName').value.trim(), phone:$('#cPhone').value.trim(), email:$('#cEmail').value.trim(), notes:$('#cNotes').value.trim() });
});
$('#addLeadBtn').onclick=()=>openModal('Nuevo Lead',`
  <div class="row"><label>Nombre</label><input id="lName"></div>
  <div class="row"><label>Origen</label><input id="lSrc" placeholder="Instagram, Referido, Web..."></div>
  <div class="row"><label>Estado</label><select id="lStatus"><option>Nuevo</option><option>En proceso</option><option>Ganado</option><option>Perdido</option></select></div>
`,'Guardar', async ()=>{
  await fx.add(uid,'leads',{ name:$('#lName').value.trim(), source:$('#lSrc').value.trim(), status:$('#lStatus').value });
});
$('#addActivityBtn').onclick=()=>{
  const options=[...ST.clients.map(c=>`<option value="cli:${c.id}">Cliente: ${c.name}</option>`), ...ST.leads.map(l=>`<option value="lead:${l.id}">Lead: ${l.name}</option>`)].join('');
  openModal('Nueva Actividad',`
    <div class="row"><label>Fecha</label><input id="actDate" type="date" value="${today()}"></div>
    <div class="row"><label>Relacionado</label><select id="actWho">${options}</select></div>
    <div class="row"><label>Tipo</label><select id="actType"><option>Llamada</option><option>Email</option><option>Visita</option><option>Nota</option></select></div>
    <div class="row"><label>Notas</label><input id="actNotes"></div>
  `,'Guardar', async ()=>{
    await fx.add(uid,'activities',{ date:$('#actDate').value, who:$('#actWho').value, type:$('#actType').value, notes:$('#actNotes').value.trim() });
  });
};
function renderCRM(){
  const tbodyC=$('#clientTable tbody'); if(!tbodyC) return; tbodyC.innerHTML='';
  ST.clients.forEach(c=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${c.name}</td><td>${c.phone||''}</td><td>${c.email||''}</td><td>${c.notes||''}</td>
      <td><button class="small outline" data-del="${c.id}">Borrar</button></td>`;
    tbodyC.appendChild(tr);
  });
  tbodyC.querySelectorAll('[data-del]').forEach(b=> b.onclick=async ()=>{ await fx.del(uid,'clients', b.dataset.del); });

  const tbodyL=$('#leadTable tbody'); tbodyL.innerHTML='';
  ST.leads.forEach(l=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${l.name}</td><td>${l.source||''}</td><td>${l.status}</td>
      <td><button class="small outline" data-del="${l.id}">Borrar</button></td>`;
    tbodyL.appendChild(tr);
  });
  tbodyL.querySelectorAll('[data-del]').forEach(b=> b.onclick=async ()=>{ await fx.del(uid,'leads', b.dataset.del); });

  const tbodyA=$('#actTable tbody'); tbodyA.innerHTML='';
  ST.activities.slice().reverse().forEach(a=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${a.date}</td><td>${a.who}</td><td>${a.type}</td><td>${a.notes||''}</td>
      <td><button class="small outline" data-del="${a.id}">Borrar</button></td>`;
    tbodyA.appendChild(tr);
  });
  tbodyA.querySelectorAll('[data-del]').forEach(b=> b.onclick=async ()=>{ await fx.del(uid,'activities', b.dataset.del); });
}

/* ===== INVENTARIO ===== */
function requireItemAndWh(){ if(!ST.items.length){alert('Primero crea productos.');return false;} if(!ST.warehouses.length){alert('Crea al menos un almacén.');return false;} return true; }
$('#addItemBtn').onclick=()=>{
  const cats = `<option value="">(sin categoría)</option>` + ST.categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  openModal('Nuevo Producto',`
    <div class="row"><label>SKU</label><input id="fSku"></div>
    <div class="row"><label>Nombre</label><input id="fName"></div>
    <div class="row"><label>Categoría</label><select id="fCat">${cats}</select></div>
    <div class="row"><label>Precio</label><input id="fPrice" type="number" step="0.01" value="0"></div>
    <div class="row"><label>Mínimo</label><input id="fMin" type="number" value="1"></div>
  `,'Guardar', async ()=>{
    await fx.add(uid,'items',{ sku:$('#fSku').value.trim(), name:$('#fName').value.trim(), categoryId:$('#fCat').value, price:Number($('#fPrice').value||0), min:Number($('#fMin').value||1) });
  });
};
$('#addWhBtn').onclick=()=>openModal('Nuevo Almacén',`
  <div class="row"><label>Nombre</label><input id="wName"></div>
  <div class="row"><label>Ubicación</label><input id="wLoc"></div>
`,'Guardar', async ()=>{ await fx.add(uid,'warehouses',{ name:$('#wName').value.trim(), location:$('#wLoc').value.trim() }); });

function movement({type, detail, itemId, sku, qty, fromWh='', toWh='', price=0}){
  return fx.add(uid,'moves',{ date:new Date().toISOString(), type, detail, itemId, sku, qty, fromWh, toWh, price });
}
$('#addPurchaseBtn').onclick=()=>{
  if(!requireItemAndWh())return;
  const wh = ST.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  const it = ST.items.map(i=>`<option value="${i.id}">${i.sku} • ${i.name}</option>`).join('');
  openModal('Registrar Compra',`
    <div class="row"><label>Almacén</label><select id="pWh">${wh}</select></div>
    <div class="row"><label>Producto</label><select id="pItem">${it}</select></div>
    <div class="row"><label>Cantidad</label><input id="pQty" type="number" value="1"></div>
    <div class="row"><label>Costo Unit.</label><input id="pCost" type="number" step="0.01" value="0"></div>
  `,'Guardar', async ()=>{
    const itemId=$('#pItem').value; const itm=ST.items.find(x=>x.id===itemId);
    await movement({type:'compra', detail:'Compra', itemId, sku:itm.sku, qty:Number($('#pQty').value||0), toWh:$('#pWh').value, price:Number($('#pCost').value||0)});
  });
};
$('#addSaleBtn').onclick=()=>{
  if(!requireItemAndWh())return;
  const wh = ST.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  const it = ST.items.map(i=>`<option value="${i.id}">${i.sku} • ${i.name} (Disp: ${stockTotal(i.id)})</option>`).join('');
  openModal('Registrar Venta',`
    <div class="row"><label>Cliente</label><input id="sClient" placeholder="Nombre/Razón social"></div>
    <div class="row"><label>Almacén</label><select id="sWh">${wh}</select></div>
    <div class="row"><label>Producto</label><select id="sItem">${it}</select></div>
    <div class="row"><label>Cantidad</label><input id="sQty" type="number" value="1"></div>
    <div class="row"><label>Precio Unit.</label><input id="sPrice" type="number" step="0.01" value="0"></div>
  `,'Guardar', async ()=>{
    const itemId=$('#sItem').value; const itm=ST.items.find(x=>x.id===itemId);
    await movement({type:'venta', detail:`Venta a ${$('#sClient').value.trim()}`, itemId, sku:itm.sku, qty:-Math.abs(Number($('#sQty').value||0)), fromWh:$('#sWh').value, price:Number($('#sPrice').value||0)});
  });
};
$('#addTransferBtn').onclick=()=>{
  if(!requireItemAndWh())return;
  const wh = ST.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  const it = ST.items.map(i=>`<option value="${i.id}">${i.sku} • ${i.name}</option>`).join('');
  openModal('Transferencia',`
    <div class="row"><label>Desde</label><select id="tFrom">${wh}</select></div>
    <div class="row"><label>Hacia</label><select id="tTo">${wh}</select></div>
    <div class="row"><label>Producto</label><select id="tItem">${it}</select></div>
    <div class="row"><label>Cantidad</label><input id="tQty" type="number" value="1"></div>
  `,'Guardar', async ()=>{
    const itemId=$('#tItem').value; const itm=ST.items.find(x=>x.id===itemId);
    const from=$('#tFrom').value, to=$('#tTo').value; if(from===to){ alert('Elige almacenes distintos.'); return; }
    await movement({type:'transferencia', detail:`${whName(from)} → ${whName(to)}`, itemId, sku:itm.sku, qty:Number($('#tQty').value||0), fromWh:from, toWh:to});
  });
};
$('#addAdjBtn').onclick=()=>{
  if(!requireItemAndWh())return;
  const wh = ST.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  const it = ST.items.map(i=>`<option value="${i.id}">${i.sku} • ${i.name}</option>`).join('');
  openModal('Ajuste',`
    <div class="row"><label>Almacén</label><select id="aWh">${wh}</select></div>
    <div class="row"><label>Producto</label><select id="aItem">${it}</select></div>
    <div class="row"><label>Δ Cantidad</label><input id="aQty" type="number" value="1"></div>
    <div class="row"><label>Motivo</label><input id="aReason" placeholder="Rotura, inventario físico..."></div>
  `,'Guardar', async ()=>{
    const itemId=$('#aItem').value; const itm=ST.items.find(x=>x.id===itemId);
    const qty=Number($('#aQty').value||0), whId=$('#aWh').value;
    await movement({type:'ajuste', detail:$('#aReason').value.trim(), itemId, sku:itm.sku, qty, toWh: qty>0?whId:'', fromWh: qty<0?whId:''});
  });
};
$('#itemSearch').addEventListener('input', renderInventario);
$('#repStockBtn').onclick=renderRepStock;
$('#kardexBtn').onclick=renderKardex;

function renderInventario(){
  ensureStock();
  // productos
  const term = ($('#itemSearch')?.value||'').toLowerCase();
  const tbody = $('#itemsTable tbody'); if(!tbody) return; tbody.innerHTML='';
  ST.items.filter(it=> it.sku.toLowerCase().includes(term) || it.name.toLowerCase().includes(term))
    .forEach(it=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><span class="badge">${it.sku}</span></td><td>${it.name}</td><td>${catName(it.categoryId)}</td>
        <td>$${Number(it.price||0).toFixed(2)}</td><td>${it.min??1}</td><td>${stockTotal(it.id)}</td>
        <td><button class="small outline" data-del="${it.id}">Borrar</button></td>`;
      tbody.appendChild(tr);
    });
  tbody.querySelectorAll('[data-del]').forEach(b=> b.onclick=async ()=>{ await fx.del(uid,'items', b.dataset.del); });

  // almacenes
  const tbodyW = $('#whTable tbody'); tbodyW.innerHTML='';
  ST.warehouses.forEach(w=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${w.name}</td><td>${w.location||''}</td>
      <td><button class="small outline" data-del="${w.id}">Borrar</button></td>`;
    tbodyW.appendChild(tr);
  });
  tbodyW.querySelectorAll('[data-del]').forEach(b=> b.onclick=async ()=>{ await fx.del(uid,'warehouses', b.dataset.del); });
}
function renderRepStock(){
  ensureStock();
  const sku = ($('#repSku').value||'').toLowerCase();
  const tbody = $('#repStockTable tbody'); tbody.innerHTML='';
  ST.warehouses.forEach(w=>{
    ST.items.forEach(it=>{
      if(sku && !it.sku.toLowerCase().includes(sku)) return;
      const qty = ST.stock?.[w.id]?.[it.id] || 0;
      if(qty!==0){
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${w.name}</td><td>${it.sku}</td><td>${it.name}</td><td>${qty}</td>`;
        tbody.appendChild(tr);
      }
    });
  });
}
function renderKardex(){
  const sku = ($('#kardexSku').value||'').toLowerCase();
  const tbody = $('#kardexTable tbody'); tbody.innerHTML='';
  ST.moves.filter(m=>m.sku.toLowerCase()===sku).sort((a,b)=>(a.date||'').localeCompare(b.date))
    .forEach(m=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${(m.date||'').slice(0,19).replace('T',' ')}</td><td>${m.type}</td><td>${m.detail||''}</td><td>${m.qty}</td>`;
      tbody.appendChild(tr);
    });
}

/* ===== Analytics ===== */
let chartFin=null, chartSkus=null;
function renderAnalytics(){
  ensureStock();
  const months=[...Array(6)].map((_,i)=>{const d=new Date();d.setMonth(d.getMonth()-(5-i)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;});
  const incomes=months.map(m=> ST.txns.filter(t=>t.type==='ingreso' && monthKey(t.date)===m).reduce((a,t)=>a+Number(t.amount||0),0));
  const expenses=months.map(m=> ST.txns.filter(t=>t.type==='gasto'   && monthKey(t.date)===m).reduce((a,t)=>a+Number(t.amount||0),0));
  const sales={}; ST.moves.filter(m=>m.type==='venta').forEach(m=>{ sales[m.sku]=(sales[m.sku]||0)+(-m.qty); });
  const top=Object.entries(sales).sort((a,b)=>b[1]-a[1]).slice(0,10), labelsTop=top.map(x=>x[0]), dataTop=top.map(x=>x[1]);
  if(chartFin) chartFin.destroy(); if(chartSkus) chartSkus.destroy();
  chartFin  = new Chart($('#chartFin'),  { type:'line', data:{ labels:months, datasets:[{label:'Ingresos',data:incomes},{label:'Gastos',data:expenses}] }});
  chartSkus = new Chart($('#chartSkus'), { type:'bar',  data:{ labels:labelsTop, datasets:[{label:'Unidades vendidas',data:dataTop}] }});
}

/* ===== Export CSV ===== */
$('#exportCsvBtn').onclick=()=>{
  ensureStock();
  const headers=['SKU','Nombre','Categoria','Precio','Minimo','StockTotal'];
  const rows=ST.items.map(it=>[it.sku,it.name,catName(it.categoryId),it.price,it.min??1,stockTotal(it.id)]);
  const csv=[headers.join(','),...rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='productos.csv'; a.click();
};

/* ===== PDFs B/N (logo en gris sin estirar) ===== */
const { jsPDF } = window.jspdf || {};
async function loadGrayImageDataUrl(url, maxWmm=40, maxHmm=16){
  return new Promise((resolve)=>{
    const img=new Image(); img.crossOrigin='anonymous'; img.onload=()=>{
      const mm2px=(mm)=>Math.floor(mm*3.78); const maxW=mm2px(maxWmm), maxH=mm2px(maxHmm);
      const sc=Math.min(maxW/img.width, maxH/img.height, 1), w=Math.max(1,Math.floor(img.width*sc)), h=Math.max(1,Math.floor(img.height*sc));
      const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,w,h);
      const d=ctx.getImageData(0,0,w,h), p=d.data; for(let i=0;i<p.length;i+=4){ const y=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2]; p[i]=p[i+1]=p[i+2]=y; }
      ctx.putImageData(d,0,0); resolve({dataUrl:c.toDataURL('image/png'), wmm:w/3.78, hmm:h/3.78});
    }; img.onerror=()=>resolve(null); img.src=url;
  });
}
async function drawHeader(doc, title){
  doc.setTextColor(0); doc.setDrawColor(0); doc.setFillColor(255,255,255);
  let logoW=0;
  if(ST.brand?.logoUrl){
    const g = await loadGrayImageDataUrl(ST.brand.logoUrl,40,16);
    if(g){ doc.addImage(g.dataUrl,'PNG',14,12,g.wmm,g.hmm); logoW=g.wmm; }
  }
  const x = 14 + (logoW?logoW+6:0), y=18;
  doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text(ST.brand?.name || 'Oasis • ERP Cloud', x, y);
  doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.text(title, x, y+7);
  doc.line(14,36,196,36);
}
function savePdf(doc,name){ doc.save(name.replace(/\s+/g,'_')+'.pdf'); }

$('#pdfFinBtn').onclick=async ()=>{
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); await drawHeader(doc,'Resumen Financiero (B/N)');
  const bal={}; ST.accounts.forEach(a=>bal[a.id]=0); ST.txns.forEach(t=>{ bal[t.accountId]=(bal[t.accountId]||0)+(t.type==='ingreso'?Number(t.amount||0):-Number(t.amount||0)); });
  const rows=ST.accounts.map(a=>[a.name,a.type,(bal[a.id]||0).toFixed(2)]);
  doc.autoTable({startY:42, head:[['Cuenta','Tipo','Saldo']], body:rows, styles:{textColor:[0,0,0],lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230],textColor:[0,0,0]}, theme:'grid'});
  savePdf(doc,'Resumen_Financiero');
};
$('#pdfTxBtn').onclick=async ()=>{
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); await drawHeader(doc,'Transacciones (B/N)');
  const rows=ST.txns.slice().reverse().map(t=>[t.date,accName(t.accountId),t.type,Number(t.amount||0).toFixed(2),t.desc||'']);
  doc.autoTable({startY:42, head:[['Fecha','Cuenta','Tipo','Monto','Descripción']], body:rows, styles:{textColor:[0,0,0],lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230],textColor:[0,0,0]}, theme:'grid'});
  savePdf(doc,'Transacciones');
};
async function pdfFactura(fid){
  const f=ST.invoices.find(x=>x.id===fid); if(!f) return;
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); await drawHeader(doc,`Factura ${f.number} (B/N)`);
  const cli = ST.clients.find(c=>c.id===f.clientId)?.name || '—';
  doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.text(`Cliente: ${cli}`,14,44); doc.text(`Fecha: ${f.date}`,14,51);
  const body=f.items.map(it=>[it.sku||'', it.name||'', it.qty, Number(it.price||0).toFixed(2), (it.qty*it.price).toFixed(2)]);
  doc.autoTable({startY:56, head:[['SKU','Descripción','Qty','Precio','Importe']], body, styles:{textColor:[0,0,0],lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230],textColor:[0,0,0]}, theme:'grid'});
  const y=doc.lastAutoTable.finalY + 8; doc.setFont('helvetica','bold'); doc.text(`TOTAL: $${Number(f.total||0).toFixed(2)}`, 196-60, y);
  savePdf(doc,`Factura_${f.number}`);
}
$('#pdfItemsBtn').onclick=async ()=>{
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); await drawHeader(doc,'Catálogo de Productos (B/N)');
  const rows=ST.items.map(it=>[it.sku,it.name,catName(it.categoryId), Number(it.price||0).toFixed(2), it.min??1, stockTotal(it.id)]);
  doc.autoTable({startY:42, head:[['SKU','Nombre','Categoría','Precio','Mín.','Stock']], body:rows, styles:{textColor:[0,0,0],lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230],textColor:[0,0,0]}, theme:'grid'});
  savePdf(doc,'Catalogo_Productos');
};
$('#pdfStockBtn').onclick=async ()=>{
  ensureStock(); const sku=($('#repSku')?.value||'').toLowerCase();
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); await drawHeader(doc,'Existencias por Almacén (B/N)');
  const body=[]; ST.warehouses.forEach(w=>{ ST.items.forEach(it=>{ if(sku && !it.sku.toLowerCase().includes(sku)) return; const qty=ST.stock?.[w.id]?.[it.id]||0; if(qty!==0) body.push([w.name,it.sku,it.name,qty]); }); });
  doc.autoTable({startY:42, head:[['Almacén','SKU','Nombre','Stock']], body, styles:{textColor:[0,0,0],lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230],textColor:[0,0,0]}, theme:'grid'});
  savePdf(doc,'Stock_por_Almacen');
};
$('#pdfKardexBtn').onclick=async ()=>{
  const sku=($('#kardexSku')?.value||'').toLowerCase(); if(!sku){ alert('Escribe un SKU.'); return; }
  const moves=ST.moves.filter(m=>m.sku.toLowerCase()===sku).sort((a,b)=> (a.date||'').localeCompare(b.date));
  if(!moves.length){ alert('No hay movimientos.'); return; }
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); await drawHeader(doc,`Kardex – ${sku.toUpperCase()} (B/N)`);
  const body=moves.map(m=>[(m.date||'').slice(0,19).replace('T',' '), m.type, m.detail||'', m.qty]);
  doc.autoTable({startY:42, head:[['Fecha','Tipo','Detalle','Qty']], body, styles:{textColor:[0,0,0],lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230],textColor:[0,0,0]}, theme:'grid'});
  savePdf(doc,`Kardex_${sku.toUpperCase()}`);
};

/* ===== Init ===== */
window.addEventListener('DOMContentLoaded', ()=>{ /* auth watcher ya maneja todo */ });
