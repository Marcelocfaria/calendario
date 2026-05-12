/* ═══════════════════════════════════════════════════════════
   UTILS.JS — Funções puras para manipulação de datas
   Todas as funções evitam UTC drift operando em tempo LOCAL.
   Zero dependências externas. Zero efeitos colaterais.
═══════════════════════════════════════════════════════════ */

'use strict';

const DateUtils = (() => {

  /* ─────────────────────────────────────────
     CONSTANTES
  ───────────────────────────────────────── */
  const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const WEEKDAYS_LONG  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const MONTHS_LONG    = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  const MONTHS_SHORT   = [
    'Jan','Fev','Mar','Abr','Mai','Jun',
    'Jul','Ago','Set','Out','Nov','Dez'
  ];
  const MS_PER_DAY = 86_400_000;

  /* ─────────────────────────────────────────
     CONSTRUTORES SEGUROS (sem UTC drift)
     Usar SEMPRE new Date(y, m, d) localmente,
     nunca new Date('YYYY-MM-DD') que assume UTC.
  ───────────────────────────────────────── */

  /**
   * Cria um Date local a partir de uma string 'YYYY-MM-DD'.
   * Evita o drift de +/-1 dia causado pelo parse UTC nativo.
   * @param {string} str — 'YYYY-MM-DD'
   * @returns {Date}
   */
  function fromISOString(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const [y, m, d] = parts;
    return new Date(y, m - 1, d);
  }

  /**
   * Converte um Date local para string 'YYYY-MM-DD'.
   * Usa componentes locais, nunca toISOString() (UTC).
   * @param {Date} date
   * @returns {string}
   */
  function toISOString(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Retorna um Date representando hoje à meia-noite local.
   * @returns {Date}
   */
  function today() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /**
   * Clona um Date e zera o horário (meia-noite local).
   * @param {Date} date
   * @returns {Date}
   */
  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  /* ─────────────────────────────────────────
     NAVEGAÇÃO DE MÊS
  ───────────────────────────────────────── */

  /**
   * Primeiro dia do mês de uma data.
   * @param {Date} date
   * @returns {Date}
   */
  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /**
   * Último dia do mês de uma data.
   * @param {Date} date
   * @returns {Date}
   */
  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  /**
   * Total de dias em um mês.
   * @param {number} year
   * @param {number} month — 0-indexed
   * @returns {number}
   */
  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  /**
   * Avança N meses a partir de uma data, preservando o dia 1.
   * @param {Date} date
   * @param {number} n — pode ser negativo
   * @returns {Date}
   */
  function addMonths(date, n) {
    return new Date(date.getFullYear(), date.getMonth() + n, 1);
  }

  /**
   * Avança N dias a partir de uma data.
   * @param {Date} date
   * @param {number} n — pode ser negativo
   * @returns {Date}
   */
  function addDays(date, n) {
    const result = startOfDay(date);
    result.setDate(result.getDate() + n);
    return result;
  }

  /* ─────────────────────────────────────────
     COMPARAÇÕES (baseadas em tempo local)
  ───────────────────────────────────────── */

  /**
   * Verifica se dois Date representam o mesmo dia local.
   * @param {Date} a
   * @param {Date} b
   * @returns {boolean}
   */
  function isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth()    === b.getMonth()    &&
      a.getDate()     === b.getDate()
    );
  }

  /**
   * Verifica se dois Date estão no mesmo mês/ano.
   * @param {Date} a
   * @param {Date} b
   * @returns {boolean}
   */
  function isSameMonth(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth()    === b.getMonth()
    );
  }

  /**
   * Verifica se a data é hoje.
   * @param {Date} date
   * @returns {boolean}
   */
  function isToday(date) {
    return isSameDay(date, today());
  }

  /**
   * Verifica se date está dentro do intervalo [start, end] (inclusive).
   * @param {Date} date
   * @param {Date} start
   * @param {Date} end
   * @returns {boolean}
   */
  function isInRange(date, start, end) {
    const d = startOfDay(date).getTime();
    return d >= startOfDay(start).getTime() && d <= startOfDay(end).getTime();
  }

  /**
   * Diferença em dias inteiros entre dois Date (b - a).
   * @param {Date} a
   * @param {Date} b
   * @returns {number}
   */
  function diffDays(a, b) {
    return Math.round(
      (startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY
    );
  }

  /* ─────────────────────────────────────────
     FORMATAÇÃO
  ───────────────────────────────────────── */

  /**
   * Formata como "Março 2025" (para o navegador de mês).
   * @param {Date} date
   * @returns {object} { month: string, year: string }
   */
  function formatMonthYear(date) {
    return {
      month: MONTHS_LONG[date.getMonth()],
      year:  String(date.getFullYear()),
    };
  }

  /**
   * Formata como "15 de março" (para cabeçalho de dia selecionado).
   * @param {Date} date
   * @returns {string}
   */
  function formatDayMonth(date) {
    return `${date.getDate()} de ${MONTHS_LONG[date.getMonth()].toLowerCase()}`;
  }

  /**
   * Formata como "Seg, 15 Mar" (para lista mensal).
   * @param {Date} date
   * @returns {string}
   */
  function formatShort(date) {
    const wd  = WEEKDAYS_SHORT[date.getDay()];
    const mon = MONTHS_SHORT[date.getMonth()];
    return `${wd}, ${date.getDate()} ${mon}`;
  }

  /**
   * Retorna o nome curto do dia da semana.
   * @param {Date} date
   * @returns {string}
   */
  function getWeekdayShort(date) {
    return WEEKDAYS_SHORT[date.getDay()];
  }

  /**
   * Retorna o nome longo do dia da semana.
   * @param {Date} date
   * @returns {string}
   */
  function getWeekdayLong(date) {
    return WEEKDAYS_LONG[date.getDay()];
  }

  /**
   * Calcula a duração entre dois horários 'HH:MM' em horas decimais.
   * Suporta virada de meia-noite (ex: 19:00 → 07:00 = 12h).
   * @param {string} start — 'HH:MM'
   * @param {string} end   — 'HH:MM'
   * @returns {number} horas (ex: 12.0, 6.5)
   */
  function calcHours(start, end) {
    if (!start || !end) return 0;
    const toMin = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    let diff = toMin(end) - toMin(start);
    if (diff <= 0) diff += 1440; // virada de meia-noite
    return Math.round((diff / 60) * 10) / 10;
  }

  /**
   * Formata horas decimais como "12h" ou "6h30".
   * @param {number} hours
   * @returns {string}
   */
  function formatHours(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }

  /* ─────────────────────────────────────────
     GERAÇÃO DE CÉLULAS DO CALENDÁRIO
  ───────────────────────────────────────── */

  /**
   * Gera o array de dias para renderizar a grade do calendário.
   * Preenche com dias do mês anterior e seguinte para completar
   * as semanas (sempre 6 linhas × 7 colunas = 42 células).
   *
   * @param {number} year
   * @param {number} month — 0-indexed
   * @returns {Array<{ date: Date, isCurrentMonth: boolean }>}
   */
  function buildCalendarCells(year, month) {
    const cells = [];
    const firstDay   = new Date(year, month, 1);
    const lastDay    = new Date(year, month + 1, 0);
    const startPad   = firstDay.getDay();       // 0 = Dom
    const totalCells = 42;                      // 6 semanas fixas

    // Dias do mês anterior (padding inicial)
    for (let i = startPad - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month, -i),
        isCurrentMonth: false,
      });
    }

    // Dias do mês atual
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells.push({
        date: new Date(year, month, d),
        isCurrentMonth: true,
      });
    }

    // Dias do mês seguinte (padding final)
    const remaining = totalCells - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        date: new Date(year, month + 1, d),
        isCurrentMonth: false,
      });
    }

    return cells;
  }

  /* ─────────────────────────────────────────
     CÁLCULO DE ESCALAS
  ───────────────────────────────────────── */

  /**
   * Dado uma escala semanal, verifica se uma data cai num dia ativo.
   * @param {Date}     date
   * @param {number[]} activeDays — array de 0-6 (0=Dom)
   * @returns {boolean}
   */
  function isWeeklyShiftDay(date, activeDays) {
    return activeDays.includes(date.getDay());
  }

  /**
   * Dado uma escala quinzenal, verifica se uma data é dia de serviço.
   * Usa semanas pares/ímpares baseadas na startDate.
   * @param {Date}     date
   * @param {Date}     startDate
   * @param {number[]} activeDays — dias da semana ativos
   * @returns {boolean}
   */
  function isBiweeklyShiftDay(date, startDate, activeDays) {
    if (!activeDays.includes(date.getDay())) return false;
    const weeksSinceStart = Math.floor(diffDays(startDate, date) / 7);
    return weeksSinceStart % 2 === 0;
  }

  /**
   * Dado uma escala cíclica (ex: 1 trabalha / 1 folga),
   * verifica se uma data é dia de serviço.
   * @param {Date}   date
   * @param {Date}   startDate
   * @param {number} workDays — dias consecutivos trabalhando
   * @param {number} offDays  — dias consecutivos de folga
   * @returns {boolean}
   */
  function isCyclicShiftDay(date, startDate, workDays, offDays) {
    const diff = diffDays(startDate, date);
    if (diff < 0) return false;
    const cycleLen = workDays + offDays;
    return (diff % cycleLen) < workDays;
  }

  /**
   * Verifica se uma escala está ativa em uma data específica.
   * Despacha para a função correta com base no tipo da escala.
   * @param {object} scale — objeto de escala do storage
   * @param {Date}   date
   * @returns {boolean}
   */
  function isScaleActiveOn(scale, date) {
    const start = fromISOString(scale.startDate);
    const end   = scale.endDate ? fromISOString(scale.endDate) : null;

    if (!start) return false;
    if (startOfDay(date).getTime() < startOfDay(start).getTime()) return false;
    if (end && startOfDay(date).getTime() > startOfDay(end).getTime()) return false;

    switch (scale.type) {
      case 'weekly':
        return isWeeklyShiftDay(date, scale.activeDays ?? []);

      case 'biweekly':
        return isBiweeklyShiftDay(date, start, scale.activeDays ?? []);

      case 'cyclic':
        return isCyclicShiftDay(
          date,
          start,
          scale.workDays ?? 1,
          scale.offDays  ?? 1
        );

      default:
        return false;
    }
  }

  /**
   * Gera eventos sintéticos de escala para um mês inteiro.
   * Retorna um array de objetos compatíveis com eventos manuais.
   * @param {object} scale
   * @param {number} year
   * @param {number} month — 0-indexed
   * @returns {Array<object>}
   */
  function generateScaleEvents(scale, year, month) {
    const events = [];
    const total  = daysInMonth(year, month);

    for (let d = 1; d <= total; d++) {
      const date = new Date(year, month, d);
      if (isScaleActiveOn(scale, date)) {
        events.push({
          id:        `scale_${scale.id}_${toISOString(date)}`,
          title:     scale.name,
          date:      toISOString(date),
          type:      'shift',
          startTime: scale.shiftStart ?? '07:00',
          endTime:   scale.shiftEnd   ?? '19:00',
          notes:     '',
          fromScale: true,
          scaleId:   scale.id,
        });
      }
    }

    return events;
  }

  /* ─────────────────────────────────────────
     UTILITÁRIOS GERAIS
  ───────────────────────────────────────── */

  /**
   * Gera um ID único baseado em timestamp + random.
   * @returns {string}
   */
  function generateId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Clamp: retorna value dentro de [min, max].
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Debounce: adia a execução de fn por `delay` ms.
   * @param {Function} fn
   * @param {number}   delay
   * @returns {Function}
   */
  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /* ─────────────────────────────────────────
     API PÚBLICA
  ───────────────────────────────────────── */
  return Object.freeze({
    // Constantes
    WEEKDAYS_SHORT,
    WEEKDAYS_LONG,
    MONTHS_LONG,
    MONTHS_SHORT,

    // Construtores
    fromISOString,
    toISOString,
    today,
    startOfDay,

    // Navegação
    startOfMonth,
    endOfMonth,
    daysInMonth,
    addMonths,
    addDays,

    // Comparações
    isSameDay,
    isSameMonth,
    isToday,
    isInRange,
    diffDays,

    // Formatação
    formatMonthYear,
    formatDayMonth,
    formatShort,
    getWeekdayShort,
    getWeekdayLong,
    calcHours,
    formatHours,

    // Calendário
    buildCalendarCells,

    // Escalas
    isScaleActiveOn,
    generateScaleEvents,

    // Utilitários
    generateId,
    clamp,
    debounce,
  });

})();