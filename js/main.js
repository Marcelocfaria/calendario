/* ═══════════════════════════════════════════════════════════
   MAIN.JS — Orquestrador da aplicação
   Responsabilidades:
   · Inicializar o app e registrar o Service Worker (PWA)
   · Gerenciar troca de abas com animação
   · Abrir/fechar modais (bottom sheets)
   · Lidar com formulários de Evento e Escala
   · Controlar o fluxo de Sync com Google Sheets
   · Exibir Toast notifications
   Dependências: DateUtils, Storage, Calendar (globals)
═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────
   SELETOR UTILITÁRIO
───────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
const Toast = (() => {
  let _timer = null;
  const el   = $('toast');

  /**
   * Exibe uma mensagem de toast.
   * @param {string} message
   * @param {'default'|'success'|'error'|'warning'} type
   * @param {number} duration — ms
   */
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
  const _stack = [];   // pilha de modais abertos

  /**
   * Abre um modal pelo ID do elemento.
   * @param {string} modalId
   */
  function open(modalId) {
    const modal = $(modalId);
    if (!modal) return;

    modal.removeAttribute('aria-hidden');
    modal.classList.add('modal--open');
    _stack.push(modalId);

    // Trava scroll do body
    document.body.style.overflow = 'hidden';

    // Foca o primeiro input ou o botão de fechar
    requestAnimationFrame(() => {
      const focusTarget = modal.querySelector('input, select, textarea, .modal__close');
      focusTarget?.focus();
    });
  }

  /**
   * Fecha o modal mais recente (ou um específico por ID).
   * @param {string} [modalId]
   */
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

  /** Fecha todos os modais abertos. */
  function closeAll() {
    [..._stack].forEach(id => close(id));
  }

  /** Verifica se um modal está aberto. */
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
  };

  let _active = 'calendar';

  /**
   * Muda para a aba especificada.
   * @param {string} tabName — 'calendar' | 'scales' | 'summary'
   */
  function switchTo(tabName) {
    if (tabName === _active) return;

    // Esconde painel atual
    const currentPanel = $(PANELS[_active]);
    if (currentPanel) {
      currentPanel.classList.remove('panel--active');
      // Pequeno delay para a transição de saída antes de esconder
      setTimeout(() => { currentPanel.hidden = true; }, 50);
    }

    // Atualiza tabs
    document.querySelectorAll('.tab-nav__item').forEach(btn => {
      const isTarget = btn.dataset.tab === tabName;
      btn.classList.toggle('tab-nav__item--active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    // Mostra novo painel
    const nextPanel = $(PANELS[tabName]);
    if (nextPanel) {
      nextPanel.hidden = false;
      // rAF garante que hidden=false seja aplicado antes da transição CSS
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          nextPanel.classList.add('panel--active');
        });
      });
    }

    _active = tabName;

    // Renderiza conteúdo específico da aba
    _onTabActivated(tabName);
  }

  /** Ações pós-ativação de cada aba. */
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
    }
  }

  return { switchTo };
})();

/* ─────────────────────────────────────────
   FORMULÁRIO DE EVENTO
───────────────────────────────────────── */
const EventForm = (() => {
  let _editingId = null;

  /** Popula e abre o modal de evento. */
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

  /** Lê e valida os campos do formulário. */
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

  /** Salva o evento e fecha o modal. */
  function save() {
    const data = _read();
    if (!data) return;

    Storage.saveEvent(data);
    Modals.close('modal-event');
    Toast.show(_editingId ? 'Evento atualizado.' : 'Evento salvo.', 'success');

    // Atualiza views
    Calendar.renderCalendar();
    Calendar.renderDayEvents(Calendar.getSelectedDate());
  }

  /** Exclui o evento em edição. */
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

  /** Popula e abre o modal de escala. */
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

    // Weekday picker
    document.querySelectorAll('.weekday-btn').forEach(btn => {
      const day = Number(btn.dataset.day);
      btn.classList.toggle('weekday-btn--active', _activeDays.has(day));
    });

    _updateTypeOptions($('scale-type').value);
    Modals.open('modal-scale');
  }

  /** Exibe/oculta opções conforme o tipo selecionado. */
  function _updateTypeOptions(type) {
    $('scale-weekly-opts').hidden  = type === 'cyclic';
    $('scale-cyclic-opts').hidden  = type !== 'cyclic';
  }

  /** Toggle de um dia no weekday picker. */
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

  /** Lê e valida os campos. */
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

  /** Salva e fecha. */
  function save() {
    const data = _read();
    if (!data) return;

    Storage.saveScale(data);
    Modals.close('modal-scale');
    Toast.show(_editingId ? 'Escala atualizada.' : 'Escala salva.', 'success');

    Calendar.renderCalendar();
    Calendar.renderScales();
  }

  /** Exclui a escala em edição. */
  function remove() {
    if (!_editingId) return;
    if (!confirm('Excluir esta escala? Os plantões gerados também serão removidos.')) return;

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

  // Estado de carregamento
  btn?.classList.add('icon-btn--spinning');
  if (dot)  dot.className   = 'sync-dot sync-dot--loading';
  if (text) text.textContent = 'Sincronizando…';

  const result = await Storage.syncToSheets();

  btn?.classList.remove('icon-btn--spinning');

  if (result.ok) {
    Toast.show(result.message, 'success');
    if (dot)  dot.className   = 'sync-dot sync-dot--ok';
    if (text) {
      const d   = new Date(result.syncedAt);
      const fmt = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      text.textContent = `Sincronizado às ${fmt}`;
    }
  } else {
    Toast.show(result.message, 'error', 4000);
    if (dot)  dot.className   = 'sync-dot sync-dot--error';
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

  // ── Abas ──
  document.querySelectorAll('.tab-nav__item').forEach(btn => {
    btn.addEventListener('click', () => Tabs.switchTo(btn.dataset.tab));
  });

  // ── Navegação de mês ──
  $('btn-prev-month')?.addEventListener('click', () => {
    Calendar.prevMonth();
    Calendar.renderDayEvents(Calendar.getSelectedDate());
  });
  $('btn-next-month')?.addEventListener('click', () => {
    Calendar.nextMonth();
    Calendar.renderDayEvents(Calendar.getSelectedDate());
  });

  // ── Botão principal + (novo evento) ──
  $('btn-add')?.addEventListener('click', () => {
    EventForm.open(DateUtils.toISOString(Calendar.getSelectedDate()));
  });

  // ── Botão nova escala ──
  $('btn-add-scale')?.addEventListener('click', () => ScaleForm.open());

  // ── Formulário de Evento ──
  $('btn-save-event')?.addEventListener('click',   () => EventForm.save());
  $('btn-delete-event')?.addEventListener('click', () => EventForm.remove());

  // ── Formulário de Escala ──
  $('btn-save-scale')?.addEventListener('click',   () => ScaleForm.save());
  $('btn-delete-scale')?.addEventListener('click', () => ScaleForm.remove());

  // Tipo de escala → mostra/oculta opções
  $('scale-type')?.addEventListener('change', e => {
    ScaleForm.updateTypeOptions(e.target.value);
  });

  // Weekday picker
  document.querySelectorAll('.weekday-btn').forEach(btn => {
    btn.addEventListener('click', () => ScaleForm.toggleDay(Number(btn.dataset.day)));
  });

  // ── Fechar modais (backdrop ou botão X) ──
  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => Modals.closeAll());
  });

  // Fechar com Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') Modals.closeAll();
  });

  // ── Sync ──
  $('btn-sync')?.addEventListener('click', _handleSync);
  $('btn-test-connection')?.addEventListener('click', _handleTestConnection);

  // ── Eventos customizados (disparados pelo Calendar) ──
  document.addEventListener('app:edit-event', e => {
    EventForm.open(null, e.detail);
  });

  document.addEventListener('app:edit-scale', e => {
    ScaleForm.open(e.detail);
  });

  // ── Swipe para fechar modal (touch) ──
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
      // Só ativa swipe se o scroll do sheet estiver no topo
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
  // 1. Registra listeners de UI
  _bindEvents();

  // 2. Render inicial do calendário
  Calendar.onDaySelect(date => {
    // Callback vazio — renderDayEvents já é chamado internamente
  });
  Calendar.renderCalendar();
  Calendar.renderDayEvents(DateUtils.today());

  // 3. Service Worker
  _registerServiceWorker();

  // 4. Remove classe de loading se existir (para splash screens)
  document.body.classList.remove('loading');

  console.info('[App] Escalas inicializado.');
}

/* ─────────────────────────────────────────
   ENTRY POINT
───────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}