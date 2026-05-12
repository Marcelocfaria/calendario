/* ═══════════════════════════════════════════════════════════
   STORAGE.JS — Persistência e Sincronização
   Responsabilidades:
   · CRUD de eventos e escalas no LocalStorage
   · Configuração do endpoint Google Sheets
   · Teste de conexão e sincronização manual via Fetch API
═══════════════════════════════════════════════════════════ */

'use strict';

const Storage = (() => {

  /* ─────────────────────────────────────────
     CHAVES DO LOCALSTORAGE
  ───────────────────────────────────────── */
  const KEYS = Object.freeze({
    EVENTS:      'escala_events',
    SCALES:      'escala_scales',
    SETTINGS:    'escala_settings',
    LAST_SYNC:   'escala_last_sync',
  });

  /* ─────────────────────────────────────────
     HELPERS INTERNOS
  ───────────────────────────────────────── */

  /**
   * Lê e faz parse seguro de uma chave do LS.
   * Retorna fallback se ausente ou JSON inválido.
   */
  function _read(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      console.warn(`[Storage] Falha ao ler chave "${key}"`);
      return fallback;
    }
  }

  /**
   * Serializa e grava um valor no LS.
   * Retorna true em sucesso, false em falha (ex: quota excedida).
   */
  function _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[Storage] Falha ao gravar chave "${key}":`, err);
      return false;
    }
  }

  /* ─────────────────────────────────────────
     EVENTOS — CRUD
  ───────────────────────────────────────── */

  /** Retorna todos os eventos manuais. */
  function getEvents() {
    return _read(KEYS.EVENTS, []);
  }

  /**
   * Retorna eventos de um dia específico.
   * @param {string} dateISO — 'YYYY-MM-DD'
   */
  function getEventsByDate(dateISO) {
    return getEvents().filter(e => e.date === dateISO);
  }

  /**
   * Retorna eventos de um mês inteiro.
   * @param {number} year
   * @param {number} month — 0-indexed
   */
  function getEventsByMonth(year, month) {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return getEvents().filter(e => e.date.startsWith(prefix));
  }

  /**
   * Salva um evento (cria ou atualiza por ID).
   * @param {object} event
   * @returns {object} evento salvo
   */
  function saveEvent(event) {
    const events = getEvents();
    const idx = events.findIndex(e => e.id === event.id);

    if (idx !== -1) {
      events[idx] = { ...events[idx], ...event };
    } else {
      events.push({
        id:        event.id ?? DateUtils.generateId(),
        title:     event.title     ?? 'Evento',
        date:      event.date      ?? '',
        type:      event.type      ?? 'other',
        startTime: event.startTime ?? '',
        endTime:   event.endTime   ?? '',
        notes:     event.notes     ?? '',
        fromScale: false,
        createdAt: event.createdAt ?? new Date().toISOString(),
      });
    }

    _write(KEYS.EVENTS, events);
    return idx !== -1 ? events[idx] : events[events.length - 1];
  }

  /**
   * Remove um evento por ID.
   * @param {string} id
   * @returns {boolean}
   */
  function deleteEvent(id) {
    const events = getEvents().filter(e => e.id !== id);
    return _write(KEYS.EVENTS, events);
  }

  /* ─────────────────────────────────────────
     ESCALAS — CRUD
  ───────────────────────────────────────── */

  /** Retorna todas as escalas. */
  function getScales() {
    return _read(KEYS.SCALES, []);
  }

  /** Retorna uma escala por ID. */
  function getScaleById(id) {
    return getScales().find(s => s.id === id) ?? null;
  }

  /**
   * Salva uma escala (cria ou atualiza por ID).
   * @param {object} scale
   * @returns {object} escala salva
   */
  function saveScale(scale) {
    const scales = getScales();
    const idx = scales.findIndex(s => s.id === scale.id);

    if (idx !== -1) {
      scales[idx] = { ...scales[idx], ...scale };
    } else {
      scales.push({
        id:         scale.id         ?? DateUtils.generateId(),
        name:       scale.name       ?? 'Nova Escala',
        type:       scale.type       ?? 'weekly',    // weekly | biweekly | cyclic
        activeDays: scale.activeDays ?? [],           // para weekly/biweekly
        workDays:   scale.workDays   ?? 1,            // para cyclic
        offDays:    scale.offDays    ?? 1,            // para cyclic
        startDate:  scale.startDate  ?? '',
        endDate:    scale.endDate    ?? null,
        shiftStart: scale.shiftStart ?? '07:00',
        shiftEnd:   scale.shiftEnd   ?? '19:00',
        createdAt:  scale.createdAt  ?? new Date().toISOString(),
      });
    }

    _write(KEYS.SCALES, scales);
    return idx !== -1 ? scales[idx] : scales[scales.length - 1];
  }

  /**
   * Remove uma escala por ID.
   * @param {string} id
   * @returns {boolean}
   */
  function deleteScale(id) {
    const scales = getScales().filter(s => s.id !== id);
    return _write(KEYS.SCALES, scales);
  }

  /* ─────────────────────────────────────────
     CONFIGURAÇÕES (endpoint Google Sheets)
  ───────────────────────────────────────── */

  const DEFAULT_SETTINGS = {
    sheetsEndpoint: '',
    sheetsEnabled:  false,
    autoSync:       false,
  };

  /** Retorna as configurações atuais. */
  function getSettings() {
    return { ...DEFAULT_SETTINGS, ..._read(KEYS.SETTINGS, {}) };
  }

  /**
   * Salva configurações (merge parcial).
   * @param {object} patch
   */
  function saveSettings(patch) {
    const current = getSettings();
    return _write(KEYS.SETTINGS, { ...current, ...patch });
  }

  /* ─────────────────────────────────────────
     SINCRONIZAÇÃO — GOOGLE SHEETS
  ───────────────────────────────────────── */

  /**
   * Monta o payload completo para envio ao Apps Script.
   * @returns {object}
   */
  function _buildSyncPayload() {
    return {
      version:   '1.0',
      exportedAt: new Date().toISOString(),
      events:    getEvents(),
      scales:    getScales(),
    };
  }

  /**
   * Testa a conectividade com o endpoint do Apps Script.
   * Envia um GET esperando { status: 'ok' }.
   * @returns {Promise<{ ok: boolean, message: string }>}
   */
  async function testConnection() {
    const { sheetsEndpoint } = getSettings();

    if (!sheetsEndpoint) {
      return { ok: false, message: 'Endpoint não configurado.' };
    }

    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(sheetsEndpoint, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return { ok: false, message: `Servidor retornou ${res.status}.` };
      }

      const data = await res.json().catch(() => ({}));
      const isValid = data?.status === 'ok';

      return {
        ok:      isValid,
        message: isValid ? 'Conexão estabelecida com sucesso.' : 'Endpoint respondeu mas retornou formato inesperado.',
      };

    } catch (err) {
      if (err.name === 'AbortError') {
        return { ok: false, message: 'Tempo limite excedido (8s).' };
      }
      return { ok: false, message: `Erro de rede: ${err.message}` };
    }
  }

  /**
   * Envia todos os dados locais via POST (JSON) para o Apps Script.
   * @returns {Promise<{ ok: boolean, message: string, syncedAt?: string }>}
   */
  async function syncToSheets() {
    const { sheetsEndpoint, sheetsEnabled } = getSettings();

    if (!sheetsEnabled) {
      return { ok: false, message: 'Sincronização com Google Sheets está desabilitada.' };
    }

    if (!sheetsEndpoint) {
      return { ok: false, message: 'Endpoint não configurado.' };
    }

    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 15_000);

      const payload = _buildSyncPayload();

      const res = await fetch(sheetsEndpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return { ok: false, message: `Servidor retornou ${res.status}.` };
      }

      const data = await res.json().catch(() => ({}));
      const syncedAt = new Date().toISOString();

      // Persiste timestamp da última sync bem-sucedida
      _write(KEYS.LAST_SYNC, syncedAt);

      return {
        ok:       true,
        message:  data?.message ?? 'Dados sincronizados com sucesso.',
        syncedAt,
      };

    } catch (err) {
      if (err.name === 'AbortError') {
        return { ok: false, message: 'Tempo limite excedido (15s).' };
      }
      return { ok: false, message: `Erro ao sincronizar: ${err.message}` };
    }
  }

  /**
   * Retorna a data/hora da última sincronização bem-sucedida,
   * ou null se nunca sincronizou.
   * @returns {string|null} ISO string
   */
  function getLastSyncDate() {
    return _read(KEYS.LAST_SYNC, null);
  }

  /* ─────────────────────────────────────────
     EXPORTAÇÃO / IMPORTAÇÃO LOCAL (backup)
  ───────────────────────────────────────── */

  /**
   * Exporta todos os dados como JSON string (para download).
   * @returns {string}
   */
  function exportJSON() {
    return JSON.stringify(_buildSyncPayload(), null, 2);
  }

  /**
   * Importa dados de um JSON string (merge ou substituição).
   * @param {string}  jsonString
   * @param {boolean} replace — se true, substitui; se false, faz merge
   * @returns {{ ok: boolean, message: string }}
   */
  function importJSON(jsonString, replace = false) {
    try {
      const data = JSON.parse(jsonString);

      if (!Array.isArray(data.events) || !Array.isArray(data.scales)) {
        return { ok: false, message: 'Formato de backup inválido.' };
      }

      if (replace) {
        _write(KEYS.EVENTS, data.events);
        _write(KEYS.SCALES, data.scales);
      } else {
        // Merge: adiciona somente IDs inexistentes
        const existingEventIds = new Set(getEvents().map(e => e.id));
        const existingScaleIds = new Set(getScales().map(s => s.id));

        const newEvents = [...getEvents(), ...data.events.filter(e => !existingEventIds.has(e.id))];
        const newScales = [...getScales(), ...data.scales.filter(s => !existingScaleIds.has(s.id))];

        _write(KEYS.EVENTS, newEvents);
        _write(KEYS.SCALES, newScales);
      }

      return { ok: true, message: `${data.events.length} evento(s) e ${data.scales.length} escala(s) importados.` };

    } catch {
      return { ok: false, message: 'JSON inválido ou corrompido.' };
    }
  }

  /**
   * Apaga TODOS os dados (eventos, escalas, configurações).
   * Use com cautela — irreversível sem backup.
   */
  function clearAll() {
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
  }

  /* ─────────────────────────────────────────
     API PÚBLICA
  ───────────────────────────────────────── */
  return Object.freeze({
    // Eventos
    getEvents,
    getEventsByDate,
    getEventsByMonth,
    saveEvent,
    deleteEvent,

    // Escalas
    getScales,
    getScaleById,
    saveScale,
    deleteScale,

    // Configurações
    getSettings,
    saveSettings,

    // Sync
    testConnection,
    syncToSheets,
    getLastSyncDate,

    // Backup
    exportJSON,
    importJSON,
    clearAll,
  });

})();