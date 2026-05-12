/* ═══════════════════════════════════════════════════════════
   CALENDAR.JS — Renderização e Lógica de Escalas
   Responsabilidades:
   · Renderizar a grade do calendário (com dots de eventos)
   · Renderizar a lista de eventos de um dia selecionado
   · Renderizar a lista de escalas cadastradas
   · Gerar o resumo mensal (stats + lista)
   Dependências: DateUtils, Storage (globals de utils.js / storage.js)
═══════════════════════════════════════════════════════════ */

'use strict';

const Calendar = (() => {

  /* ─────────────────────────────────────────
     ESTADO INTERNO DO MÓDULO
  ───────────────────────────────────────── */
  let _currentDate   = DateUtils.today();   // mês sendo exibido
  let _selectedDate  = DateUtils.today();   // dia selecionado
  let _onDaySelect   = null;                // callback externo ao selecionar dia

  /* ─────────────────────────────────────────
     REFERÊNCIAS AO DOM
  ───────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  const DOM = {
    get grid()        { return $('calendar-grid');    },
    get monthName()   { return $('month-name');       },
    get yearName()    { return $('year-name');        },
    get dayEvents()   { return $('day-events');       },
    get scalesList()  { return $('scales-list');      },
    get statShifts()  { return $('stat-shifts');      },
    get statHours()   { return $('stat-hours');       },
    get statFree()    { return $('stat-free');        },
    get statNext()    { return $('stat-next');        },
    get summaryMonth(){ return $('summary-month-label'); },
    get monthlyList() { return $('monthly-events-list'); },
  };

  /* ─────────────────────────────────────────
     HELPERS INTERNOS
  ───────────────────────────────────────── */

  /**
   * Coleta todos os eventos de um dia:
   * eventos manuais + eventos gerados por escalas.
   * @param {Date} date
   * @returns {object[]}
   */
  function _getEventsForDay(date) {
    const iso    = DateUtils.toISOString(date);
    const manual = Storage.getEventsByDate(iso);
    const scales = Storage.getScales();

    const scaleEvents = scales.flatMap(scale => {
      if (!DateUtils.isScaleActiveOn(scale, date)) return [];
      // Evita duplicar se o usuário também criou evento manual para esse dia/escala
      const alreadyManual = manual.some(
        e => e.fromScale && e.scaleId === scale.id && e.date === iso
      );
      if (alreadyManual) return [];
      return [{
        id:        `scale_${scale.id}_${iso}`,
        title:     scale.name,
        date:      iso,
        type:      'shift',
        startTime: scale.shiftStart ?? '07:00',
        endTime:   scale.shiftEnd   ?? '19:00',
        notes:     '',
        fromScale: true,
        scaleId:   scale.id,
      }];
    });

    return [...manual, ...scaleEvents].sort((a, b) =>
      (a.startTime ?? '').localeCompare(b.startTime ?? '')
    );
  }

  /**
   * Coleta todos os eventos de um mês inteiro
   * (manuais + gerados por escalas), sem duplicatas.
   * @param {number} year
   * @param {number} month — 0-indexed
   * @returns {object[]}
   */
  function _getEventsForMonth(year, month) {
    const days  = DateUtils.daysInMonth(year, month);
    const all   = [];
    const seen  = new Set();

    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d);
      _getEventsForDay(date).forEach(ev => {
        if (!seen.has(ev.id)) {
          seen.add(ev.id);
          all.push(ev);
        }
      });
    }

    return all.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  }

  /**
   * Cria o HTML de um dot de evento.
   * @param {string} type
   * @returns {string}
   */
  function _dotHTML(type) {
    return `<span class="calendar__dot calendar__dot--${type}" aria-hidden="true"></span>`;
  }

  /**
   * Retorna os dots únicos (máx 3) para exibir numa célula.
   * @param {object[]} events
   * @returns {string} HTML
   */
  function _buildDotsHTML(events) {
    if (!events.length) return '';
    // Deduplicar tipos para no máx 3 dots
    const types = [...new Set(events.map(e => e.type))].slice(0, 3);
    return `<div class="calendar__day-dots">${types.map(_dotHTML).join('')}</div>`;
  }

  /* ─────────────────────────────────────────
     RENDERIZAÇÃO — GRADE DO CALENDÁRIO
  ───────────────────────────────────────── */

  /**
   * Renderiza o cabeçalho (mês/ano) e a grade de dias.
   * Chamada a cada troca de mês ou atualização de dados.
   */
  function renderCalendar() {
    const { month, year } = {
      month: _currentDate.getMonth(),
      year:  _currentDate.getFullYear(),
    };

    // Atualiza cabeçalho
    const { month: mLabel, year: yLabel } = DateUtils.formatMonthYear(_currentDate);
    DOM.monthName.textContent = mLabel;
    DOM.yearName.textContent  = yLabel;

    // Busca eventos do mês para marcação rápida
    const monthEvents = Storage.getEventsByMonth(year, month);
    const scales      = Storage.getScales();

    // Mapa: 'YYYY-MM-DD' → events[]
    const eventMap = new Map();
    monthEvents.forEach(ev => {
      if (!eventMap.has(ev.date)) eventMap.set(ev.date, []);
      eventMap.get(ev.date).push(ev);
    });

    // Células do calendário
    const cells = DateUtils.buildCalendarCells(year, month);
    const frag  = document.createDocumentFragment();

    cells.forEach(({ date, isCurrentMonth }) => {
      const iso     = DateUtils.toISOString(date);
      const isToday = DateUtils.isToday(date);
      const isSel   = DateUtils.isSameDay(date, _selectedDate);

      // Eventos manuais + escala ativa
      const manualEvents = eventMap.get(iso) ?? [];
      const hasScale = isCurrentMonth && scales.some(s => DateUtils.isScaleActiveOn(s, date));

      // Agrupa dots (manual + scale sintético)
      const allDots = [...manualEvents];
      if (hasScale && !allDots.some(e => e.fromScale)) {
        allDots.push({ type: 'shift' }); // dot sintético para escala
      }

      // Classes CSS
      const classes = ['calendar__day'];
      if (!isCurrentMonth) classes.push('calendar__day--other-month');
      if (isToday)         classes.push('calendar__day--today');
      if (isSel)           classes.push('calendar__day--selected');
      if (hasScale && !isSel) classes.push('calendar__day--has-scale');

      // Elemento
      const cell = document.createElement('div');
      cell.className = classes.join(' ');
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', DateUtils.formatShort(date));
      cell.setAttribute('aria-selected', isSel ? 'true' : 'false');
      cell.setAttribute('tabindex', isCurrentMonth ? '0' : '-1');
      cell.dataset.date = iso;

      cell.innerHTML = `
        <span class="calendar__day-num">${date.getDate()}</span>
        ${_buildDotsHTML(allDots)}
      `;

      // Evento de clique (somente dias do mês atual)
      if (isCurrentMonth) {
        cell.addEventListener('click',   () => _handleDayClick(date, iso));
        cell.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            _handleDayClick(date, iso);
          }
        });
      }

      frag.appendChild(cell);
    });

    DOM.grid.innerHTML = '';
    DOM.grid.appendChild(frag);
  }

  /**
   * Handler ao selecionar um dia.
   * Atualiza estado, re-renderiza e dispara callback.
   */
  function _handleDayClick(date, iso) {
    _selectedDate = date;
    // Atualiza classes sem re-renderizar tudo
    DOM.grid.querySelectorAll('.calendar__day').forEach(cell => {
      const isThis = cell.dataset.date === iso;
      cell.classList.toggle('calendar__day--selected', isThis);
      cell.setAttribute('aria-selected', isThis ? 'true' : 'false');
      // Restaura cor de scale-bg se saiu da seleção
      if (!isThis) {
        const cellDate = DateUtils.fromISOString(cell.dataset.date);
        const hasScale = Storage.getScales().some(s => DateUtils.isScaleActiveOn(s, cellDate));
        cell.classList.toggle('calendar__day--has-scale', hasScale);
      } else {
        cell.classList.remove('calendar__day--has-scale');
      }
    });

    renderDayEvents(date);
    if (typeof _onDaySelect === 'function') _onDaySelect(date);
  }

  /* ─────────────────────────────────────────
     RENDERIZAÇÃO — EVENTOS DO DIA
  ───────────────────────────────────────── */

  /**
   * Renderiza a lista de eventos abaixo do calendário.
   * @param {Date} date
   */
  function renderDayEvents(date) {
    const events = _getEventsForDay(date);
    const iso    = DateUtils.toISOString(date);
    const container = DOM.dayEvents;

    if (!events.length) {
      container.innerHTML = `
        <div class="day-events__header">
          <span class="day-events__date">${DateUtils.formatDayMonth(date)}</span>
          <span class="day-events__weekday">${DateUtils.getWeekdayLong(date)}</span>
        </div>
        <p class="day-events__empty">Nenhum evento neste dia.</p>
      `;
      return;
    }

    const itemsHTML = events.map(ev => _eventItemHTML(ev)).join('');
    container.innerHTML = `
      <div class="day-events__header">
        <span class="day-events__date">${DateUtils.formatDayMonth(date)}</span>
        <span class="day-events__weekday">${DateUtils.getWeekdayLong(date)}</span>
      </div>
      ${itemsHTML}
    `;

    // Delega cliques para edição
    container.querySelectorAll('.event-item').forEach(item => {
      item.addEventListener('click', () => {
        const eventId = item.dataset.eventId;
        const ev = Storage.getEvents().find(e => e.id === eventId);
        if (ev && !ev.fromScale) {
          // Dispara evento customizado que main.js vai capturar
          document.dispatchEvent(new CustomEvent('app:edit-event', { detail: ev }));
        }
      });
    });
  }

  /**
   * Gera o HTML de um item de evento.
   * @param {object} ev
   * @returns {string}
   */
  function _eventItemHTML(ev) {
    const timeLabel = (ev.startTime && ev.endTime)
      ? `${ev.startTime} – ${ev.endTime}`
      : ev.startTime ?? '';
    const badge = ev.fromScale
      ? `<span class="event-item__source-badge">Escala</span>`
      : '';
    return `
      <div
        class="event-item"
        data-event-id="${ev.id}"
        role="button"
        tabindex="${ev.fromScale ? '-1' : '0'}"
        aria-label="${ev.title}, ${timeLabel}"
      >
        <div class="event-item__stripe event-item__stripe--${ev.type}"></div>
        <div class="event-item__body">
          <div class="event-item__title">${_escapeHTML(ev.title)}</div>
          ${timeLabel ? `<div class="event-item__time">${timeLabel}</div>` : ''}
        </div>
        ${badge}
      </div>
    `;
  }

  /* ─────────────────────────────────────────
     RENDERIZAÇÃO — LISTA DE ESCALAS
  ───────────────────────────────────────── */

  /** Renderiza os cards de escalas na aba "Escalas". */
  function renderScales() {
    const scales    = Storage.getScales();
    const container = DOM.scalesList;

    if (!scales.length) {
      container.innerHTML = `<p class="empty-state">Nenhuma escala cadastrada.</p>`;
      return;
    }

    const typeLabels = {
      weekly:   'Semanal',
      biweekly: 'Quinzenal',
      cyclic:   'Cíclica',
    };

    const iconMap = {
      weekly:   '◷',
      biweekly: '◑',
      cyclic:   '↻',
    };

    container.innerHTML = scales.map(scale => `
      <div
        class="scale-card"
        data-scale-id="${scale.id}"
        role="button"
        tabindex="0"
        aria-label="Editar escala ${_escapeHTML(scale.name)}"
      >
        <div class="scale-card__icon" aria-hidden="true">${iconMap[scale.type] ?? '◈'}</div>
        <div class="scale-card__body">
          <div class="scale-card__name">${_escapeHTML(scale.name)}</div>
          <div class="scale-card__meta">
            ${typeLabels[scale.type] ?? scale.type}
            · ${scale.shiftStart ?? '07:00'} – ${scale.shiftEnd ?? '19:00'}
            · desde ${_formatStartDate(scale.startDate)}
          </div>
        </div>
        <svg class="scale-card__chevron" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    `).join('');

    // Delega cliques para edição
    container.querySelectorAll('.scale-card').forEach(card => {
      const open = () => {
        const scale = Storage.getScaleById(card.dataset.scaleId);
        if (scale) {
          document.dispatchEvent(new CustomEvent('app:edit-scale', { detail: scale }));
        }
      };
      card.addEventListener('click',   open);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  /**
   * Formata a data de início de uma escala para exibição.
   */
  function _formatStartDate(iso) {
    if (!iso) return '—';
    const d = DateUtils.fromISOString(iso);
    return d ? DateUtils.formatShort(d) : iso;
  }

  /* ─────────────────────────────────────────
     RENDERIZAÇÃO — RESUMO MENSAL
  ───────────────────────────────────────── */

  /**
   * Calcula e renderiza o painel de Resumo para o mês atual.
   * @param {number} [year]
   * @param {number} [month] — 0-indexed
   */
  function renderSummary(year, month) {
    const y = year  ?? _currentDate.getFullYear();
    const m = month ?? _currentDate.getMonth();

    const events = _getEventsForMonth(y, m);

    // ── Estatísticas ──
    const shifts = events.filter(e => e.type === 'shift');
    const totalShifts = shifts.length;

    const totalHours = shifts.reduce((acc, ev) => {
      return acc + DateUtils.calcHours(ev.startTime ?? '07:00', ev.endTime ?? '19:00');
    }, 0);

    const workDays = new Set(shifts.map(e => e.date)).size;
    const freeDays = DateUtils.daysInMonth(y, m) - workDays;

    // Próximo plantão a partir de hoje
    const todayISO = DateUtils.toISOString(DateUtils.today());
    const nextShift = shifts.find(e => e.date >= todayISO);

    // Atualiza DOM das stats
    DOM.statShifts.textContent = totalShifts || '0';
    DOM.statHours.textContent  = totalHours  ? DateUtils.formatHours(totalHours) : '0h';
    DOM.statFree.textContent   = freeDays >= 0 ? String(freeDays) : '—';
    DOM.statNext.textContent   = nextShift
      ? DateUtils.formatShort(DateUtils.fromISOString(nextShift.date))
      : 'Nenhum';

    // Rótulo do mês
    const { month: mLabel, year: yLabel } = DateUtils.formatMonthYear(new Date(y, m, 1));
    if (DOM.summaryMonth) {
      DOM.summaryMonth.textContent = `${mLabel} ${yLabel}`;
    }

    // ── Lista mensal ──
    if (!events.length) {
      DOM.monthlyList.innerHTML = `<p class="empty-state">Sem eventos em ${mLabel.toLowerCase()}.</p>`;
      return;
    }

    DOM.monthlyList.innerHTML = events.map(ev => {
      const d = DateUtils.fromISOString(ev.date);
      const timeLabel = (ev.startTime && ev.endTime)
        ? `${ev.startTime}–${ev.endTime}`
        : '';
      return `
        <div class="monthly-event-row">
          <div>
            <div class="monthly-event-row__date">${d.getDate()}</div>
            <div class="monthly-event-row__weekday">${DateUtils.getWeekdayShort(d)}</div>
          </div>
          <div class="monthly-event-row__title">${_escapeHTML(ev.title)}</div>
          ${timeLabel ? `<div class="monthly-event-row__time">${timeLabel}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  /* ─────────────────────────────────────────
     NAVEGAÇÃO DE MÊS
  ───────────────────────────────────────── */

  /** Avança um mês. */
  function nextMonth() {
    _currentDate = DateUtils.addMonths(_currentDate, 1);
    renderCalendar();
  }

  /** Retrocede um mês. */
  function prevMonth() {
    _currentDate = DateUtils.addMonths(_currentDate, -1);
    renderCalendar();
  }

  /** Vai para o mês/ano específico. */
  function goToMonth(year, month) {
    _currentDate = new Date(year, month, 1);
    renderCalendar();
  }

  /* ─────────────────────────────────────────
     UTILITÁRIO
  ───────────────────────────────────────── */

  /** Escape básico de HTML para prevenir XSS. */
  function _escapeHTML(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /* ─────────────────────────────────────────
     INICIALIZAÇÃO
  ───────────────────────────────────────── */

  /** Configura o callback chamado ao selecionar um dia. */
  function onDaySelect(cb) {
    _onDaySelect = cb;
  }

  /** Getters de estado */
  function getCurrentDate()  { return _currentDate;  }
  function getSelectedDate() { return _selectedDate; }

  /* ─────────────────────────────────────────
     API PÚBLICA
  ───────────────────────────────────────── */
  return Object.freeze({
    // Render
    renderCalendar,
    renderDayEvents,
    renderScales,
    renderSummary,

    // Navegação
    nextMonth,
    prevMonth,
    goToMonth,

    // Estado
    onDaySelect,
    getCurrentDate,
    getSelectedDate,
  });

})();
