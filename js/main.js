/* ═══════════════════════════════════════════════════════════
   MAIN.JS — Orquestrador da aplicação
   · Inicializar o app e registrar o Service Worker (PWA)
   · Trocar abas com animação
   · Abrir/fechar modais (bottom sheets)
   · Formulários de Evento e Escala
   · Fluxo de Sync com Google Sheets
   · Toast notifications
   Dependências: DateUtils, Storage, Calendar, Finance (globals)
═══════════════════════════════════════════════════════════ */

'use strict';

const $ = id => document.getElementById(id);

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
const Toast = (() => {
  let _timer = null;
  const el   = $('toast');

  function show(message, type = 'default', duration = 3000) {
    if (!el) return;
    clearTimeout(_timer);

    el.textContent = message;
    el.className   = 'toast toast--visible';
    if (type !== 'default') el.classList.add(`toast--${type}`);

    _timer = setTimeout(hide, duration);
  }

  function hide() {
    if (!el) return;
    el.classList.remove('toast--visible');
  }

  return { show, hide };
})();

/* ─────────────────────────────────────────
   GERENCIADOR DE MODAIS
───────────────────────────────────────── */
const Modals = (() => {
  const _stack = [];

  function open(modalId) {
    const modal = $(modalId);
    if (!modal) return;

    modal.removeAttribute('aria-hidden');
    modal.classList.add('modal--open');
    _stack.push(modalId);

    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      const focusTarget = modal.querySelector('input, select, textarea, .modal__close');
      focusTarget?.focus();
    });
  }

  function close(modalId) {
    const id    = modalId ?? _stack[_stack.length - 1];
    const modal = $(id);
    if (!modal) return;

    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('modal--open');

    const idx = _stack.indexOf(id);
    if (idx !== -1) _stack.splice(idx, 1);

    if (_stack.length === 0) {
      document.body.style.overflow = '';
    }
  }

  function closeAll() {
    [..._stack].forEach(id => close(id));
  }

  function isOpen(modalId) {
    return _stack.includes(modalId);
  }

  return { open, close, closeAll, isOpen };
})();

/* ─────────────────────────────────────────
   GERENCIADOR DE ABAS
───────────────────────────────────────── */
const Tabs = (() => {
  const PANELS = {
    calendar: 'panel-calendar',
    scales:   'panel-scales',
    summary:  'panel-summary',
    finance:  'panel-finance',
  };

  let _active = 'calendar';

  function switchTo(tabName) {
    if (tabName === _active) return;

    const currentPanel = $(PANELS[_active]);
    if (currentPanel) {
      currentPanel.classList.remove('panel--active');
      setTimeout(() => { currentPanel.hidden = true; }, 50);
    }

    document.querySelectorAll('.tab-nav__item').forEach(btn => {
      const isTarget = btn.dataset.tab === tabName;
      btn.classList.toggle('tab-nav__item--active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    const nextPanel = $(PANELS[tabName]);
    if (nextPanel) {
      nextPanel.hidden = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          nextPanel.classList.add('panel--active');
        });
      });
    }

    _active = tabName;
    _onTabActivated(tabName);
  }

  function _onTabActivated(tabName) {
    if (tabName === 'calendar') {
      Calendar.renderCalendar();
      Calendar.renderDayEvents(Calendar.getSelectedDate());
    } else if (tabName === 'scales') {
      Calendar.renderScales();
    } else if (tabName === 'summary') {
      const now = new Date();
      Calendar.renderSummary(now.getFullYear(), now.getMonth());
      _renderSyncStatus();
    } else if (tabName === 'finance') {
      Finance.render();
    }
  }

  return { switchTo };
})();

/* ─────────────────────────────────────────
   FORMULÁRIO DE EVENTO
───────────────────────────────────────── */
const EventForm = (() => {
  let _editingId = null;

  function open(prefillDate = null, existingEvent = null) {
    _editingId = existingEvent?.id ?? null;

    $('modal-event-title').textContent = existingEvent ? 'Editar Evento' : 'Novo Evento';
    $('btn-delete-event').hidden = !existingEvent;

    if (existingEvent) {
      $('event-title').value = existingEvent.title     ?? '';
      $('event-date').value  = existingEvent.date      ?? '';
      $('event-type').value  = existingEvent.type      ?? 'shift';
      $('event-start').value = existingEvent.startTime ?? '07:00';
      $('event-end').value   = existingEvent.endTime   ?? '19:00';
      $('event-notes').value = existingEvent.notes     ?? '';
    } else {
      $('event-title').value = '';
      $('event-date').value  = prefillDate ?? DateUtils.toISOString(DateUtils.today());
      $('event-type').value  = 'shift';
      $('event-start').value = '07:00';
      $('event-end').value   = '19:00';
      $('event-notes').value = '';
    }

    Modals.open('modal-event');
  }

  function _read() {
    const title = $('event-title').value.trim();
    const date  = $('event-date').value;

    if (!title) { Toast.show('Informe um título para o evento.', 'error'); return null; }
    if (!date)  { Toast.show('Selecione uma data.', 'error'); return null; }

    return {
      id:        _editingId ?? DateUtils.generateId(),
      title,
      date,
      type:      $('event-type').value,
      startTime: $('event-start').value,
      endTime:   $('event-end').value,
      notes:     $('event-notes').value.trim(),
    };
  }

  function save() {
    const data = _read();
    if (!data) return;

    const wasEditing = !!_editingId;
    Storage.saveEvent(data);
    Modals.close('modal-event');
    Toast.show(wasEditing ? 'Evento atualizado.' : 'Evento salvo.', 'success');

    Calendar.renderCalendar();
    Calendar.renderDayEvents(Calendar.getSelectedDate());
  }

  function remove() {
    if (!_editingId) return;
    if (!confirm('Excluir este evento?')) return;

    Storage.deleteEvent(_editingId);
    Modals.close('modal-event');
    Toast.show('Evento excluído.', 'default');

    Calendar.renderCalendar();
    Calendar.renderDayEvents(Calendar.getSelectedDate());
    _editingId = null;
  }

  return { open, save, remove };
})();

/* ─────────────────────────────────────────
   FORMULÁRIO DE ESCALA
───────────────────────────────────────── */
const ScaleForm = (() => {
  let _editingId    = null;
  let _activeDays   = new Set();

  function open(existing = null) {
    _editingId  = existing?.id ?? null;
    _activeDays = new Set(existing?.activeDays ?? []);

    $('modal-scale-title').textContent = existing ? 'Editar Escala' : 'Nova Escala';
    $('btn-delete-scale').hidden = !existing;

    $('scale-name').value        = existing?.name       ?? '';
    $('scale-type').value        = existing?.type       ?? 'weekly';
    $('scale-start').value       = existing?.startDate  ?? '';
    $('scale-end').value         = existing?.endDate    ?? '';
    $('scale-shift-start').value = existing?.shiftStart ?? '07:00';
    $('scale-shift-end').value   = existing?.shiftEnd   ?? '19:00';
    $('cycle-work').value        = existing?.workDays   ?? 1;
    $('cycle-off').value         = existing?.offDays    ?? 1;

    document.querySelectorAll('.weekday-btn').forEach(btn => {
      const day = Number(btn.dataset.day);
      btn.classList.toggle('weekday-btn--active', _activeDays.has(day));
    });

    _updateTypeOptions($('scale-type').value);
    Modals.open('modal-scale');
  }

  function _updateTypeOptions(type) {
    $('scale-weekly-opts').hidden  = type === 'cyclic';
    $('scale-cyclic-opts').hidden  = type !== 'cyclic';
  }

  function toggleDay(day) {
    if (_activeDays.has(day)) {
      _activeDays.delete(day);
    } else {
      _activeDays.add(day);
    }
    document.querySelectorAll('.weekday-btn').forEach(btn => {
      btn.classList.toggle('weekday-btn--active', _activeDays.has(Number(btn.dataset.day)));
    });
  }

  function _read() {
    const name  = $('scale-name').value.trim();
    const type  = $('scale-type').value;
    const start = $('scale-start').value;

    if (!name)  { Toast.show('Informe um nome para a escala.', 'error');  return null; }
    if (!start) { Toast.show('Informe a data de início.', 'error'); return null; }

    if ((type === 'weekly' || type === 'biweekly') && _activeDays.size === 0) {
      Toast.show('Selecione ao menos um dia da semana.', 'error');
      return null;
    }

    return {
      id:         _editingId ?? DateUtils.generateId(),
      name,
      type,
      activeDays: [..._activeDays].sort(),
      workDays:   Number($('cycle-work').value) || 1,
      offDays:    Number($('cycle-off').value)  || 1,
      startDate:  start,
      endDate:    $('scale-end').value || null,
      shiftStart: $('scale-shift-start').value,
      shiftEnd:   $('scale-shift-end').value,
    };
  }

  function save() {
    const data = _read();
    if (!data) return;

    const wasEditing = !!_editingId;
    Storage.saveScale(data);
    Modals.close('modal-scale');
    Toast.show(wasEditing ? 'Escala atualizada.' : 'Escala salva.', 'success');

    Calendar.renderCalendar();
    Calendar.renderScales();
  }

  function remove() {
    if (!_editingId) return;
    if (!confirm('Excluir esta escala? Os plantões gerados por ela deixarão de aparecer.')) return;

    Storage.deleteScale(_editingId);
    Modals.close('modal-scale');
    Toast.show('Escala excluída.', 'default');

    Calendar.renderCalendar();
    Calendar.renderScales();
    _editingId = null;
  }

  return { open, save, remove, toggleDay, updateTypeOptions: _updateTypeOptions };
})();

/* ─────────────────────────────────────────
   CONFIGURAÇÃO DO GOOGLE SHEETS
───────────────────────────────────────── */
const SheetsConfig = (() => {

  function open() {
    const settings = Storage.getSettings();
    $('sheets-endpoint').value = settings.sheetsEndpoint || '';
    Modals.open('modal-sheets-config');
  }

  function save() {
    const url = $('sheets-endpoint').value.trim();

    if (!url) {
      Toast.show('Cole a URL do Apps Script.', 'error');
      return;
    }
    if (!/^https:\/\/script\.google\.com\//.test(url)) {
      Toast.show('A URL deve começar com https://script.google.com/', 'error', 4000);
      return;
    }

    Storage.saveSettings({ sheetsEndpoint: url, sheetsEnabled: true });
    Toast.show('Configuração salva.', 'success');
    Modals.close('modal-sheets-config');
  }

  return { open, save };
})();

/* ─────────────────────────────────────────
   SYNC (Google Sheets)
───────────────────────────────────────── */
function _renderSyncStatus() {
  const dot    = $('sync-status-dot');
  const text   = $('sync-status-text');
  const lastSync = Storage.getLastSyncDate();

  if (!dot || !text) return;

  if (lastSync) {
    const d = new Date(lastSync);
    const fmt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    dot.className  = 'sync-dot sync-dot--ok';
    text.textContent = `Sincronizado em ${fmt}`;
  } else {
    dot.className  = 'sync-dot sync-dot--idle';
    text.textContent = 'Não sincronizado';
  }
}

async function _handleSync() {
  const btn  = $('btn-sync');
  const dot  = $('sync-status-dot');
  const text = $('sync-status-text');

  const { sheetsEndpoint } = Storage.getSettings();
  if (!sheetsEndpoint || !sheetsEndpoint.trim()) {
    Toast.show('Configure o endpoint do Google Sheets primeiro.', 'warning', 4000);
    SheetsConfig.open();
    return;
  }

  btn?.classList.add('icon-btn--spinning');
  if (dot)  dot.className    = 'sync-dot sync-dot--loading';
  if (text) text.textContent = 'Sincronizando…';

  const result = await Storage.syncToSheets();

  btn?.classList.remove('icon-btn--spinning');

  if (result.ok) {
    Toast.show(result.message, 'success');
    if (dot)  dot.className = 'sync-dot sync-dot--ok';
    if (text) {
      const d   = new Date(result.syncedAt);
      const fmt = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      text.textContent = `Sincronizado às ${fmt}`;
    }
  } else {
    Toast.show(result.message, 'error', 4500);
    if (dot)  dot.className    = 'sync-dot sync-dot--error';
    if (text) text.textContent = 'Falha na sincronização';
  }
}

async function _handleTestConnection() {
  const btn = $('btn-test-connection');
  if (btn) { btn.disabled = true; btn.textContent = 'Testando…'; }

  const result = await Storage.testConnection();

  if (btn) { btn.disabled = false; btn.textContent = 'Testar conexão'; }
  Toast.show(result.message, result.ok ? 'success' : 'error', 4000);
}

/* ─────────────────────────────────────────
   REGISTRO DE EVENT LISTENERS
───────────────────────────────────────── */
function _bindEvents() {

  // Financeiro
  Finance.bind();

  // Abas
  document.querySelectorAll('.tab-nav__item').forEach(btn => {
    btn.addEventListener('click', () => Tabs.switchTo(btn.dataset.tab));
  });

  // Navegação de mês
  $('btn-prev-month')?.addEventListener('click', () => {
    Calendar.prevMonth();
    Calendar.renderDayEvents(Calendar.getSelectedDate());
  });
  $('btn-next-month')?.addEventListener('click', () => {
    Calendar.nextMonth();
    Calendar.renderDayEvents(Calendar.getSelectedDate());
  });

  // Novo evento
  $('btn-add')?.addEventListener('click', () => {
    EventForm.open(DateUtils.toISOString(Calendar.getSelectedDate()));
  });

  // Nova escala
  $('btn-add-scale')?.addEventListener('click', () => ScaleForm.open());

  // Formulário de Evento
  $('btn-save-event')?.addEventListener('click',   () => EventForm.save());
  $('btn-delete-event')?.addEventListener('click', () => EventForm.remove());

  // Formulário de Escala
  $('btn-save-scale')?.addEventListener('click',   () => ScaleForm.save());
  $('btn-delete-scale')?.addEventListener('click', () => ScaleForm.remove());

  $('scale-type')?.addEventListener('change', e => {
    ScaleForm.updateTypeOptions(e.target.value);
  });

  document.querySelectorAll('.weekday-btn').forEach(btn => {
    btn.addEventListener('click', () => ScaleForm.toggleDay(Number(btn.dataset.day)));
  });

  // Fechar modais
  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => Modals.closeAll());
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') Modals.closeAll();
  });

  // Sync
  $('btn-sync')?.addEventListener('click', _handleSync);
  $('btn-test-connection')?.addEventListener('click', _handleTestConnection);

  // Configuração Google Sheets
  $('btn-sheets-config')?.addEventListener('click', () => SheetsConfig.open());
  $('btn-save-sheets-config')?.addEventListener('click', () => SheetsConfig.save());

  // Eventos customizados (disparados pelo Calendar)
  document.addEventListener('app:edit-event', e => {
    EventForm.open(null, e.detail);
  });

  document.addEventListener('app:edit-scale', e => {
    ScaleForm.open(e.detail);
  });

  _bindSwipeToClose();
}

/* ─────────────────────────────────────────
   SWIPE TO CLOSE (bottom sheets)
───────────────────────────────────────── */
function _bindSwipeToClose() {
  document.querySelectorAll('.modal__sheet').forEach(sheet => {
    let startY = 0;
    let isDragging = false;

    sheet.addEventListener('touchstart', e => {
      if (sheet.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      isDragging = true;
    }, { passive: true });

    sheet.addEventListener('touchmove', e => {
      if (!isDragging) return;
      const delta = e.touches[0].clientY - startY;
      if (delta > 0) {
        sheet.style.transform = `translateY(${delta}px)`;
        sheet.style.transition = 'none';
      }
    }, { passive: true });

    sheet.addEventListener('touchend', e => {
      if (!isDragging) return;
      isDragging = false;
      const delta = e.changedTouches[0].clientY - startY;
      sheet.style.transform = '';
      sheet.style.transition = '';

      if (delta > 80) {
        Modals.closeAll();
      }
    });
  });
}

/* ─────────────────────────────────────────
   SERVICE WORKER (PWA)
───────────────────────────────────────── */
function _registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js')
    .then(reg => console.info('[PWA] Service Worker registrado:', reg.scope))
    .catch(err => console.warn('[PWA] Service Worker falhou:', err));
}

/* ─────────────────────────────────────────
   INICIALIZAÇÃO
───────────────────────────────────────── */
function _init() {
  _bindEvents();

  Calendar.onDaySelect(() => {});
  Calendar.renderCalendar();
  Calendar.renderDayEvents(DateUtils.today());

  _registerServiceWorker();

  document.body.classList.remove('loading');

  console.info('[App] Escalas inicializado.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}
