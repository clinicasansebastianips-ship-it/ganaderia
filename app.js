const DB_NAME="ganaderia_offline", DB_VERSION=2;
const STORES={users:"users",animals:"animals",milk:"milk",healthEvents:"healthEvents",boosters:"boosters",repro:"repro",salesCheese:"salesCheese",buyMilk:"buyMilk",transMilk:"transMilk",fixedCosts:"fixedCosts"};
const uid=(p="id")=>`${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const $=(id)=>document.getElementById(id);
const todayISO=()=>new Date().toISOString().slice(0,10);
const parseISO=(s)=>{ if(!s) return null; const d=new Date(s); return isNaN(d)?null:d; };
const daysUntil=(d)=>Math.floor((d.getTime()-Date.now())/(1000*60*60*24));
const daysSince=(d)=>Math.floor((Date.now()-d.getTime())/(1000*60*60*24));

function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;Object.values(STORES).forEach(s=>{if(!db.objectStoreNames.contains(s)) db.createObjectStore(s,{keyPath:"id"});});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function getAll(store){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(store,"readonly").objectStore(store).getAll();t.onsuccess=()=>res(t.result||[]);t.onerror=()=>rej(t.error);});}
async function put(store,obj){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(store,"readwrite").objectStore(store).put(obj);t.onsuccess=()=>res(true);t.onerror=()=>rej(t.error);});}
async function delRow(store,id){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(store,"readwrite").objectStore(store).delete(id);t.onsuccess=()=>res(true);t.onerror=()=>rej(t.error);});}

let state={userId:null,users:[],animals:[],milk:[],boosters:[],repro:[],salesCheese:[],buyMilk:[],transMilk:[],fixedCosts:[]};

async function seed(){const u=await getAll(STORES.users); if(u.length===0){await put(STORES.users,{id:uid("user"),name:"Administrador"});await put(STORES.users,{id:uid("user"),name:"Operario"});}}

function showModal(title, html){$("modalTitle").textContent=title;$("modalBody").innerHTML=html;$("modal").classList.add("show");}
function closeModal(){$("modal").classList.remove("show");}
$("closeModal").addEventListener("click", closeModal);
$("modal").addEventListener("click",(e)=>{if(e.target.id==="modal") closeModal();});

function userName(id){return state.users.find(x=>x.id===id)?.name||"—";}
function animalById(id){return state.animals.find(x=>x.id===id)||null;}
function animalLabel(id){const a=animalById(id); if(!a) return "—"; return `${a.arete||"s/a"} • ${a.name||""}`.trim();}

function classifyBooster(b){ if(b.status==="done") return "done"; const d=parseISO(b.refDate); if(!d) return "ok"; const left=daysUntil(d); if(left<0) return "overdue"; if(left<=3) return "d3"; if(left<=10) return "d10"; if(left<=15) return "d15"; return "ok"; }
function labelBooster(k){return k==="overdue"?"VENCIDO":k==="d3"?"≤ 3 días":k==="d10"?"≤ 10 días":k==="d15"?"≤ 15 días":k==="done"?"HECHO":"OK";}
function badgeClass(k){return (k==="overdue"||k==="d3")?"bad":(k==="d10"||k==="d15")?"warn":"ok";}

function reproDaysOpen(r){ if(r.pre==="SI") return 0; const parto=parseISO(r.parto); if(!parto) return null; return daysSince(parto); }
function reproAlert(d){ if(d===null) return ""; return d>120?"REVISAR":"OK"; }

async function refresh(){
  state.users=await getAll(STORES.users);
  state.animals=await getAll(STORES.animals);
  state.milk=await getAll(STORES.milk);
  state.boosters=await getAll(STORES.boosters);
  state.repro=await getAll(STORES.repro);
  state.salesCheese=await getAll(STORES.salesCheese);
  state.buyMilk=await getAll(STORES.buyMilk);
  state.transMilk=await getAll(STORES.transMilk);
  state.fixedCosts=await getAll(STORES.fixedCosts);
  if(!state.userId && state.users.length) state.userId=state.users[0].id;
}

function renderUsers(){
  const sel=$("userSelect"); sel.innerHTML="";
  state.users.forEach(u=>{const o=document.createElement("option");o.value=u.id;o.textContent=u.name;if(u.id===state.userId) o.selected=true;sel.appendChild(o);});
  sel.onchange=()=>{state.userId=sel.value; renderAll();};
}
$("addUserBtn").addEventListener("click", async()=>{const name=prompt("Nombre del usuario:"); if(!name) return; await put(STORES.users,{id:uid("user"),name:name.trim()}); await renderAll();});

// Tabs
function setTab(tab){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $("view-"+tab).classList.remove("hidden");
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

// Form helpers
function formInput(id,label,type="text",value="",placeholder=""){return `<div><label class="label">${label}</label><input id="${id}" type="${type}" value="${value||""}" placeholder="${placeholder||""}"/></div>`;}
function formSelect(id,label,opts,value){const o=opts.map(x=>`<option value="${x.value}" ${x.value===value?"selected":""}>${x.label}</option>`).join("");return `<div><label class="label">${label}</label><select id="${id}">${o}</select></div>`;}
function animalOptions(){return state.animals.map(a=>({value:a.id,label:`${a.arete||"s/a"} • ${a.name||""}`}));}

// Animals
async function openAnimalForm(){
  showModal("Agregar animal",`<div class="formgrid">
    ${formInput("aArete","Arete","text","","Ej: 403")}
    ${formInput("aName","Nombre","text","","Ej: Indira")}
    ${formInput("aFinca","Finca","text","","Ej: Guadalupe / 3C")}
    ${formSelect("aSexo","Sexo",[{value:"Hembra",label:"Hembra"},{value:"Macho",label:"Macho"}],"Hembra")}
    ${formInput("aRaza","Raza","text","","Ej: Girolanda F1")}
    <div class="full"><button class="btn" id="saveA">Guardar</button></div>
  </div>`);
  $("saveA").onclick=async()=>{
    await put(STORES.animals,{id:uid("ani"),arete:$("aArete").value.trim(),name:$("aName").value.trim(),finca:$("aFinca").value.trim(),sexo:$("aSexo").value,raza:$("aRaza").value.trim(),createdBy:state.userId,createdAt:Date.now()});
    closeModal(); await renderAll();
  };
}
$("addAnimalBtn").addEventListener("click", openAnimalForm);
$("searchAnimals").addEventListener("input", ()=>renderAnimals());
function renderAnimals(){
  const q=($("searchAnimals").value||"").toLowerCase();
  const tb=$("animalsTbody"); tb.innerHTML="";
  state.animals.filter(a=>!q||((a.arete||"")+" "+(a.name||"")).toLowerCase().includes(q))
    .sort((a,b)=>(a.arete||"").localeCompare(b.arete||""))
    .forEach(a=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${a.arete||"—"}</td><td>${a.name||"—"}</td><td>${a.finca||"—"}</td><td>${a.sexo||"—"}</td><td>${a.raza||"—"}</td><td><button class="btn secondary">Eliminar</button></td>`;
      tr.querySelector("button").onclick=async()=>{await delRow(STORES.animals,a.id); await renderAll();};
      tb.appendChild(tr);
    });
}

// Milk
async function openMilkForm(){
  const opts=animalOptions(); if(opts.length===0){alert("Primero agrega animales."); setTab("animals"); return;}
  showModal("Registrar ordeño",`<div class="formgrid">
    ${formInput("mDate","Fecha","date",todayISO())}
    ${formSelect("mAnimal","Vaca",opts,opts[0].value)}
    ${formInput("mM","Litros mañana","number","","0")}
    ${formInput("mT","Litros tarde","number","","0")}
    <div class="full"><button class="btn" id="saveM">Guardar</button></div>
  </div>`);
  $("saveM").onclick=async()=>{
    const m=Number($("mM").value||0), t=Number($("mT").value||0);
    await put(STORES.milk,{id:uid("milk"),date:$("mDate").value||todayISO(),animalId:$("mAnimal").value,m,t,total:m+t,createdBy:state.userId,createdAt:Date.now()});
    closeModal(); await renderAll();
  };
}
$("addMilkBtn").addEventListener("click", openMilkForm);
$("quickMilk").addEventListener("click", ()=>{setTab("milk"); openMilkForm();});
$("searchMilk").addEventListener("input", ()=>renderMilk());
function renderMilk(){
  const q=($("searchMilk").value||"").toLowerCase();
  const tb=$("milkTbody"); tb.innerHTML="";
  state.milk.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||""))
    .filter(m=>{if(!q) return true; const a=animalById(m.animalId); return ((a?.arete||"")+" "+(a?.name||"")).toLowerCase().includes(q);})
    .forEach(m=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${m.date||"—"}</td><td>${animalLabel(m.animalId)}</td><td>${m.m||0}</td><td>${m.t||0}</td><td><b>${m.total||0}</b></td><td>${userName(m.createdBy)}</td><td><button class="btn secondary">Eliminar</button></td>`;
      tr.querySelector("button").onclick=async()=>{await delRow(STORES.milk,m.id); await renderAll();};
      tb.appendChild(tr);
    });
}

// Health / Boosters
async function openHealthForm(){
  const opts=animalOptions(); if(opts.length===0){alert("Primero agrega animales."); setTab("animals"); return;}
  showModal("Registrar sanidad + refuerzos",`<div class="formgrid">
    ${formInput("hDate","Fecha aplicación","date",todayISO())}
    ${formSelect("hAnimal","Animal",opts,opts[0].value)}
    ${formInput("hProc","Procedimiento","text","","Ej: Ricomax / Carbón")}
    <div class="full">
      <div style="font-weight:800; margin-bottom:6px">Refuerzos (múltiples)</div>
      <div class="help">Alertas a 15/10/3 días y vencidos.</div>
      <div id="refList"></div>
      <button class="btn secondary" id="addRefBtn" style="margin-top:8px">+ Agregar fecha</button>
    </div>
    <div class="full"><button class="btn" id="saveH">Guardar</button></div>
  </div>`);
  const refDates=[];
  const renderRefs=()=>{
    const el=$("refList"); el.innerHTML="";
    if(refDates.length===0){el.innerHTML=`<div class="small">Sin refuerzos por ahora.</div>`; return;}
    refDates.forEach((d,i)=>{
      const row=document.createElement("div");
      row.style.display="flex"; row.style.gap="10px"; row.style.marginBottom="8px";
      row.innerHTML=`<input type="date" value="${d}"/><button class="btn secondary">Quitar</button>`;
      row.querySelector("input").onchange=(e)=>refDates[i]=e.target.value;
      row.querySelector("button").onclick=()=>{refDates.splice(i,1); renderRefs();};
      el.appendChild(row);
    });
  };
  renderRefs();
  $("addRefBtn").onclick=()=>{refDates.push(""); renderRefs();};
  $("saveH").onclick=async()=>{
    const animalId=$("hAnimal").value;
    const procedure=$("hProc").value.trim();
    const date=$("hDate").value||todayISO();
    const a=animalById(animalId);
    const eventId=uid("hev");
    await put(STORES.healthEvents,{id:eventId,animalId,procedure,date,createdBy:state.userId,createdAt:Date.now()});
    for(const rd of refDates.filter(x=>x)){
      await put(STORES.boosters,{id:uid("boo"),eventId,animalId,procedure,refDate:rd,finca:a?.finca||"",status:"pending",createdBy:state.userId,createdAt:Date.now()});
    }
    closeModal(); await renderAll();
  };
}
$("addHealthBtn").addEventListener("click", openHealthForm);
$("quickHealth").addEventListener("click", ()=>{setTab("health"); openHealthForm();});
$("filterBoosters").addEventListener("change", ()=>renderBoosters());
$("searchBoosters").addEventListener("input", ()=>renderBoosters());

async function markBoosterDone(id){const b=state.boosters.find(x=>x.id===id); if(!b) return; b.status="done"; b.doneAt=Date.now(); b.doneBy=state.userId; await put(STORES.boosters,b); await renderAll();}
function renderBoosters(){
  const status=$("filterBoosters").value;
  const q=($("searchBoosters").value||"").toLowerCase();
  const tb=$("boostersTbody"); tb.innerHTML="";
  state.boosters.map(b=>({b,kind:classifyBooster(b)}))
    .filter(({b,kind})=>{
      if(status==="all") return true;
      if(status==="done") return kind==="done";
      if(status==="overdue") return kind==="overdue";
      if(status==="d3") return kind==="d3";
      if(status==="d10") return kind==="d10";
      if(status==="d15") return kind==="d15";
      if(status==="ok") return kind==="ok" && b.status!=="done";
      return true;
    })
    .filter(({b})=>{
      if(!q) return true;
      const a=animalById(b.animalId);
      return ((a?.arete||"")+" "+(a?.name||"")).toLowerCase().includes(q);
    })
    .sort((a,c)=>(a.b.refDate||"").localeCompare(c.b.refDate||""))
    .forEach(({b,kind})=>{
      const tr=document.createElement("tr");
      const lbl=b.status==="done"?"HECHO":labelBooster(kind);
      tr.innerHTML=`<td>${animalLabel(b.animalId)}</td><td>${b.procedure}</td><td>${b.refDate||"—"}</td><td><span class="badge ${badgeClass(kind)}">${lbl}</span></td><td>${userName(b.createdBy)}</td>
      <td>${b.status==="done"?"":`<button class="btn secondary" data-d="${b.id}">Hecho</button>`} <button class="btn secondary" data-x="${b.id}">Eliminar</button></td>`;
      const bh=tr.querySelector("button[data-d]"); if(bh) bh.onclick=()=>markBoosterDone(b.id);
      tr.querySelector("button[data-x]").onclick=async()=>{await delRow(STORES.boosters,b.id); await renderAll();};
      tb.appendChild(tr);
    });
}

// Repro
async function openReproForm(){
  const opts=animalOptions().filter(o=> (animalById(o.value)?.sexo||"Hembra")==="Hembra");
  if(opts.length===0){alert("Agrega hembras en animales."); setTab("animals"); return;}
  showModal("Registrar reproducción",`<div class="formgrid">
    ${formSelect("rAnimal","Vaca",opts,opts[0].value)}
    ${formInput("rParto","Último parto","date","")}
    ${formInput("rCelo","Último celo","date","")}
    ${formInput("rInsem","Inseminación","date","")}
    ${formSelect("rPre","Diagnóstico preñez",[{value:"",label:"(Sin dato)"},{value:"SI",label:"SI"},{value:"NO",label:"NO"}],"")}
    <div class="full"><button class="btn" id="saveR">Guardar</button></div>
  </div>`);
  $("saveR").onclick=async()=>{
    await put(STORES.repro,{id:uid("rep"),animalId:$("rAnimal").value,parto:$("rParto").value||"",celo:$("rCelo").value||"",insem:$("rInsem").value||"",pre:$("rPre").value||"",createdBy:state.userId,createdAt:Date.now()});
    closeModal(); await renderAll();
  };
}
$("addReproBtn").addEventListener("click", openReproForm);
$("quickRepro").addEventListener("click", ()=>{setTab("repro"); openReproForm();});
$("filterRepro").addEventListener("change", ()=>renderRepro());
$("searchRepro").addEventListener("input", ()=>renderRepro());

function renderRepro(){
  const filt=$("filterRepro").value;
  const q=($("searchRepro").value||"").toLowerCase();
  const latest=new Map();
  state.repro.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).forEach(r=>{if(!latest.has(r.animalId)) latest.set(r.animalId,r);});
  let rows=[...latest.values()].map(r=>{const d=reproDaysOpen(r); return {...r,daysOpen:d,alert:reproAlert(d)};});
  if(filt==="revisar") rows=rows.filter(r=>r.alert==="REVISAR");
  rows=rows.filter(r=>{if(!q) return true; const a=animalById(r.animalId); return ((a?.arete||"")+" "+(a?.name||"")).toLowerCase().includes(q);});
  const tb=$("reproTbody"); tb.innerHTML="";
  rows.forEach(r=>{
    const badge=r.daysOpen===null?"—":(r.alert==="REVISAR"?`<span class="badge bad">REVISAR</span>`:`<span class="badge ok">OK</span>`);
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${animalLabel(r.animalId)}</td><td>${r.parto||"—"}</td><td>${r.celo||"—"}</td><td>${r.insem||"—"}</td><td>${r.pre||"—"}</td><td>${r.daysOpen===null?"—":r.daysOpen}</td><td>${badge}</td><td><button class="btn secondary">Eliminar</button></td>`;
    tr.querySelector("button").onclick=async()=>{await delRow(STORES.repro,r.id); await renderAll();};
    tb.appendChild(tr);
  });
}

// Finance
async function openSaleForm(){
  showModal("Registrar venta de queso",`<div class="formgrid">
    ${formInput("sDate","Fecha","date",todayISO())}
    ${formInput("sClient","Cliente","text","","Ej: Tienda")}
    ${formInput("sLbs","Libras","number","","")}
    ${formInput("sPrice","Precio por libra (COP)","number","","")}
    <div class="full"><button class="btn" id="saveS">Guardar</button></div>
  </div>`);
  $("saveS").onclick=async()=>{
    const lbs=Number($("sLbs").value||0), price=Number($("sPrice").value||0);
    await put(STORES.salesCheese,{id:uid("sale"),date:$("sDate").value||todayISO(),client:$("sClient").value.trim(),lbs,price,total:lbs*price,createdBy:state.userId,createdAt:Date.now()});
    closeModal(); await renderAll();
  };
}
$("addSaleBtn").addEventListener("click", openSaleForm);

async function openBuyMilkForm(){
  showModal("Registrar compra de leche",`<div class="formgrid">
    ${formInput("bPeriod","Periodo","text","","Ej: 05-01-26 al 11-01-26")}
    ${formInput("bLiters","Litros","number","","")}
    ${formInput("bVL","Valor por litro (COP)","number","","")}
    <div class="full"><button class="btn" id="saveB">Guardar</button></div>
  </div>`);
  $("saveB").onclick=async()=>{
    const liters=Number($("bLiters").value||0), vl=Number($("bVL").value||0);
    await put(STORES.buyMilk,{id:uid("buy"),period:$("bPeriod").value.trim(),liters,vl,total:liters*vl,createdBy:state.userId,createdAt:Date.now()});
    closeModal(); await renderAll();
  };
}
$("addBuyMilkBtn").addEventListener("click", openBuyMilkForm);

async function openTransMilkForm(){
  showModal("Registrar transporte de leche",`<div class="formgrid">
    ${formInput("tPeriod","Periodo","text","","Ej: 05-01-26 al 11-01-26")}
    ${formInput("tValue","Valor transporte (COP)","number","","")}
    ${formInput("tQty","Cantidad","number","","")}
    <div class="full"><button class="btn" id="saveT">Guardar</button></div>
  </div>`);
  $("saveT").onclick=async()=>{
    const value=Number($("tValue").value||0), qty=Number($("tQty").value||0);
    await put(STORES.transMilk,{id:uid("tm"),period:$("tPeriod").value.trim(),value,qty,total:value*qty,createdBy:state.userId,createdAt:Date.now()});
    closeModal(); await renderAll();
  };
}
$("addTransMilkBtn").addEventListener("click", openTransMilkForm);

async function openFixedForm(){
  showModal("Registrar gasto fijo",`<div class="formgrid">
    ${formInput("fConcept","Concepto","text","","Ej: Nómina")}
    ${formInput("fValue","Valor mensual (COP)","number","","")}
    <div class="full"><button class="btn" id="saveF">Guardar</button></div>
  </div>`);
  $("saveF").onclick=async()=>{
    const value=Number($("fValue").value||0);
    await put(STORES.fixedCosts,{id:uid("fx"),concept:$("fConcept").value.trim(),value,createdBy:state.userId,createdAt:Date.now()});
    closeModal(); await renderAll();
  };
}
$("addFixedBtn").addEventListener("click", openFixedForm);

function renderFinance(){
  const totalSales=state.salesCheese.reduce((s,x)=>s+(x.total||0),0);
  const totalBuy=state.buyMilk.reduce((s,x)=>s+(x.total||0),0);
  const totalTrans=state.transMilk.reduce((s,x)=>s+(x.total||0),0);
  const totalFixed=state.fixedCosts.reduce((s,x)=>s+(x.value||0),0);
  const util=totalSales-totalBuy-totalTrans-totalFixed;
  $("financeSummary").innerHTML=`
    <div class="item"><div><b>Ventas queso</b></div><div>${totalSales.toLocaleString("es-CO")}</div></div>
    <div class="item"><div><b>Compra leche</b></div><div>${totalBuy.toLocaleString("es-CO")}</div></div>
    <div class="item"><div><b>Transporte leche</b></div><div>${totalTrans.toLocaleString("es-CO")}</div></div>
    <div class="item"><div><b>Gastos fijos</b></div><div>${totalFixed.toLocaleString("es-CO")}</div></div>
    <div class="item"><div><b>Utilidad (aprox)</b></div><div><b>${util.toLocaleString("es-CO")}</b></div></div>`;
  const st=$("salesTbody"); st.innerHTML="";
  state.salesCheese.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).forEach(s=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${s.date||"—"}</td><td>${s.client||"—"}</td><td>${s.lbs||0}</td><td>${s.price||0}</td><td><b>${(s.total||0).toLocaleString("es-CO")}</b></td><td><button class="btn secondary">Eliminar</button></td>`;
    tr.querySelector("button").onclick=async()=>{await delRow(STORES.salesCheese,s.id); await renderAll();};
    st.appendChild(tr);
  });
  const ft=$("financeTbody"); ft.innerHTML="";
  const combined=[];
  state.buyMilk.forEach(x=>combined.push({type:"Compra leche",period:x.period||"",detail:`${x.liters||0} L × ${x.vl||0}`,total:x.total||0,id:x.id,store:STORES.buyMilk}));
  state.transMilk.forEach(x=>combined.push({type:"Transporte leche",period:x.period||"",detail:`${x.value||0} × ${x.qty||0}`,total:x.total||0,id:x.id,store:STORES.transMilk}));
  state.fixedCosts.forEach(x=>combined.push({type:"Gasto fijo",period:"Mensual",detail:x.concept||"",total:x.value||0,id:x.id,store:STORES.fixedCosts}));
  combined.forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${r.type}</td><td>${r.period}</td><td>${r.detail}</td><td><b>${(r.total||0).toLocaleString("es-CO")}</b></td><td><button class="btn secondary">Eliminar</button></td>`;
    tr.querySelector("button").onclick=async()=>{await delRow(r.store,r.id); await renderAll();};
    ft.appendChild(tr);
  });
}

// Dashboard
function renderDashboard(){
  const kinds=state.boosters.map(classifyBooster).filter(k=>k!=="done");
  $("mOverdue").textContent=kinds.filter(k=>k==="overdue").length;
  $("mD3").textContent=kinds.filter(k=>k==="d3").length;
  $("mD10").textContent=kinds.filter(k=>k==="d10").length;
  $("mD15").textContent=kinds.filter(k=>k==="d15").length;
  const low=state.milk.filter(m=>{const d=parseISO(m.date); return d && daysSince(d)<=7 && (m.total||0)<4;}).length;
  $("mLowMilk").textContent=low;

  const latest=new Map();
  state.repro.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).forEach(r=>{if(!latest.has(r.animalId)) latest.set(r.animalId,r);});
  const reproRevisar=[...latest.values()].filter(r=>reproAlert(reproDaysOpen(r))==="REVISAR").length;
  $("mRepro").textContent=reproRevisar;

  const list=$("alertsList"); list.innerHTML="";
  const priority={overdue:0,d3:1,d10:2,d15:3,ok:4,done:9};
  const boosterAlerts=state.boosters.map(b=>({b,kind:classifyBooster(b)})).filter(x=>x.kind!=="ok"&&x.kind!=="done").sort((a,c)=>priority[a.kind]-priority[c.kind]).slice(0,6);
  if(boosterAlerts.length===0 && low===0 && reproRevisar===0){list.innerHTML=`<div class="small">No hay alertas críticas. ✅</div>`;}
  boosterAlerts.forEach(({b,kind})=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`<div><div><b>${animalLabel(b.animalId)}</b> — ${b.procedure}</div><div class="small">Refuerzo: ${b.refDate||"—"} • Finca: ${b.finca||"—"}</div></div>
      <div style="display:flex; gap:8px; align-items:center"><span class="badge ${badgeClass(kind)}">${labelBooster(kind)}</span><button class="btn secondary">Hecho</button></div>`;
    div.querySelector("button").onclick=()=>markBoosterDone(b.id);
    list.appendChild(div);
  });
  state.milk.filter(m=>{const d=parseISO(m.date); return d && daysSince(d)<=7 && (m.total||0)<4;}).slice(0,4).forEach(m=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`<div><div><b>Producción baja</b> — ${animalLabel(m.animalId)}</div><div class="small">Fecha: ${m.date} • Total: <b>${m.total||0} L</b></div></div><span class="badge bad">&lt;4L</span>`;
    list.appendChild(div);
  });
  if(reproRevisar>0){
    const div=document.createElement("div"); div.className="item";
    div.innerHTML=`<div><div><b>Reproducción</b> — ${reproRevisar} vaca(s) con &gt;120 días abiertos</div><div class="small">Ir a Reproducción → filtro REVISAR</div></div><span class="badge bad">REVISAR</span>`;
    list.appendChild(div);
  }

  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-30);
  const by=new Map();
  state.milk.forEach(m=>{const d=parseISO(m.date); if(!d||d<cutoff) return; by.set(m.animalId,(by.get(m.animalId)||0)+(m.total||0));});
  const ranking=[...by.entries()].map(([animalId,liters])=>({animalId,liters})).sort((a,b)=>b.liters-a.liters).slice(0,30);
  const rt=$("rankTbody"); rt.innerHTML="";
  if(ranking.length===0){rt.innerHTML=`<tr><td colspan="3">Aún no hay ordeños registrados.</td></tr>`;}
  ranking.forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${animalLabel(r.animalId)}</td><td><b>${r.liters.toFixed(1)}</b></td><td>${(r.liters/30).toFixed(2)}</td>`;
    rt.appendChild(tr);
  });
}

// Backup
async function exportJSON(){
  const payload={exportedAt:new Date().toISOString(),data:{}};
  for(const [k,store] of Object.entries(STORES)) payload.data[k]=await getAll(store);
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`ganaderia_respaldo_${todayISO()}.json`; a.click(); URL.revokeObjectURL(a.href);
}
async function importJSON(file){
  const obj=JSON.parse(await file.text()); const data=obj?.data; if(!data) throw new Error("Archivo inválido");
  for(const [k,store] of Object.entries(STORES)){ for(const row of (data[k]||[])) await put(store,row); }
  await renderAll();
}
$("exportBtn").addEventListener("click", exportJSON);
$("importFile").addEventListener("change", async (e)=>{const f=e.target.files?.[0]; if(!f) return; try{await importJSON(f); alert("Importación exitosa.");}catch(err){alert("Error importando: "+err.message);} e.target.value="";});

async function renderAll(){
  await refresh();
  renderUsers();
  renderDashboard();
  renderAnimals();
  renderMilk();
  renderBoosters();
  renderRepro();
  renderFinance();
}

(async function init(){await seed(); await renderAll();})();


// Importar desde Excel (XLSX) - guía (la conversión se hace con el script incluido)
const excelInput = document.getElementById("importExcelFile");
if(excelInput){
  excelInput.addEventListener("change", async (e)=>{
    const f=e.target.files?.[0];
    if(!f) return;
    // Show a simple modal with steps and keep the filename
    const filename = f.name || "archivo.xlsx";
    showModal("Importar desde Excel (XLSX)", `
      <div class="small">
        Para importar datos desde <b>${filename}</b>, esta app offline necesita convertir el Excel a un archivo <b>JSON</b> (sin internet).
        <div class="divider"></div>
        <b>En PC (Windows/Mac):</b><br/>
        1) Copia <b>${filename}</b> en la misma carpeta donde está esta app.<br/>
        2) Ejecuta en la consola (en esa carpeta):<br/>
        <div style="background:#0b1220;border:1px solid var(--line);border-radius:12px;padding:10px;overflow:auto;margin:8px 0">
          <code>python convert_excel_to_json.py "${filename}"</code>
        </div>
        3) Se creará: <b>ganaderia_import.json</b><br/>
        4) Vuelve al panel y usa <b>Importar respaldo (JSON)</b> para cargarlo.
        <div class="divider"></div>
        <b>Tip:</b> si tu Excel tiene “Medicamentos” con texto tipo “refuerzo el 19-02-26”, el sistema crea los refuerzos automáticamente.
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap">
        <button class="btn secondary" id="closeExcelHelp">Entendido</button>
      </div>
    `);
    document.getElementById("closeExcelHelp").onclick=()=>{ closeModal(); };
    e.target.value="";
  });
}

