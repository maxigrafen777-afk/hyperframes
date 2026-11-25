"use strict";

const $app = document.getElementById("app");
const state = { tab: "video", dirty: false, project: null, candidates: null, lastJobs: "" };

const VISUALS = {
  hook: "Hook (Name groß)",
  profile: "Steckbrief",
  timeline: "Karriere-Zeitleiste",
  stat: "Statistik-Zahl",
  year: "Jahreszahl",
  score: "Spielstand",
  keyword: "Schlagwort",
  quote: "Zitat",
  pitch: "Spielfeld-Animation",
  outro: "Abspann",
};
const VISUAL_FIELDS = {
  hook: ["headline"],
  profile: ["headline"],
  timeline: ["headline"],
  stat: ["value", "label", "sub"],
  year: ["value", "sub"],
  score: ["value", "sub"],
  keyword: ["text"],
  quote: ["text", "sub"],
  pitch: ["text"],
  outro: ["headline", "sub"],
};
const FIELD_LABELS = {
  headline: "Überschrift",
  text: "Bildtext",
  value: "Zahl/Wert",
  label: "Einheit",
  sub: "Unterzeile",
};
const STEP_LABELS = {
  research: "Recherche",
  script: "Skript",
  voice: "Voice-over",
  music: "Musik",
  video: "Video",
  preview: "Vorschau",
  export: "Export",
};

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).detail || msg;
    } catch {
      // Antwort ohne JSON-Body
    }
    throw new Error(msg);
  }
  return res.json();
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.style.display = "none"), 3500);
}
async function act(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    toast("Fehler: " + e.message);
    throw e;
  }
}
function fmtSec(s) {
  if (s == null) return "–";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")} min`;
}
const fileUrl = (pid, path) => `/files/${encodeURIComponent(pid)}/${path}`;

// ---------------- Routing ----------------
async function route() {
  const h = location.hash || "#/themen";
  const [, view, id] = h.split("/");
  document
    .querySelectorAll("nav a")
    .forEach((a) =>
      a.classList.toggle("active", a.dataset.nav === (view === "projekt" ? "projekte" : view)),
    );
  state.dirty = false;
  if (view === "projekte") return viewProjects();
  if (view === "projekt" && id) return viewProject(decodeURIComponent(id));
  if (view === "einstellungen") return viewSettings();
  return viewTopics();
}
window.addEventListener("hashchange", route);

// ---------------- Themen ----------------
async function viewTopics() {
  const data = await api("/api/topics/today");
  const cards = data.topics
    .map(
      (t) => `<div class="card">
      <div class="row spread"><span class="badge cat">${esc(t.category_label)}</span><span class="muted">#${t.rank + 1}</span></div>
      <h3 style="margin-top:10px">${esc(t.title)}</h3>
      <div class="muted" style="min-height:42px">${esc(t.teaser || t.label)}</div>
      <div class="row" style="margin-top:12px">
        ${
          t.project_id
            ? `<a class="btn" href="#/projekt/${encodeURIComponent(t.project_id)}">Projekt öffnen</a>`
            : t.status === "dismissed"
              ? `<span class="badge">verworfen</span>`
              : `<button class="primary" data-start="${esc(t.qid)}">Projekt starten</button>
                 <button data-dismiss="${esc(t.qid)}">Verwerfen</button>`
        }
        <a class="muted" href="https://www.wikidata.org/wiki/${esc(t.qid)}" target="_blank" rel="noopener">${esc(t.qid)}</a>
      </div></div>`,
    )
    .join("");
  $app.innerHTML = `
    <div class="row spread">
      <div><h1>Videoideen für heute</h1><div class="muted">${esc(data.day)} · bereits verwendete Themen werden automatisch ausgeschlossen</div></div>
      <div class="row">
        <button id="refresh">Neue Ideen suchen</button>
        <button id="autorun">Automatik jetzt ausführen</button>
      </div>
    </div>
    <div class="card" style="margin:18px 0">
      <label for="q">Eigenes Thema (Spieler, Spiel, Ereignis)</label>
      <div class="row"><input id="q" placeholder="z. B. Lars Ricken, Wembley-Tor …" style="flex:1;min-width:220px">
      <select id="qcat">${Object.entries(data.categories)
        .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`)
        .join("")}</select>
      <button id="search">Suchen</button></div>
      <div id="results"></div>
    </div>
    ${cards ? `<div class="grid">${cards}</div>` : `<div class="empty">Für heute gibt es noch keine Ideen.<br><br><button class="primary" id="refresh2">Jetzt 10 Ideen suchen</button></div>`}`;
  const refresh = () =>
    act(
      () => api("/api/topics/refresh?force=true", { method: "POST" }),
      "Suche läuft – die Ideen erscheinen in Kürze (Wikidata-Abfragen dauern bis zu 1 Min.).",
    );
  document.getElementById("refresh").onclick = refresh;
  const r2 = document.getElementById("refresh2");
  if (r2) r2.onclick = refresh;
  document.getElementById("autorun").onclick = () =>
    act(() => api("/api/automation/run", { method: "POST" }), "Tageslauf gestartet");
  $app.querySelectorAll("[data-start]").forEach(
    (b) =>
      (b.onclick = async () => {
        const p = await act(
          () => api("/api/projects", { method: "POST", body: { qid: b.dataset.start } }),
          "Projekt angelegt – Recherche läuft",
        );
        location.hash = `#/projekt/${p.id}`;
      }),
  );
  $app.querySelectorAll("[data-dismiss]").forEach(
    (b) =>
      (b.onclick = async () => {
        await act(() => api(`/api/topics/${b.dataset.dismiss}/dismiss`, { method: "POST" }));
        viewTopics();
      }),
  );
  const doSearch = async () => {
    const q = document.getElementById("q").value.trim();
    if (!q) return;
    const res = await act(() => api(`/api/topics/search?q=${encodeURIComponent(q)}`));
    document.getElementById("results").innerHTML = res.length
      ? `<table style="margin-top:10px">${res
          .map(
            (r) =>
              `<tr><td><b>${esc(r.label)}</b><div class="muted">${esc(r.description)}</div></td><td style="width:160px"><button data-new="${esc(r.qid)}" data-label="${esc(r.label)}">Projekt starten</button></td></tr>`,
          )
          .join("")}</table>`
      : `<div class="muted" style="margin-top:8px">Nichts gefunden.</div>`;
    document.querySelectorAll("[data-new]").forEach(
      (b) =>
        (b.onclick = async () => {
          const p = await act(
            () =>
              api("/api/projects", {
                method: "POST",
                body: {
                  qid: b.dataset.new,
                  label: b.dataset.label,
                  category: document.getElementById("qcat").value,
                },
              }),
            "Projekt angelegt – Recherche läuft",
          );
          location.hash = `#/projekt/${p.id}`;
        }),
    );
  };
  document.getElementById("search").onclick = doSearch;
  document.getElementById("q").onkeydown = (e) => e.key === "Enter" && doSearch();
}

// ---------------- Projekte ----------------
async function viewProjects() {
  const list = await api("/api/projects");
  $app.innerHTML = `<h1>Projekte</h1><div class="muted">${list.length} Projekte · lokal gespeichert unter data/projects</div><br>
  ${
    list.length
      ? `<div class="grid">${list
          .map(
            (p) => `<div class="card click" data-open="${esc(p.id)}">
          ${p.poster ? `<img class="poster" src="${fileUrl(p.id, p.poster)}" alt="">` : ""}
          <div class="row spread"><span class="badge ${p.status === "fertig" ? "ok" : p.status === "fehler" ? "fehler" : ""}">${esc(p.status_label)}</span><span class="muted">${fmtSec(p.duration)}</span></div>
          <h3 style="margin-top:8px">${esc(p.title)}</h3>
          <div class="muted">${esc(p.created_at.slice(0, 10))} · ${esc(p.category || "")}</div></div>`,
          )
          .join("")}</div>`
      : `<div class="empty">Noch keine Projekte. Starte eines unter „Themen“.</div>`
  }`;
  $app
    .querySelectorAll("[data-open]")
    .forEach((c) => (c.onclick = () => (location.hash = `#/projekt/${c.dataset.open}`)));
}

// ---------------- Projektdetail ----------------
async function viewProject(pid, keepTab = true) {
  const p = await api(`/api/projects/${encodeURIComponent(pid)}`);
  if (!keepTab || !state.project || state.project.id !== pid) {
    state.tab = p.outputs?.preview ? "video" : p.script ? "skript" : "protokoll";
    state.candidates = null;
  }
  state.project = p;
  const sc = p.script;
  const steps = Object.entries(p.steps || {})
    .map(
      ([k, v]) =>
        `<span class="step ${esc(v.status)}">${esc(STEP_LABELS[k] || k)}: ${esc(v.status)}</span>`,
    )
    .join("");
  const canApprove = sc && !["produktion", "export"].includes(p.status);
  const hasVideo = !!(p.outputs && p.outputs.preview);
  $app.innerHTML = `
    <div class="row spread">
      <div><a href="#/projekte" class="muted">← Projekte</a>
        <h1>${esc(sc?.title || p.topic.title || p.topic.label)}</h1>
        <div class="muted">${esc(p.topic.label)} · ${esc(p.topic.category)} · Status: <b>${esc(p.status)}</b>${p.approved ? " · freigegeben" : ""}</div>
        <div class="steps">${steps}</div>
      </div>
      <div class="row">
        ${canApprove ? `<button class="primary" id="approve">${p.approved ? "Neu produzieren" : "Freigeben & produzieren"}</button>` : ""}
        ${hasVideo ? `<button id="export" class="${p.outputs.export ? "" : "primary"}">Als MP4 exportieren (1080×1920)</button>` : ""}
        ${p.outputs?.export ? `<a class="btn primary" href="${fileUrl(p.id, p.outputs.export)}" download>MP4 herunterladen</a>` : ""}
        <button class="danger" id="del">Löschen</button>
      </div>
    </div>
    <div class="tabs">${[
      "video",
      "skript",
      "szenen",
      "recherche",
      "quellen",
      "pruefung",
      "protokoll",
    ]
      .map(
        (t) =>
          `<button data-tab="${t}" class="${state.tab === t ? "active" : ""}">${{ video: "Video", skript: "Skript", szenen: "Szenen", recherche: "Recherche", quellen: "Quellen", pruefung: "Prüfung", protokoll: "Protokoll" }[t]}</button>`,
      )
      .join("")}</div>
    <div id="tab"></div>`;
  $app.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        if (state.dirty && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
        state.dirty = false;
        state.tab = b.dataset.tab;
        viewProject(pid);
      }),
  );
  const ap = document.getElementById("approve");
  if (ap)
    ap.onclick = () =>
      act(
        () => api(`/api/projects/${pid}/approve`, { method: "POST" }),
        "Produktion gestartet: Voice-over → Musik → Video → Vorschau",
      ).then(() => viewProject(pid));
  const ex = document.getElementById("export");
  if (ex)
    ex.onclick = () =>
      act(() => api(`/api/projects/${pid}/export`, { method: "POST" }), "Export gestartet");
  document.getElementById("del").onclick = async () => {
    if (!confirm("Projekt inklusive aller Dateien löschen?")) return;
    await act(() => api(`/api/projects/${pid}`, { method: "DELETE" }), "Gelöscht");
    location.hash = "#/projekte";
  };
  const T = {
    video: tabVideo,
    skript: tabScript,
    szenen: tabScenes,
    recherche: tabResearch,
    quellen: tabSources,
    pruefung: tabChecks,
    protokoll: tabLog,
  };
  await T[state.tab](p);
}

function tabVideo(p) {
  const el = document.getElementById("tab");
  const o = p.outputs || {};
  const src = o.export || o.preview;
  el.innerHTML = `<div class="player">
    <div>${
      src
        ? `<video controls playsinline src="${fileUrl(p.id, src)}?v=${encodeURIComponent(o.export_at || o.preview_at || "")}"></video>
      <div class="muted" style="margin-top:6px">${o.export ? "Finaler Export" : "Vorschau (Entwurfsqualität)"}</div>`
        : `<div class="empty">Noch kein Video. ${p.script ? "Skript prüfen und „Freigeben &amp; produzieren“ klicken." : "Recherche/Skript laufen …"}</div>`
    }</div>
    <div>
      <div class="kv">
        <label>Länge</label><div>${fmtSec(p.voice?.duration)}</div>
        <label>Stimme</label><div>${esc(p.voice ? `${p.voice.provider} (${p.voice.voice}, Tempo ${p.voice.speed})` : "–")}</div>
        <label>Musik</label><div>${esc(p.music ? p.music.license : "–")}</div>
        <label>Skript-Engine</label><div>${esc(p.script?.engine || "–")}</div>
        <label>Faktenprüfung</label><div>${p.script ? (p.script.validation.ok ? '<span class="badge ok">bestanden</span>' : '<span class="badge fehler">offene Fehler</span>') : "–"}</div>
        <label>TikTok-Beschreibung</label><div><textarea readonly>${esc(p.script ? `${p.script.caption}\n${p.script.hashtags.join(" ")}` : "")}</textarea></div>
      </div>
      <div class="row" style="margin-top:14px">
        ${p.approved ? `<button id="regen-video">Video neu generieren</button><button id="regen-voice">Voice-over neu generieren</button>` : ""}
        ${p.voice ? `<audio controls src="${fileUrl(p.id, "voice/voiceover.wav")}?v=${encodeURIComponent(p.voice.text_hash)}"></audio>` : ""}
      </div>
    </div></div>`;
  const rv = document.getElementById("regen-video");
  if (rv)
    rv.onclick = () =>
      act(
        () => api(`/api/projects/${p.id}/regenerate`, { method: "POST", body: { step: "video" } }),
        "Video wird neu generiert",
      );
  const rvo = document.getElementById("regen-voice");
  if (rvo)
    rvo.onclick = () =>
      act(
        () => api(`/api/projects/${p.id}/regenerate`, { method: "POST", body: { step: "voice" } }),
        "Voice-over wird neu generiert",
      );
}

function issuesHtml(v) {
  if (!v) return "";
  if (!v.issues.length)
    return `<div class="badge ok">Faktenprüfung bestanden – alle Zahlen sind belegt</div>`;
  return `<ul class="issues">${v.issues.map((i) => `<li><span class="badge ${i.level === "fehler" ? "fehler" : "warnung"}">${esc(i.level)}</span> ${i.scene ? `<b>${esc(i.scene)}</b>: ` : ""}${esc(i.message)}</li>`).join("")}</ul>`;
}

function tabScript(p) {
  const el = document.getElementById("tab");
  if (!p.script) {
    el.innerHTML = `<div class="empty">Das Skript wird gerade erstellt …</div>`;
    return;
  }
  const s = p.script;
  const sent = Object.fromEntries((p.research?.sentences || []).map((x) => [x.id, x]));
  el.innerHTML = `
    <div class="row spread"><div class="muted">${s.words} Wörter · geschätzt ${Math.round(s.est_seconds)} s · Engine: ${esc(s.engine)}</div>
      <div class="row"><button id="regen-script">Skript neu generieren</button><button class="primary" id="save">Speichern & prüfen</button></div></div>
    <div style="margin:12px 0">${issuesHtml(s.validation)}</div>
    <div class="card">
      <label>Videotitel</label><input id="title" style="width:100%" value="${esc(s.title)}">
      <label style="margin-top:10px">Beschreibung</label><textarea id="caption">${esc(s.caption)}</textarea>
      <label style="margin-top:10px">Hashtags</label><input id="tags" style="width:100%" value="${esc(s.hashtags.join(" "))}">
    </div>
    <h2>Szenen</h2>
    <div id="scenes">${s.scenes
      .map(
        (sc, i) => `<div class="card" style="margin-bottom:10px" data-scene="${i}">
        <div class="row spread"><b>${esc(sc.id)} · ${esc(sc.role)}</b><div class="row"><button data-up="${i}">↑</button><button data-down="${i}">↓</button><button class="danger" data-remove="${i}">Entfernen</button></div></div>
        <textarea data-text="${i}" style="margin-top:8px">${esc(sc.text)}</textarea>
        ${sc.sentence_ids.length ? `<div class="cite">Beleg: ${sc.sentence_ids.map((id) => `„${esc((sent[id]?.text || id).slice(0, 160))}…“ (${esc(sent[id]?.section || "")})`).join(" ")}</div>` : `<div class="cite">${sc.fact_ids.length ? "Belegt durch Fakten: " + esc(sc.fact_ids.join(", ")) : "Kein Quellsatz – Formulierung ohne neue Fakten"}</div>`}
      </div>`,
      )
      .join("")}</div>
    <button id="add">+ Szene hinzufügen</button>`;
  const collect = () => {
    const scenes = s.scenes.map((sc, i) => ({
      ...sc,
      text: el.querySelector(`[data-text="${i}"]`)?.value ?? sc.text,
    }));
    return {
      title: document.getElementById("title").value,
      caption: document.getElementById("caption").value,
      hashtags: document.getElementById("tags").value.split(/\s+/).filter(Boolean),
      scenes,
    };
  };
  el.querySelectorAll("textarea, input").forEach((x) => (x.oninput = () => (state.dirty = true)));
  const save = async (body) => {
    const np = await act(
      () => api(`/api/projects/${p.id}/script`, { method: "PUT", body }),
      "Gespeichert und geprüft",
    );
    state.dirty = false;
    state.project = np;
    viewProject(p.id);
  };
  document.getElementById("save").onclick = () => save(collect());
  document.getElementById("regen-script").onclick = async () => {
    if (
      !confirm(
        "Skript aus der Recherche komplett neu erstellen? Manuelle Änderungen gehen verloren.",
      )
    )
      return;
    await act(
      () => api(`/api/projects/${p.id}/regenerate`, { method: "POST", body: { step: "script" } }),
      "Skript wird neu erstellt",
    );
  };
  document.getElementById("add").onclick = () => {
    const b = collect();
    b.scenes.splice(b.scenes.length - 1, 0, {
      text: "Neuer Text …",
      role: "story",
      sentence_ids: [],
      fact_ids: [],
      visual: {},
    });
    save(b);
  };
  el.querySelectorAll("[data-remove]").forEach(
    (x) =>
      (x.onclick = () => {
        const b = collect();
        b.scenes.splice(+x.dataset.remove, 1);
        save(b);
      }),
  );
  const move = (i, d) => {
    const b = collect();
    const j = i + d;
    if (j < 0 || j >= b.scenes.length) return;
    [b.scenes[i], b.scenes[j]] = [b.scenes[j], b.scenes[i]];
    save(b);
  };
  el.querySelectorAll("[data-up]").forEach((x) => (x.onclick = () => move(+x.dataset.up, -1)));
  el.querySelectorAll("[data-down]").forEach((x) => (x.onclick = () => move(+x.dataset.down, 1)));
}

async function tabScenes(p) {
  const el = document.getElementById("tab");
  if (!p.script) {
    el.innerHTML = `<div class="empty">Noch kein Skript.</div>`;
    return;
  }
  if (!state.candidates) state.candidates = await api(`/api/projects/${p.id}/candidates`);
  const thumbs = p.outputs?.thumbs || {};
  const opts = state.candidates
    .slice()
    .sort((a, b) => b.score - a.score)
    .map(
      (c) =>
        `<option value="${esc(c.id)}">[${esc(c.section)}] ${esc(c.text.slice(0, 110))}</option>`,
    )
    .join("");
  el.innerHTML = `<div class="muted" style="margin-bottom:12px">Bildtyp oder Bildtext ändern, oder den Inhalt einer Szene durch einen anderen belegten Satz aus der Recherche ersetzen. Danach „Video neu generieren“.</div>
   ${p.script.scenes
     .map((sc, i) => {
       const v = sc.visual || {};
       const fields = (VISUAL_FIELDS[v.type] || [])
         .map(
           (f) =>
             `<label style="margin-top:6px">${FIELD_LABELS[f]}</label><input data-vf="${i}" data-field="${f}" style="width:100%" value="${esc(v[f] ?? "")}">`,
         )
         .join("");
       return `<div class="card scene" style="margin-bottom:10px">
        ${thumbs[sc.id] ? `<img class="thumb" src="${fileUrl(p.id, thumbs[sc.id])}?v=${encodeURIComponent(p.outputs?.preview_at || "")}" alt="">` : `<div class="ph">Noch keine Vorschau</div>`}
        <div><b>${esc(sc.id)}</b> <span class="badge">${esc(sc.role)}</span><div style="margin-top:6px">${esc(sc.text)}</div>
          <label style="margin-top:10px">Szene durch anderen Recherche-Satz ersetzen</label>
          <div class="row"><select data-cand="${i}" style="flex:1;min-width:0"><option value="">– Satz wählen –</option>${opts}</select><button data-swap="${i}">Ersetzen</button></div></div>
        <div><label>Bildtyp</label><select data-vtype="${i}" style="width:100%">${Object.entries(
          VISUALS,
        )
          .map(
            ([k, l]) => `<option value="${k}" ${k === v.type ? "selected" : ""}>${esc(l)}</option>`,
          )
          .join("")}</select>
          ${fields}<div class="row" style="margin-top:8px"><button data-vsave="${i}">Bild übernehmen</button></div></div>
      </div>`;
     })
     .join("")}
   ${p.approved ? `<button class="primary" id="rebuild">Video neu generieren</button>` : `<div class="muted">Nach der Freigabe wird das Video mit diesen Szenen produziert.</div>`}`;
  const sid = (i) => p.script.scenes[i].id;
  el.querySelectorAll("[data-vtype]").forEach(
    (s) =>
      (s.onchange = async () => {
        await act(
          () =>
            api(`/api/projects/${p.id}/scenes/${sid(+s.dataset.vtype)}/swap`, {
              method: "POST",
              body: { visual_type: s.value },
            }),
          "Bildtyp geändert",
        );
        viewProject(p.id);
      }),
  );
  el.querySelectorAll("[data-vsave]").forEach(
    (b) =>
      (b.onclick = async () => {
        const i = +b.dataset.vsave;
        const scenes = p.script.scenes.map((x) => ({ ...x, visual: { ...x.visual } }));
        el.querySelectorAll(`[data-vf="${i}"]`).forEach(
          (inp) => (scenes[i].visual[inp.dataset.field] = inp.value),
        );
        await act(
          () =>
            api(`/api/projects/${p.id}/script`, {
              method: "PUT",
              body: {
                title: p.script.title,
                caption: p.script.caption,
                hashtags: p.script.hashtags,
                scenes,
              },
            }),
          "Bild aktualisiert",
        );
        viewProject(p.id);
      }),
  );
  el.querySelectorAll("[data-swap]").forEach(
    (b) =>
      (b.onclick = async () => {
        const i = +b.dataset.swap;
        const val = el.querySelector(`[data-cand="${i}"]`).value;
        if (!val) return toast("Bitte zuerst einen Satz wählen");
        await act(
          () =>
            api(`/api/projects/${p.id}/scenes/${sid(i)}/swap`, {
              method: "POST",
              body: { sentence_id: val },
            }),
          "Szene ersetzt",
        );
        state.candidates = null;
        viewProject(p.id);
      }),
  );
  const rb = document.getElementById("rebuild");
  if (rb)
    rb.onclick = () =>
      act(
        () => api(`/api/projects/${p.id}/regenerate`, { method: "POST", body: { step: "video" } }),
        "Video wird neu generiert",
      );
}

function tabResearch(p) {
  const el = document.getElementById("tab");
  const r = p.research;
  if (!r) {
    el.innerHTML = `<div class="empty">Recherche läuft …</div>`;
    return;
  }
  const srcName = (id) =>
    ({
      wikidata: "Wikidata",
      dewiki: "Wikipedia (de)",
      enwiki: "Wikipedia (en)",
      berechnet: "berechnet",
    })[id] || id;
  el.innerHTML = `
    <div class="row"><span class="badge verifiziert">${r.summary.verifiziert} verifiziert</span><span class="badge einzelquelle">${r.summary.einzelquelle} Einzelquelle</span><span class="badge widerspruch">${r.summary.widerspruch} Widerspruch</span><span class="muted">${r.summary.saetze} belegbare Sätze · ${r.summary.quellen} Quellen · recherchiert ${esc(r.researched_at)}</span>
    <button id="regen-research" style="margin-left:auto">Neu recherchieren</button></div>
    <h2>Fakten-Abgleich</h2>
    <table><tr><th>Fakt</th><th>Wert</th><th>Status</th><th>Quellen</th></tr>
    ${r.facts
      .map(
        (f) =>
          `<tr><td>${esc(f.label)}</td><td>${esc(f.display)}${
            Object.keys(f.conflicts).length
              ? `<div class="cite">abweichend: ${esc(
                  Object.entries(f.conflicts)
                    .map(
                      ([k, v]) => `${srcName(k)}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
                    )
                    .join("; "),
                )}</div>`
              : ""
          }</td><td><span class="badge ${esc(f.status)}">${esc(f.status)}</span></td><td>${esc(f.sources.map(srcName).join(", "))}</td></tr>`,
      )
      .join("")}
    </table>
    ${r.career.length ? `<h2>Vereinsstationen</h2><table><tr><th>Jahre</th><th>Verein</th><th>Spiele (Tore)</th><th>Status</th></tr>${r.career.map((c) => `<tr><td>${esc(c.years)}</td><td>${esc(c.team)}</td><td>${c.matches ?? "–"} (${c.goals ?? "–"})</td><td><span class="badge ${esc(c.status)}">${esc(c.status)}</span> <span class="cite">${esc(c.sources.map(srcName).join(", "))}</span></td></tr>`).join("")}</table>` : ""}
    ${r.photo ? `<h2>Foto</h2><div>${r.photo.used ? `Verwendet: ${esc(r.photo.attribution)} – <a href="${esc(r.photo.page)}" target="_blank" rel="noopener">Dateiseite</a>` : `Nicht verwendet (Lizenz ${esc((r.photo.licenses || []).join(", "))} nicht freigegeben) – <a href="${esc(r.photo.page)}" target="_blank" rel="noopener">Dateiseite</a>`}</div>` : ""}
    <h2>Belegbare Sätze (${r.sentences.length})</h2>
    <table>${r.sentences
      .map(
        (s) =>
          `<tr><td style="width:60px" class="muted">${esc(s.id)}</td><td>${esc(s.text)}<div class="cite">${esc(s.section)}${
            s.cites.length
              ? " · Einzelnachweis: " +
                s.cites
                  .map((c) => {
                    const src = r.sources.find((x) => x.id === c);
                    return src
                      ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.work || src.title)}</a>`
                      : esc(c);
                  })
                  .join(", ")
              : ""
          }</div></td></tr>`,
      )
      .join("")}</table>`;
  document.getElementById("regen-research").onclick = async () => {
    if (!confirm("Recherche und Skript neu erstellen?")) return;
    await act(
      () => api(`/api/projects/${p.id}/regenerate`, { method: "POST", body: { step: "research" } }),
      "Recherche gestartet",
    );
  };
}

function tabSources(p) {
  const el = document.getElementById("tab");
  const srcs = p.research?.sources || [];
  el.innerHTML = `<div class="muted">Rohtexte sind als Schnappschuss mit SHA-256 im Projektordner gespeichert und bleiben auch bei späteren Artikeländerungen nachprüfbar.</div>
  <table style="margin-top:10px"><tr><th>Quelle</th><th>Art</th><th>Abgerufen</th><th>Schnappschuss</th></tr>
  ${srcs.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.work ? `<div class="cite">${esc(s.work)}</div>` : ""}${s.permalink ? `<div class="cite"><a href="${esc(s.permalink)}" target="_blank" rel="noopener">Revision ${esc(s.revision)}</a></div>` : ""}</td><td>${esc(s.kind)}</td><td>${esc(s.retrieved_at || "über Wikipedia zitiert")}</td><td>${s.file ? `<a href="${fileUrl(p.id, s.file)}" target="_blank">${esc(s.file.split("/").pop())}</a><div class="cite">${esc(s.sha256.slice(0, 16))}…</div>` : "–"}</td></tr>`).join("")}</table>`;
}

function tabChecks(p) {
  const el = document.getElementById("tab");
  const c = p.checks;
  el.innerHTML = !c
    ? `<div class="empty">Das Video wurde noch nicht gebaut.</div>`
    : `<div>${c.ok ? '<span class="badge ok">HyperFrames lint + check bestanden</span>' : '<span class="badge fehler">Prüfung fehlgeschlagen</span>'}</div>
    <table style="margin-top:10px"><tr><th>Bereich</th><th>Stufe</th><th>Meldung</th></tr>${c.findings.map((f) => `<tr><td>${esc(f.section)}</td><td><span class="badge ${f.severity === "error" ? "fehler" : "warnung"}">${esc(f.severity)}</span></td><td>${esc(f.message)}<div class="cite">${esc(f.code)} · ${esc(f.file || "")}</div></td></tr>`).join("") || `<tr><td colspan="3" class="muted">Keine Meldungen.</td></tr>`}</table>`;
}

function tabLog(p) {
  document.getElementById("tab").innerHTML =
    `<div class="log">${p.log.map((l) => `${esc(l.at)}  ${l.level === "error" ? "FEHLER " : ""}${esc(l.message)}`).join("\n") || "—"}</div>`;
}

// ---------------- Einstellungen ----------------
async function viewSettings() {
  const [s, st] = await Promise.all([api("/api/settings"), api("/api/status")]);
  const f = (k, label, type = "text", extra = "") => {
    const v = s[k];
    if (type === "bool")
      return `<label>${label}</label><div><input type="checkbox" data-k="${k}" ${v ? "checked" : ""}></div>`;
    if (type === "select")
      return `<label>${label}</label><select data-k="${k}">${extra
        .split(",")
        .map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`)
        .join("")}</select>`;
    return `<label>${label}</label><input data-k="${k}" type="${type}" value="${esc(Array.isArray(v) ? v.join(",") : v)}" ${extra}>`;
  };
  $app.innerHTML = `<h1>Einstellungen</h1>
  <div class="muted">Claude: ${st.providers.claude ? "verfügbar" : "kein ANTHROPIC_API_KEY gesetzt – regelbasierte Skripte"} · ElevenLabs: ${st.providers.elevenlabs ? "verfügbar" : "kein ELEVENLABS_API_KEY – lokale Piper-Stimme"} · HyperFrames ${esc(st.hyperframes)} · letzter Tageslauf: ${esc(st.last_daily || "nie")}</div>
  <div class="card kv" style="margin-top:16px">
    <h3 style="grid-column:1/-1">Automatisierung</h3>
    ${f("automation_enabled", "Täglich automatisch recherchieren", "bool")}
    ${f("daily_run_time", "Uhrzeit (HH:MM)", "time")}
    ${f("auto_prepare_count", "Projekte pro Tag vorbereiten", "number", 'min="0" max="10"')}
    ${f("daily_topic_count", "Ideen pro Tag", "number", 'min="1" max="30"')}
    ${f("topic_cooldown_days", "Thema frühestens wieder nach (Tagen)", "number")}
    ${f("render_preview_after_approval", "Nach Freigabe Vorschau rendern", "bool")}
    <h3 style="grid-column:1/-1;margin-top:10px">Skript</h3>
    ${f("script_engine", "Engine", "select", "auto,claude,regelbasiert")}
    ${f("claude_model", "Claude-Modell")}
    ${f("target_min_seconds", "Mindestlänge (s)", "number")}
    ${f("target_max_seconds", "Maximallänge (s)", "number")}
    <h3 style="grid-column:1/-1;margin-top:10px">Stimme</h3>
    ${f("tts_provider", "Anbieter", "select", "auto,elevenlabs,piper")}
    ${f("elevenlabs_voice_id", "ElevenLabs Voice-ID")}
    ${f("elevenlabs_model", "ElevenLabs Modell")}
    ${f("elevenlabs_speed", "ElevenLabs Tempo (0.7–1.2)", "number", 'step="0.05"')}
    ${f("piper_length_scale", "Piper Sprechdauer-Faktor (kleiner = schneller)", "number", 'step="0.05"')}
    <h3 style="grid-column:1/-1;margin-top:10px">Musik, Bilder & Look</h3>
    ${f("music_source", "Musikquelle", "select", "generated,library")}
    ${f("music_volume_db", "Musik-Lautstärke (dB)", "number", 'step="1"')}
    ${f("use_commons_photos", "Frei lizenzierte Fotos von Wikimedia Commons nutzen", "bool")}
    ${f("allowed_photo_licenses", "Erlaubte Foto-Lizenzen (kommagetrennt)")}
    ${f("accent_color", "Akzentfarbe", "color")}
    ${f("fps", "Bildrate", "number")}
  </div>
  <div class="row" style="margin-top:14px"><button class="primary" id="save">Speichern</button></div>
  <div class="muted" style="margin-top:10px">Eigene Musik: Dateien nach <code>data/music-library/</code> legen, jeweils mit gleichnamiger <code>.txt</code>-Datei, die Herkunft und Lizenz dokumentiert. Ohne Lizenzdatei wird ein Titel nie verwendet.</div>`;
  document.getElementById("save").onclick = async () => {
    const body = {};
    $app.querySelectorAll("[data-k]").forEach((i) => {
      const k = i.dataset.k;
      body[k] =
        i.type === "checkbox"
          ? i.checked
          : k === "allowed_photo_licenses"
            ? i.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            : i.value;
    });
    await act(() => api("/api/settings", { method: "PUT", body }), "Gespeichert");
  };
}

// ---------------- Jobs & Status ----------------
async function poll() {
  try {
    const st = await api("/api/status");
    document.getElementById("engine-status").innerHTML =
      `Skript: <b>${esc(st.providers.script_active)}</b> · Stimme: <b>${esc(st.providers.tts_active)}</b> · Automatik: <b>${st.automation.enabled ? st.automation.time : "aus"}</b>`;
    const active = st.jobs.filter(
      (j) =>
        j.status === "läuft" ||
        j.status === "wartend" ||
        (j.finished && Date.now() - Date.parse(j.finished) < 8000),
    );
    document.getElementById("jobs").innerHTML = active
      .map(
        (j) =>
          `<div class="job"><div class="row spread"><b>${esc(j.label)}</b><span class="badge ${j.status === "fehler" ? "fehler" : j.status === "fertig" ? "ok" : "läuft"}">${esc(j.status)}</span></div>
        ${j.error ? `<div style="color:var(--err)">${esc(j.error)}</div>` : ""}${j.status === "läuft" ? `<div class="bar"><div style="width:${Math.max(4, j.pct)}%"></div></div>` : ""}</div>`,
      )
      .join("");
    const sig = JSON.stringify(st.jobs.map((j) => [j.id, j.status]));
    if (sig !== state.lastJobs) {
      const changed = state.lastJobs !== "";
      state.lastJobs = sig;
      if (changed && !state.dirty) {
        const h = location.hash;
        if (h.startsWith("#/projekt/") && state.project) viewProject(state.project.id);
        else if (h === "" || h.startsWith("#/themen")) viewTopics();
        else if (h.startsWith("#/projekte")) viewProjects();
      }
    }
  } catch {
    // Server kurz nicht erreichbar – nächster Versuch folgt
  }
  setTimeout(poll, 2000);
}

route();
poll();
