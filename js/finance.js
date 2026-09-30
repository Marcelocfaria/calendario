/* ═══════════════════════════════════════════════════════════
   FINANCE.JS — Aba Financeiro
   Regra:
   · Base (9.350) é fixa e cai TODO mês.
   · Cada serviço voluntário feito no mês M rende +550 e só é
     depositado em M + lag (padrão: 2 meses depois).
   · Logo, o recebimento do mês X = base + (voluntários de X − lag) × valor.
   Dependências: DateUtils, Storage, Modals, Toast (globals)
═══════════════════════════════════════════════════════════ */

'use strict';

const Finance = (() => {

  const $ = id => document.getElementById(id);
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const MONTHS = DateUtils.MONTHS_LONG;
  const MSHORT = DateUtils.MONTHS_SHORT;

  let _ref = DateUtils.startOfMonth(DateUtils.today());

  const _ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const _label = d => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const _short = d => `${MSHORT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
  const _curMonth = () => { const n = DateUtils.today(); return new Date(n.getFullYear(), n.getMonth(), 1); };
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

  /* ── Serviços voluntários FEITOS em um mês ── */
  function worked(year, month) {
    const services = Storage.getEventsByMonth(year, month)
      .filter(e => e.type === 'voluntary')
      .sort((a, b) => a.date.localeCompare(b.date));
    const hours = services.reduce((acc, e) => acc + DateUtils.calcHours(e.startTime, e.endTime), 0);
    return { services, count: services.length, hours };
  }

  /* ── Recebimento de um mês (mês do depósito) ──
     base + voluntários feitos em (mês − lag) */
  function calcMonth(year, month, cfg = getConfig()) {
    const date    = new Date(year, month, 1);
    const srcDate = new Date(year, month - cfg.lag, 1);   // mês em que os voluntários foram feitos
    const done    = worked(year, month);
    const paid    = worked(srcDate.getFullYear(), srcDate.getMonth());
    const extra   = paid.count * cfg.rate;

    return {
      year, month, date,
      // feito neste mês
      workedCount: done.count, workedHours: done.hours, workedServices: done.services,
      payDate: new Date(year, month + cfg.lag, 1),        // quando os voluntários DESTE mês caem
      // recebido neste mês
      srcDate, paidCount: paid.count, extra,
      base: cfg.base, total: cfg.base + extra,
      received: date <= _curMonth(),
    };
  }

  /* ── Linhas para o Google Sheets ── */
  function buildSyncRows(monthsBack = 12, monthsAhead = 3) {
    const cfg = getConfig();
    const now = _curMonth();
    const rows = [];
    for (let i = monthsBack; i >= -monthsAhead; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const r = calcMonth(d.getFullYear(), d.getMonth(), cfg);
      rows.push({
        referencia:       _ym(d),                 // mês do recebimento
        servicosFeitos:   r.workedCount,          // voluntários feitos neste mês
        horas:            r.workedHours,
        origemVoluntario: _ym(r.srcDate),         // mês em que foram feitos os voluntários pagos agora
        servicosPagos:    r.paidCount,
        valorPorServico:  cfg.rate,
        valorVoluntario:  r.extra,
        valorBase:        r.base,
        total:            r.total,
        status:           r.received ? 'Recebido' : 'A receber',
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
    const lagTxt = cfg.lag === 1 ? '1 mês' : `${cfg.lag} meses`;

    $('fin-month-name').textContent = MONTHS[m];
    $('fin-year-name').textContent  = y;

    // Ano: recebimentos por mês de depósito
    const months = Array.from({ length: 12 }, (_, i) => calcMonth(y, i, cfg));
    const yearWorked   = months.reduce((a, r) => a + r.workedCount, 0);
    const yearEarned   = yearWorked * cfg.rate;                       // gerado pelos serviços feitos no ano
    const yearReceived = months.filter(r => r.received).reduce((a, r) => a + r.total, 0);
    const yearProjected = months.reduce((a, r) => a + r.total, 0);
    const best = months.reduce((b, r) => r.workedCount > b.workedCount ? r : b, months[0]);

    // Em trânsito: feitos em [hoje − lag + 1 .. hoje], ainda não depositados
    const now = _curMonth();
    const pending = [];
    for (let k = cfg.lag - 1; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const w = worked(d.getFullYear(), d.getMonth());
      pending.push({ date: d, count: w.count, extra: w.count * cfg.rate,
                     payDate: new Date(d.getFullYear(), d.getMonth() + cfg.lag, 1) });
    }
    const pendingTotal = pending.reduce((a, p) => a + p.extra, 0);

    // Histórico: 6 recebimentos até o mês selecionado
    const history = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - i, 1);
      history.push(calcMonth(d.getFullYear(), d.getMonth(), cfg));
    }
    const maxExtra = Math.max(1, ...history.map(r => r.extra));

    const days = cur.workedServices
      .map(e => `<span class="fin-chip">${DateUtils.fromISOString(e.date).getDate()}</span>`).join('');
    const srcName = MONTHS[cur.srcDate.getMonth()].toLowerCase();

    $('finance-content').innerHTML = `
      <div class="fin-hero">
        <span class="fin-hero__label">Recebimento de ${MONTHS[m].toLowerCase()} ${_badge(cur.received)}</span>
        <span class="fin-hero__value">${BRL.format(cur.total)}</span>
        <span class="fin-hero__sub">
          ${cur.paidCount
            ? `Inclui ${cur.paidCount} voluntário(s) de <strong>${srcName}</strong>`
            : `Sem voluntários de <strong>${srcName}</strong> neste depósito`}
        </span>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><span class="stat-card__label">Voluntários feitos em ${MSHORT[m].toLowerCase()}</span><span class="stat-card__value">${cur.workedCount}</span></div>
        <div class="stat-card"><span class="stat-card__label">Horas</span><span class="stat-card__value">${cur.workedHours ? DateUtils.formatHours(cur.workedHours) : '0h'}</span></div>
      </div>

      <div class="fin-card">
        <h3 class="fin-card__title">Composição do recebimento</h3>
        <div class="fin-line"><span>Base fixa</span><span>${BRL.format(cur.base)}</span></div>
        <div class="fin-line"><span>${cur.paidCount} × ${BRL.format(cfg.rate)} (voluntários de ${srcName})</span><span>${BRL.format(cur.extra)}</span></div>
        <div class="fin-line fin-line--total"><span>Total</span><span>${BRL.format(cur.total)}</span></div>
      </div>

      <div class="fin-card">
        <h3 class="fin-card__title">Voluntários feitos em ${MONTHS[m].toLowerCase()}</h3>
        <div class="fin-line"><span>${cur.workedCount} × ${BRL.format(cfg.rate)}</span><span>${BRL.format(cur.workedCount * cfg.rate)}</span></div>
        <div class="fin-line"><span>Cai em</span><span>${_label(cur.payDate)}</span></div>
        ${days ? `<div class="fin-days"><span>Dias:</span>${days}</div>` : '<p class="fin-muted">Nenhum serviço voluntário neste mês.</p>'}
      </div>

      <div class="fin-card">
        <h3 class="fin-card__title">Em trânsito</h3>
        <div class="fin-line"><span>Voluntários já feitos, ainda não pagos</span><span>${BRL.format(pendingTotal)}</span></div>
        ${pending.map(p => `
          <div class="fin-line"><span>${MONTHS[p.date.getMonth()]}: ${p.count} serviço(s)</span><span>${BRL.format(p.extra)} · cai em ${_short(p.payDate)}</span></div>`).join('')}
      </div>

      <div class="fin-card">
        <h3 class="fin-card__title">Ano de ${y}</h3>
        <div class="fin-line"><span>Voluntários feitos</span><span>${yearWorked}</span></div>
        <div class="fin-line"><span>Gerado por voluntários</span><span>${BRL.format(yearEarned)}</span></div>
        <div class="fin-line"><span>Média por mês</span><span>${(yearWorked / 12).toFixed(1).replace('.', ',')} serviços</span></div>
        <div class="fin-line"><span>Mês com mais serviços</span><span>${best.workedCount ? `${MONTHS[best.month]} (${best.workedCount})` : '—'}</span></div>
        <div class="fin-line"><span>Já recebido no ano</span><span>${BRL.format(yearReceived)}</span></div>
        <div class="fin-line"><span>Previsto no ano (12 meses)</span><span>${BRL.format(yearProjected)}</span></div>
      </div>

      <div class="fin-card">
        <h3 class="fin-card__title">Últimos 6 recebimentos</h3>
        ${history.reverse().map(r => `
          <div class="fin-hist">
            <div class="fin-hist__top">
              <span class="fin-hist__month">${_short(r.date)}</span>
              <span class="fin-hist__total">${BRL.format(r.total)}</span>
            </div>
            <div class="fin-hist__bar"><span style="width:${(r.extra / maxExtra) * 100}%"></span></div>
            <div class="fin-hist__meta">
              <span>${r.paidCount} voluntário(s) de ${_short(r.srcDate)} · ${BRL.format(r.extra)}</span>
              ${_badge(r.received)}
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
