"use strict";

const $app = document.getElementById("app");
const S = { tab: "video", project: null, dirty: false, lastJobs: "", selCut: null, cand: null };
const STEP = {
  research: "Recherche",
  script: "Skript",
  media: "Medien",
  voice: "Voice-over",
  render: "Vorschau",
  export: "Export",
};
const LIC = {
  freigegeben: "Freigegeben",
  läuft_bald_ab: "Läuft bald ab",
  abgelaufen: "Abgelaufen",
  unklar: "Lizenz unklar",
  nicht_erlaubt: "Nicht erlaubt",
  gesperrt: "Gesperrt",
};
const SHOT_KINDS = ["spielszene", "jubel", "interview", "pressekonferenz", "training", "sonstiges"];

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, {
    ...opts,
    headers: isForm ? {} : { "Content-Type": "application/json" },
    body: opts.body ? (isForm ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).detail || msg;
    } catch {
      // keine JSON-Antwort
    }
    throw new Error(msg);
  }
  return res.json();
}
function toast(m) {
  const t = document.getElementById("toast");
  t.textContent = m;
  t.style.display = "block";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.style.display = "none"), 3800);
}
async function act(fn, ok) {
  try {
    const r = await fn();
    if (ok) toast(ok);
    return r;
  } catch (e) {
    toast("Fehler: " + e.message);
    throw e;
  }
}
const fmt = (s) =>
  s == null ? "–" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")} min`;
const fileUrl = (pid, p, v = "") =>
  `/files/${encodeURIComponent(pid)}/${p}${v ? "?v=" + encodeURIComponent(v) : ""}`;
const badge = (cls, txt) => `<span class="badge b-${esc(cls)}">${esc(txt)}</span>`;

async function route() {
  const [, view, id] = (location.hash || "#/neu").split("/");
  document
    .querySelectorAll("nav a")
    .forEach((a) =>
      a.classList.toggle("active", a.dataset.nav === (view === "video" ? "projekte" : view)),
    );
  S.dirty = false;
  closeDrawer();
  if (view === "projekte") return viewProjects();
  if (view === "video" && id) return viewProject(decodeURIComponent(id));
  if (view === "medien") return viewMedia();
  if (view === "lizenzen") return viewLicenses();
  if (view === "einstellungen") return viewSettings();
  return viewNew();
}
window.addEventListener("hashchange", route);

// ---------- Neues Video + aktuelle Themen ----------
async function viewNew() {
  $app.innerHTML = `<h1>Neues Video</h1>
    <div class="muted">Thema eingeben – das System recherchiert, schreibt das Skript, sucht lizenzierte MAXPPP-/PressBox-Medien, vertont und schneidet eine Vorschau.</div>
    <div class="card" style="margin:16px 0"><div class="big-input"><input id="topic" placeholder="z. B. „Musiala-Drama beim FC Bayern“ oder „Harry Kane und der FC Bayern“"><button class="primary" id="go">Video erstellen</button></div></div>
    <div class="row spread"><h2>Aktuelle Fußballthemen</h2><button id="refresh">Aktualisieren</button></div>
    <div id="trends"><div class="empty">Lade aktuelle Nachrichten aus Sportschau, FAZ, Spiegel, SZ, Welt, Transfermarkt … (beim ersten Mal bis zu 1 Minute)</div></div>`;
  const go = async () => {
    const topic = document.getElementById("topic").value.trim();
    if (!topic) return toast("Bitte ein Thema eingeben");
    const p = await act(
      () => api("/api/projects", { method: "POST", body: { topic } }),
      "Produktion gestartet",
    );
    location.hash = `#/video/${p.id}`;
  };
  document.getElementById("go").onclick = go;
  document.getElementById("topic").onkeydown = (e) => e.key === "Enter" && go();
  const load = async (refresh) => {
    const d = await api(`/api/trending${refresh ? "?refresh=true" : ""}`);
    const box = document.getElementById("trends");
    if (!box) return; // Seite wurde inzwischen gewechselt
    box.innerHTML = d.topics.length
      ? `<div class="muted small" style="margin-bottom:8px">Stand ${esc(d.at)} · sortiert nach Anzahl der Quellen und Aktualität</div><div class="grid">${d.topics
          .map(
            (
              t,
            ) => `<div class="card"><div class="trend"><div class="score">${Math.round(t.score)}</div><div style="min-width:0">
            <div class="row"><b>${esc(t.entity)}</b>${badge(t.kind === "verein" ? "info" : "ok", t.kind)}</div>
            <div class="muted small">${t.sources.length} Quellen: ${esc(t.sources.join(", "))}</div>
            <ul style="padding-left:18px;margin:8px 0">${t.headlines
              .slice(0, 3)
              .map(
                (h) =>
                  `<li class="small"><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}</a> <span class="muted">(${esc(h.source)})</span></li>`,
              )
              .join("")}</ul>
            <button class="primary" data-topic="${esc(t.entity)}: ${esc(t.suggested_topic)}">Video dazu erstellen</button></div></div></div>`,
          )
          .join("")}</div>`
      : `<div class="empty">Keine Themen gefunden.</div>`;
    document.querySelectorAll("[data-topic]").forEach(
      (b) =>
        (b.onclick = async () => {
          const p = await act(
            () => api("/api/projects", { method: "POST", body: { topic: b.dataset.topic } }),
            "Produktion gestartet",
          );
          location.hash = `#/video/${p.id}`;
        }),
    );
  };
  document.getElementById("refresh").onclick = () => load(true);
  load(false).catch(
    (e) =>
      (document.getElementById("trends").innerHTML =
        `<div class="err-box">${esc(e.message)}</div>`),
  );
}

// ---------- Videos ----------
async function viewProjects() {
  const list = await api("/api/projects");
  $app.innerHTML = `<h1>Videos</h1><div class="muted">${list.length} Projekte · lokal gespeichert</div><br>${
    list.length
      ? `<div class="grid">${list
          .map(
            (p) => `<div class="card click" data-open="${esc(p.id)}">
        ${p.poster ? `<img class="thumb v" src="${fileUrl(p.id, p.poster, p.status)}" alt="">` : ""}
        <div class="row spread" style="margin-top:8px">${badge(p.status, p.status_label)}<span class="muted small">${fmt(p.duration)}</span></div>
        <h3 style="margin-top:6px">${esc(p.title)}</h3><div class="muted small">${esc(p.created_at.replace("T", " "))}${p.warnings ? ` · ⚠ ${p.warnings} Medienwarnungen` : ""}</div></div>`,
          )
          .join("")}</div>`
      : `<div class="empty">Noch keine Videos. Unter „Neues Video“ ein Thema eingeben.</div>`
  }`;
  $app
    .querySelectorAll("[data-open]")
    .forEach((c) => (c.onclick = () => (location.hash = `#/video/${c.dataset.open}`)));
}

async function viewProject(pid, keep = true) {
  const p = await api(`/api/projects/${encodeURIComponent(pid)}`);
  if (!keep || !S.project || S.project.id !== pid) {
    S.tab = p.outputs?.preview ? "video" : "protokoll";
    S.selCut = null;
    S.cand = null;
  }
  S.project = p;
  const steps = Object.entries(p.steps)
    .map(([k, v]) => `<span class="step ${esc(v.status)}">${STEP[k] || k}: ${esc(v.status)}</span>`)
    .join("");
  const busy = ["recherche", "skript", "stimme", "schnitt", "export"].includes(p.status);
  $app.innerHTML = `<div class="row spread"><div style="min-width:0"><a class="muted" href="#/projekte">← Videos</a>
      <h1>${esc(p.script?.title || p.topic)}</h1><div class="muted">Thema: ${esc(p.topic)} · Status: <b>${esc(p.status)}</b></div><div class="steps">${steps}</div></div>
      <div class="row">
        ${p.script ? `<button id="preview" ${busy ? "disabled" : ""}>Vorschau rendern</button>` : ""}
        ${p.outputs?.preview ? `<button class="primary" id="export" ${busy ? "disabled" : ""}>Final exportieren (MP4)</button>` : ""}
        ${p.outputs?.final ? `<a class="btn primary" href="${fileUrl(p.id, p.outputs.final, p.outputs.final_at)}" download="${esc((p.script?.title || "video").replace(/[^\wäöüÄÖÜß -]/g, ""))}.mp4">MP4 herunterladen</a>` : ""}
        <button class="danger" id="del">Löschen</button></div></div>
    <div class="tabs">${["video", "skript", "szenen", "recherche", "protokoll"].map((t) => `<button data-tab="${t}" class="${S.tab === t ? "active" : ""}">${{ video: "Vorschau & Export", skript: "Skript", szenen: "Szenen & Medien", recherche: "Recherche & Quellen", protokoll: "Protokoll" }[t]}</button>`).join("")}</div>
    <div id="tab"></div>`;
  $app.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        if (S.dirty && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
        S.dirty = false;
        S.tab = b.dataset.tab;
        viewProject(pid);
      }),
  );
  const run = (step, msg) =>
    act(() => api(`/api/projects/${pid}/run`, { method: "POST", body: { step } }), msg);
  const pv = document.getElementById("preview");
  if (pv) pv.onclick = () => run("preview", "Vorschau wird gerendert");
  const ex = document.getElementById("export");
  if (ex) ex.onclick = () => run("export", "Export läuft (volle Qualität)");
  document.getElementById("del").onclick = async () => {
    if (!confirm("Projekt mit allen Dateien löschen?")) return;
    await act(() => api(`/api/projects/${pid}`, { method: "DELETE" }), "Gelöscht");
    location.hash = "#/projekte";
  };
  ({
    video: tabVideo,
    skript: tabScript,
    szenen: tabScenes,
    recherche: tabResearch,
    protokoll: tabLog,
  })[S.tab](p);
}

function warningsHtml(p) {
  const w = p.timeline?.warnings || [];
  return w.length
    ? `<div class="warn-box"><b>⚠ Medienwarnungen</b><ul style="margin:6px 0 0;padding-left:18px">${w.map((x) => `<li>${esc(x.scene)}: ${esc(x.message)}</li>`).join("")}</ul></div>`
    : "";
}

function tabVideo(p) {
  const o = p.outputs || {};
  const src = o.final || o.preview;
  const v = p.script?.validation;
  document.getElementById("tab").innerHTML = `<div class="player"><div>${
    src
      ? `<video class="vertical" controls playsinline src="${fileUrl(p.id, src, o.final_at || o.preview_at)}"></video><div class="muted small">${o.final ? "Finaler Export 1080×1920 · 30 fps" : "Vorschau (540×960, schnelle Qualität)"}</div>`
      : `<div class="empty">Noch keine Vorschau. Der Ablauf läuft – Fortschritt unten rechts.</div>`
  }</div><div>
    ${warningsHtml(p)}
    ${
      v
        ? v.ok
          ? `<div class="ok-box">✔ Faktenprüfung bestanden – alle Zahlen belegt, Gerüchte gekennzeichnet.</div>`
          : `<div class="err-box">✖ Faktenprüfung: ${v.issues
              .filter((i) => i.level === "fehler")
              .map((i) => esc(i.message))
              .join(" · ")}</div>`
        : ""
    }
    ${p.script?.engine?.startsWith("briefing") ? `<div class="warn-box">Skript im <b>Briefing-Modus</b> (ohne KI erstellt). Für journalistischen Stil mit eigener Einordnung einen Anthropic-API-Key hinterlegen oder den Text im Reiter „Skript“ überarbeiten.</div>` : ""}
    <div class="kv">
      <label>Länge</label><div>${fmt(p.voice?.duration)}</div>
      <label>Schnitte</label><div>${p.timeline ? `${p.timeline.cuts.length} · Videoanteil ${Math.round(p.timeline.video_share * 100)} %` : "–"}</div>
      <label>Stimme</label><div>${esc(p.voice ? `${p.voice.provider} · ${p.voice.voice}` : "–")}</div>
      <label>Verwendete Medien</label><div>${p.timeline ? new Set(p.timeline.cuts.filter((c) => c.media_id).map((c) => c.media_id)).size + " lizenzierte Dateien" : "–"}</div>
      <label>Bildnachweise</label><div class="small">${esc([...new Set((p.timeline?.cuts || []).map((c) => c.credit).filter(Boolean))].join(" · ") || "–")}</div>
      <label>TikTok-Text</label><div><textarea readonly>${esc(p.script ? `${p.script.caption}\n${p.script.hashtags.join(" ")}` : "")}</textarea></div>
      <label>Audio</label><div>${p.voice ? `<audio controls src="${fileUrl(p.id, "voice/voiceover.mp3", p.voice.text_hash)}"></audio> <a href="${fileUrl(p.id, "voice/voiceover.wav")}" download>WAV</a>` : "–"}</div>
    </div></div></div>`;
}

function tabScript(p) {
  const el = document.getElementById("tab");
  if (!p.script) {
    el.innerHTML = `<div class="empty">Skript wird erstellt …</div>`;
    return;
  }
  const s = p.script;
  const claims = Object.fromEntries((p.research?.claims || []).map((c) => [c.id, c]));
  const v = s.validation;
  el.innerHTML = `<div class="row spread"><div class="muted">${s.words} Wörter · ~${Math.round(s.est_seconds)} s · Engine: ${esc(s.engine)}</div>
    <div class="row"><button id="regen">Neu generieren</button><button class="primary" id="save">Speichern & prüfen</button></div></div>
    ${v.issues.length ? `<div class="${v.ok ? "warn-box" : "err-box"}"><ul style="margin:0;padding-left:18px">${v.issues.map((i) => `<li>${badge(i.level === "fehler" ? "err" : "warn", i.level)} ${i.scene ? `<b>${esc(i.scene)}</b>: ` : ""}${esc(i.message)}</li>`).join("")}</ul></div>` : `<div class="ok-box">✔ Prüfung bestanden</div>`}
    <div class="card"><label>Titel</label><input id="title" style="width:100%" value="${esc(s.title)}"><label>Beschreibung</label><textarea id="caption">${esc(s.caption)}</textarea><label>Hashtags</label><input id="tags" style="width:100%" value="${esc(s.hashtags.join(" "))}"></div>
    <h2>Szenen</h2>${s.scenes
      .map(
        (
          sc,
          i,
        ) => `<div class="card" style="margin-bottom:10px"><div class="row spread"><b>${esc(sc.id)}</b>
        <div class="row small"><span class="muted">Grafik</span><select data-g="${i}">${["none", "headline", "stat", "quote", "transfer", "tag"].map((g) => `<option ${g === sc.graphic.type ? "selected" : ""}>${g}</option>`).join("")}</select>
        <span class="muted">Tag</span><select data-tag="${i}">${["", "NEWS", "OFFIZIELL", "BESTÄTIGT", "BERICHT", "GERÜCHT", "EINORDNUNG", "TRANSFER"].map((g) => `<option ${g === (sc.graphic.tag || "") ? "selected" : ""}>${g}</option>`).join("")}</select>
        <span class="muted">Bewegung</span><select data-m="${i}">${["zoom_in", "zoom_out", "pan_left", "pan_right", "static"].map((g) => `<option ${g === sc.motion ? "selected" : ""}>${g}</option>`).join("")}</select>
        <span class="muted">Übergang</span><select data-t="${i}">${["cut", "whip", "flash", "zoom", "fade"].map((g) => `<option ${g === sc.transition ? "selected" : ""}>${g}</option>`).join("")}</select>
        <button class="danger" data-del="${i}">✕</button></div></div>
        <label>Sprechertext</label><textarea data-text="${i}">${esc(sc.text)}</textarea>
        <div class="row"><div style="flex:1;min-width:160px"><label>Grafik-Text / Zahl</label><input data-gt="${i}" style="width:100%" value="${esc(sc.graphic.title || sc.graphic.value || "")}"></div>
        <div style="flex:1;min-width:160px"><label>Hervorheben (Komma)</label><input data-em="${i}" style="width:100%" value="${esc(sc.emphasis.join(", "))}"></div></div>
        <div class="small muted" style="margin-top:6px">Quellen: ${esc(sc.sources.join(", ") || "–")} ${sc.claim_ids.map((c) => (claims[c] ? `· ${badge(claims[c].status, claims[c].status)} „${esc(claims[c].text.slice(0, 110))}…“` : "")).join(" ")}</div></div>`,
      )
      .join("")}<button id="add">+ Szene</button>`;
  el.querySelectorAll("textarea,input,select").forEach((x) => (x.oninput = () => (S.dirty = true)));
  const collect = () => ({
    title: document.getElementById("title").value,
    caption: document.getElementById("caption").value,
    hashtags: document.getElementById("tags").value.split(/\s+/).filter(Boolean),
    scenes: s.scenes.map((sc, i) => {
      const g = {
        ...sc.graphic,
        type: el.querySelector(`[data-g="${i}"]`).value,
        tag: el.querySelector(`[data-tag="${i}"]`).value,
      };
      const gt = el.querySelector(`[data-gt="${i}"]`).value;
      if (g.type === "stat") g.value = gt;
      else g.title = gt;
      return {
        ...sc,
        text: el.querySelector(`[data-text="${i}"]`).value,
        graphic: g,
        motion: el.querySelector(`[data-m="${i}"]`).value,
        transition: el.querySelector(`[data-t="${i}"]`).value,
        emphasis: el
          .querySelector(`[data-em="${i}"]`)
          .value.split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      };
    }),
  });
  const save = async (b) => {
    await act(
      () => api(`/api/projects/${p.id}/script`, { method: "PUT", body: b }),
      "Gespeichert, geprüft und Medien neu zugeordnet",
    );
    S.dirty = false;
    viewProject(p.id);
  };
  document.getElementById("save").onclick = () => save(collect());
  document.getElementById("regen").onclick = () => {
    if (confirm("Skript aus der Recherche neu erstellen?"))
      act(
        () => api(`/api/projects/${p.id}/run`, { method: "POST", body: { step: "script" } }),
        "Skript wird neu erstellt",
      );
  };
  document.getElementById("add").onclick = () => {
    const b = collect();
    b.scenes.splice(b.scenes.length - 1, 0, {
      text: "Neuer Sprechertext …",
      claim_ids: [],
      sources: [],
      graphic: { type: "none" },
      emphasis: [],
      motion: "zoom_in",
      transition: "cut",
      media_kind: "auto",
    });
    save(b);
  };
  el.querySelectorAll("[data-del]").forEach(
    (b) =>
      (b.onclick = () => {
        const x = collect();
        x.scenes.splice(+b.dataset.del, 1);
        save(x);
      }),
  );
}

async function tabScenes(p) {
  const el = document.getElementById("tab");
  const tl = p.timeline;
  if (!tl || !p.script) {
    el.innerHTML = `<div class="empty">Noch keine Medienzuordnung.</div>`;
    return;
  }
  const by = {};
  tl.cuts.forEach((c) => (by[c.scene] = by[c.scene] || []).push(c));
  el.innerHTML = `${warningsHtml(p)}<div class="muted" style="margin-bottom:10px">Pro Szene die automatisch gewählten Schnitte. Klicke einen Schnitt an und wähle ein anderes lizenziertes Bild/Video – danach „Vorschau rendern“.</div>
    ${p.script.scenes
      .map(
        (
          sc,
        ) => `<div class="card scene" style="margin-bottom:10px"><div><b>${esc(sc.id)}</b> <span class="muted small">${(by[sc.id] || []).length} Schnitte</span><div style="margin-top:6px">${esc(sc.text)}</div></div>
      <div><div class="cuts">${(by[sc.id] || [])
        .map((c) => {
          const key = `${c.scene}#${c.index}`;
          const img =
            c.kind === "video" && c.shot_id
              ? `/api/shots/${c.shot_id}/thumb`
              : c.media_id
                ? `/media-files/${c.media_id}/thumb`
                : "";
          return `<div class="cut ${S.selCut === key ? "sel" : ""} click" data-cut="${esc(key)}" title="${esc((c.why || []).join(", "))}">${img ? `<img src="${img}" alt="">` : `<div class="ph">Grafik</div>`}
            <div>${badge(c.kind === "video" ? "video" : c.kind === "grafik" ? "warn" : "info", c.kind)} ${c.duration.toFixed(1)}s</div><div class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.filename || "eigene Grafik")}</div>${p.overrides[key] ? '<div class="small" style="color:var(--accent)">manuell</div>' : ""}</div>`;
        })
        .join(
          "",
        )}</div>${S.selCut && S.selCut.startsWith(sc.id + "#") ? `<div id="opts">Lade Vorschläge …</div>` : ""}</div></div>`,
      )
      .join("")}`;
  el.querySelectorAll("[data-cut]").forEach(
    (c) =>
      (c.onclick = () => {
        S.selCut = S.selCut === c.dataset.cut ? null : c.dataset.cut;
        tabScenes(p);
      }),
  );
  if (S.selCut) {
    const sid = S.selCut.split("#")[0];
    const r = await api(`/api/projects/${p.id}/scenes/${sid}/candidates`);
    const box = document.getElementById("opts");
    if (!box) return;
    box.innerHTML = `<div class="small muted" style="margin-top:8px">Erkannt: ${esc(r.context.persons.join(", ") || "–")} · Kontext-Verein: ${esc(r.context.clubs.join(", ") || "–")} · gewünscht: ${esc(r.context.want || "beliebig")}</div>
      ${r.warnings.map((w) => `<div class="warn-box small">${esc(w)}</div>`).join("")}
      <div class="options">${r.options.map((o, i) => `<div class="opt" data-o="${i}"><img src="${o.shot ? `/api/shots/${o.shot.id}/thumb` : `/media-files/${o.media_id}/thumb`}" alt=""><div>${badge(o.kind === "video" ? "video" : "info", o.kind)} <b>${o.score}</b></div><div class="muted">${esc(o.why.join(", "))}</div></div>`).join("") || '<div class="muted">Keine lizenzierten Medien passend.</div>'}
      <div class="opt" data-o="graphic"><div class="ph" style="height:100px;display:flex;align-items:center;justify-content:center">Automatisch</div><div class="muted">Auswahl zurücksetzen</div></div></div>`;
    box.querySelectorAll("[data-o]").forEach(
      (b) =>
        (b.onclick = async () => {
          const o = r.options[+b.dataset.o];
          const body =
            b.dataset.o === "graphic"
              ? { key: S.selCut, media_id: null }
              : { key: S.selCut, media_id: o.media_id, shot_id: o.shot ? o.shot.id : null };
          await act(
            () => api(`/api/projects/${p.id}/overrides`, { method: "PUT", body }),
            "Zuordnung geändert – Vorschau neu rendern",
          );
          viewProject(p.id);
        }),
    );
  }
}

function tabResearch(p) {
  const r = p.research;
  const el = document.getElementById("tab");
  if (!r) {
    el.innerHTML = `<div class="empty">Recherche läuft …</div>`;
    return;
  }
  const cnt = (st) => r.claims.filter((c) => c.status === st).length;
  el.innerHTML = `<div class="row">${badge("bestätigt", cnt("bestätigt") + " bestätigt")}${badge("berichtet", cnt("berichtet") + " berichtet")}${badge("gerücht", cnt("gerücht") + " Gerüchte")}${badge("meinung", cnt("meinung") + " Meinungen")}<span class="muted small">${r.sources.length} Quellen · ${esc(r.researched_at)}</span>
    <button style="margin-left:auto" id="rr">Neu recherchieren</button></div>
    ${r.conflicts.length ? `<div class="warn-box"><b>Widersprüchliche Zahlen:</b> ${r.conflicts.map((c) => `${esc(c.topic)}: ${esc(c.values.join(" vs. "))}`).join("; ")}</div>` : ""}
    <h2>Aussagen (nach Gewicht)</h2><table><tr><th>Status</th><th>Aussage</th><th>Quellen</th></tr>${r.claims
      .slice(0, 80)
      .map(
        (c) =>
          `<tr><td>${badge(c.status, c.status)}</td><td>${esc(c.text)}${c.numbers.length ? `<div class="small muted">Zahlen: ${esc(c.numbers.join(", "))}</div>` : ""}</td><td class="small">${esc(c.sources.join(", "))}</td></tr>`,
      )
      .join("")}</table>
    <h2>Artikel</h2><table><tr><th>Quelle</th><th>Titel</th><th>Abruf</th></tr>${r.articles.map((a) => `<tr><td>${esc(a.source)} <span class="muted small">Tier ${a.tier}</span></td><td><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a><div class="small muted">${esc(a.published || "")}</div></td><td class="small">${esc(a.status)}</td></tr>`).join("")}</table>`;
  document.getElementById("rr").onclick = () =>
    act(
      () => api(`/api/projects/${p.id}/run`, { method: "POST", body: { step: "research" } }),
      "Recherche läuft",
    );
}

function tabLog(p) {
  document.getElementById("tab").innerHTML =
    `<div class="log">${p.log.map((l) => `${esc(l.at.slice(11))}  ${l.level === "error" ? "FEHLER " : l.level === "warn" ? "⚠ " : ""}${esc(l.message)}`).join("\n") || "—"}</div>`;
}

// ---------- Medienbibliothek ----------
async function viewMedia() {
  const st = await api("/api/media/stats");
  $app.innerHTML = `<div class="row spread"><div><h1>Medienbibliothek</h1><div class="muted">${st.total} Dateien · ${st.fotos} Fotos · ${st.videos} Videos · ${Object.entries(
    st.status,
  )
    .map(([k, v]) => `${v} ${LIC[k] || k}`)
    .join(" · ")}</div></div>
    <div class="row"><button id="scan">Ordner neu einlesen</button><label class="btn primary" style="margin:0">Dateien hochladen<input id="up" type="file" multiple hidden></label><select id="upsrc"><option>MAXPPP</option><option>PressBox</option><option>Eigene</option></select></div></div>
    ${st.expiring.length ? `<div class="warn-box">⚠ ${st.expiring.length} Lizenzen laufen bald ab.</div>` : ""}
    <div class="card" style="margin:14px 0"><div class="row"><input id="q" placeholder="Suche: Spieler, Verein, Wettbewerb, Dateiname … z. B. Harry Kane" style="flex:1;min-width:220px">
      <select id="src"><option value="">Alle Quellen</option><option>MAXPPP</option><option>PressBox</option><option>Eigene</option></select>
      <select id="kind"><option value="">Fotos + Videos</option><option value="foto">Nur Fotos</option><option value="video">Nur Videos</option></select>
      <select id="lic"><option value="">Jeder Lizenzstatus</option>${Object.entries(LIC)
        .map(([k, v]) => `<option value="${k}">${v}</option>`)
        .join("")}</select>
      <button id="find">Suchen</button></div>
      <div class="small muted" style="margin-top:6px">Ordner: <code>media/maxppp</code>, <code>media/pressbox</code>, <code>media/eigene</code> · Begleitdateien (.xml/.json/.csv) mit gleichem Namen werden mitgelesen.</div></div>
    <div id="res"></div>`;
  const find = async () => {
    const q = new URLSearchParams({
      q: document.getElementById("q").value,
      source: document.getElementById("src").value,
      kind: document.getElementById("kind").value,
      status: document.getElementById("lic").value,
    });
    const list = await api(`/api/media?${q}`);
    document.getElementById("res").innerHTML = list.length
      ? `<div class="grid media">${list
          .map(
            (
              m,
            ) => `<div class="card click" data-m="${m.id}"><img class="thumb" src="/media-files/${m.id}/thumb" alt="">
        <div class="row" style="margin-top:6px">${badge(m.kind === "video" ? "video" : "info", m.kind)}${badge(m.license_status, LIC[m.license_status])}</div>
        <div class="small" style="margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${esc(
          m.entities
            .filter((e) => e.kind !== "wettbewerb")
            .slice(0, 2)
            .map((e) => e.name)
            .join(", ") || m.filename,
        )}</b></div>
        <div class="small muted">${esc(m.source)} · ${esc(m.captured_at || "ohne Datum")}${m.kind === "video" ? ` · ${m.shots.length} Shots` : ""}</div></div>`,
          )
          .join("")}</div>`
      : `<div class="empty">Keine Treffer. Lege lizenzierte Dateien in die Medienordner oder lade sie hoch.</div>`;
    document
      .querySelectorAll("[data-m]")
      .forEach((c) => (c.onclick = () => mediaDrawer(+c.dataset.m, find)));
  };
  document.getElementById("find").onclick = find;
  document.getElementById("q").onkeydown = (e) => e.key === "Enter" && find();
  ["src", "kind", "lic"].forEach((i) => (document.getElementById(i).onchange = find));
  document.getElementById("scan").onclick = () =>
    act(() => api("/api/media/scan", { method: "POST" }), "Import läuft");
  document.getElementById("up").onchange = async (e) => {
    const fd = new FormData();
    fd.append("source", document.getElementById("upsrc").value);
    [...e.target.files].forEach((f) => fd.append("files", f));
    await act(
      () => api("/api/media/upload", { method: "POST", body: fd }),
      `${e.target.files.length} Datei(en) hochgeladen – Import läuft`,
    );
  };
  find();
}

function closeDrawer() {
  document.querySelector(".drawer")?.remove();
}
async function mediaDrawer(id, refresh) {
  closeDrawer();
  const [m, profiles] = await Promise.all([api(`/api/media/${id}`), api("/api/licenses")]);
  const d = document.createElement("div");
  d.className = "drawer";
  d.innerHTML = `<div class="row spread"><h2 style="margin:0">${esc(m.filename)}</h2><button id="x">Schließen</button></div>
    ${m.kind === "video" ? `<video controls src="/media-files/${m.id}/proxy" style="margin-top:10px"></video>` : `<img class="thumb" style="aspect-ratio:auto;margin-top:10px" src="/media-files/${m.id}/thumb">`}
    <div class="${m.usable ? "ok-box" : "err-box"}">${badge(m.license_status, LIC[m.license_status])} ${m.usable ? "Darf in Videos verwendet werden." : "Wird NICHT verwendet: " + esc(m.license_reasons.join("; "))}${m.credit_line ? `<div class="small">Bildnachweis: ${esc(m.credit_line)}</div>` : ""}</div>
    <h3>Metadaten</h3><div class="kv small"><label>Quelle</label><div>${esc(m.source)}${m.is_test ? " · TESTMATERIAL" : ""}</div><label>Titel</label><div>${esc(m.title || "–")}</div><label>Bildtext</label><div>${esc(m.caption || "–")}</div><label>Fotograf/Byline</label><div>${esc(m.byline || "–")}</div><label>Aufnahmedatum</label><div>${esc(m.captured_at || "–")}</div><label>Wettbewerb</label><div>${esc(m.competition || "–")}</div><label>Auflösung</label><div>${m.width}×${m.height}${m.duration ? ` · ${m.duration.toFixed(1)} s` : ""}</div><label>Pfad</label><div style="word-break:break-all">${esc(m.path)}</div></div>
    <h3 style="margin-top:14px">Spieler / Vereine / Trainer</h3><div class="row">${m.entities.map((e) => `<span class="badge">${esc(e.name)} <span class="muted">(${esc(e.kind)}, ${esc(e.origin)})</span> <a href="#" data-rm="${e.id}">✕</a></span>`).join("") || '<span class="muted">keine erkannt</span>'}</div>
    <div class="row" style="margin-top:6px"><input id="addent" placeholder="Name hinzufügen, z. B. Harry Kane" style="flex:1"><select id="entkind"><option>spieler</option><option>trainer</option><option>verein</option><option>funktionaer</option></select><button id="addbtn">+</button></div>
    ${m.kind === "video" ? `<h3 style="margin-top:14px">Shots (Szenen im Video)</h3><table class="small"><tr><th></th><th>Von–Bis (s)</th><th>Art</th><th>Aktiv</th></tr>${m.shots.map((s) => `<tr><td><img src="/api/shots/${s.id}/thumb" style="width:80px;border-radius:4px"></td><td><input data-s="${s.id}" data-f="start" value="${s.start}" style="width:64px"> – <input data-s="${s.id}" data-f="end" value="${s.end}" style="width:64px"></td><td><select data-s="${s.id}" data-f="kind">${SHOT_KINDS.map((k) => `<option ${k === s.kind ? "selected" : ""}>${k}</option>`).join("")}</select></td><td><input type="checkbox" data-s="${s.id}" data-f="enabled" ${s.enabled ? "checked" : ""}></td></tr>`).join("")}</table>` : ""}
    <h3 style="margin-top:14px">Lizenz</h3><div class="kv small">
      <label>Lizenzprofil</label><select id="lp"><option value="">– keines (gesperrt) –</option>${profiles.map((p) => `<option value="${p.id}" ${p.id === m.license_profile_id ? "selected" : ""}>${esc(p.name)}${p.confirmed ? "" : " (unbestätigt)"}</option>`).join("")}</select>
      <label>Abweichend: Plattformen</label><input id="lpl" value="${esc(m.lic_platforms || "")}" placeholder="leer = laut Profil">
      <label>Abweichend: gültig bis</label><input id="lvu" type="date" value="${esc(m.lic_valid_until || "")}">
      <label>Abweichend: Bildnachweis</label><input id="lcr" value="${esc(m.lic_credit || "")}" placeholder="leer = laut Profil">
      <label>Bildausschnitt (0–1)</label><div class="row"><input id="fx" type="number" step="0.05" min="0" max="1" value="${m.focus_x}" style="width:80px"> horizontal <input id="fy" type="number" step="0.05" min="0" max="1" value="${m.focus_y}" style="width:80px"> vertikal</div>
      <label>Sperren</label><div><input id="blk" type="checkbox" ${m.blocked ? "checked" : ""}> nie verwenden</div></div>
    <div class="row" style="margin-top:12px"><button class="primary" id="msave">Speichern</button></div>`;
  document.body.appendChild(d);
  d.querySelector("#x").onclick = closeDrawer;
  const put = async (body, msg) => {
    await act(() => api(`/api/media/${id}`, { method: "PUT", body }), msg);
    mediaDrawer(id, refresh);
    if (refresh) refresh();
  };
  d.querySelectorAll("[data-rm]").forEach(
    (a) =>
      (a.onclick = (e) => {
        e.preventDefault();
        put({ remove_entities: [+a.dataset.rm] }, "Entfernt");
      }),
  );
  d.querySelector("#addbtn").onclick = () =>
    put(
      {
        add_entities: [d.querySelector("#addent").value],
        entity_kind: d.querySelector("#entkind").value,
      },
      "Hinzugefügt",
    );
  d.querySelector("#msave").onclick = () => {
    const shots = m.shots.map((s) => ({
      id: s.id,
      start: d.querySelector(`[data-s="${s.id}"][data-f="start"]`).value,
      end: d.querySelector(`[data-s="${s.id}"][data-f="end"]`).value,
      kind: d.querySelector(`[data-s="${s.id}"][data-f="kind"]`).value,
      enabled: d.querySelector(`[data-s="${s.id}"][data-f="enabled"]`).checked ? 1 : 0,
    }));
    put(
      {
        license_profile_id: d.querySelector("#lp").value || "",
        lic_platforms: d.querySelector("#lpl").value,
        lic_valid_until: d.querySelector("#lvu").value,
        lic_credit: d.querySelector("#lcr").value,
        focus_x: +d.querySelector("#fx").value,
        focus_y: +d.querySelector("#fy").value,
        blocked: d.querySelector("#blk").checked ? 1 : 0,
        shots,
      },
      "Gespeichert",
    );
  };
}

// ---------- Lizenzen ----------
async function viewLicenses() {
  const list = await api("/api/licenses");
  $app.innerHTML = `<h1>Lizenzen</h1>
    <div class="warn-box"><b>Wichtig:</b> Das Programm kann deine Verträge nicht selbst prüfen. Eine Datei wird nur verwendet, wenn ihr Lizenzprofil <b>bestätigt</b> ist, die Plattform erlaubt, die kommerzielle Nutzung geklärt, ein Ablaufdatum (oder „unbefristet“) und ein Bildnachweis hinterlegt sind. Trage hier genau ein, was in deinem MAXPPP- bzw. PressBox-Vertrag steht. Im Zweifel: Anbieter fragen.</div>
    ${list
      .map(
        (
          p,
        ) => `<div class="card" style="margin-bottom:12px" data-p="${p.id}"><div class="row spread"><h3>${esc(p.name)}</h3><span>${p.confirmed ? badge("ok", "bestätigt") : badge("err", "nicht bestätigt – gesperrt")} <span class="muted small">${p.files} Dateien</span></span></div>
      <div class="kv small"><label>Name</label><input data-f="name" value="${esc(p.name)}"><label>Quelle</label><select data-f="source">${["MAXPPP", "PressBox", "Eigene", "sonstige"].map((s) => `<option ${s === p.source ? "selected" : ""}>${s}</option>`).join("")}</select>
      <label>Vertrag / Referenz</label><input data-f="reference" value="${esc(p.reference || "")}">
      <label>Erlaubte Plattformen</label><input data-f="platforms" value="${esc(p.platforms || "")}" placeholder="tiktok,instagram,youtube">
      <label>Kommerzielle Nutzung</label><select data-f="commercial"><option value="" ${p.commercial == null ? "selected" : ""}>ungeklärt</option><option value="1" ${p.commercial === 1 ? "selected" : ""}>erlaubt</option><option value="0" ${p.commercial === 0 ? "selected" : ""}>nicht erlaubt</option></select>
      <label>Gültig bis</label><div class="row"><input type="date" data-f="valid_until" value="${esc(p.valid_until || "")}"><label style="margin:0"><input type="checkbox" data-f="unlimited" ${p.unlimited ? "checked" : ""}> unbefristet</label></div>
      <label>Bildnachweis-Vorlage</label><input data-f="credit_template" value="${esc(p.credit_template || "")}" placeholder="Foto: {byline} / MAXPPP">
      <label>Einschränkungen</label><input data-f="restrictions" value="${esc(p.restrictions || "")}">
      <label>Bestätigung</label><label style="margin:0;color:var(--ink)"><input type="checkbox" data-f="confirmed" ${p.confirmed ? "checked" : ""}> Ich habe diese Angaben mit meinem Vertrag abgeglichen.</label></div>
      <div class="row" style="margin-top:10px"><button class="primary" data-save="${p.id}">Speichern</button></div></div>`,
      )
      .join("")}<button id="newp">+ Lizenzprofil</button>`;
  $app.querySelectorAll("[data-save]").forEach(
    (b) =>
      (b.onclick = async () => {
        const card = $app.querySelector(`[data-p="${b.dataset.save}"]`);
        const v = {};
        card
          .querySelectorAll("[data-f]")
          .forEach(
            (i) =>
              (v[i.dataset.f] =
                i.type === "checkbox"
                  ? i.checked
                    ? 1
                    : 0
                  : i.value === ""
                    ? null
                    : i.dataset.f === "commercial"
                      ? +i.value
                      : i.value),
          );
        await act(
          () => api(`/api/licenses/${b.dataset.save}`, { method: "PUT", body: v }),
          "Lizenz gespeichert",
        );
        viewLicenses();
      }),
  );
  document.getElementById("newp").onclick = async () => {
    await api("/api/licenses", {
      method: "POST",
      body: { name: "Neue Lizenz", source: "sonstige", confirmed: 0 },
    });
    viewLicenses();
  };
}

// ---------- Einstellungen ----------
async function viewSettings() {
  const [s, st] = await Promise.all([api("/api/settings"), api("/api/status")]);
  const f = (k, l, t = "text", ex = "") =>
    t === "select"
      ? `<label>${l}</label><select data-k="${k}">${ex.map(([v, n]) => `<option value="${esc(v)}" ${String(v) === String(s[k]) ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>`
      : `<label>${l}</label><input data-k="${k}" type="${t}" value="${esc(s[k])}" ${ex}>`;
  $app.innerHTML = `<h1>Einstellungen</h1>
    <div class="${st.claude ? "ok-box" : "warn-box"}">${st.claude ? "Claude ist verbunden – journalistische Skripte mit Einordnung." : "Kein <code>ANTHROPIC_API_KEY</code> gesetzt: Skripte entstehen im Briefing-Modus (sachlich, mit Quellen, ohne eigene Formulierung). Key unter console.anthropic.com anlegen und vor dem Start als Umgebungsvariable setzen."}</div>
    <div class="card kv"><h3 style="grid-column:1/-1">Marke & Look</h3>${f("brand_name", "Kanalname (Einblendung)")}${f("brand_color", "Markenfarbe", "color")}${f("accent_color", "Akzentfarbe (Namen/Zahlen)", "color")}
    <h3 style="grid-column:1/-1;margin-top:10px">Stimme</h3>${f("tts_provider", "Anbieter", "select", [["auto", "Automatisch"], ...Object.entries(st.providers)])}${f("elevenlabs_voice_id", "ElevenLabs-Stimme", "select", Object.entries(st.voices))}${f("elevenlabs_speed", "Tempo (0.7–1.2)", "number", 'step="0.05"')}${f("piper_length_scale", "Piper-Sprechdauer (kleiner = schneller)", "number", 'step="0.02"')}
    <h3 style="grid-column:1/-1;margin-top:10px">Schnitt</h3>${f("max_still_seconds", "Max. Standbild-Dauer (s)", "number", 'step="0.1"')}${f("music_volume_db", "Musik-Lautstärke (dB)", "number")}${f(
      "platform",
      "Zielplattform (Lizenzprüfung)",
      "select",
      [
        ["tiktok", "TikTok"],
        ["instagram", "Instagram"],
        ["youtube", "YouTube"],
      ],
    )}
    <h3 style="grid-column:1/-1;margin-top:10px">Recherche & Skript</h3>${f("news_lookback_hours", "Nachrichten der letzten … Stunden", "number")}${f(
      "script_engine",
      "Skript-Engine",
      "select",
      [
        ["auto", "Automatisch"],
        ["claude", "Claude"],
        ["briefing", "Briefing (ohne KI)"],
      ],
    )}${f("target_min_seconds", "Mindestlänge (s)", "number")}${f("target_max_seconds", "Maximallänge (s)", "number")}</div>
    <div class="row" style="margin-top:12px"><button class="primary" id="save">Speichern</button><button id="sync">Spielerverzeichnis aktualisieren</button><span class="muted small">Stand: ${esc(st.entities_synced || "noch nicht geladen")}</span></div>`;
  document.getElementById("save").onclick = () => {
    const v = {};
    $app.querySelectorAll("[data-k]").forEach((i) => (v[i.dataset.k] = i.value));
    act(() => api("/api/settings", { method: "PUT", body: v }), "Gespeichert");
  };
  document.getElementById("sync").onclick = () =>
    act(() => api("/api/entities/sync", { method: "POST" }), "Wird aktualisiert (ca. 1–2 Minuten)");
}

// ---------- Jobs ----------
async function poll() {
  try {
    const st = await api("/api/status");
    document.getElementById("engine").innerHTML =
      `Skript: <b>${st.script_engine === "claude" ? "Claude" : "Briefing"}</b> · Stimme: <b>${esc(st.tts)}</b> · Medien: <b>${st.library.total}</b>`;
    const active = st.jobs.filter(
      (j) =>
        j.status === "läuft" ||
        j.status === "wartend" ||
        (j.finished && Date.now() - Date.parse(j.finished) < 8000),
    );
    document.getElementById("jobs").innerHTML = active
      .map(
        (j) =>
          `<div class="job"><div class="row spread"><b>${esc(j.label)}</b>${badge(j.status === "fehler" ? "err" : j.status === "fertig" ? "ok" : "warn", j.status)}</div>${j.error ? `<div style="color:var(--err)" class="small">${esc(j.error)}</div>` : ""}${j.status === "läuft" ? `<div class="bar"><div style="width:${Math.max(4, j.pct)}%"></div></div>` : ""}</div>`,
      )
      .join("");
    const sig = JSON.stringify(st.jobs.map((j) => [j.id, j.status]));
    if (sig !== S.lastJobs) {
      const changed = S.lastJobs !== "";
      S.lastJobs = sig;
      if (changed && !S.dirty && !document.querySelector(".drawer")) {
        const h = location.hash;
        if (h.startsWith("#/video/") && S.project) viewProject(S.project.id);
        else if (h.startsWith("#/projekte")) viewProjects();
        else if (h.startsWith("#/medien")) viewMedia();
      }
    } else if (
      location.hash.startsWith("#/video/") &&
      S.project &&
      active.some((j) => j.pid === S.project.id) &&
      !S.dirty &&
      S.tab === "protokoll"
    ) {
      viewProject(S.project.id);
    }
  } catch {
    // Server kurz nicht erreichbar – nächster Versuch folgt
  }
  setTimeout(poll, 2500);
}

route();
poll();
