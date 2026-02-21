/* Ganadería Offline PWA — app.js (limpio)
   - IndexedDB local
   - Multiusuario
   - Inventario, ordeño, sanidad/refuerzos, reproducción, finanzas
   - Bovinos brutos + Medicamentos (tablas extra)
*/

// =====================
// DB
// =====================
const DB_NAME = "ganaderia_offline";
const DB_VERSION = 4; // subir versión cuando agregas stores nuevos

const STORES = {
  users: "users",
  animals: "animals",
  milk: "milk",
  healthEvents: "healthEvents",
  boosters: "boosters",
  repro: "repro",
  salesCheese: "salesCheese",
  buyMilk: "buyMilk",
  transMilk: "transMilk",
  fixedCosts: "fixedCosts",
  brutos: "brutos",
  meds: "meds",
};

const uid = (p = "id") => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const $ = (id) => document.getElementById(id);
const on = (id, ev, fn) => {
  const el = $(id);
  if (el) el.addEventListener(ev, fn);
  return el;
};

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const parseISO = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
};
const daysUntil = (d) => Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
const daysSince = (d) => Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      Object.values(STORES).forEach((s) => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
      });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function getAll(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, "readonly").objectStore(store).getAll();
    t.onsuccess = () => res(t.result || []);
    t.onerror = () => rej(t.error);
  });
}

async function put(store, obj) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, "readwrite").objectStore(store).put(obj);
    t.onsuccess = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

async function delRow(store, id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, "readwrite").objectStore(store).delete(id);
    t.onsuccess = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

// =====================
// State
// =====================
let state = {
  userId: null,
  users: [],
  animals: [],
  milk: [],
  healthEvents: [],
  boosters: [],
  repro: [],
  salesCheese: [],
  buyMilk: [],
  transMilk: [],
  fixedCosts: [],
  brutos: [],
  meds: [],
};

async function seed() {
  const u = await getAll(STORES.users);
  if (u.length === 0) {
    await put(STORES.users, { id: uid("user"), name: "Administrador" });
    await put(STORES.users, { id: uid("user"), name: "Operario" });
  }
}

async function refresh() {
  state.users = await getAll(STORES.users);
  state.animals = await getAll(STORES.animals);
  state.milk = await getAll(STORES.milk);
  state.healthEvents = await getAll(STORES.healthEvents);
  state.boosters = await getAll(STORES.boosters);
  state.repro = await getAll(STORES.repro);
  state.salesCheese = await getAll(STORES.salesCheese);
  state.buyMilk = await getAll(STORES.buyMilk);
  state.transMilk = await getAll(STORES.transMilk);
  state.fixedCosts = await getAll(STORES.fixedCosts);
  state.brutos = await getAll(STORES.brutos);
  state.meds = await getAll(STORES.meds);

  if (!state.userId && state.users.length) state.userId = state.users[0].id;
}

// =====================
// Modal
// =====================
function showModal(title, html) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("modal").classList.add("show");
}

function closeModal() {
  $("modal").classList.remove("show");
}

on("closeModal", "click", closeModal);
on("modal", "click", (e) => {
  if (e.target.id === "modal") closeModal();
});

// =====================
// Helpers
// =====================
function userName(id) {
  return state.users.find((x) => x.id === id)?.name || "—";
}

function animalById(id) {
  return state.animals.find((x) => x.id === id) || null;
}

function animalLabel(id) {
  const a = animalById(id);
  if (!a) return "—";
  return `${a.arete || "s/a"} • ${a.name || ""}`.trim();
}

function animalOptions() {
  return state.animals.map((a) => ({ value: a.id, label: `${a.arete || "s/a"} • ${a.name || ""}` }));
}

// =====================
// Tabs
// =====================
function setTab(tab) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  const view = $("view-" + tab);
  if (view) view.classList.remove("hidden");
}

document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

// =====================
// Users
// =====================
function renderUsers() {
  const sel = $("userSelect");
  if (!sel) return;
  sel.innerHTML = "";
  state.users.forEach((u) => {
    const o = document.createElement("option");
    o.value = u.id;
    o.textContent = u.name;
    if (u.id === state.userId) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = () => {
    state.userId = sel.value;
    renderAll();
  };
}

on("addUserBtn", "click", async () => {
  const name = prompt("Nombre del usuario:");
  if (!name) return;
  await put(STORES.users, { id: uid("user"), name: name.trim() });
  await renderAll();
});

// =====================
// Form helpers
// =====================
function formInput(id, label, type = "text", value = "", placeholder = "") {
  return `<div><label class="label">${label}</label><input id="${id}" type="${type}" value="${escapeAttr(value || "")}" placeholder="${escapeAttr(placeholder || "")}"/></div>`;
}

function formSelect(id, label, opts, value) {
  const o = opts
    .map((x) => `<option value="${escapeAttr(x.value)}" ${x.value === value ? "selected" : ""}>${escapeHtml(x.label)}</option>`)
    .join("");
  return `<div><label class="label">${label}</label><select id="${id}">${o}</select></div>`;
}

// =====================
// Animals
// =====================
async function openAnimalForm(existing) {
  const a = existing || { arete: "", name: "", finca: "", sexo: "Hembra", raza: "", extras: {} };
  const extrasTxt = JSON.stringify(a.extras || {}, null, 2);

  showModal(
    existing ? "Ver / Editar animal" : "Agregar animal",
    `<div class="formgrid">
      ${formInput("aArete", "Arete", "text", a.arete, "Ej: 403")}
      ${formInput("aName", "Nombre", "text", a.name, "Ej: Indira")}
      ${formInput("aFinca", "Finca", "text", a.finca, "Ej: Guadalupe / 3C")}
      ${formSelect(
        "aSexo",
        "Sexo",
        [
          { value: "Hembra", label: "Hembra" },
          { value: "Macho", label: "Macho" },
        ],
        a.sexo || "Hembra"
      )}
      ${formInput("aRaza", "Raza", "text", a.raza, "Ej: Girolanda F1")}
      <div class="full">
        <label class="label">Extras (todas las columnas del Excel) — JSON</label>
        <textarea id="aExtras" rows="6">${escapeHtml(extrasTxt)}</textarea>
      </div>
      <div class="full row">
        <button class="btn" id="saveA">Guardar</button>
        <button class="btn secondary" id="cancelA">Cancelar</button>
      </div>
    </div>`
  );

  $("cancelA").onclick = closeModal;
  $("saveA").onclick = async () => {
    let extras = {};
    try {
      extras = JSON.parse($("aExtras").value || "{}");
    } catch {
      return alert("Extras JSON inválido");
    }

    const rec = {
      id: a.id || uid("ani"),
      arete: $("aArete").value.trim(),
      name: $("aName").value.trim(),
      finca: $("aFinca").value.trim(),
      sexo: $("aSexo").value,
      raza: $("aRaza").value.trim(),
      extras,
      createdBy: a.createdBy || state.userId,
      createdAt: a.createdAt || Date.now(),
    };

    await put(STORES.animals, rec);
    closeModal();
    await renderAll();
  };
}

on("addAnimalBtn", "click", () => openAnimalForm(null));
on("searchAnimals", "input", () => renderAnimals());

function renderAnimals() {
  const tb = $("animalsTbody");
  if (!tb) return;

  const q = ($("searchAnimals")?.value || "").toLowerCase();
  tb.innerHTML = "";

  state.animals
    .filter((a) => !q || ((a.arete || "") + " " + (a.name || "")).toLowerCase().includes(q))
    .sort((a, b) => (a.arete || "").localeCompare(b.arete || ""))
    .forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(a.arete || "—")}</td><td>${escapeHtml(a.name || "—")}</td><td>${escapeHtml(a.finca || "—")}</td><td>${escapeHtml(a.sexo || "—")}</td><td>${escapeHtml(a.raza || "—")}</td>
        <td style="white-space:nowrap"><button class="btn secondary">Ver/Editar</button> <button class="btn danger">Borrar</button></td>`;
      const btns = tr.querySelectorAll("button");
      btns[0].onclick = () => openAnimalForm(a);
      btns[1].onclick = async () => {
        if (!confirm("Borrar animal?")) return;
        await delRow(STORES.animals, a.id);
        await renderAll();
      };
      tb.appendChild(tr);
    });
}

// =====================
// Milk
// =====================
async function openMilkForm() {
  const opts = animalOptions();
  if (opts.length === 0) {
    alert("Primero agrega animales.");
    setTab("animals");
    return;
  }

  showModal(
    "Registrar ordeño",
    `<div class="formgrid">
      ${formInput("mDate", "Fecha", "date", todayISO())}
      ${formSelect("mAnimal", "Vaca", opts, opts[0].value)}
      ${formInput("mM", "Litros mañana", "number", "", "0")}
      ${formInput("mT", "Litros tarde", "number", "", "0")}
      <div class="full"><button class="btn" id="saveM">Guardar</button></div>
    </div>`
  );

  $("saveM").onclick = async () => {
    const m = Number($("mM").value || 0);
    const t = Number($("mT").value || 0);
    await put(STORES.milk, {
      id: uid("milk"),
      date: $("mDate").value || todayISO(),
      animalId: $("mAnimal").value,
      m,
      t,
      total: m + t,
      createdBy: state.userId,
      createdAt: Date.now(),
    });
    closeModal();
    await renderAll();
  };
}

on("addMilkBtn", "click", openMilkForm);
on("quickMilk", "click", () => {
  setTab("milk");
  openMilkForm();
});
on("searchMilk", "input", () => renderMilk());

function renderMilk() {
  const tb = $("milkTbody");
  if (!tb) return;

  const q = ($("searchMilk")?.value || "").toLowerCase();
  tb.innerHTML = "";

  state.milk
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .filter((m) => {
      if (!q) return true;
      const a = animalById(m.animalId);
      return ((a?.arete || "") + " " + (a?.name || "")).toLowerCase().includes(q);
    })
    .forEach((m) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(m.date || "—")}</td><td>${escapeHtml(animalLabel(m.animalId))}</td><td>${m.m || 0}</td><td>${m.t || 0}</td><td><b>${m.total || 0}</b></td><td>${escapeHtml(userName(m.createdBy))}</td>
        <td><button class="btn secondary">Eliminar</button></td>`;
      tr.querySelector("button").onclick = async () => {
        await delRow(STORES.milk, m.id);
        await renderAll();
      };
      tb.appendChild(tr);
    });
}

// =====================
// Health / Boosters
// =====================
function classifyBooster(b) {
  if (b.status === "done") return "done";
  const d = parseISO(b.refDate);
  if (!d) return "ok";
  const left = daysUntil(d);
  if (left < 0) return "overdue";
  if (left <= 3) return "d3";
  if (left <= 10) return "d10";
  if (left <= 15) return "d15";
  return "ok";
}

function labelBooster(k) {
  return k === "overdue"
    ? "VENCIDO"
    : k === "d3"
      ? "≤ 3 días"
      : k === "d10"
        ? "≤ 10 días"
        : k === "d15"
          ? "≤ 15 días"
          : k === "done"
            ? "HECHO"
            : "OK";
}

function badgeClass(k) {
  return k === "overdue" || k === "d3" ? "bad" : k === "d10" || k === "d15" ? "warn" : "ok";
}

async function openHealthForm() {
  const opts = animalOptions();
  if (opts.length === 0) {
    alert("Primero agrega animales.");
    setTab("animals");
    return;
  }

  showModal(
    "Registrar sanidad + refuerzos",
    `<div class="formgrid">
      ${formInput("hDate", "Fecha aplicación", "date", todayISO())}
      ${formSelect("hAnimal", "Animal", opts, opts[0].value)}
      ${formInput("hProc", "Procedimiento", "text", "", "Ej: Ricomax / Carbón")}
      <div class="full">
        <div style="font-weight:800; margin-bottom:6px">Refuerzos (múltiples)</div>
        <div class="help">Alertas a 15/10/3 días y vencidos.</div>
        <div id="refList"></div>
        <button class="btn secondary" id="addRefBtn" style="margin-top:8px">+ Agregar fecha</button>
      </div>
      <div class="full"><button class="btn" id="saveH">Guardar</button></div>
    </div>`
  );

  const refDates = [];
  const renderRefs = () => {
    const el = $("refList");
    el.innerHTML = "";
    if (refDates.length === 0) {
      el.innerHTML = `<div class="small">Sin refuerzos por ahora.</div>`;
      return;
    }
    refDates.forEach((d, i) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "10px";
      row.style.marginBottom = "8px";
      row.innerHTML = `<input type="date" value="${escapeAttr(d)}"/><button class="btn secondary">Quitar</button>`;
      row.querySelector("input").onchange = (e) => (refDates[i] = e.target.value);
      row.querySelector("button").onclick = () => {
        refDates.splice(i, 1);
        renderRefs();
      };
      el.appendChild(row);
    });
  };
  renderRefs();

  $("addRefBtn").onclick = () => {
    refDates.push("");
    renderRefs();
  };

  $("saveH").onclick = async () => {
    const animalId = $("hAnimal").value;
    const procedure = $("hProc").value.trim();
    const date = $("hDate").value || todayISO();
    const a = animalById(animalId);
    const eventId = uid("hev");

    await put(STORES.healthEvents, { id: eventId, animalId, procedure, date, createdBy: state.userId, createdAt: Date.now() });

    for (const rd of refDates.filter((x) => x)) {
      await put(STORES.boosters, {
        id: uid("boo"),
        eventId,
        animalId,
        procedure,
        refDate: rd,
        finca: a?.finca || "",
        status: "pending",
        createdBy: state.userId,
        createdAt: Date.now(),
      });
    }

    closeModal();
    await renderAll();
  };
}

on("addHealthBtn", "click", openHealthForm);
on("quickHealth", "click", () => {
  setTab("health");
  openHealthForm();
});
on("filterBoosters", "change", () => renderBoosters());
on("searchBoosters", "input", () => renderBoosters());

async function markBoosterDone(id) {
  const b = state.boosters.find((x) => x.id === id);
  if (!b) return;
  b.status = "done";
  b.doneAt = Date.now();
  b.doneBy = state.userId;
  await put(STORES.boosters, b);
  await renderAll();
}

function renderBoosters() {
  const tb = $("boostersTbody");
  if (!tb) return;

  const status = $("filterBoosters")?.value || "all";
  const q = ($("searchBoosters")?.value || "").toLowerCase();

  tb.innerHTML = "";

  state.boosters
    .map((b) => ({ b, kind: classifyBooster(b) }))
    .filter(({ b, kind }) => {
      if (status === "all") return true;
      if (status === "done") return kind === "done";
      if (status === "overdue") return kind === "overdue";
      if (status === "d3") return kind === "d3";
      if (status === "d10") return kind === "d10";
      if (status === "d15") return kind === "d15";
      if (status === "ok") return kind === "ok" && b.status !== "done";
      return true;
    })
    .filter(({ b }) => {
      if (!q) return true;
      const a = animalById(b.animalId);
      return ((a?.arete || "") + " " + (a?.name || "")).toLowerCase().includes(q);
    })
    .sort((a, c) => (a.b.refDate || "").localeCompare(c.b.refDate || ""))
    .forEach(({ b, kind }) => {
      const tr = document.createElement("tr");
      const lbl = b.status === "done" ? "HECHO" : labelBooster(kind);
      tr.innerHTML = `<td>${escapeHtml(animalLabel(b.animalId))}</td><td>${escapeHtml(b.procedure || "")}</td><td>${escapeHtml(b.refDate || "—")}</td>
        <td><span class="badge ${badgeClass(kind)}">${escapeHtml(lbl)}</span></td><td>${escapeHtml(userName(b.createdBy))}</td>
        <td>${b.status === "done" ? "" : `<button class="btn secondary" data-d="${b.id}">Hecho</button>`}
            <button class="btn secondary" data-x="${b.id}">Eliminar</button></td>`;

      const bh = tr.querySelector("button[data-d]");
      if (bh) bh.onclick = () => markBoosterDone(b.id);

      tr.querySelector("button[data-x]").onclick = async () => {
        await delRow(STORES.boosters, b.id);
        await renderAll();
      };

      tb.appendChild(tr);
    });
}

// =====================
// Repro
// =====================
function reproDaysOpen(r) {
  if (String(r.pre || "").toUpperCase() === "SI") return 0;
  const parto = parseISO(r.parto);
  if (!parto) return null;
  return daysSince(parto);
}

function reproAlert(d) {
  if (d === null) return "";
  return d > 120 ? "REVISAR" : "OK";
}

async function openReproForm() {
  const opts = animalOptions().filter((o) => (animalById(o.value)?.sexo || "Hembra") === "Hembra");
  if (opts.length === 0) {
    alert("Agrega hembras en animales.");
    setTab("animals");
    return;
  }

  showModal(
    "Registrar reproducción",
    `<div class="formgrid">
      ${formSelect("rAnimal", "Vaca", opts, opts[0].value)}
      ${formInput("rParto", "Último parto", "date", "")}
      ${formInput("rCelo", "Último celo", "date", "")}
      ${formInput("rInsem", "Inseminación", "date", "")}
      ${formSelect(
        "rPre",
        "Diagnóstico preñez",
        [
          { value: "", label: "(Sin dato)" },
          { value: "SI", label: "SI" },
          { value: "NO", label: "NO" },
        ],
        ""
      )}
      <div class="full"><button class="btn" id="saveR">Guardar</button></div>
    </div>`
  );

  $("saveR").onclick = async () => {
    await put(STORES.repro, {
      id: uid("rep"),
      animalId: $("rAnimal").value,
      parto: $("rParto").value || "",
      celo: $("rCelo").value || "",
      insem: $("rInsem").value || "",
      pre: $("rPre").value || "",
      createdBy: state.userId,
      createdAt: Date.now(),
    });
    closeModal();
    await renderAll();
  };
}

on("addReproBtn", "click", openReproForm);
on("quickRepro", "click", () => {
  setTab("repro");
  openReproForm();
});
on("filterRepro", "change", () => renderRepro());
on("searchRepro", "input", () => renderRepro());

function renderRepro() {
  const tb = $("reproTbody");
  if (!tb) return;

  const filt = $("filterRepro")?.value || "all";
  const q = ($("searchRepro")?.value || "").toLowerCase();

  const latest = new Map();
  state.repro
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((r) => {
      if (!latest.has(r.animalId)) latest.set(r.animalId, r);
    });

  let rows = [...latest.values()].map((r) => {
    const d = reproDaysOpen(r);
    return { ...r, daysOpen: d, alert: reproAlert(d) };
  });

  if (filt === "revisar") rows = rows.filter((r) => r.alert === "REVISAR");

  rows = rows.filter((r) => {
    if (!q) return true;
    const a = animalById(r.animalId);
    return ((a?.arete || "") + " " + (a?.name || "")).toLowerCase().includes(q);
  });

  tb.innerHTML = "";

  rows.forEach((r) => {
    const badge =
      r.daysOpen === null
        ? "—"
        : r.alert === "REVISAR"
          ? `<span class="badge bad">REVISAR</span>`
          : `<span class="badge ok">OK</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(animalLabel(r.animalId))}</td><td>${escapeHtml(r.parto || "—")}</td><td>${escapeHtml(r.celo || "—")}</td><td>${escapeHtml(r.insem || "—")}</td>
      <td>${escapeHtml(r.pre || "—")}</td><td>${r.daysOpen === null ? "—" : r.daysOpen}</td><td>${badge}</td>
      <td><button class="btn secondary">Eliminar</button></td>`;

    tr.querySelector("button").onclick = async () => {
      await delRow(STORES.repro, r.id);
      await renderAll();
    };

    tb.appendChild(tr);
  });
}

// =====================
// Finance
// =====================
async function openSaleForm() {
  showModal(
    "Registrar venta de queso",
    `<div class="formgrid">
      ${formInput("sDate", "Fecha", "date", todayISO())}
      ${formInput("sClient", "Cliente", "text", "", "Ej: Tienda")}
      ${formInput("sLbs", "Libras", "number", "", "")}
      ${formInput("sPrice", "Precio por libra (COP)", "number", "", "")}
      <div class="full"><button class="btn" id="saveS">Guardar</button></div>
    </div>`
  );

  $("saveS").onclick = async () => {
    const lbs = Number($("sLbs").value || 0);
    const price = Number($("sPrice").value || 0);

    await put(STORES.salesCheese, {
      id: uid("sale"),
      date: $("sDate").value || todayISO(),
      client: $("sClient").value.trim(),
      lbs,
      price,
      total: lbs * price,
      createdBy: state.userId,
      createdAt: Date.now(),
    });

    closeModal();
    await renderAll();
  };
}

on("addSaleBtn", "click", openSaleForm);

async function openBuyMilkForm() {
  showModal(
    "Registrar compra de leche",
    `<div class="formgrid">
      ${formInput("bPeriod", "Periodo", "text", "", "Ej: 05-01-26 al 11-01-26")}
      ${formInput("bLiters", "Litros", "number", "", "")}
      ${formInput("bVL", "Valor por litro (COP)", "number", "", "")}
      <div class="full"><button class="btn" id="saveB">Guardar</button></div>
    </div>`
  );

  $("saveB").onclick = async () => {
    const liters = Number($("bLiters").value || 0);
    const vl = Number($("bVL").value || 0);

    await put(STORES.buyMilk, {
      id: uid("buy"),
      period: $("bPeriod").value.trim(),
      liters,
      vl,
      total: liters * vl,
      createdBy: state.userId,
      createdAt: Date.now(),
    });

    closeModal();
    await renderAll();
  };
}

on("addBuyMilkBtn", "click", openBuyMilkForm);

async function openTransMilkForm() {
  showModal(
    "Registrar transporte de leche",
    `<div class="formgrid">
      ${formInput("tPeriod", "Periodo", "text", "", "Ej: 05-01-26 al 11-01-26")}
      ${formInput("tValue", "Valor transporte (COP)", "number", "", "")}
      ${formInput("tQty", "Cantidad", "number", "", "")}
      <div class="full"><button class="btn" id="saveT">Guardar</button></div>
    </div>`
  );

  $("saveT").onclick = async () => {
    const value = Number($("tValue").value || 0);
    const qty = Number($("tQty").value || 0);

    await put(STORES.transMilk, {
      id: uid("tm"),
      period: $("tPeriod").value.trim(),
      value,
      qty,
      total: value * qty,
      createdBy: state.userId,
      createdAt: Date.now(),
    });

    closeModal();
    await renderAll();
  };
}

on("addTransMilkBtn", "click", openTransMilkForm);

async function openFixedForm() {
  showModal(
    "Registrar gasto fijo",
    `<div class="formgrid">
      ${formInput("fConcept", "Concepto", "text", "", "Ej: Nómina")}
      ${formInput("fValue", "Valor mensual (COP)", "number", "", "")}
      <div class="full"><button class="btn" id="saveF">Guardar</button></div>
    </div>`
  );

  $("saveF").onclick = async () => {
    const value = Number($("fValue").value || 0);

    await put(STORES.fixedCosts, {
      id: uid("fx"),
      concept: $("fConcept").value.trim(),
      value,
      createdBy: state.userId,
      createdAt: Date.now(),
    });

    closeModal();
    await renderAll();
  };
}

on("addFixedBtn", "click", openFixedForm);

function renderFinance() {
  const summary = $("financeSummary");
  const salesTb = $("salesTbody");
  const finTb = $("financeTbody");
  if (!summary || !salesTb || !finTb) return;

  const totalSales = state.salesCheese.reduce((s, x) => s + (x.total || 0), 0);
  const totalBuy = state.buyMilk.reduce((s, x) => s + (x.total || 0), 0);
  const totalTrans = state.transMilk.reduce((s, x) => s + (x.total || 0), 0);
  const totalFixed = state.fixedCosts.reduce((s, x) => s + (x.value || 0), 0);
  const util = totalSales - totalBuy - totalTrans - totalFixed;

  summary.innerHTML = `
    <div class="item"><div><b>Ventas queso</b></div><div>${totalSales.toLocaleString("es-CO")}</div></div>
    <div class="item"><div><b>Compra leche</b></div><div>${totalBuy.toLocaleString("es-CO")}</div></div>
    <div class="item"><div><b>Transporte leche</b></div><div>${totalTrans.toLocaleString("es-CO")}</div></div>
    <div class="item"><div><b>Gastos fijos</b></div><div>${totalFixed.toLocaleString("es-CO")}</div></div>
    <div class="item"><div><b>Utilidad (aprox)</b></div><div><b>${util.toLocaleString("es-CO")}</b></div></div>`;

  salesTb.innerHTML = "";
  state.salesCheese
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .forEach((s) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(s.date || "—")}</td><td>${escapeHtml(s.client || "—")}</td><td>${s.lbs || 0}</td><td>${s.price || 0}</td>
        <td><b>${(s.total || 0).toLocaleString("es-CO")}</b></td><td><button class="btn secondary">Eliminar</button></td>`;
      tr.querySelector("button").onclick = async () => {
        await delRow(STORES.salesCheese, s.id);
        await renderAll();
      };
      salesTb.appendChild(tr);
    });

  finTb.innerHTML = "";
  const combined = [];
  state.buyMilk.forEach((x) =>
    combined.push({ type: "Compra leche", period: x.period || "", detail: `${x.liters || 0} L × ${x.vl || 0}`, total: x.total || 0, id: x.id, store: STORES.buyMilk })
  );
  state.transMilk.forEach((x) =>
    combined.push({ type: "Transporte leche", period: x.period || "", detail: `${x.value || 0} × ${x.qty || 0}`, total: x.total || 0, id: x.id, store: STORES.transMilk })
  );
  state.fixedCosts.forEach((x) =>
    combined.push({ type: "Gasto fijo", period: "Mensual", detail: x.concept || "", total: x.value || 0, id: x.id, store: STORES.fixedCosts })
  );

  combined.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.period)}</td><td>${escapeHtml(r.detail)}</td>
      <td><b>${(r.total || 0).toLocaleString("es-CO")}</b></td><td><button class="btn secondary">Eliminar</button></td>`;
    tr.querySelector("button").onclick = async () => {
      await delRow(r.store, r.id);
      await renderAll();
    };
    finTb.appendChild(tr);
  });
}

// =====================
// Dashboard
// =====================
function renderDashboard() {
  const mOverdue = $("mOverdue");
  if (!mOverdue) return;

  const kinds = state.boosters.map(classifyBooster).filter((k) => k !== "done");
  $("mOverdue").textContent = kinds.filter((k) => k === "overdue").length;
  $("mD3").textContent = kinds.filter((k) => k === "d3").length;
  $("mD10").textContent = kinds.filter((k) => k === "d10").length;
  $("mD15").textContent = kinds.filter((k) => k === "d15").length;

  const low = state.milk.filter((m) => {
    const d = parseISO(m.date);
    return d && daysSince(d) <= 7 && (m.total || 0) < 4;
  }).length;
  $("mLowMilk").textContent = low;

  const latest = new Map();
  state.repro
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((r) => {
      if (!latest.has(r.animalId)) latest.set(r.animalId, r);
    });
  const reproRevisar = [...latest.values()].filter((r) => reproAlert(reproDaysOpen(r)) === "REVISAR").length;
  $("mRepro").textContent = reproRevisar;

  const list = $("alertsList");
  list.innerHTML = "";

  const priority = { overdue: 0, d3: 1, d10: 2, d15: 3, ok: 4, done: 9 };
  const boosterAlerts = state.boosters
    .map((b) => ({ b, kind: classifyBooster(b) }))
    .filter((x) => x.kind !== "ok" && x.kind !== "done")
    .sort((a, c) => priority[a.kind] - priority[c.kind])
    .slice(0, 6);

  if (boosterAlerts.length === 0 && low === 0 && reproRevisar === 0) {
    list.innerHTML = `<div class="small">No hay alertas críticas. ✅</div>`;
  }

  boosterAlerts.forEach(({ b, kind }) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div><div><b>${escapeHtml(animalLabel(b.animalId))}</b> — ${escapeHtml(b.procedure || "")}</div>
      <div class="small">Refuerzo: ${escapeHtml(b.refDate || "—")} • Finca: ${escapeHtml(b.finca || "—")}</div></div>
      <div style="display:flex; gap:8px; align-items:center"><span class="badge ${badgeClass(kind)}">${escapeHtml(labelBooster(kind))}</span>
      <button class="btn secondary">Hecho</button></div>`;
    div.querySelector("button").onclick = () => markBoosterDone(b.id);
    list.appendChild(div);
  });

  state.milk
    .filter((m) => {
      const d = parseISO(m.date);
      return d && daysSince(d) <= 7 && (m.total || 0) < 4;
    })
    .slice(0, 4)
    .forEach((m) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `<div><div><b>Producción baja</b> — ${escapeHtml(animalLabel(m.animalId))}</div>
        <div class="small">Fecha: ${escapeHtml(m.date)} • Total: <b>${m.total || 0} L</b></div></div><span class="badge bad">&lt;4L</span>`;
      list.appendChild(div);
    });

  if (reproRevisar > 0) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div><div><b>Reproducción</b> — ${reproRevisar} vaca(s) con &gt;120 días abiertos</div>
      <div class="small">Ir a Reproducción → filtro REVISAR</div></div><span class="badge bad">REVISAR</span>`;
    list.appendChild(div);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const by = new Map();
  state.milk.forEach((m) => {
    const d = parseISO(m.date);
    if (!d || d < cutoff) return;
    by.set(m.animalId, (by.get(m.animalId) || 0) + (m.total || 0));
  });

  const ranking = [...by.entries()]
    .map(([animalId, liters]) => ({ animalId, liters }))
    .sort((a, b) => b.liters - a.liters)
    .slice(0, 30);

  const rt = $("rankTbody");
  rt.innerHTML = "";
  if (ranking.length === 0) {
    rt.innerHTML = `<tr><td colspan="3">Aún no hay ordeños registrados.</td></tr>`;
  }
  ranking.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(animalLabel(r.animalId))}</td><td><b>${r.liters.toFixed(1)}</b></td><td>${(r.liters / 30).toFixed(2)}</td>`;
    rt.appendChild(tr);
  });
}

// =====================
// Backup (JSON)
// =====================
async function exportJSON() {
  const payload = { exportedAt: new Date().toISOString(), data: {} };
  for (const [k, store] of Object.entries(STORES)) payload.data[k] = await getAll(store);

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ganaderia_respaldo_${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importJSON(file) {
  const obj = JSON.parse(await file.text());
  const data = obj?.data;
  if (!data) throw new Error("Archivo inválido");

  for (const [k, store] of Object.entries(STORES)) {
    for (const row of data[k] || []) await put(store, row);
  }

  await renderAll();
}

on("exportBtn", "click", exportJSON);
on("importFile", "change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    await importJSON(f);
    alert("Importación exitosa.");
  } catch (err) {
    alert("Error importando: " + err.message);
  }
  e.target.value = "";
});

// =====================
// Bovinos brutos
// =====================
on("addBrutoBtn", "click", () => openBrutoForm(null));
on("searchBrutos", "input", () => renderBrutos());

function renderBrutos() {
  const tb = $("brutosTbody");
  if (!tb) return;

  const q = ($("searchBrutos")?.value || "").toLowerCase().trim();
  tb.innerHTML = "";

  state.brutos
    .slice()
    .reverse()
    .filter((b) => {
      if (!q) return true;
      const s = `${b.nombreArete || ""} ${b.estadoNota || ""} ${b.edad || ""} ${b.peso || ""}`.toLowerCase();
      return s.includes(q);
    })
    .forEach((b) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(b.nombreArete || "")}</td><td>${escapeHtml(b.estadoNota || "")}</td><td>${escapeHtml(b.edad || "")}</td><td>${escapeHtml(b.peso || "")}</td>
        <td style="white-space:nowrap"><button class="btn secondary">Ver/Editar</button> <button class="btn danger">Borrar</button></td>`;

      const btns = tr.querySelectorAll("button");
      btns[0].onclick = () => openBrutoForm(b);
      btns[1].onclick = async () => {
        if (!confirm("¿Borrar este bruto?")) return;
        await delRow(STORES.brutos, b.id);
        await renderAll();
      };

      tb.appendChild(tr);
    });
}

async function openBrutoForm(existing) {
  const b = existing || { nombreArete: "", estadoNota: "", edad: "", peso: "", extras: {} };
  const extrasTxt = JSON.stringify(b.extras || {}, null, 2);

  showModal(
    existing ? "Editar bruto" : "Nuevo bruto",
    `<div class="formgrid">
      ${formInput("bruNombreArete", "Nombre/Arete", "text", b.nombreArete)}
      ${formInput("bruEstado", "Estado / Nota", "text", b.estadoNota)}
      ${formInput("bruEdad", "Edad", "text", b.edad)}
      ${formInput("bruPeso", "Peso", "text", b.peso)}
      <div class="full">
        <label class="label">Extras (JSON)</label>
        <textarea id="bruExtras" rows="6">${escapeHtml(extrasTxt)}</textarea>
      </div>
      <div class="full row">
        <button class="btn" id="saveBru">Guardar</button>
        <button class="btn secondary" id="cancelBru">Cancelar</button>
      </div>
    </div>`
  );

  $("cancelBru").onclick = closeModal;
  $("saveBru").onclick = async () => {
    let extras = {};
    try {
      extras = JSON.parse($("bruExtras").value || "{}");
    } catch {
      return alert("Extras JSON inválido");
    }

    const rec = {
      id: b.id || uid("bru"),
      nombreArete: $("bruNombreArete").value.trim(),
      estadoNota: $("bruEstado").value.trim(),
      edad: $("bruEdad").value.trim(),
      peso: $("bruPeso").value.trim(),
      extras,
      createdBy: b.createdBy || state.userId,
      createdAt: b.createdAt || Date.now(),
    };

    await put(STORES.brutos, rec);
    closeModal();
    await renderAll();
  };
}

// =====================
// Medicamentos (tabla)
// =====================
on("addMedBtn", "click", () => openMedForm(null));
on("searchMeds", "input", () => renderMeds());

function animalLabelById(id) {
  const a = state.animals.find((x) => x.id === id);
  if (!a) return id || "";
  const label = `${a.arete ? "#" + a.arete + " " : ""}${a.name || ""}`.trim();
  return label || a.id;
}

function renderMeds() {
  const tb = $("medsTbody");
  if (!tb) return;

  const q = ($("searchMeds")?.value || "").toLowerCase().trim();
  tb.innerHTML = "";

  state.meds
    .slice()
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
    .filter((m) => {
      if (!q) return true;
      const s = `${m.fecha || ""} ${animalLabelById(m.animalId)} ${m.nombre || ""} ${m.procedimiento || ""} ${m.plan || ""} ${m.finca || ""}`.toLowerCase();
      return s.includes(q);
    })
    .forEach((m) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(m.fecha || "")}</td><td>${escapeHtml(animalLabelById(m.animalId) || m.nombre || "")}</td>
        <td>${escapeHtml(m.procedimiento || "")}</td><td>${escapeHtml(m.finca || "")}</td>
        <td style="white-space:nowrap"><button class="btn secondary">Ver/Editar</button> <button class="btn danger">Borrar</button></td>`;

      const btns = tr.querySelectorAll("button");
      btns[0].onclick = () => openMedForm(m);
      btns[1].onclick = async () => {
        if (!confirm("¿Borrar este medicamento?")) return;
        await delRow(STORES.meds, m.id);
        await renderAll();
      };

      tb.appendChild(tr);
    });
}

async function openMedForm(existing) {
  const m =
    existing ||
    {
      animalId: "",
      nombre: "",
      fecha: todayISO(),
      procedimiento: "",
      responsable: "",
      plan: "",
      costo: "",
      notas: "",
      finca: "",
      extras: {},
    };

  const options = [{ value: "", label: "(sin vínculo)" }, ...animalOptions()].map((o) => ({
    value: o.value,
    label: o.label,
  }));

  const extrasTxt = JSON.stringify(m.extras || {}, null, 2);

  showModal(
    existing ? "Editar medicamento" : "Nuevo medicamento",
    `<div class="formgrid">
      ${formSelect("medAnimal", "Animal (opcional)", options, m.animalId || "")}
      ${formInput("medNombre", "Nombre (si no hay vínculo)", "text", m.nombre)}
      ${formInput("medFecha", "Fecha", "date", m.fecha || todayISO())}
      ${formInput("medProc", "Procedimiento / Medicamento", "text", m.procedimiento)}
      ${formInput("medResp", "Responsable", "text", m.responsable)}
      <div class="full"><label class="label">Plan / Dosis</label><textarea id="medPlan" rows="3">${escapeHtml(m.plan || "")}</textarea></div>
      ${formInput("medCosto", "Costo", "text", m.costo)}
      ${formInput("medFinca", "Finca", "text", m.finca)}
      <div class="full"><label class="label">Notas</label><textarea id="medNotas" rows="3">${escapeHtml(m.notas || "")}</textarea></div>
      <div class="full"><label class="label">Extras (JSON)</label><textarea id="medExtras" rows="5">${escapeHtml(extrasTxt)}</textarea></div>
      <div class="full row">
        <button class="btn" id="saveMed">Guardar</button>
        <button class="btn secondary" id="cancelMed">Cancelar</button>
      </div>
    </div>`
  );

  $("cancelMed").onclick = closeModal;
  $("saveMed").onclick = async () => {
    let extras = {};
    try {
      extras = JSON.parse($("medExtras").value || "{}");
    } catch {
      return alert("Extras JSON inválido");
    }

    const rec = {
      id: m.id || uid("med"),
      animalId: $("medAnimal").value,
      nombre: $("medNombre").value.trim(),
      fecha: $("medFecha").value,
      procedimiento: $("medProc").value.trim(),
      responsable: $("medResp").value.trim(),
      plan: $("medPlan").value.trim(),
      costo: $("medCosto").value.trim(),
      finca: $("medFinca").value.trim(),
      notas: $("medNotas").value.trim(),
      extras,
      createdBy: m.createdBy || state.userId,
      createdAt: m.createdAt || Date.now(),
    };

    await put(STORES.meds, rec);
    closeModal();
    await renderAll();
  };
}

// =====================
// Importar desde Excel (XLSX) — solo guía
// =====================
on("importExcelFile", "change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  const filename = f.name || "archivo.xlsx";
  showModal(
    "Importar desde Excel (XLSX)",
    `<div class="small">
      Para importar datos desde <b>${escapeHtml(filename)}</b>, esta app offline necesita convertir el Excel a un archivo <b>JSON</b> (sin internet).
      <div class="divider"></div>
      <b>En PC (Windows/Mac):</b><br/>
      1) Copia <b>${escapeHtml(filename)}</b> en la misma carpeta donde está esta app.<br/>
      2) Ejecuta en la consola (en esa carpeta):<br/>
      <div style="background:#0b1220;border:1px solid var(--line);border-radius:12px;padding:10px;overflow:auto;margin:8px 0">
        <code>python convert_excel_to_json.py "${escapeHtml(filename)}"</code>
      </div>
      3) Se creará: <b>ganaderia_import.json</b><br/>
      4) Vuelve al panel y usa <b>Importar respaldo (JSON)</b> para cargarlo.
    </div>
    <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap">
      <button class="btn secondary" id="closeExcelHelp">Entendido</button>
    </div>`
  );

  $("closeExcelHelp").onclick = closeModal;
  e.target.value = "";
});

// =====================
// Render all
// =====================
async function renderAll() {
  await refresh();
  renderUsers();
  renderDashboard();
  renderAnimals();
  renderMilk();
  renderBoosters();
  renderRepro();
  renderFinance();
  renderBrutos();
  renderMeds();
}

(async function init() {
  await seed();
  await renderAll();
})();
