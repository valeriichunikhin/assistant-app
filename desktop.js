// The desktop layer of the Mini App (≥ 900 px): index.html loads this file, then desktop-a.js and
// desktop-b.js, on a wide screen only. A wide tab is a function in DESKTOP.views[tab] that draws into
// APP.main with the page's helpers (window.APP) and the shared ones below; index.html's show() prefers
// it over the phone view. Spec: docs/specs/miniapp-desktop.md. Nodes are built with el()/add(), never from HTML strings.
(function () {
  var A = window.APP, D = window.DESKTOP = window.DESKTOP || { views: {} };
  if (!A) return;
  var el = A.el, add = A.add;

  // A 12-column grid of widgets; span(card, n) makes a card n columns wide.
  D.grid = function () { return el('div', 'dg'); };
  D.span = function (node, n) { node.classList.add('span-' + n); return node; };

  // A section head inside a page: «Акции · 24» with a muted note on the right.
  D.section = function (title, note) {
    var h = add(el('div', 'dsec'), el('h2', '', title));
    if (note) h.appendChild(el('span', 'mu', note));
    return h;
  };

  // A table. cols: [{ h: 'Товар' } | { h: 'Цена', r: true } | { h: '' }], rows: arrays of cells (a node, a string
  // or a number; a number is mono and right-aligned), opts.onRow(rowIndex) makes rows tappable,
  // opts.cls(rowIndex) adds a class to a row.
  D.table = function (cols, rows, opts) {
    opts = opts || {};
    var t = el('table', 'tbl'), thead = el('thead'), tr = el('tr'), tbody = el('tbody');
    cols.forEach(function (c) {
      var th = el('th', c.r ? 'r' : '', c.h || '');
      if (c.w) th.style.width = c.w;
      tr.appendChild(th);
    });
    add(t, add(thead, tr), tbody);
    rows.forEach(function (cells, i) {
      var r = el('tr', opts.onRow ? 'tap' : '');
      if (opts.cls) { var k = opts.cls(i); if (k) r.classList.add(k); }
      cells.forEach(function (c, j) {
        var td = el('td', cols[j] && cols[j].r ? 'r' : '');
        if (typeof c === 'number') { td.classList.add('num'); td.textContent = String(c); }
        else if (c && c.nodeType) td.appendChild(c);
        else td.textContent = c == null ? '' : String(c);
        r.appendChild(td);
      });
      if (opts.onRow) { r.tabIndex = 0; A.tap(r, function () { opts.onRow(i); }); }
      tbody.appendChild(r);
    });
    return t;
  };

  // Two panes: the list on the left, a sticky detail on the right; even: 1:1.
  D.panes = function (left, right, even) {
    var p = el('div', 'panes' + (even ? ' even' : ''));
    right.classList.add('side');
    return add(p, left, right);
  };

  // A poster cell for a poster grid: the image (or a film glyph), the name, a muted line, actions on hover.
  D.posterCell = function (f, line, actions) {
    var cell = el('div', 'pcell'), box = el('div', 'pbox');
    if (/^https?:\/\//i.test(String(f.poster || ''))) {
      var img = el('img');
      img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = f.poster;
      img.onerror = function () { img.replaceWith(add(el('div', 'ph'), A.icon('film'))); };
      box.appendChild(img);
    } else box.appendChild(add(el('div', 'ph'), A.icon('film')));
    if (actions && actions.length) {
      var ov = el('div', 'pov hov');
      actions.forEach(function (a) { if (a) ov.appendChild(a); });
      box.appendChild(ov);
    }
    add(cell, box, el('div', 'pn', f.display || f.name || ''));
    if (line) cell.appendChild(el('div', 'pd', line));
    return cell;
  };

  // Key/value tiles: items = [{ k: 'Траты', v: '1 234 zł', small: 'за месяц' }].
  // A tile: {k, v, small?, bar?: a share for a thin bar, cls?: its class, tab?: what a tap opens, go?(cell): or what a
  // tap does}.
  D.tiles = function (items) {
    var box = el('div', 'kv');
    items.forEach(function (t) {
      var v = el('div', 'v', t.v), cell = add(el('div'), el('div', 'k', t.k), v);
      if (t.small) v.appendChild(add(el('small'), document.createTextNode(' ' + t.small)));
      if (typeof t.bar === 'number') {
        var bar = add(el('div', 'mbar dbar'), el('i', t.cls || ''));
        bar.firstChild.style.width = Math.max(Math.min(t.bar, 1) * 100, 1).toFixed(1) + '%';
        cell.appendChild(bar);
      }
      if (t.tab) A.tap(cell, function () { A.show(t.tab); });
      else if (t.go) A.tap(cell, function () { t.go(cell); });
      box.appendChild(cell);
    });
    return box;
  };

  // Keyboard: 1–9, 0 switch tabs in rail order; «/» focuses the search in the header, when there is one (on «Цены»
  // the page's own field, the header one is hidden there).
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing) return;
    if (e.key === '/') {
      var s = A.shopIs('prices') ? A.main.querySelector('input[type="search"]') : A.hdr.querySelector('.dsearch input');
      if (s && !s.closest('.off')) { e.preventDefault(); s.focus(); }
      return;
    }
    var n = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
    if (n >= 0 && n < A.tabs.length && !isNaN(n)) A.show(A.tabs[n][0]);
  });
})();

// The overview (lane 1): DESKTOP.views.home — the day on one screen as a grid of widgets, each fetching on its
// own with the same requests as the phone views (homeView, vbView, cinemaView, picksView, pricesView's watch,
// feedView's digest, delaView, inboxView) — and the header's price search.
(function () {
  var A = window.APP, D = window.DESKTOP;
  if (!A || !D) return;
  var el = A.el, add = A.add, clear = A.clear, icon = A.icon, pill = A.pill, hrow = A.hrow, WEEK = A.WEEK, dm = A.dm;
  // As feedView's SOURCES and inboxView's IB (not exposed on APP).
  var SOURCES = {
    'infor-legal': 'infor.pl', udsc: 'UdSC', muw: 'MUW', warszawa: 'warszawa.pl', wtp: 'WTP', ukrinform: 'Ukrinform',
    tvn24: 'TVN24', polsatnews: 'Polsat News', pravda: 'Українська правда'
  };
  var IB = { link: 'link', text: 'sticky-note', photo: 'image', document: 'file', voice: 'mic', video: 'video', forward: 'forward', other: 'inbox' };

  function ymd(ts) { var p = A.wp(ts); return p.year + '-' + p.month + '-' + p.day; }
  function hm(ts) { var p = A.wp(ts); return p.hour + ':' + p.minute; }
  function dayName(date) { return WEEK[A.wd(date)] + ' ' + dm(date); }
  function rel(n) { return n < 0 ? 'просрочено' : n === 0 ? 'сегодня' : n === 1 ? 'завтра' : 'через ' + n + ' дн'; }
  function relPill(n) { return pill(rel(n), n < 0 ? 'bad' : n <= 1 ? 'warn' : ''); }
  function more(n, tab) {
    var r = el('div', 'row small mu', '+' + n + ' ещё');
    return A.tap(r, function () { A.show(tab); });
  }

  // One answer per request for 10 s: the overview is drawn again when each desktop script loads, and several
  // widgets read the same answer (home: tiles, week, today). fresh skips the cache (a retry, after a write).
  var memo = {};
  function get(fn, params, ms, fresh) {
    var k = fn + JSON.stringify(params), m = memo[k];
    if (!fresh && m && Date.now() - m.t < 10000) return m.p;
    var p = A.api(fn, params, ms, true);
    memo[k] = { t: Date.now(), p: p };
    p.catch(function () { if (memo[k] && memo[k].p === p) delete memo[k]; });
    return p;
  }
  function soft(p) { return p.then(null, function () { return null; }); }
  // The page's Russian names (index.html: APP.levelRu, APP.hallRu); the raw text until the page has them.
  function lvRu(l) { var r = typeof A.levelRu === 'function' ? A.levelRu(l.id) : null; return r && r !== l.id ? r : l.label; }
  function hallRu(x) { return typeof A.hallRu === 'function' ? A.hallRu(x) : x; }

  // A widget: the card head with «→» to its tab (none for the overview's own cards), a body that loads on its
  // own; a failed load shows the phone's failed() with a retry inside the card and the other widgets stand.
  function widget(grid, n, ic, title, tab) {
    var c = A.mkCard(ic, title);
    if (tab) {
      var go = add(el('button', 'dgo'), document.createTextNode('открыть →'));
      go.type = 'button';
      go.setAttribute('aria-label', 'Открыть: ' + A.names[tab]);
      go.onclick = function () { A.show(tab); };
      c.firstChild.appendChild(go);
    }
    var body = add(c, el('div', 'wb')).lastChild;
    grid.appendChild(D.span(c, n));
    return body;
  }
  function skel() { return add(el('div', 'skel'), el('i'), el('i'), el('i')); }
  function load(body, call, draw) {
    function run(fresh) {
      add(clear(body), skel());
      call(fresh === true).then(function (j) {
        if (A.current === 'home' && body.isConnected) draw(clear(body), j, run);
      }, function (e) {
        if (!e.login && A.current === 'home' && body.isConnected) A.failed(body, function () { run(true); });
      });
    }
    run(false);
  }
  function homeA(f) { return get('miniapp', { action: 'home' }, 30000, f); }
  function vbA(f) { return get('miniapp', { action: 'volleyball' }, 25000, f); }

  // 1. The day in numbers: only tiles whose data exists; a counter of nothing waiting (parcels, inbox) is left out.
  function tiles(box, a) {
    var j = a[0], st = a[1], vb = a[2], m = j.morning || {}, wk = j.week, now = Date.now(), items = [];
    var td = m.today || ymd(now);
    var games = (m.my_games || []).filter(function (g) { return Date.parse(g.ends_at || g.starts_at) > now; })
      .sort(function (x, y) { return x.starts_at.localeCompare(y.starts_at); });
    if (games.length) {
      var g = games[0], d = ymd(g.starts_at), seen = vb && (vb.games || []).filter(function (x) { return x.id === g.activity_id; })[0];
      items.push({ k: 'Следующая игра', v: WEEK[A.wd(d)] + ' ' + hm(g.starts_at),
        small: [d === td ? 'сегодня' : dm(d), g.venue, seen ? seen.taken + '/' + seen.max_players : ''].filter(Boolean).join(' · ') });
    }
    var show = null;
    ((wk && wk.days) || []).some(function (day) {
      return day.items.some(function (x) { if (x.kind === 'show') show = { date: day.date, x: x }; return !!show; });
    });
    if (show) items.push({ k: 'Ближайший сеанс', v: WEEK[A.wd(show.date)] + ' ' + (show.x.time || dm(show.date)), small: show.x.text });
    if (m.deadlines || m.payments) {
      var due = (m.deadlines || []).map(function (d) { return d.due_date; })
        .concat((m.payments || []).map(function (p) { return p.due_date; }))
        .map(function (d) { return A.days(td, d); }).filter(function (n) { return n <= 7; }).sort(function (x, y) { return x - y; });
      items.push({ k: 'Сроки · 7 дней', v: String(due.length), small: due.length ? 'ближайший ' + rel(due[0]) : 'пусто' });
    }
    if (m.parcels && m.parcels.length) items.push({ k: 'Посылки', v: String(m.parcels.length), small: 'ждут' });
    if (wk && wk.free_evenings) {
      items.push({ k: 'Свободные вечера', v: String(wk.free_evenings.length),
        small: wk.free_evenings.map(function (d) { return WEEK[A.wd(d)]; }).join(' · ') });
    }
    if (st && st.totals && st.totals.receipts > 0) {
      items.push({ k: 'Траты · 4 нед', v: A.grouped(Math.round(st.totals.spent)) + ' zł',
        small: st.totals.receipts + ' ' + A.plural(st.totals.receipts, ['чек', 'чека', 'чеков']) });
    }
    if (j.inbox_new) items.push({ k: 'Инбокс', v: String(j.inbox_new), small: 'новых' });
    // «Деньги» (docs/specs/money-6.md §2): the phone's «Сегодня» card as a tile, hidden with that card.
    var hid = (j.prefs && j.prefs.home && j.prefs.home.hidden) || [];
    if (j.money && A.moneyHomeOn && A.moneyHomeOn(j) && hid.indexOf('money') < 0) {
      var mm = j.money, mt = A.moneyHomeText(mm), d = mm.diff_pct;
      items.push({ k: 'Деньги · ' + A.monthLabel(mm.month).split(' ')[0].toLowerCase(), v: A.grouped(Math.round(mm.spent)) + ' zł',
        small: mm.budget ? 'из ' + A.grouped(Math.round(mm.budget)) + ' · ' + (mm.left >= 0 ? 'осталось ' : 'больше на ') +
          A.grouped(Math.round(Math.abs(mm.left))) : d === null || d === undefined ? '' : (d > 0 ? '+' : d < 0 ? '−' : '±') +
          Math.abs(d) + ' % к прошлому месяцу', bar: mt.p === null ? undefined : mt.p, cls: mt.cls, tab: 'money' });
    }
    // «Сегодня можно ещё N zł» (docs/specs/money-9.md), with the «Деньги» tile: a tap opens «Бюджет на день».
    if (j.money && j.money.daily && A.moneyHomeOn(j) && hid.indexOf('money') < 0) {
      var dd = j.money.daily, dt = A.moneyDailyText(dd);
      items.push({ k: dd.left < 0 ? 'Перерасход сегодня' : 'Сегодня можно ещё', v: A.grouped(Math.round(Math.abs(dd.left))) + ' zł',
        small: dt.sub, go: function (cell) { A.moneyDailySheet(dd, cell); } });
    }
    // «Октябрь закрыт» (docs/specs/money-8.md §1), the 1st to the 7th: a tap opens the month's review.
    if (A.moneyReviewOn && A.moneyReviewOn(j) && hid.indexOf('money_review') < 0) {
      var rv = j.money_review, rt = A.moneyReviewHomeText(rv);
      items.push({ k: rt.title, v: A.grouped(Math.round(rv.total)) + ' zł', small: rt.sub,
        go: function (cell) { A.moneyReviewSheet(rv.month, cell); } });
    }
    if (!items.length) return;
    var t = D.tiles(items);
    box.appendChild(t);
  }

  // 2a. «План недели»: seven columns, a day's items as the phone's week card lists them, «свободно» in a free evening.
  function week(body, j) {
    var w = j.week;
    if (w === null) return add(body, A.state('alert', 'План недели недоступен'));
    if (!w || !Array.isArray(w.days) || !w.days.length) return add(body, A.state('calendar', 'План недели пока не собран'));
    var g = el('div', 'week7'), td = w.today || ymd(Date.now());
    w.days.forEach(function (d) {
      var c = el('div', d.date === td ? 'now' : '');
      add(c, add(el('div', 'd'), el('b', '', WEEK[A.wd(d.date)]), document.createTextNode(' ' + dm(d.date))));
      // Untimed tasks past two fold into «N задач», as on the phone (21.10.2026).
      var ts = d.items.filter(function (x) { return x.kind === 'task' && !x.time; });
      d.items.filter(function (x) { return x.kind !== 'task' || x.time || ts.length <= 2; }).forEach(function (x) {
        add(c, add(el('div', 'it it-' + (x.kind || '')), el('span', 'ie', x.icon + ' '),
          x.time ? el('span', 'tm', x.time + ' ') : null, document.createTextNode(x.text)));
      });
      if (ts.length > 2) add(c, add(el('div', 'it it-task'), el('span', 'ie', '☑️ '), document.createTextNode(ts.length + ' ' + A.plural(ts.length, ['задача', 'задачи', 'задач']))));
      if (d.free_evening) c.appendChild(el('div', 'it free', 'свободно'));
      g.appendChild(c);
    });
    body.appendChild(g);
  }

  // 2b. «Сегодня»: the calendar of today and tomorrow, deadlines, payments, documents, parcels, shows — condensed.
  function todayCard(body, j) {
    var m = j.morning;
    if (!m) return add(body, A.state('alert', 'Утренняя сводка недоступна'));
    var td = m.today || ymd(Date.now()), rows = [];
    (m.calendar_view || []).forEach(function (x) {
      rows.push(hrow((x.icon ? x.icon + ' ' : '') + x.text, [x.date === td ? 'сегодня' : dayName(x.date),
        x.time ? x.time + (x.until ? '–' + x.until : '') : x.until ? 'до ' + x.until : 'весь день', x.location].filter(Boolean).join(' · ')));
    });
    (m.my_shows || []).forEach(function (s) {
      var d = ymd(s.starts_at);
      rows.push(A.lead(hrow(s.display || s.film, [d === td ? 'сегодня' : dayName(d), hm(s.starts_at), s.cinema].filter(Boolean).join(' · ')), 'film'));
    });
    (m.deadlines || []).forEach(function (d) {
      rows.push(hrow(d.title, (d.sender ? d.sender + ' · ' : '') + 'до ' + dm(d.due_date), relPill(A.days(td, d.due_date))));
    });
    (m.payments || []).forEach(function (p) {
      rows.push(hrow(p.kind + ' · ' + p.period, 'до ' + dm(p.due_date), relPill(A.days(td, p.due_date))));
    });
    (m.documents || []).forEach(function (d) {
      var n = A.days(td, d.expires_on);
      rows.push(hrow(d.name, 'документ · ' + dm(d.expires_on) + '.' + d.expires_on.slice(0, 4),
        pill(n < 0 ? 'просрочено' : n === 0 ? 'сегодня' : 'через ' + n + ' дн', n <= 7 ? 'bad' : '')));
    });
    (m.parcels || []).forEach(function (p) {
      rows.push(A.lead(hrow([p.carrier, p.shop].filter(Boolean).join(' · '), 'забрать до ' + A.whenW(p.pickup_deadline)), 'package'));
    });
    // Courts (the tennis rule's days only), Genshin endings and yesterday's health, as the phone's homeView.
    if (m.courts && m.courts.clubs && m.courts.slots && (!Array.isArray(m.courts.days) || m.courts.days.indexOf(A.wd(td)) >= 0)) {
      var names = {}, now = A.wp(Date.now()), nowHm = now.hour + ':' + now.minute;
      m.courts.clubs.forEach(function (c) { names[c.slug] = c.name; });
      m.courts.slots.filter(function (s) { return names[s.slug] && s.start_time >= nowHm; })
        .sort(function (x, y) { return x.start_time.localeCompare(y.start_time) || Number(x.price) - Number(y.price); })
        .slice(0, 3).forEach(function (s) {
          rows.push(A.lead(hrow(s.start_time + ' · ' + names[s.slug], null, A.zl(s.price) + ' zł', 'https://playmore.pl/klub/' + s.slug + '/'), 'pin'));
        });
    }
    (m.genshin || []).slice().sort(function (x, y) { return Date.parse(x.ends_at) - Date.parse(y.ends_at); }).slice(0, 2)
      .forEach(function (r) { rows.push(A.lead(hrow(r.title || r.item_id, 'до ' + A.whenW(r.ends_at)), 'game')); });
    var h = m.health;
    if (h) {
      var hp = [h.steps != null ? A.grouped(h.steps) + ' ' + A.plural(h.steps, ['шаг', 'шага', 'шагов']) : '',
        h.exercise_min != null ? h.exercise_min + ' мин тренировок' : '', h.sleep_min != null ? 'сон ' + A.sleepLine(h.sleep_min) : ''].filter(Boolean);
      if (hp.length) rows.push(hrow('Вчера', hp.join(' · ')));
    }
    // The Mac jobs and the mail bridge, only when a part went quiet (as the phone's «Система»).
    var ps = (j.pulse && j.pulse.parts || []).filter(function (x) { return x.stale; });
    if (ps.length) rows.push(hrow('Система', ps.map(function (x) { return x.label; }).join(' · '), pill('тихо', 'warn')));
    if (!rows.length) return add(body, A.state('check', 'На сегодня ничего'));
    A.capped(rows, 12).forEach(function (r) { body.appendChild(r); });
  }

  // 3a. «Волейбол»: his games first, then the filter's games by date (as vbView); 8 rows and «+N».
  function volley(body, j) {
    if (!j || !j.filter) return add(body, A.state('alert', 'Нет данных об играх'));
    var lv = {}, rows = [], mine = {};
    j.levels.forEach(function (l) { lv[l.id] = lvRu(l); });
    (j.my_games || []).slice().sort(function (x, y) { return x.starts_at.localeCompare(y.starts_at); }).forEach(function (g) {
      mine[g.activity_id] = true;
      var x = (j.games || []).filter(function (y) { return y.id === g.activity_id; })[0];
      rows.push(x ? { g: x, mine: true } : { g: { date: ymd(g.starts_at), start_at: hm(g.starts_at), venue: g.venue,
        url: g.activity_id > 0 ? 'https://pilkanahali.pl/zajecia/' + g.activity_id : null }, mine: true, paid: g.status === 'paid' });
    });
    (j.games || []).forEach(function (g) { if (!mine[g.id]) rows.push({ g: g, mine: !!g.mine }); });
    if (!rows.length) return add(body, A.state('ball', 'Подходящих игр нет'));
    var shown = rows.slice(0, 8), pr = j.filter.priority_weekdays || [];
    body.appendChild(D.table([{ h: 'День' }, { h: 'Время' }, { h: 'Зал' }, { h: 'Уровень' }, { h: 'Занято', r: true }, { h: '' }],
      shown.map(function (r) {
        var g = r.g, d = A.wd(g.date);
        return [pr.indexOf(d) >= 0 ? add(el('span'), document.createTextNode(WEEK[d] + ' ' + dm(g.date)), A.icon('flame', 'sx')) : WEEK[d] + ' ' + dm(g.date),
          add(el('span', 'num', g.start_at)),
          g.verified_only ? add(el('span'), document.createTextNode(g.venue), A.icon('shield-check', 'sx')) : g.venue, g.lv ? lv[g.lv] || g.lv : '—',
          g.max_players != null ? add(el('span', 'num', g.taken + '/' + g.max_players)) : '—',
          r.mine ? pill(A.ict('check', 'моя'), 'acc') : g.busy ? pill('у тебя игра') : ''];
      }), {
        onRow: function (i) { if (shown[i].g.url) A.openLink(shown[i].g.url); },
        cls: function (i) { return shown[i].g.full && !shown[i].mine ? 'off' : ''; }
      }));
    if (rows.length > 8) body.appendChild(more(rows.length - 8, 'vb'));
  }

  // 3b. «Кино»: the «Хочу» posters (date line, «О фильме» on hover), under them «Мои сеансы».
  function cinema(body, j) {
    var want = j.want || [], shows = (j.my_shows || []).filter(function (s) { return !s.past; });
    if (!want.length && !shows.length) return add(body, A.state('film', '«Хочу» и сеансов пока нет'));
    if (want.length) {
      var g = el('div', 'pgrid mini');
      want.slice(0, 8).forEach(function (f) {
        var acts = [];
        if (/^https?:\/\//i.test(String(f.link || ''))) {
          var b = A.label(el('button', 'pg'), 'link', 'О фильме');
          b.type = 'button';
          b.onclick = function () { A.openLink(f.link); };
          acts.push(b);
        }
        g.appendChild(D.posterCell(f, !f.release_date ? '' : f.release_date <= j.today ? 'в прокате' : 'с ' + dm(f.release_date), acts));
      });
      body.appendChild(g);
    }
    if (shows.length) {
      body.appendChild(el('div', 'wsub', 'Мои сеансы'));
      body.appendChild(D.table([{ h: 'Когда' }, { h: 'Фильм' }, { h: 'Где' }], shows.slice(0, 5).map(function (s) {
        var d = ymd(s.starts_at), ua = s.ukrainian || /ukraiński dubbing/i.test(s.film);
        return [add(el('span', 'num'), document.createTextNode(dayName(d) + ' ' + hm(s.starts_at))),
          A.ua(s.display || s.film.replace(/\s*ukraiński dubbing.*$/i, ''), ua),
          add(el('span', 'mu'), document.createTextNode([String(s.cinema || '').replace(/^Cinema City /, ''), hallRu(s.hall)].filter(Boolean).join(' · ')))];
      })));
    }
  }

  // 4a. «Акции»: the Aldi vs Biedronka pairs (?action=compare) and the watched products in open batches.
  function deals(body, a) {
    var cmp = a[0], picks = a[1], ps = (cmp && cmp.pairs) || [], stars = [];
    ((picks && picks.batches) || []).forEach(function (b) {
      (b.candidates || []).forEach(function (c) { if (/^⭐/.test(c.label)) stars.push({ b: b, c: c }); });
    });
    if (!ps.length && !stars.length) return add(body, A.state('tag', 'Пар и ожидаемых акций в подборках пока нет — придут с газетками'));
    if (ps.length) {
      body.appendChild(el('div', 'wsub', A.ict('scale', 'Aldi vs Biedronka · ' + dm(cmp.week_start) + '–' + dm(A.addDays(cmp.week_start, 6)))));
      var side = function (p, chain, price, card) {
        return add(el('span', 'num' + (p.cheaper === chain ? ' cw' : ''), A.zl(price)), card ? A.icon('wallet-cards', 'sx') : null);
      };
      body.appendChild(D.table([{ h: 'Товар' }, { h: 'Aldi', r: true }, { h: 'Biedronka', r: true }, { h: 'Экономия', r: true }],
        ps.slice(0, 6).map(function (p) {
          return [add(el('span', 'pn'), A.prodPic(p.product, null, p.cheaper, null, false, p.emoji), el('span', '', p.product)),
            side(p, 'Aldi', p.aldi_price, p.aldi_card), side(p, 'Biedronka', p.biedronka_price, p.biedronka_card),
            add(el('span', 'num'), document.createTextNode(p.cheaper === 'equal' ? '=' : '−' + A.zl(p.diff)))];
        })));
      if (ps.length > 6) body.appendChild(more(ps.length - 6, 'picks'));
    }
    if (stars.length) {
      body.appendChild(el('div', 'wsub', A.ict('target', 'Жду акцию — уже в подборках')));
      body.appendChild(D.table([{ h: 'Товар' }, { h: 'Сеть' }, { h: 'Цена', r: true }, { h: 'Было', r: true }],
        stars.slice(0, 6).map(function (s) {
          var c = s.c;
          return [add(el('span', 'pn'), A.prodPic(c.label, c.image_url, s.b.chain, c.category, false, c.emoji),
            el('span', '', c.label.replace(/^⭐\s*/, ''))), s.b.chain || '',
          c.price != null ? Number(c.price) : '', add(el('span', 'num old'), document.createTextNode(c.old_price != null ? A.zl(c.old_price) : ''))];
        }), { onRow: function () { A.show('picks'); } }));
      if (stars.length > 6) body.appendChild(more(stars.length - 6, 'picks'));
    }
  }

  // 4b. «Новости»: the digest of today or yesterday (rows with the source as the link); without one, a hint and the
  // three newest headlines outside «Варшава» (its rows are mostly festival screenings).
  function news(body, j, head) {
    var d = j.digest, picks = (d && d.picks) || [];
    function link(s, url) {
      var a = el('a', 'lnk', s);
      if (/^https?:\/\//i.test(url)) a.href = url;
      a.onclick = function (ev) { ev.preventDefault(); A.openLink(url); };
      return a;
    }
    if (picks.length) {
      A.text(head, 'Выжимка · ' + dm(d.day));
      picks.forEach(function (p) {
        body.appendChild(add(el('div', 'row'), add(el('span', 'tx'), document.createTextNode(p.line + ' · '),
          link(SOURCES[p.source] || p.source, p.url))));
      });
      return;
    }
    var rows = (j.rows || []).filter(function (r) { return r.stream !== 'city'; }).slice(0, 3);
    if (!rows.length) return add(body, A.state('news', 'Выжимки сегодня не было'));
    body.appendChild(el('div', 'wsub', 'Выжимки сегодня не было'));
    rows.forEach(function (r) {
      var row = hrow(r.title, (SOURCES[r.source] || r.source) + (r.published_at ? ' · ' + A.whenW(r.published_at) : ''), null,
        /^https?:\/\//i.test(r.url) ? r.url : null);
      body.appendChild(row);
    });
  }

  // 5a. «Жду акцию»: the price_watch rows; a click searches the product in «Цены».
  function watch(body, j) {
    var rows = j.rows || [];
    if (!rows.length) return add(body, A.state('trending', 'Ничего не жду — отметь товар в «Ценах»'));
    A.capped(rows.map(function (w) {
      var r = A.lead(hrow(w.product_name + (w.size ? ' · ' + w.size : ''), w.chain || 'все сети'), 'target');
      return A.tap(r, function () { prices(w.product_name); });
    }), 6).forEach(function (r) { body.appendChild(r); });
  }

  // 5b. «Дела»: the next six by date.
  function dela(body, j) {
    var items = (j.items || []).slice().sort(function (x, y) { return x.days - y.days; });
    if (!items.length) return add(body, A.state('check', 'Открытых дел нет'));
    items.slice(0, 6).forEach(function (i) {
      var tile = add(el('span', 'ptile'), A.icon(A.DELA_ICON[i.kind] || 'tack'));
      tile.setAttribute('aria-hidden', 'true');
      var r = add(el('div', 'row'), tile, add(el('span', 'tx'), el('div', 't', i.title),
        el('div', 'mu num', (i.sub || A.DELA_KIND[i.kind]) + ' · ' + (i.approx ? '≈' : '') + dm(i.due))),
      add(el('span', 'pr'), pill(i.days < 0 ? 'просрочено ' + -i.days + ' дн' : i.days === 0 ? 'сегодня' : 'через ' + i.days + ' дн',
        i.days <= 3 ? 'bad' : '')));
      if (i.days < 0) r.classList.add('overdue');
      body.appendChild(A.tap(r, function () { A.show('dela'); }));
    });
    if (items.length > 6) body.appendChild(more(items.length - 6, 'dela'));
  }

  // 5c. «Инбокс»: the last five drops, ✅/⏭ on hover (inbox_mark, its answer as a toast, then a reload).
  function inbox(body, j, again) {
    var rows = (j.rows || []).slice(-5).reverse();
    if (!rows.length) return add(body, A.state('inbox', 'Инбокс пуст'));
    rows.forEach(function (r) {
      var tile = add(el('span', 'ptile'), A.icon(IB[r.kind] || IB.other)), acts = el('div', 'acts hov');
      tile.setAttribute('aria-hidden', 'true');
      [['done', 'check', 'Готово'], ['skip', 'x', 'Пропустить']].forEach(function (k) {
        var b = A.label(el('button', 'pg'), k[1], k[2]);
        b.type = 'button';
        b.onclick = function () {
          A.haptic();
          b.disabled = true;
          A.api('telegram-webhook', { action: 'inbox_mark', id: r.id, what: k[0] }, 30000, true).then(function (x) {
            A.toast(x.answer);
            again(true);
          }, function (e) { if (!e.login) { A.toast(e.answer); again(true); } });
        };
        acts.appendChild(b);
      });
      var s = String(r.text || '').replace(/\s+/g, ' ').trim();
      body.appendChild(add(el('div', 'row'), tile, add(el('span', 'tx'),
        el('div', 't clip1', s ? (s.length > 140 ? s.slice(0, 139) + '…' : s) : r.kind),
        el('div', 'mu num', [A.whenW(r.received_at), r.file_name].filter(Boolean).join(' · '))), acts));
    });
  }

  D.views.home = function () {
    var main = A.main, grid = D.grid();
    grid.classList.add('dhome');
    var top = D.span(el('div', 'dtiles'), 12);
    grid.appendChild(top);
    load(top, function (f) {
      return Promise.all([homeA(f), soft(get('miniapp', { action: 'stats', period: '4w' }, 15000, f)), soft(vbA(f))]);
    }, tiles);
    load(widget(grid, 8, 'calendar', 'План недели', null), homeA, week);
    var tb = widget(grid, 4, 'clock', 'Сегодня', null);
    tb.parentNode.classList.add('dfill'); // full width at 900–1199 px, where a span-4 would stand alone
    load(tb, homeA, todayCard);
    load(widget(grid, 6, 'ball', 'Волейбол', 'vb'), vbA, volley);
    load(widget(grid, 6, 'film', 'Кино', 'cinema'), function (f) { return get('miniapp', { action: 'cinema' }, 25000, f); }, cinema);
    load(widget(grid, 6, 'tag', 'Акции', 'picks'), function (f) {
      return Promise.all([soft(get('telegram-webhook', { action: 'compare' }, 15000, f)), soft(get('telegram-webhook', { action: 'picks' }, 15000, f))])
        .then(function (a) { if (!a[0] && !a[1]) throw new Error('both failed'); return a; });
    }, deals);
    var nb = widget(grid, 6, 'news', 'Новости', 'feed'), nh = nb.parentNode.querySelector('h3');
    load(nb, function (f) { return get('miniapp', { action: 'news', stream: 'all' }, 15000, f); }, function (b, j) { news(b, j, nh); });
    load(widget(grid, 4, 'target', 'Жду акцию', 'prices'), function (f) { return get('telegram-webhook', { action: 'watch' }, 15000, f); }, watch);
    load(widget(grid, 4, 'tack', 'Дела', 'dela'), function (f) { return get('telegram-webhook', { action: 'dela' }, 15000, f); }, dela);
    var ib = widget(grid, 4, 'inbox', 'Инбокс', 'inbox');
    ib.parentNode.classList.add('dfill');
    load(ib, function (f) { return get('telegram-webhook', { action: 'inbox' }, 15000, f); }, inbox);
    var again = A.label(el('button', 'btn ghost wide'), 'refresh', 'Обновить');
    again.type = 'button';
    again.onclick = function () { memo = {}; A.show('home'); };
    add(main, grid, add(el('div', 'dfoot'), again));
  };
  // The header search: Enter, or a pause of 400 ms with two letters or more, opens «Цены» with the query. The
  // query goes to DESKTOP.query (for a wide prices view) and into the prices view's own field as typed input, so
  // the phone pricesView takes it into priceQuery and searches. On «Цены» the header field is hidden (the page's
  // field is the one; DESKTOP.typed asks it to take the focus when the query was being typed here), and it is
  // emptied on leaving «Цены» and on Escape.
  var input = el('input'), timer = null;
  input.type = 'search';
  input.placeholder = 'Поиск товара…';
  input.setAttribute('aria-label', 'Поиск товара');
  function prices(q) {
    q = String(q || '').trim();
    if (q.length < 2) return;
    clearTimeout(timer);
    D.query = q;
    if (input.value.trim() !== q) input.value = q;
    var had = document.activeElement === input;
    D.typed = had && !A.shopIs('prices');
    if (!A.shopIs('prices')) A.show('prices');
    var f = A.main.querySelector('input[type="search"]');
    if (f && f.value !== q) { f.value = q; f.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  input.oninput = function () {
    clearTimeout(timer);
    if (input.value.trim().length >= 2) timer = setTimeout(function () { prices(input.value); }, 400);
  };
  input.onkeydown = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); prices(input.value); }
    else if (e.key === 'Escape') { clearTimeout(timer); input.value = ''; input.blur(); }
  };
  function kbd(s) { return el('kbd', 'k', s); }
  var box = add(el('label', 'field dsearch'), icon('search'), input);
  A.hdr.insertBefore(box, A.hTitle.nextSibling);
  // show() retitles the header on every tab change: hide the field on «Цены», empty it elsewhere.
  var lastTab = null;
  function onTab() {
    var p = A.shopIs('prices');
    // Genshin has nothing to search for in shops (19.10.2026): the field is hidden there too.
    box.classList.toggle('off', p || A.current === 'genshin');
    if (!p && lastTab === 'prices') { clearTimeout(timer); input.value = ''; }
    lastTab = p ? 'prices' : A.current;
  }
  if (window.MutationObserver) new MutationObserver(onTab).observe(A.hTitle, { childList: true, characterData: true, subtree: true });
  onTab();
  A.hdr.appendChild(add(el('span', 'kbd'), kbd('1–9'), document.createTextNode(' разделы · '), kbd('/'),
    document.createTextNode(' поиск')));
})();
