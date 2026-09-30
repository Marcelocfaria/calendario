/* ═══════════════════════════════════════════════════════════
   FINANCE.JS — Aba Financeiro (serviços voluntários)
   Total do mês = base + (serviços voluntários × valor por serviço)
   O valor cai N meses depois do mês de referência.
   Dependências: DateUtils, Storage, Modals, Toast (globals)
═══════════════════════════════════════════════════════════ */

'use strict';

const Finance = (() => {

  const $ = id => document.getElementById(id);
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const MONTHS = DateUtils.MONTHS_LONG;

  let _ref = DateUtils.startOfMonth(DateUtils.today());

  const _ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const _payLabel = d => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const _badge = ok => ok
    ? '<span class="fin-badge fin-badge--ok">Recebido</span>'
    : '<span class="fin-badge fin-badge--pending">A receber</span>';

  /* ── Configuração ── */
  function getConfig() {
    const s = Storage.getSettings();
    const num = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v))) ? d : Number(v);
    return {
      rate: num(s.voluntaryRate, 550),
      base: num(s.baseAmount, 9350),
      lag:  Math.max(0, Math.round(num(s.payLagMonths, 2))),
    };
  }

  /* ── Cálculo de um mês ── */
  function calcMonth(year, month, cfg = getConfig()) {
    const services = Storage.getEventsByMonth(year, month)
      .filter(e => e.type === 'voluntary')
      .sort((a, b) => a.date.localeCompare(b.date));

    const count = services.length;
    const hours = services.reduce((acc, e) => acc + DateUtils.calcHours(e.startTime, e.endTime), 0);
    const extra = count * cfg.rate;
    const payDate = new Date(year, month + cfg.lag, 1);
    const now = DateUtils.today();
    const received = payDate <= new Date(now.getFullYear(), now.getMonth(), 1);

    return { year, month, count, hours, extra, base: cfg.base, total: cfg.base + extra, payDate, received, services };
  }

  /* ── Linhas para o Google Sheets (12 meses atrás até 3 à frente) ── */
  function buildSyncRows(monthsBack = 12, monthsAhead = 3) {
    const cfg = getConfig();
    const now = DateUtils.today();
    const rows = [];
    for (let i = monthsBack; i >= -monthsAhead; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const r = calcMonth(d.getFullYear(), d.getMonth(), cfg);
      rows.push({
        referencia:      _ym(d),
        servicos:        r.count,
        horas:           r.hours,
        valorPorServico: cfg.rate,
        valorVoluntario: r.extra,
        valorBase:       r.base,
        total:           r.total,
        mesPagamento:    _ym(r.payDate),
        status:          r.received ? 'Recebido' : 'A receber',
      });
    }
    return rows;
  }

  /* ── Renderização ── */
  function render() {
    const cfg = getConfig();
    const y = _ref.getFullYear();
    const m = _ref.getMonth();
    const cur = calcMonth(y, m, cfg);

    $('fin-month-name').textContent = MONTHS[m];
    $('fin-year-name').textContent  = y;

    const months = Array.from({ length: 12 }, (_, i) => calcMonth(y, i, cfg));
    const yearServices = months.reduce((a, r) => a + r.count, 0);
    const yearExtra    = months.reduce((a, r) => a + r.extra, 0);
    const best = months.reduce((b, r) => r.count > b.count ? r : b, months[0]);

    // Em trânsito: meses já trabalhados que ainda não caíram
    const now = DateUtils.today();
    const pending = [];
    for (let k = cfg.lag - 1; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      pending.push(calcMonth(d.getFullYear(), d.getMonth(), cfg));
    }
    const pendingTotal = pending.reduce((a, r) => a + r.total, 0);
    const next = pending[0];

    // Histórico: 6 meses até o mês de referência
    const history = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - i, 1);
      history.push(calcMonth(d.getFullYear(), d.getMonth(), cfg));
    }
    const maxCount = Math.max(1, ...history.map(r => r.count));

    const days = cur.services
      .map(e => `<span class="fin-chip">${DateUtils.fromISOString(e.date).getDate()}</span>`).join('');

    $('finance-content').innerHTML = `
      <div class="fin-hero">
        <span class="fin-hero__label">Total de ${MONTHS[m].toLowerCase()} ${_badge(cur.received)}</span>
        <span class="fin-hero__value">${BRL.format(cur.total)}</span>
        <span class="fin-hero__sub">Cai em <strong>${_payLabel(cur.payDate)}</strong></span>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><span class="stat-card__label">Serviços voluntários</span><span class="stat-card__value">${cur.count}</span></div>
        <div class="stat-card"><span class="stat-card__label">Horas</span><span class="stat-card__value">${cur.hours ? DateUtils.formatHours(cur.hours) : '0h'}</span></div>
      </div>

      <div class="fin-card">
        <h3 class="fin-card__title">Composição</h3>
        <div class="fin-line"><span>Base fixa</span><span>${BRL.format(cur.base)}</span></div>
        <div class="fin-line"><span>${cur.count} × ${BRL.format(cfg.rate)} (voluntários)</span><span>${BRL.format(cur.extra)}</span></div>
        <div class="fin-line fin-line--total"><span>Total</span><span>${BRL.format(cur.total)}</span></div>
        ${days ? `<div class="fin-days"><span>Dias:</span>${days}</div>` : '<p class="fin-muted">Nenhum serviço voluntário neste mês.</p>'}
      </div>

      <div class="fin-card">
        <h3 class="fin-card__title">Em trânsito</h3>
        <div class="fin-line"><span>A receber (já trabalhado)</span><span>${BRL.format(pendingTotal)}</span></div>
        ${next ? `<div class="fin-line"><span>Próximo recebimento</span><span>${_payLabel(next.payDate)} · ${BRL.format(next.total)}</span></div>` : ''}
      </div>

      <div class="fin-card">
        <h3 class="fin-card__title">Ano de ${y}</h3>
        <div class="fin-line"><span>Serviços voluntários</span><span>${yearServices}</span></div>
        <div class="fin-line"><span>Ganho com voluntários</span><span>${BRL.format(yearExtra)}</span></div>
        <div class="fin-line"><span>Média por mês</span><span>${(yearServices / 12).toFixed(1).replace('.', ',')} serviços</span></div>
        <div class="fin-line"><span>Mês com mais serviços</span><span>${best.count ? `${MONTHS[best.month]} (${best.count})` : '—'}</span></div>
      </div>

      <div class="fin-card">
        <h3 class="fin-card__title">Últimos 6 meses</h3>
        ${history.reverse().map(r => `
          <div class="fin-hist">
            <div class="fin-hist__top">
              <span class="fin-hist__month">${DateUtils.MONTHS_SHORT[r.month]}/${String(r.year).slice(2)}</span>
              <span class="fin-hist__total">${BRL.format(r.total)}</span>
            </div>
            <div class="fin-hist__bar"><span style="width:${(r.count / maxCount) * 100}%"></span></div>
            <div class="fin-hist__meta">
              <span>${r.count} serviço(s) · ${BRL.format(r.extra)}</span>
              <span>cai em ${DateUtils.MONTHS_SHORT[r.payDate.getMonth()]}/${String(r.payDate.getFullYear()).slice(2)} ${_badge(r.received)}</span>
            </div>
          </div>`).join('')}
      </div>
    `;
  }

  /* ── Modal de valores ── */
  function openConfig() {
    const c = getConfig();
    $('fin-rate').value = c.rate;
    $('fin-base').value = c.base;
    $('fin-lag').value  = c.lag;
    Modals.open('modal-finance-config');
  }

  function saveConfig() {
    const parse = v => Number(String(v).replace(',', '.'));
    const rate = parse($('fin-rate').value);
    const base = parse($('fin-base').value);
    const lag  = parseInt($('fin-lag').value, 10);

    if (![rate, base].every(Number.isFinite) || rate < 0 || base < 0 || !(lag >= 0)) {
      Toast.show('Confira os valores informados.', 'error');
      return;
    }
    Storage.saveSettings({ voluntaryRate: rate, baseAmount: base, payLagMonths: lag });
    Modals.close('modal-finance-config');
    Toast.show('Valores atualizados.', 'success');
    render();
  }

  function shiftMonth(n) { _ref = DateUtils.addMonths(_ref, n); render(); }

  function bind() {
    $('fin-prev')?.addEventListener('click', () => shiftMonth(-1));
    $('fin-next')?.addEventListener('click', () => shiftMonth(1));
    $('btn-finance-config')?.addEventListener('click', openConfig);
    $('btn-save-finance-config')?.addEventListener('click', saveConfig);
  }

  return Object.freeze({ render, bind, calcMonth, buildSyncRows, getConfig });
})();
