/* ========= Oasis • ERP Suite =========
   HTML5 + CSS3 + JS puro
   - Login overlay (PIN)
   - ERP/Finanzas, CRM, Inventario, Analytics
   - PDFs reales B/N (logo en gris, sin estirar)
======================================*/

const $  = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);
const nowISO = ()=>new Date().toISOString();
const today = ()=>new Date().toISOString().slice(0,10);

const store = {
  get:(k,d)=>{ try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;} },
  set:(k,v)=>localStorage.setItem(k, JSON.stringify(v)),
  del:(k)=>localStorage.removeItem(k)
};

/* ===== DB ===== */
const DB = {
  key:'oasis.erp.v1',
  load(){
    let db = store.get(this.key);
    if(!db){
      db = {
        settings:{ brandName:'Oasis • ERP Suite', logoDataUrl:'', lowStockDefault:1 },
        security:{ pinHash:'' },
        // ERP/Finanzas
        accounts:[/* {id,name,type:'Caja/Banco/Crédito',balance} */],
        txns:[/* {id,date,accountId,type:'ingreso'|'gasto',amount,desc} */],
        invoices:[/* {id,number,clientId,date,items:[{sku,name,qty,price}], total,status} */],
        // CRM
        clients:[/* {id,name,phone,email,notes} */],
        leads:[/* {id,name,source,status} */],
        activities:[/* {id,date,who,type,notes} */],
        // Inventario
        categories:[],
        suppliers:[],
        warehouses:[{id:id(), name:'Principal', location:''}],
        items:[],
        stock:{},     // stock[whId][itemId] = qty
        moves:[]      // historial de movimientos
      };
      store.set(this.key, db);
    }
    return db;
  },
  save(db){ store.set(this.key, db); }
};
let db = DB.load();

const AUTH = { key:'oasis.auth.v1', is(){return !!store.get(this.key,false);}, set(v){store.set(this.key,!!v);} };

/* ===== Utils ===== */
function id(){ return Math.random().toString(36).slice(2,10); }
function ensureStockMatrix(){ db.warehouses.forEach(w=>{ if(!db.stock[w.id]) db.stock[w.id]={}; }); }
function whName(id){ return db.warehouses.find(w=>w.id===id)?.name || '—'; }
function catName(id){ return db.categories.find(c=>c.id===id)?.name || '—'; }
function stockTotal(itemId){ let t=0; Object.values(db.stock).forEach(m=>{ t += (m?.[itemId]||0); }); return t; }
function monthKey(d){ const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; }
function hashPin(pin){ let h=0; for(let i=0;i<pin.length;i++){ h=((h<<5)-h)+pin.charCodeAt(i); h|=0;} return String(h); }

/* ===== Auth Overlay ===== */
const loginView = $('#loginView');
const appView   = $('#appView');
function enforceAuth(){
  if(!AUTH.is()){ loginView.classList.add('active'); appView.setAttribute('inert',''); appView.setAttribute('aria-hidden','true'); }
  else { loginView.classList.remove('active'); appView.removeAttribute('inert'); appView.removeAttribute('aria-hidden'); }
}
$('#loginBtn').onclick = ()=>{
  const pin = $('#pinInput').value.trim();
  if(!db.security.pinHash){ alert('Primero crea un PIN.'); return; }
  if(hashPin(pin)===db.security.pinHash){ AUTH.set(true); enterApp(); } else alert('PIN incorrecto');
};
$('#setPinBtn').onclick = ()=>{
  const pin = prompt('Nuevo PIN (4-8 dígitos):')?.trim() ?? '';
  if(!pin || pin.length<4){ alert('PIN muy corto'); return; }
  db.security.pinHash = hashPin(pin); DB.save(db); alert('PIN guardado.');
};
$('#logoutBtn').onclick = ()=>{ AUTH.set(false); enforceAuth(); $('#pinInput').value=''; };

/* ===== Nav ===== */
$$('.nav-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    $$('.nav-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const page = b.dataset.nav;
    $$('.page').forEach(p=>p.classList.remove('active'));
    $('#'+page).classList.add('active');
    // renders
    if(page==='dashboard') renderDashboard();
    if(page==='finanzas') renderFinanzas();
    if(page==='crm') renderCRM();
    if(page==='inventario') renderInventario();
    if(page==='analytics') renderAnalytics();
  });
});

/* ===== Modal ===== */
const modal = $('#modal'); const modalTitle = $('#modalTitle'); const modalBody = $('#modalBody');
const modalOk = $('#modalOk'); const modalCancel = $('#modalCancel'); const modalClose = $('#modalClose');
function openModal(title, bodyHtml, okLabel='Guardar', onOk=()=>{}){
  modalTitle.textContent=title; modalBody.innerHTML=bodyHtml; modalOk.textContent=okLabel; modal.classList.remove('hidden');
  const okHandler=()=>{ onOk(); closeModal(); };
  modalOk.onclick=okHandler; modalCancel.onclick=closeModal; modalClose.onclick=closeModal;
}
function closeModal(){ modal.classList.add('hidden'); modalBody.innerHTML=''; }

/* ===== Dashboard ===== */
function renderDashboard(){
  // KPIs finanzas
  const thisMonth = monthKey(new Date());
  const inc = db.txns.filter(t=>t.type==='ingreso' && monthKey(t.date)===thisMonth).reduce((a,t)=>a+Number(t.amount||0),0);
  const exp = db.txns.filter(t=>t.type==='gasto' && monthKey(t.date)===thisMonth).reduce((a,t)=>a+Number(t.amount||0),0);
  $('#kpiIncome').textContent = `$${inc.toFixed(2)}`;
  $('#kpiExpense').textContent = `$${exp.toFixed(2)}`;
  $('#kpiClients').textContent = db.clients.length;
  $('#kpiSkus').textContent = db.items.length;
  // bajo inventario
  const tbody = $('#lowStockTable tbody'); tbody.innerHTML='';
  db.items.forEach(it=>{
    const st = stockTotal(it.id), min = it.min ?? db.settings.lowStockDefault;
    if(st<=min){
      const tr=document.createElement('tr'); tr.innerHTML=`<td>${it.sku}</td><td>${it.name}</td><td>${st}</td><td>${min}</td>`;
      tbody.appendChild(tr);
    }
  });
}

/* ------------------------------------
   ERP / FINANZAS
------------------------------------ */
function accName(id){ return db.accounts.find(a=>a.id===id)?.name || '—'; }
function recalcBalances(){
  db.accounts.forEach(a=>a.balance=0);
  db.txns.forEach(t=>{
    const a = db.accounts.find(x=>x.id===t.accountId); if(!a) return;
    a.balance += (t.type==='ingreso' ? Number(t.amount||0) : -Number(t.amount||0));
  });
}
$('#addAccountBtn').onclick=()=>{
  openModal('Nueva Cuenta', `
    <div class="row"><label>Nombre</label><input id="aName"/></div>
    <div class="row"><label>Tipo</label>
      <select id="aType"><option>Caja</option><option>Banco</option><option>Crédito</option></select>
    </div>
  `,'Guardar',()=>{
    db.accounts.push({id:id(), name:$('#aName').value.trim(), type:$('#aType').value, balance:0});
    DB.save(db); renderFinanzas();
  });
};
$('#addTxnBtn').onclick=()=>{
  const acc = db.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  openModal('Nueva Transacción', `
    <div class="row"><label>Fecha</label><input id="tDate" type="date" value="${today()}"/></div>
    <div class="row"><label>Cuenta</label><select id="tAcc">${acc}</select></div>
    <div class="row"><label>Tipo</label><select id="tType"><option value="ingreso">Ingreso</option><option value="gasto">Gasto</option></select></div>
    <div class="row"><label>Monto</label><input id="tAmt" type="number" step="0.01" value="0"/></div>
    <div class="row"><label>Descripción</label><input id="tDesc"/></div>
  `,'Guardar',()=>{
    db.txns.push({id:id(), date:$('#tDate').value, accountId:$('#tAcc').value, type:$('#tType').value, amount:Number($('#tAmt').value||0), desc:$('#tDesc').value.trim()});
    DB.save(db); recalcBalances(); renderFinanzas(); renderDashboard();
  });
};
$('#addInvoiceBtn').onclick=()=>{
  const clients = db.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  openModal('Nueva Factura', `
    <div class="row"><label>Cliente</label><select id="fvClient">${clients}</select></div>
    <div class="row"><label>Fecha</label><input id="fvDate" type="date" value="${today()}"/></div>
    <div class="row"><label>Número</label><input id="fvNumber" placeholder="FAC-0001"/></div>
    <div class="row"><label>Ítems</label><button id="fvAddItem" class="small">Añadir ítem</button></div>
    <div id="fvItems"></div>
    <div class="row"><strong>Total: $<span id="fvTotal">0.00</span></strong></div>
  `,'Guardar',()=>{
    const items = collectInvoiceItems();
    const total = items.reduce((a,it)=>a+(it.qty*it.price),0);
    db.invoices.push({
      id:id(), number:$('#fvNumber').value.trim()||`FAC-${String(db.invoices.length+1).padStart(4,'0')}`,
      clientId:$('#fvClient').value, date:$('#fvDate').value, items, total, status:'emitida'
    });
    DB.save(db); renderFinanzas();
  });
  // Items dinámicos
  const wrap = document.createElement('div'); $('#fvItems').appendChild(wrap);
  function addItemRow(){
    const row = document.createElement('div'); row.className='row';
    row.innerHTML = `
      <input class="fvSku" placeholder="SKU" style="max-width:120px">
      <input class="fvName" placeholder="Descripción">
      <input class="fvQty" type="number" min="1" value="1" style="max-width:100px">
      <input class="fvPrice" type="number" step="0.01" value="0" style="max-width:140px">
      <button class="small outline fvDel">X</button>
    `;
    wrap.appendChild(row);
    row.querySelector('.fvDel').onclick=()=>{ row.remove(); recompute(); };
    row.querySelectorAll('input').forEach(i=> i.oninput=recompute);
  }
  function recompute(){
    const items = collectInvoiceItems();
    const total = items.reduce((a,it)=>a+(it.qty*it.price),0);
    $('#fvTotal').textContent = total.toFixed(2);
  }
  function collectInvoiceItems(){
    const rows = wrap.querySelectorAll('.row');
    const list=[];
    rows.forEach(r=>{
      list.push({
        sku:r.querySelector('.fvSku').value.trim(),
        name:r.querySelector('.fvName').value.trim(),
        qty:Number(r.querySelector('.fvQty').value||0),
        price:Number(r.querySelector('.fvPrice').value||0)
      });
    });
    return list;
  }
  $('#fvAddItem').onclick=()=>{ addItemRow(); };
  addItemRow();
};

function renderFinanzas(){
  recalcBalances();
  // cuentas
  const tbodyA = $('#accTable tbody'); tbodyA.innerHTML='';
  db.accounts.forEach(a=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${a.name}</td><td>${a.type}</td><td>$${(a.balance||0).toFixed(2)}</td>
    <td><button class="small" data-edit="${a.id}">Editar</button> <button class="small outline" data-del="${a.id}">Borrar</button></td>`;
    tbodyA.appendChild(tr);
  });
  tbodyA.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{
    if(!confirm('¿Eliminar cuenta?'))return;
    const i=db.accounts.findIndex(x=>x.id===b.dataset.del); if(i>=0) db.accounts.splice(i,1);
    DB.save(db); renderFinanzas();
  });

  // transacciones
  const term = ($('#txnSearch')?.value||'').toLowerCase();
  const tbodyT = $('#txnTable tbody'); tbodyT.innerHTML='';
  db.txns.filter(t=>!term || (t.desc||'').toLowerCase().includes(term))
    .slice().reverse().forEach(t=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${t.date}</td><td>${accName(t.accountId)}</td><td>${t.type}</td><td>$${Number(t.amount||0).toFixed(2)}</td><td>${t.desc||''}</td>
      <td><button class="small outline" data-del="${t.id}">Borrar</button></td>`;
      tbodyT.appendChild(tr);
    });
  tbodyT.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{
    const i=db.txns.findIndex(x=>x.id===b.dataset.del); if(i>=0) db.txns.splice(i,1); DB.save(db); renderFinanzas(); renderDashboard();
  });

  // facturas
  const tbodyF = $('#invTable tbody'); tbodyF.innerHTML='';
  db.invoices.slice().reverse().forEach(f=>{
    const cli = db.clients.find(c=>c.id===f.clientId)?.name || '—';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${f.number}</td><td>${cli}</td><td>${f.date}</td><td>$${f.total.toFixed(2)}</td><td>${f.status}</td>
    <td>
      <button class="small" data-pdf="${f.id}">PDF</button>
      <button class="small outline" data-del="${f.id}">Borrar</button>
    </td>`;
    tbodyF.appendChild(tr);
  });
  tbodyF.querySelectorAll('[data-pdf]').forEach(b=> b.onclick=()=> pdfFactura(b.dataset.pdf));
  tbodyF.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{
    const i=db.invoices.findIndex(x=>x.id===b.dataset.del); if(i>=0) db.invoices.splice(i,1); DB.save(db); renderFinanzas();
  });
}
$('#txnSearch')?.addEventListener('input', renderFinanzas);

/* ------------------------------------
   CRM
------------------------------------ */
$('#addClientBtn').onclick=()=>{
  openModal('Nuevo Cliente', `
    <div class="row"><label>Nombre</label><input id="cName"/></div>
    <div class="row"><label>Teléfono</label><input id="cPhone"/></div>
    <div class="row"><label>Email</label><input id="cEmail"/></div>
    <div class="row"><label>Notas</label><input id="cNotes"/></div>
  `,'Guardar',()=>{
    db.clients.push({id:id(), name:$('#cName').value.trim(), phone:$('#cPhone').value.trim(), email:$('#cEmail').value.trim(), notes:$('#cNotes').value.trim()});
    DB.save(db); renderCRM(); renderFinanzas(); // por si se usa en factura
  });
};
$('#addLeadBtn').onclick=()=>{
  openModal('Nuevo Lead', `
    <div class="row"><label>Nombre</label><input id="lName"/></div>
    <div class="row"><label>Origen</label><input id="lSrc" placeholder="Instagram, Referido, Web..."/></div>
    <div class="row"><label>Estado</label><select id="lStatus"><option>Nuevo</option><option>En proceso</option><option>Ganado</option><option>Perdido</option></select></div>
  `,'Guardar',()=>{
    db.leads.push({id:id(), name:$('#lName').value.trim(), source:$('#lSrc').value.trim(), status:$('#lStatus').value});
    DB.save(db); renderCRM();
  });
};
$('#addActivityBtn').onclick=()=>{
  const options = [
    ...db.clients.map(c=>`<option value="cli:${c.id}">Cliente: ${c.name}</option>`),
    ...db.leads.map(l=>`<option value="lead:${l.id}">Lead: ${l.name}</option>`)
  ].join('');
  openModal('Nueva Actividad', `
    <div class="row"><label>Fecha</label><input id="actDate" type="date" value="${today()}"/></div>
    <div class="row"><label>Relacionado</label><select id="actWho">${options}</select></div>
    <div class="row"><label>Tipo</label><select id="actType"><option>Llamada</option><option>Email</option><option>Visita</option><option>Nota</option></select></div>
    <div class="row"><label>Notas</label><input id="actNotes"/></div>
  `,'Guardar',()=>{
    db.activities.push({id:id(), date:$('#actDate').value, who:$('#actWho').value, type:$('#actType').value, notes:$('#actNotes').value.trim()});
    DB.save(db); renderCRM();
  });
};
function renderCRM(){
  // clients
  const tbodyC=$('#clientTable tbody'); tbodyC.innerHTML='';
  db.clients.forEach(c=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${c.name}</td><td>${c.phone||''}</td><td>${c.email||''}</td><td>${c.notes||''}</td>
    <td><button class="small" data-edit="${c.id}">Editar</button> <button class="small outline" data-del="${c.id}">Borrar</button></td>`;
    tbodyC.appendChild(tr);
  });
  tbodyC.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{
    const i=db.clients.findIndex(x=>x.id===b.dataset.del); if(i>=0) db.clients.splice(i,1); DB.save(db); renderCRM(); renderFinanzas();
  });

  // leads
  const tbodyL=$('#leadTable tbody'); tbodyL.innerHTML='';
  db.leads.forEach(l=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${l.name}</td><td>${l.source||''}</td><td>${l.status}</td>
    <td><button class="small" data-edit="${l.id}">Editar</button> <button class="small outline" data-del="${l.id}">Borrar</button></td>`;
    tbodyL.appendChild(tr);
  });
  tbodyL.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{
    const i=db.leads.findIndex(x=>x.id===b.dataset.del); if(i>=0) db.leads.splice(i,1); DB.save(db); renderCRM();
  });

  // activities
  const tbodyA=$('#actTable tbody'); tbodyA.innerHTML='';
  db.activities.slice().reverse().forEach(a=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${a.date}</td><td>${a.who}</td><td>${a.type}</td><td>${a.notes||''}</td>
    <td><button class="small outline" data-del="${a.id}">Borrar</button></td>`;
    tbodyA.appendChild(tr);
  });
  tbodyA.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{
    const i=db.activities.findIndex(x=>x.id===b.dataset.del); if(i>=0) db.activities.splice(i,1); DB.save(db); renderCRM();
  });
}

/* ------------------------------------
   INVENTARIO
------------------------------------ */
function movement({type, detail, itemId, sku, qty, fromWh='', toWh='', price=0}){
  db.moves.push({id:id(), date:nowISO(), type, detail, itemId, sku, qty, fromWh, toWh, price});
}
function addStock(whId,itemId,qty){
  ensureStockMatrix();
  db.stock[whId] ??= {};
  db.stock[whId][itemId] = (db.stock[whId][itemId]||0)+qty;
}
function requireItemAndWh(){ if(!db.items.length){alert('Primero crea productos.');return false;} if(!db.warehouses.length){alert('Crea al menos un almacén.');return false;} return true; }

$('#addItemBtn').onclick=()=>{
  const cats = `<option value="">(sin categoría)</option>` + db.categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  openModal('Nuevo Producto',`
    <div class="row"><label>SKU</label><input id="fSku"></div>
    <div class="row"><label>Nombre</label><input id="fName"></div>
    <div class="row"><label>Categoría</label><select id="fCat">${cats}</select></div>
    <div class="row"><label>Precio</label><input id="fPrice" type="number" step="0.01" value="0"></div>
    <div class="row"><label>Mínimo</label><input id="fMin" type="number" value="${db.settings.lowStockDefault}"></div>
  `,'Guardar',()=>{
    db.items.push({id:id(), sku:$('#fSku').value.trim(), name:$('#fName').value.trim(), categoryId:$('#fCat').value, price:Number($('#fPrice').value||0), min:Number($('#fMin').value||0)});
    DB.save(db); renderInventario(); renderDashboard();
  });
};
$('#addWhBtn').onclick=()=>{
  openModal('Nuevo Almacén',`
    <div class="row"><label>Nombre</label><input id="wName"></div>
    <div class="row"><label>Ubicación</label><input id="wLoc"></div>
  `,'Guardar',()=>{
    db.warehouses.push({id:id(), name:$('#wName').value.trim(), location:$('#wLoc').value.trim()});
    ensureStockMatrix(); DB.save(db); renderInventario();
  });
};
$('#addPurchaseBtn').onclick=()=>{
  if(!requireItemAndWh())return;
  const wh = db.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  const it = db.items.map(i=>`<option value="${i.id}">${i.sku} • ${i.name}</option>`).join('');
  openModal('Registrar Compra',`
    <div class="row"><label>Almacén</label><select id="pWh">${wh}</select></div>
    <div class="row"><label>Producto</label><select id="pItem">${it}</select></div>
    <div class="row"><label>Cantidad</label><input id="pQty" type="number" value="1"></div>
    <div class="row"><label>Costo Unit.</label><input id="pCost" type="number" step="0.01" value="0"></div>
  `,'Guardar',()=>{
    const itemId=$('#pItem').value; const it=db.items.find(x=>x.id===itemId); const whId=$('#pWh').value;
    const qty=Number($('#pQty').value||0); const cost=Number($('#pCost').value||0);
    addStock(whId,itemId,qty); movement({type:'compra',detail:'Compra',itemId,sku:it.sku,qty,toWh:whId,price:cost});
    DB.save(db); renderInventario(); renderDashboard();
  });
};
$('#addSaleBtn').onclick=()=>{
  if(!requireItemAndWh())return;
  const wh = db.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  const it = db.items.map(i=>`<option value="${i.id}">${i.sku} • ${i.name} (Disp: ${stockTotal(i.id)})</option>`).join('');
  openModal('Registrar Venta',`
    <div class="row"><label>Cliente</label><input id="sClient" placeholder="Nombre/Razón social"></div>
    <div class="row"><label>Almacén</label><select id="sWh">${wh}</select></div>
    <div class="row"><label>Producto</label><select id="sItem">${it}</select></div>
    <div class="row"><label>Cantidad</label><input id="sQty" type="number" value="1"></div>
    <div class="row"><label>Precio Unit.</label><input id="sPrice" type="number" step="0.01" value="0"></div>
  `,'Guardar',()=>{
    const itemId=$('#sItem').value; const it=db.items.find(x=>x.id===itemId); const whId=$('#sWh').value;
    const qty=Number($('#sQty').value||0); const price=Number($('#sPrice').value||0);
    if((db.stock?.[whId]?.[itemId]||0)<qty){ alert('Stock insuficiente.'); return; }
    addStock(whId,itemId,-qty); movement({type:'venta',detail:`Venta a ${$('#sClient').value.trim()}`,itemId,sku:it.sku,qty:-qty,fromWh:whId,price});
    DB.save(db); renderInventario(); renderDashboard();
  });
};
$('#addTransferBtn').onclick=()=>{
  if(!requireItemAndWh())return;
  const wh = db.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  const it = db.items.map(i=>`<option value="${i.id}">${i.sku} • ${i.name}</option>`).join('');
  openModal('Transferencia',`
    <div class="row"><label>Desde</label><select id="tFrom">${wh}</select></div>
    <div class="row"><label>Hacia</label><select id="tTo">${wh}</select></div>
    <div class="row"><label>Producto</label><select id="tItem">${it}</select></div>
    <div class="row"><label>Cantidad</label><input id="tQty" type="number" value="1"></div>
  `,'Guardar',()=>{
    const itemId=$('#tItem').value; const it=db.items.find(x=>x.id===itemId);
    const from=$('#tFrom').value; const to=$('#tTo').value; const qty=Number($('#tQty').value||0);
    if(from===to){ alert('Selecciona almacenes distintos.'); return; }
    if((db.stock?.[from]?.[itemId]||0)<qty){ alert('Stock insuficiente.'); return; }
    addStock(from,itemId,-qty); addStock(to,itemId,qty);
    movement({type:'transferencia',detail:`${whName(from)} → ${whName(to)}`,itemId,sku:it.sku,qty,fromWh:from,toWh:to});
    DB.save(db); renderInventario(); renderDashboard();
  });
};
$('#addAdjBtn').onclick=()=>{
  if(!requireItemAndWh())return;
  const wh = db.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  const it = db.items.map(i=>`<option value="${i.id}">${i.sku} • ${i.name}</option>`).join('');
  openModal('Ajuste de Inventario',`
    <div class="row"><label>Almacén</label><select id="aWh">${wh}</select></div>
    <div class="row"><label>Producto</label><select id="aItem">${it}</select></div>
    <div class="row"><label>Δ Cantidad</label><input id="aQty" type="number" value="1"></div>
    <div class="row"><label>Motivo</label><input id="aReason" placeholder="Rotura, inventario físico..."></div>
  `,'Guardar',()=>{
    const itemId=$('#aItem').value; const it=db.items.find(x=>x.id===itemId);
    const whId=$('#aWh').value; const qty=Number($('#aQty').value||0);
    addStock(whId,itemId,qty);
    movement({type:'ajuste',detail:$('#aReason').value.trim(),itemId,sku:it.sku,qty,toWh: qty>0?whId:'', fromWh: qty<0?whId:''});
    DB.save(db); renderInventario(); renderDashboard();
  });
};
$('#itemSearch').addEventListener('input', renderInventario);
$('#repStockBtn').onclick=()=>{
  const sku = ($('#repSku').value||'').toLowerCase();
  const tbody=$('#repStockTable tbody'); tbody.innerHTML='';
  db.warehouses.forEach(w=>{
    db.items.forEach(it=>{
      if(sku && !it.sku.toLowerCase().includes(sku)) return;
      const qty=db.stock?.[w.id]?.[it.id]||0;
      if(qty!==0){ const tr=document.createElement('tr'); tr.innerHTML=`<td>${w.name}</td><td>${it.sku}</td><td>${it.name}</td><td>${qty}</td>`; tbody.appendChild(tr); }
    });
  });
};
$('#kardexBtn').onclick=()=>{
  const sku = ($('#kardexSku').value||'').toLowerCase();
  const tbody=$('#kardexTable tbody'); tbody.innerHTML='';
  db.moves.filter(m=>m.sku.toLowerCase()===sku).sort((a,b)=>a.date.localeCompare(b.date))
    .forEach(m=>{
      const tr=document.createElement('tr'); tr.innerHTML=`<td>${m.date.slice(0,19).replace('T',' ')}</td><td>${m.type}</td><td>${m.detail||''}</td><td>${m.qty}</td>`;
      tbody.appendChild(tr);
    });
};

function renderInventario(){
  // productos
  const term = ($('#itemSearch')?.value||'').toLowerCase();
  const tbody = $('#itemsTable tbody'); tbody.innerHTML='';
  db.items.filter(it=> it.sku.toLowerCase().includes(term) || it.name.toLowerCase().includes(term))
    .forEach(it=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td><span class="badge gold">${it.sku}</span></td><td>${it.name}</td><td>${catName(it.categoryId)}</td>
        <td>$${Number(it.price||0).toFixed(2)}</td><td>${it.min??0}</td><td>${stockTotal(it.id)}</td>
        <td><button class="small" data-edit="${it.id}">Editar</button> <button class="small outline" data-del="${it.id}">Borrar</button></td>
      `;
      tbody.appendChild(tr);
    });
  tbody.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{
    const i=db.items.findIndex(x=>x.id===b.dataset.del); if(i>=0) db.items.splice(i,1); DB.save(db); renderInventario(); renderDashboard();
  });

  // almacenes
  const tbodyW = $('#whTable tbody'); tbodyW.innerHTML='';
  db.warehouses.forEach(w=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${w.name}</td><td>${w.location||''}</td>
    <td><button class="small" data-edit="${w.id}">Editar</button> <button class="small outline" data-del="${w.id}">Borrar</button></td>`;
    tbodyW.appendChild(tr);
  });
  tbodyW.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{
    const i=db.warehouses.findIndex(x=>x.id===b.dataset.del); if(i>=0) db.warehouses.splice(i,1); DB.save(db); renderInventario();
  });
}

/* ------------------------------------
   Analytics (Chart.js)
------------------------------------ */
let chartFin=null, chartSkus=null;
function renderAnalytics(){
  // datos 6 meses
  const months = [...Array(6)].map((_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()- (5-i)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const incomes = months.map(m=> db.txns.filter(t=>t.type==='ingreso' && monthKey(t.date)===m).reduce((a,t)=>a+Number(t.amount||0),0));
  const expenses= months.map(m=> db.txns.filter(t=>t.type==='gasto'   && monthKey(t.date)===m).reduce((a,t)=>a+Number(t.amount||0),0));
  // top SKUs por ventas (qty)
  const sales = {};
  db.moves.filter(m=>m.type==='venta').forEach(m=>{ sales[m.sku]=(sales[m.sku]||0)+(-m.qty); });
  const top = Object.entries(sales).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const labelsTop = top.map(x=>x[0]); const dataTop = top.map(x=>x[1]);

  if(chartFin) chartFin.destroy();
  if(chartSkus) chartSkus.destroy();

  chartFin = new Chart($('#chartFin'), { type:'line', data:{ labels:months, datasets:[
    { label:'Ingresos', data:incomes },
    { label:'Gastos', data:expenses }
  ]}});
  chartSkus = new Chart($('#chartSkus'), { type:'bar', data:{ labels:labelsTop, datasets:[{ label:'Unidades vendidas', data:dataTop }] }});
}

/* ------------------------------------
   Export/Import/CSV/Settings
------------------------------------ */
$('#exportJsonBtn').onclick=()=>{
  const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='oasis_erp.json'; a.click();
};
$('#importJsonBtn').onclick=()=>$('#importFile').click();
$('#importFile').onchange=(e)=>{
  const f=e.target.files?.[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{ const data=JSON.parse(r.result); db=data; DB.save(db); ensureStockMatrix(); alert('Datos importados.'); refreshAll(); } catch(err){ alert('Error al importar: '+err.message);} };
  r.readAsText(f);
};
$('#exportCsvBtn').onclick=()=>{
  const headers=['SKU','Nombre','Categoria','Precio','Minimo','StockTotal'];
  const rows=db.items.map(it=>[it.sku,it.name,catName(it.categoryId),it.price,it.min??0,stockTotal(it.id)]);
  const csv=[headers.join(','),...rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='productos.csv'; a.click();
};
$('#saveBrandBtn').onclick=()=>{ db.settings.brandName=$('#brandName').value.trim()||db.settings.brandName; DB.save(db); applyBrand(); };
$('#changePinBtn').onclick=()=>$('#setPinBtn').click();
$('#logoFile').onchange=(e)=>{
  const f=e.target.files?.[0]; if(!f) return;
  const r=new FileReader(); r.onload=()=>{ db.settings.logoDataUrl=r.result; DB.save(db); $('#logoPreview').src=db.settings.logoDataUrl; }; r.readAsDataURL(f);
};
function applyBrand(){ $('.logo').textContent=db.settings.brandName||'Oasis • ERP Suite'; $('#brandName').value=db.settings.brandName||''; if(db.settings.logoDataUrl) $('#logoPreview').src=db.settings.logoDataUrl; }

/* ------------------------------------
   PDFs B/N – Logo en gris sin estirar
------------------------------------ */
const { jsPDF } = window.jspdf || {};
function loadGrayImageDataUrl(src, maxWmm=40, maxHmm=16){
  return new Promise((resolve)=>{
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{
      const mm2px = (mm)=>Math.floor(mm*3.78);
      const maxW=mm2px(maxWmm), maxH=mm2px(maxHmm);
      const scale=Math.min(maxW/img.width, maxH/img.height, 1);
      const w=Math.max(1,Math.floor(img.width*scale)), h=Math.max(1,Math.floor(img.height*scale));
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h; const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,w,h);
      const d=ctx.getImageData(0,0,w,h); const dt=d.data;
      for(let i=0;i<dt.length;i+=4){ const y=0.299*dt[i]+0.587*dt[i+1]+0.114*dt[i+2]; dt[i]=dt[i+1]=dt[i+2]=y; }
      ctx.putImageData(d,0,0);
      resolve({ dataUrl:canvas.toDataURL('image/png'), wmm:w/3.78, hmm:h/3.78 });
    };
    img.onerror=()=>resolve(null); img.src=src;
  });
}
async function drawHeader(doc, title){
  doc.setTextColor(0); doc.setDrawColor(0); doc.setFillColor(255,255,255);
  let logoW=0;
  if(db.settings.logoDataUrl){
    const g=await loadGrayImageDataUrl(db.settings.logoDataUrl,40,16);
    if(g){ doc.addImage(g.dataUrl,'PNG',14,12,g.wmm,g.hmm); logoW=g.wmm; }
  }
  const xText = 14 + (logoW?logoW+6:0), y=18;
  doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text(db.settings.brandName||'Oasis • ERP Suite', xText, y);
  doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.text(title, xText, y+7);
  doc.line(14,36,196,36);
}
function savePdf(doc, name){ doc.save(name.replace(/\s+/g,'_')+'.pdf'); }

/* PDFs Finanzas */
$('#pdfFinBtn').onclick=async ()=>{
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
  await drawHeader(doc,'Resumen Financiero (B/N)');
  const balRows = db.accounts.map(a=>[a.name,a.type, (a.balance||0).toFixed(2)]);
  doc.autoTable({ startY:42, head:[['Cuenta','Tipo','Saldo']], body:balRows,
    styles:{textColor:[0,0,0], lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230], textColor:[0,0,0]}, theme:'grid'});
  savePdf(doc,'Resumen_Financiero');
};
$('#pdfTxBtn').onclick=async ()=>{
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
  await drawHeader(doc,'Transacciones (B/N)');
  const rows = db.txns.slice().reverse().map(t=>[t.date, accName(t.accountId), t.type, Number(t.amount||0).toFixed(2), t.desc||'']);
  doc.autoTable({ startY:42, head:[['Fecha','Cuenta','Tipo','Monto','Descripción']], body:rows,
    styles:{textColor:[0,0,0], lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230], textColor:[0,0,0]}, theme:'grid'});
  savePdf(doc,'Transacciones');
};
/* PDF Factura individual */
async function pdfFactura(fid){
  const f = db.invoices.find(x=>x.id===fid); if(!f) return;
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
  await drawHeader(doc,`Factura ${f.number} (B/N)`);
  const cli = db.clients.find(c=>c.id===f.clientId)?.name || '—';
  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  doc.text(`Cliente: ${cli}`,14,44); doc.text(`Fecha: ${f.date}`,14,51);
  const body = f.items.map(it=>[it.sku||'', it.name||'', it.qty, Number(it.price||0).toFixed(2), (it.qty*it.price).toFixed(2)]);
  doc.autoTable({ startY:56, head:[['SKU','Descripción','Qty','Precio','Importe']], body,
    styles:{textColor:[0,0,0], lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230], textColor:[0,0,0]}, theme:'grid'});
  const y = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica','bold'); doc.text(`TOTAL: $${f.total.toFixed(2)}`, 196-60, y);
  savePdf(doc, `Factura_${f.number}`);
}

/* PDFs Inventario */
$('#pdfItemsBtn').onclick=async ()=>{
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); await drawHeader(doc,'Catálogo de Productos (B/N)');
  const rows=db.items.map(it=>[it.sku,it.name,catName(it.categoryId), Number(it.price||0).toFixed(2), it.min??0, stockTotal(it.id)]);
  doc.autoTable({startY:42, head:[['SKU','Nombre','Categoría','Precio','Mín.','Stock']], body:rows,
    styles:{textColor:[0,0,0], lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230], textColor:[0,0,0]}, theme:'grid'});
  savePdf(doc,'Catalogo_Productos');
};
$('#pdfStockBtn').onclick=async ()=>{
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); await drawHeader(doc,'Existencias por Almacén (B/N)');
  const skuFilter = ($('#repSku')?.value||'').toLowerCase();
  const body=[]; db.warehouses.forEach(w=>{ db.items.forEach(it=>{ if(skuFilter && !it.sku.toLowerCase().includes(skuFilter)) return;
    const qty=db.stock?.[w.id]?.[it.id]||0; if(qty!==0) body.push([w.name,it.sku,it.name,qty]); }); });
  doc.autoTable({startY:42, head:[['Almacén','SKU','Nombre','Stock']], body,
    styles:{textColor:[0,0,0], lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230], textColor:[0,0,0]}, theme:'grid'});
  savePdf(doc,'Stock_por_Almacen');
};
$('#pdfKardexBtn').onclick=async ()=>{
  const sku = ($('#kardexSku')?.value||'').toLowerCase(); if(!sku){ alert('Escribe un SKU para el Kardex.'); return; }
  const moves=db.moves.filter(m=>m.sku.toLowerCase()===sku).sort((a,b)=>a.date.localeCompare(b.date));
  if(!moves.length){ alert('No hay movimientos para ese SKU.'); return; }
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); await drawHeader(doc,`Kardex – ${sku.toUpperCase()} (B/N)`);
  const body=moves.map(m=>[m.date.slice(0,19).replace('T',' '), m.type, m.detail||'', m.qty]);
  doc.autoTable({startY:42, head:[['Fecha','Tipo','Detalle','Qty']], body,
    styles:{textColor:[0,0,0], lineColor:[0,0,0]}, headStyles:{fillColor:[230,230,230], textColor:[0,0,0]}, theme:'grid'});
  savePdf(doc,`Kardex_${sku.toUpperCase()}`);
};

/* ===== Inicial ===== */
function refreshAll(){ renderDashboard(); renderFinanzas(); renderCRM(); renderInventario(); /* analytics render on tab */ }
function enterApp(){ enforceAuth(); if(!AUTH.is())return; applyBrand(); ensureStockMatrix(); refreshAll(); }
window.addEventListener('DOMContentLoaded',()=>{ enforceAuth(); $('#pinInput').focus(); });
