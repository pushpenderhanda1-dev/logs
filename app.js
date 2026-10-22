/* Video Logs — local-first static app.
   Uploads and edits are stored in IndexedDB in this browser/device.
   This static GitHub Pages site does not upload content to GitHub or sync across devices. */
(() => {
  "use strict";
  const DEMO_PIN = "1234"; // Change this casual UI PIN.
  const DB_NAME = "video-logs-local";
  const DB_VERSION = 1;
  const STORE = "entries";
  let db;
  let currentEntry = null;
  let currentType = "log";
  let editingEntryId = null;
  let editingNoteId = null;
  let activePointerId = null;
  let lastOverlayNoteId = null;
  let overlayTimer = null;
  let toastTimer = null;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const els = {
    pinGate: $("#pinGate"), pinForm: $("#pinForm"), pinInput: $("#pinInput"), pinError: $("#pinError"),
    app: $("#app"), logsPage: $("#logsPage"), bloopersPage: $("#bloopersPage"), detailPage: $("#detailPage"),
    logsList: $("#logsList"), bloopersList: $("#bloopersList"), logsEmpty: $("#logsEmpty"), bloopersEmpty: $("#bloopersEmpty"),
    logDialog: $("#logDialog"), logForm: $("#logForm"), noteDialog: $("#noteDialog"), noteForm: $("#noteForm"),
    bloopDialog: $("#bloopDialog"), bloopForm: $("#bloopForm"), mainVideo: $("#mainVideo"),
    noteOverlay: $("#noteOverlay"), overlayTime: $("#overlayTime"), overlayTitle: $("#overlayTitle"), overlayText: $("#overlayText"),
    pointerList: $("#pointerList"), pointerEmpty: $("#pointerEmpty"), observationsInput: $("#observationsInput"),
    observationsStatus: $("#observationsStatus"), toast: $("#toast")
  };

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }
  function transaction(mode = "readonly") { return db.transaction(STORE, mode).objectStore(STORE); }
  function getAll() {
    return new Promise((resolve, reject) => {
      const req = transaction().getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  function getEntry(id) {
    return new Promise((resolve, reject) => {
      const req = transaction().get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  function saveEntry(entry) {
    return new Promise((resolve, reject) => {
      const req = transaction("readwrite").put(entry);
      req.onsuccess = () => resolve(entry);
      req.onerror = () => reject(req.error);
    });
  }
  function removeEntry(id) {
    return new Promise((resolve, reject) => {
      const req = transaction("readwrite").delete(id);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
  }
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  function formatDate(date) {
    if (!date) return "Undated";
    const d = new Date(`${date}T12:00:00`);
    return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
  }
  function parseTime(value) {
    const parts = String(value).trim().split(":");
    if (!parts.length || parts.some(p => !/^\d+$/.test(p))) return null;
    let seconds;
    if (parts.length === 2) seconds = Number(parts[0]) * 60 + Number(parts[1]);
    else if (parts.length === 3) seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
    else if (parts.length === 1) seconds = Number(parts[0]);
    else return null;
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function setPage(name) {
    els.logsPage.hidden = name !== "logs";
    els.bloopersPage.hidden = name !== "bloopers";
    els.detailPage.hidden = name !== "detail";
    $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.page === name));
    if (name === "logs" || name === "bloopers") currentEntry = null;
  }
  function entryCard(entry) {
    const hasThumb = !!entry.thumbnail;
    const thumb = hasThumb
      ? `<img src="${entry.thumbnail}" alt="">`
      : `<span class="placeholder">▶</span>`;
    const kind = entry.type === "bloop" ? "blooper" : "log";
    const count = entry.type === "log" ? `${(entry.notes || []).length} pointer${(entry.notes || []).length === 1 ? "" : "s"}` : "outtake";
    return `<article class="log-card" data-open-entry="${escapeHTML(entry.id)}" tabindex="0" role="button" aria-label="Open ${escapeHTML(entry.title)}">
      <div class="thumbnail">${thumb}</div>
      <div class="card-body"><div class="card-date">${escapeHTML(formatDate(entry.date))}</div>
      <h2>${escapeHTML(entry.title)}</h2><p>${escapeHTML(entry.description || (kind === "blooper" ? "No description added." : "No description added."))}</p>
      <div class="card-footer"><span>${count}</span><span>Open ↗</span></div></div></article>`;
  }
  async function renderLists() {
    const entries = (await getAll()).sort((a,b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
    const logs = entries.filter(e => e.type === "log");
    const bloops = entries.filter(e => e.type === "bloop");
    els.logsList.innerHTML = logs.map(entryCard).join("");
    els.bloopersList.innerHTML = bloops.map(entryCard).join("");
    els.logsEmpty.hidden = logs.length > 0;
    els.bloopersEmpty.hidden = bloops.length > 0;
  }
  function openEntryFromCard(event) {
    const card = event.target.closest("[data-open-entry]");
    if (card) openEntry(card.dataset.openEntry);
  }
  async function openEntry(id) {
    const entry = await getEntry(id);
    if (!entry) return toast("That entry could not be found.");
    currentEntry = entry;
    currentType = entry.type;
    activePointerId = null;
    lastOverlayNoteId = null;
    clearTimeout(overlayTimer);
    $("#backButton").textContent = entry.type === "bloop" ? "← Back to bloopers" : "← Back to logs";
    $("#editCurrentButton").hidden = false;
    $("#deleteCurrentButton").hidden = false;
    $("#videoLayout").classList.toggle("bloop-layout", entry.type === "bloop");
    $("#pointersPanel").hidden = entry.type === "bloop";
    $("#observationsSection").hidden = entry.type === "bloop";
    $("#fullscreenPointersToggle").hidden = true;
    $("#fullscreenPointersPanel").hidden = true;
    $("#fullscreenPointersToggle").setAttribute("aria-expanded", "false");
    $("#detailTitleBlock").innerHTML = `<p class="eyebrow">${entry.type === "bloop" ? "FIRST BLOOPERS" : "VIDEO LOG"}</p><h1>${escapeHTML(entry.title)}</h1><p class="date">${escapeHTML(formatDate(entry.date))}</p>${entry.description ? `<p class="description">${escapeHTML(entry.description)}</p>` : ""}`;
    els.mainVideo.pause();
    els.mainVideo.removeAttribute("src");
    els.mainVideo.load();
    let noVideo = $("#noVideoMessage");
    if (noVideo) noVideo.remove();
    if (entry.videoData) {
      els.mainVideo.src = entry.videoData;
      els.mainVideo.hidden = false;
    } else {
      els.mainVideo.hidden = true;
      const message = document.createElement("div");
      message.id = "noVideoMessage";
      message.className = "no-video";
      message.textContent = "No video attached. Edit this entry to add a video file.";
      $("#videoStage").append(message);
    }
    els.observationsInput.value = entry.observations || "";
    els.observationsStatus.textContent = "Saved on this device.";
    renderPointers();
    setPage("detail");
  }
  function renderPointers() {
    if (!currentEntry || currentEntry.type !== "log") return;
    const notes = [...(currentEntry.notes || [])].sort((a,b) => a.time - b.time || a.createdAt - b.createdAt);
    els.pointerList.innerHTML = notes.map(note => `<div class="pointer ${note.id === activePointerId ? "active" : ""}" data-pointer="${escapeHTML(note.id)}">
      <button class="pointer-jump" data-jump="${escapeHTML(note.id)}" title="Jump to ${formatTime(note.time)}" style="all:unset;cursor:pointer"><span class="pointer-time">${formatTime(note.time)}</span></button>
      <div class="pointer-content"><strong>${escapeHTML(note.title)}</strong><span>${escapeHTML(note.text || "")}</span></div>
      <div class="pointer-tools"><button data-edit-note="${escapeHTML(note.id)}" title="Edit pointer" aria-label="Edit pointer">Edit</button><button data-delete-note="${escapeHTML(note.id)}" title="Delete pointer" aria-label="Delete pointer">×</button></div>
    </div>`).join("");
    els.pointerEmpty.hidden = notes.length > 0;
    renderFullscreenPointers(notes);
  }
  function renderFullscreenPointers(notes = [...(currentEntry?.notes || [])].sort((a,b) => a.time - b.time || a.createdAt - b.createdAt)) {
    const list = $("#fullscreenPointerList");
    if (!list) return;
    // Show pointers whose timestamps have been reached in the current playback session.
    const now = els.mainVideo.currentTime || 0;
    const discovered = notes.filter(note => note.time <= now + 0.15);
    list.innerHTML = discovered.map(note => `<button type="button" class="fullscreen-pointer ${note.id === activePointerId ? "active" : ""}" data-fullscreen-jump="${escapeHTML(note.id)}">
      <span class="fullscreen-pointer-time">${formatTime(note.time)}</span>
      <span class="fullscreen-pointer-copy"><strong>${escapeHTML(note.title)}</strong><span>${escapeHTML(note.text || "")}</span></span>
    </button>`).join("");
    $("#fullscreenPointersEmpty").hidden = discovered.length > 0;
  }
  async function refreshCurrent() {
    if (currentEntry) currentEntry = await getEntry(currentEntry.id);
    await renderLists();
    if (currentEntry) {
      if (currentEntry.type === "log") renderPointers();
      $("#detailTitleBlock").querySelector("h1").textContent = currentEntry.title;
    }
  }
  function openLogDialog(entry = null) {
    editingEntryId = entry?.id || null;
    $("#logDialogTitle").textContent = entry ? "Edit video log" : "New video log";
    $("#logTitle").value = entry?.title || "";
    $("#logDate").value = entry?.date || today();
    $("#logDescription").value = entry?.description || "";
    $("#logVideo").value = "";
    $("#logThumbnail").value = "";
    $("#existingVideoHint").textContent = entry?.videoData ? "A video is already attached. Choose a file only if you want to replace it." : "Choose a local video file (optional).";
    els.logDialog.showModal();
  }
  function openBloopDialog(entry = null) {
    editingEntryId = entry?.id || null;
    $("#bloopDialogTitle").textContent = entry ? "Edit blooper" : "Add blooper";
    $("#bloopTitle").value = entry?.title || "";
    $("#bloopDate").value = entry?.date || today();
    $("#bloopDescription").value = entry?.description || "";
    $("#bloopVideo").value = "";
    $("#bloopThumbnail").value = "";
    $("#bloopExistingVideoHint").textContent = entry?.videoData ? "A video is already attached. Choose a file only if you want to replace it." : "Choose a local video file (optional).";
    els.bloopDialog.showModal();
  }
  async function handleEntryForm(event, type) {
    event.preventDefault();
    const isBloop = type === "bloop";
    const prefix = isBloop ? "bloop" : "log";
    const existing = editingEntryId ? await getEntry(editingEntryId) : null;
    const videoFile = $(`#${prefix}Video`).files[0];
    const thumbnailFile = $(`#${prefix}Thumbnail`).files[0];
    const title = $(`#${prefix}Title`).value.trim();
    if (!title) return toast("Please enter a title.");
    try {
      const entry = {
        ...(existing || {}),
        id: existing?.id || uid(),
        type,
        title,
        date: $(`#${prefix}Date`).value || today(),
        description: $(`#${prefix}Description`).value.trim(),
        videoData: videoFile ? await fileToDataURL(videoFile) : (existing?.videoData || null),
        videoName: videoFile ? videoFile.name : (existing?.videoName || ""),
        thumbnail: thumbnailFile ? await fileToDataURL(thumbnailFile) : (existing?.thumbnail || null),
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now()
      };
      if (type === "log") {
        entry.notes = existing?.notes || [];
        entry.observations = existing?.observations || "";
      }
      await saveEntry(entry);
      els[isBloop ? "bloopDialog" : "logDialog"].close();
      await renderLists();
      if (currentEntry?.id === entry.id) await openEntry(entry.id);
      toast(existing ? "Entry updated." : "Entry added.");
    } catch (error) {
      console.error(error);
      toast("Could not save. The file may be too large for this browser's storage.");
    }
  }
  function openNoteDialog(note = null) {
    if (!currentEntry || currentEntry.type !== "log") return;
    editingNoteId = note?.id || null;
    $("#noteDialogTitle").textContent = note ? "Edit pointer" : "Add pointer";
    $("#noteTimestamp").value = note ? formatTime(note.time) : formatTime(els.mainVideo.currentTime || 0);
    $("#noteTitle").value = note?.title || "";
    $("#noteText").value = note?.text || "";
    els.noteDialog.showModal();
  }
  async function handleNoteForm(event) {
    event.preventDefault();
    if (!currentEntry) return;
    const time = parseTime($("#noteTimestamp").value);
    if (time === null) return toast("Enter a timestamp like 01:25 or 1:02:15.");
    const title = $("#noteTitle").value.trim();
    if (!title) return toast("Please enter a pointer title.");
    const notes = [...(currentEntry.notes || [])];
    const oldIndex = notes.findIndex(n => n.id === editingNoteId);
    const note = {
      id: editingNoteId || uid(), time, title,
      text: $("#noteText").value.trim(),
      createdAt: oldIndex >= 0 ? notes[oldIndex].createdAt : Date.now(),
      updatedAt: Date.now()
    };
    if (oldIndex >= 0) notes[oldIndex] = note;
    else notes.push(note);
    currentEntry.notes = notes;
    await saveEntry(currentEntry);
    els.noteDialog.close();
    activePointerId = note.id;
    renderPointers();
    toast(editingNoteId ? "Pointer updated." : "Pointer added.");
    editingNoteId = null;
  }
  async function deleteNote(id) {
    if (!currentEntry) return;
    const note = (currentEntry.notes || []).find(n => n.id === id);
    if (!note || !confirm(`Delete pointer “${note.title}”?`)) return;
    currentEntry.notes = currentEntry.notes.filter(n => n.id !== id);
    await saveEntry(currentEntry);
    if (activePointerId === id) activePointerId = null;
    if (lastOverlayNoteId === id) hideOverlay();
    renderPointers();
    toast("Pointer deleted.");
  }
  function hideOverlay() {
    els.noteOverlay.hidden = true;
    clearTimeout(overlayTimer);
  }
  function showOverlay(note) {
    els.overlayTime.textContent = formatTime(note.time);
    els.overlayTitle.textContent = note.title;
    els.overlayText.textContent = note.text || "";
    els.noteOverlay.hidden = false;
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => { els.noteOverlay.hidden = true; }, 5000);
  }
  function syncPointerToTime() {
    if (!currentEntry || currentEntry.type !== "log") return;
    const notes = [...(currentEntry.notes || [])].sort((a,b) => a.time - b.time || a.createdAt - b.createdAt);
    const time = els.mainVideo.currentTime || 0;
    // Latest pointer at or before playhead remains highlighted, including after backward/forward seeking.
    const reached = notes.filter(n => n.time <= time + 0.15).at(-1) || null;
    const previous = activePointerId;
    activePointerId = reached?.id || null;
    if (previous !== activePointerId) renderPointers();

    // Show only when crossing a note's timestamp during forward playback, not repeatedly on every timeupdate.
    if (els.mainVideo.seeking) return;
    const crossed = notes.find(n => n.id !== lastOverlayNoteId && n.time <= time + 0.15 && n.time >= time - 0.9);
    if (crossed && !els.mainVideo.paused) {
      lastOverlayNoteId = crossed.id;
      showOverlay(crossed);
    }
  }
  async function deleteCurrent() {
    if (!currentEntry || !confirm(`Delete “${currentEntry.title}” and its locally stored files and notes? This cannot be undone.`)) return;
    await removeEntry(currentEntry.id);
    currentEntry = null;
    hideOverlay();
    setPage(currentType === "bloop" ? "bloopers" : "logs");
    await renderLists();
    toast("Entry deleted.");
  }

  els.pinForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (els.pinInput.value !== DEMO_PIN) {
      els.pinError.hidden = false;
      els.pinInput.select();
      return;
    }
    sessionStorage.setItem("videoLogsUnlocked", "yes");
    els.pinGate.hidden = true;
    els.app.hidden = false;
    await initApp();
  });
  $("#lockButton").addEventListener("click", () => {
    sessionStorage.removeItem("videoLogsUnlocked");
    els.app.hidden = true;
    els.pinGate.hidden = false;
    els.pinInput.value = "";
    els.pinError.hidden = true;
    els.pinInput.focus();
  });
  $("#newLogButton").addEventListener("click", () => openLogDialog());
  $("#emptyNewLog").addEventListener("click", () => openLogDialog());
  $("#newBloopButton").addEventListener("click", () => openBloopDialog());
  $("#emptyNewBloop").addEventListener("click", () => openBloopDialog());
  els.logForm.addEventListener("submit", e => handleEntryForm(e, "log"));
  els.bloopForm.addEventListener("submit", e => handleEntryForm(e, "bloop"));
  els.noteForm.addEventListener("submit", handleNoteForm);
  $$("[data-close]").forEach(button => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
  $$(".nav-link").forEach(button => button.addEventListener("click", () => {
    setPage(button.dataset.page);
    renderLists();
  }));
  els.logsList.addEventListener("click", openEntryFromCard);
  els.bloopersList.addEventListener("click", openEntryFromCard);
  [els.logsList, els.bloopersList].forEach(list => list.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-open-entry]")) {
      e.preventDefault(); openEntry(e.target.dataset.openEntry);
    }
  }));
  $("#backButton").addEventListener("click", () => {
    hideOverlay();
    setPage(currentType === "bloop" ? "bloopers" : "logs");
    renderLists();
  });
  $("#editCurrentButton").addEventListener("click", () => {
    if (!currentEntry) return;
    currentEntry.type === "bloop" ? openBloopDialog(currentEntry) : openLogDialog(currentEntry);
  });
  $("#deleteCurrentButton").addEventListener("click", deleteCurrent);
  $("#addNoteButton").addEventListener("click", () => openNoteDialog());
  $("#useCurrentTime").addEventListener("click", () => { $("#noteTimestamp").value = formatTime(els.mainVideo.currentTime || 0); });
  els.pointerList.addEventListener("click", async event => {
    const jump = event.target.closest("[data-jump]");
    const edit = event.target.closest("[data-edit-note]");
    const del = event.target.closest("[data-delete-note]");
    if (jump) {
      const note = (currentEntry?.notes || []).find(n => n.id === jump.dataset.jump);
      if (note && Number.isFinite(els.mainVideo.duration)) {
        els.mainVideo.currentTime = Math.min(note.time, els.mainVideo.duration);
        activePointerId = note.id;
        renderPointers();
      } else if (note) {
        els.mainVideo.currentTime = note.time;
        activePointerId = note.id;
        renderPointers();
      }
    } else if (edit) {
      const note = (currentEntry?.notes || []).find(n => n.id === edit.dataset.editNote);
      if (note) openNoteDialog(note);
    } else if (del) {
      await deleteNote(del.dataset.deleteNote);
    }
  });
  els.mainVideo.addEventListener("timeupdate", () => {
    syncPointerToTime();
    renderFullscreenPointers();
  });
  $("#fullscreenButton").addEventListener("click", async () => {
    const stage = $("#videoStage");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.requestFullscreen) await stage.requestFullscreen();
      else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
      else toast("Fullscreen is not supported by this browser.");
    } catch (error) {
      toast("Could not enter fullscreen. Try the browser's fullscreen controls.");
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const active = document.fullscreenElement === $("#videoStage");
    $("#fullscreenButton").textContent = active ? "⤢ Exit fullscreen" : "⛶ Fullscreen";
    $("#fullscreenButton").setAttribute("aria-label", active ? "Exit fullscreen video" : "Enter fullscreen video");
    $("#fullscreenPointersToggle").hidden = !active || currentEntry?.type !== "log";
    if (!active) {
      $("#fullscreenPointersPanel").hidden = true;
      $("#fullscreenPointersToggle").setAttribute("aria-expanded", "false");
    }
    renderFullscreenPointers();
  });
  $("#fullscreenPointersToggle").addEventListener("click", () => {
    const panel = $("#fullscreenPointersPanel");
    panel.hidden = !panel.hidden;
    $("#fullscreenPointersToggle").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) renderFullscreenPointers();
  });
  $("#closeFullscreenPointers").addEventListener("click", () => {
    $("#fullscreenPointersPanel").hidden = true;
    $("#fullscreenPointersToggle").setAttribute("aria-expanded", "false");
    $("#fullscreenPointersToggle").focus();
  });
  $("#fullscreenPointerList").addEventListener("click", event => {
    const jump = event.target.closest("[data-fullscreen-jump]");
    if (!jump) return;
    const note = (currentEntry?.notes || []).find(n => n.id === jump.dataset.fullscreenJump);
    if (!note) return;
    els.mainVideo.currentTime = note.time;
    activePointerId = note.id;
    renderPointers();
  });
  els.mainVideo.addEventListener("seeked", () => {
    // Seeking updates the highlight, but never triggers a note overlay.
    if (currentEntry?.type === "log") {
      const notes = [...(currentEntry.notes || [])].sort((a,b) => a.time - b.time || a.createdAt - b.createdAt);
      const reached = notes.filter(n => n.time <= (els.mainVideo.currentTime || 0)).at(-1) || null;
      activePointerId = reached?.id || null;
      renderPointers();
    }
  });
  els.mainVideo.addEventListener("play", () => { lastOverlayNoteId = null; });
  $("#saveObservations").addEventListener("click", async () => {
    if (!currentEntry || currentEntry.type !== "log") return;
    currentEntry.observations = els.observationsInput.value;
    currentEntry.updatedAt = Date.now();
    await saveEntry(currentEntry);
    els.observationsStatus.textContent = `Saved locally at ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}.`;
    toast("Observations saved.");
  });
  // Autosave observations after a short pause in typing.
  let observationsTimer;
  els.observationsInput.addEventListener("input", () => {
    els.observationsStatus.textContent = "Unsaved changes…";
    clearTimeout(observationsTimer);
    observationsTimer = setTimeout(async () => {
      if (!currentEntry || currentEntry.type !== "log") return;
      currentEntry.observations = els.observationsInput.value;
      currentEntry.updatedAt = Date.now();
      try {
        await saveEntry(currentEntry);
        els.observationsStatus.textContent = "Saved on this device.";
      } catch (e) {
        els.observationsStatus.textContent = "Could not save automatically. Use Save observations.";
      }
    }, 600);
  });

  async function initApp() {
    try {
      await openDB();
      await renderLists();
    } catch (error) {
      console.error(error);
      toast("Local storage is unavailable in this browser.");
    }
  }
  // Escape closes dialogs and overlay. Don't delete records on browser refresh.
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !els.noteDialog.open && !els.logDialog.open && !els.bloopDialog.open) hideOverlay();
  });
  if (sessionStorage.getItem("videoLogsUnlocked") === "yes") {
    els.pinGate.hidden = true;
    els.app.hidden = false;
    initApp();
  }
})();
