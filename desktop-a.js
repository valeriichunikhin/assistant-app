// Lane 2 of the desktop layer (docs/specs/miniapp-desktop.md): the wide «Цены», «Кино», «Волейбол» and
// «Статистика». Each view reads the same api() answers and writes through the same actions as its phone view in
// index.html; nodes are built with el()/add(), never from HTML strings.
(function () {
  var A = window.APP, D = window.DESKTOP = window.DESKTOP || { views: {} };
  if (!A) return;
  D.views = D.views || {};
  var el = A.el, add = A.add, text = A.text, clear = A.clear, icon = A.icon, api = A.api, zl = A.zl, dm = A.dm;
  function noop() {}
  function live(tab) { return A.current === tab; }
  // The scripts arrive in any order: until desktop.js has run, the tab draws its phone view, and desktop.js's
  // arrival redraws it.
  function view(tab, fn) {
    D.views[tab] = function () { return D.table ? fn() : A.views[tab](); };
  }
  function pg(ic, s, fn) {
    var b = A.label(el('button', 'pg'), ic, s);
    b.type = 'button';
    b.onclick = function (ev) { ev.stopPropagation(); fn(); };
    return b;
  }
  function btn(cls, s, fn) {
    var b = el('button', cls, s);
    b.type = 'button';
    b.onclick = fn;
    return b;
  }
  function num(s) { return el('span', 'num', s); }
  function two(main, sub) { return add(el('div', 'da-two'), el('div', 't', main), sub ? el('div', 'mu', sub) : null); }
  function card(ic, title, sub) { return A.mkCard(ic, title, sub); }
  function loading(box) { return add(clear(box), A.skeleton(1)); }

  // --- prices ---
  // The search on the left, the selected product on the right; before a search, «Жду акцию» and the last looked-at
  // products (kept in this browser only). The query lives in DESKTOP.query, where the header search (desktop.js) puts it.
  var SEEN = 'deskPricesSeen';
  function seen() {
    try { var l = JSON.parse(A.store(SEEN) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  function remember(r) {
    var keep = { chain: r.chain, product_key: r.product_key, product_name: r.product_name, size: r.size, last_price: r.last_price,
      min_90d: r.min_90d, n: r.n, image_url: r.image_url, emoji: r.emoji };
    var l = seen().filter(function (x) { return !(x.chain === r.chain && x.product_key === r.product_key); });
    l.unshift(keep);
    A.store(SEEN, JSON.stringify(l.slice(0, 8)));
  }
  // «Жду акцию» rows (price_watch): a bot row has no key and matches by name — pricesView's own rule.
  function fw(s) { return s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter(function (t) { return t.length > 2; }); }
  function nameHit(w, n) {
    var f = fw(n), ws = fw(w);
    return ws.length > 0 && ws.every(function (t) {
      var i = f.findIndex(function (x) { return t.length > 5 ? x.indexOf(t) === 0 : x === t; });
      if (i < 0) return false;
      f.splice(i, 1);
      return true;
    });
  }
  function prodName(r) { return r.product_name + (r.size ? ' · ' + r.size : ''); }

  view('prices', function () {
    if (typeof D.query !== 'string') D.query = '';
    var watch = [], seq = 0, dseq = 0, timer = null, marks = [], detailMark = noop;
    var left = el('div'), right = el('div');
    var input = el('input');
    input.type = 'search';
    input.placeholder = 'Товар, от 2 букв';
    input.value = D.query;
    input.setAttribute('aria-label', 'Поиск товара');
    var results = el('div', 'card da-res');
    add(left, add(el('div', 'bar'), add(el('label', 'field'), icon('search'), input)), results);
    A.main.appendChild(D.panes(left, right)).classList.add('da-prices');

    function watchOf(r) {
      return watch.filter(function (w) {
        return (!w.chain || w.chain === r.chain) &&
          (w.product_key ? w.product_key === r.product_key : nameHit(w.product_name, r.product_name));
      })[0] || null;
    }
    function loadWatch(quiet) {
      return api('telegram-webhook', { action: 'watch' }, 0, true).then(function (j) { watch = j.rows || []; },
        function (e) { if (!quiet) throw e; });
    }
    function refresh() { marks.forEach(function (f) { f(); }); detailMark(); }
    // The toggle the phone's product page has, from any row: watch_add / watch_remove, then every mark in step.
    function toggle(r) {
      var was = watchOf(r);
      A.haptic();
      (was ? api('telegram-webhook', { action: 'watch_remove', id: was.id })
        : api('telegram-webhook', { action: 'watch_add', chain: r.chain, key: r.product_key, name: r.product_name, size: r.size || '' }))
        .then(function (j) {
          watch = watch.filter(function (x) { return x !== was; });
          if (!was) watch.push({ id: j.id, chain: r.chain, product_key: r.product_key, product_name: r.product_name });
          refresh();
          A.toast(was ? 'Больше не жду' : 'Жду акцию — ⭐ в партиях');
        }, function (e) { if (e.code === 'no such item') loadWatch(true).then(refresh); });
    }
    function eye(r) {
      var b = btn('da-eye', '👀', function (ev) { ev.stopPropagation(); toggle(r); });
      function set() {
        var on = !!watchOf(r);
        b.className = 'da-eye' + (on ? ' on' : ' hov');
        b.title = on ? 'Жду акцию — убрать' : 'Жду акцию';
        b.setAttribute('aria-pressed', String(on));
      }
      set();
      marks.push(set);
      return b;
    }
    function pic(r, big) { return A.prodPic(r.product_name, r.image_url, r.chain, null, big, r.emoji); }
    function prodCell(r) {
      return add(el('div', 'da-prod'), pic(r), two(r.product_name, r.size || null));
    }

    function search() {
      var q = D.query.trim(), mine = ++seq;
      if (q.length < 2) {
        add(clear(results), A.state('trending', 'Начни вводить название — покажу цены по газеткам и чекам'));
        return idle();
      }
      loading(results);
      Promise.all([api('miniapp', { action: 'prices', q: q }, 0, true), loadWatch(true)]).then(function (a) {
        if (mine !== seq || !live('prices')) return;
        var rows = a[0].rows || [];
        marks = [];
        clear(results);
        if (!rows.length) { results.appendChild(A.state('search', 'Ничего не нашлось')); return idle(); }
        var t = D.table([{ h: 'Товар' }, { h: 'Магазин' }, { h: 'Цена', r: true }, { h: 'Мин 90 дн', r: true }, { h: 'Набл.', r: true }, { h: '', w: '44px' }],
          rows.map(function (r) {
            return [prodCell(r), r.chain, num(zl(r.last_price) + ' zł'), num(zl(r.min_90d)), r.n, eye(r)];
          }), { onRow: function (i) { pick(i, true); } });
        add(results, add(el('div', 'da-cap'), el('span', '', rows.length + ' ' + A.plural(rows.length, ['товар', 'товара', 'товаров'])),
          el('span', 'mu', '👀 — жду акцию')), t);
        function pick(i, byHand) {
          Array.prototype.forEach.call(t.tBodies[0].rows, function (tr, k) { tr.classList.toggle('sel', k === i); });
          open(rows[i], byHand);
        }
        pick(0, false);
      }, function (e) { if (!e.login && mine === seq && live('prices')) A.failed(results, search); });
    }
    input.oninput = function () {
      D.query = input.value;
      clearTimeout(timer);
      timer = setTimeout(search, 300);
    };
    input.onkeydown = function (e) { if (e.key === 'Enter') { clearTimeout(timer); search(); } };

    // The selected product: the price in numbers, the chart, «В список» and «Жду акцию», then the history.
    function open(r, byHand) {
      var mine = ++dseq;
      if (byHand) remember(r);
      var c = card('trending', prodName(r));
      var ch = c.firstChild;
      ch.replaceChild(pic(r, true), ch.firstChild);
      ch.appendChild(add(el('span', 'tx'), ch.lastChild, el('div', 'mu', r.chain)));
      var inner = add(el('div'), A.skeleton(1));
      var foot = el('div', 'foot'), buy = el('button', 'btn ghost', '🛒 В список'), wb = el('button', 'btn ghost');
      buy.type = wb.type = 'button';
      buy.onclick = function () {
        api('telegram-webhook', { action: 'add', text: r.product_name + (r.size ? ' ' + r.size : '') }).then(function (j) {
          A.toast('Добавил: ' + j.added.join(', '));
        }, noop);
      };
      wb.onclick = function () { toggle(r); };
      detailMark = function () { text(wb, '👀 Жду акцию' + (watchOf(r) ? ' ✓' : '')); };
      detailMark();
      add(foot, buy, wb);
      add(clear(right), add(c, inner));
      api('miniapp', { action: 'series', chain: r.chain, key: r.product_key }, 0, true).then(function (j) {
        if (mine !== dseq || !live('prices')) return;
        c.removeChild(inner);
        var rows = j.rows || [], s = j.stats || {};
        if (!rows.length) return add(c, A.state('trending', 'Наблюдений нет'), foot);
        var tiles = [{ k: 'последняя', v: zl(s.last) + ' zł', small: dm(s.last_on) }, { k: 'мин 90 дн', v: zl(s.min_90d), small: dm(s.min_on) },
          { k: 'медиана 90 дн', v: zl(s.median_90d) }, { k: 'наблюдений', v: String(s.n_90d || 0), small: 'за 90 дн' }];
        c.appendChild(add(el('div', 'da-kv'), D.tiles(tiles)));
        if (s.best_now) c.appendChild(add(el('div', 'sub'), A.pill('лучшая цена сейчас', 'good')));
        c.appendChild(A.chart(rows, s.min_90d, c.clientWidth - 16));
        var legend = el('div', 'legend');
        ['leaflet', 'aldi-json', 'receipt'].forEach(function (k) {
          add(legend, add(el('span'), el('i', 'dot ' + A.SRC_CLASS[k]), document.createTextNode(A.SRC[k])));
        });
        if (s.min_90d != null) add(legend, add(el('span'), el('i', 'dash'), document.createTextNode('мин 90 дн')));
        add(c, legend, foot);
        var h = card('clock', 'История', rows.length + ' ' + A.plural(rows.length, ['наблюдение', 'наблюдения', 'наблюдений']));
        h.appendChild(D.table([{ h: 'Дата' }, { h: 'Источник' }, { h: 'Условие' }, { h: 'Цена', r: true }],
          rows.slice().reverse().map(function (x) {
            return [num(dm(x.observed_on)), A.SRC[x.source] || x.source, x.mechanic ? el('span', 'mu', x.mechanic) : '',
              num(zl(x.price) + ' zł')];
          })));
        right.appendChild(h);
      }, function (e) {
        if (!e.login && mine === dseq && live('prices')) A.failed(inner, function () { open(r, false); });
      });
    }

    // Before a search: «Жду акцию» and the last products looked at here.
    function idle() {
      var mine = ++dseq;
      detailMark = noop;
      var wc = card('target', 'Жду акцию', 'бот отметит ⭐ в партиях, когда будет скидка'), wbox = add(el('div'), A.skeleton(1));
      var rc = card('clock', 'Недавно смотрел'), list = seen();
      add(clear(right), add(wc, wbox), rc);
      if (!list.length) rc.appendChild(el('div', 'row small mu', 'Пока пусто — открой товар из поиска'));
      else {
        rc.appendChild(D.table([{ h: 'Товар' }, { h: 'Магазин' }, { h: 'Цена', r: true }],
          list.map(function (r) { return [prodCell(r), r.chain, num(zl(r.last_price) + ' zł')]; }),
          { onRow: function (i) { D.query = input.value = list[i].product_name; search(); } }));
      }
      function draw() {
        loadWatch().then(function () {
          if (mine !== dseq || !live('prices')) return;
          clear(wbox);
          if (!watch.length) return wbox.appendChild(el('div', 'row small mu', 'Ничего не жду — 👀 у товара в поиске'));
          wbox.appendChild(D.table([{ h: 'Товар' }, { h: 'Сеть' }, { h: 'С', r: true }, { h: '', w: '44px' }],
            watch.map(function (w) {
              var x = add(btn('btn ghost x hov', '', function (ev) {
                ev.stopPropagation();
                api('telegram-webhook', { action: 'watch_remove', id: w.id }).then(function () {
                  A.toast('Больше не жду');
                  if (mine === dseq && live('prices')) draw();
                }, function (e) { if (e.code === 'no such item' && mine === dseq && live('prices')) draw(); });
              }), icon('x'));
              x.setAttribute('aria-label', 'Больше не ждать');
              return [prodName(w), w.chain || 'любая', num(w.added_at ? A.dmt(w.added_at) : ''), x];
            }), { onRow: function (i) { D.query = input.value = watch[i].product_name; search(); } }));
        }, function (e) { if (!e.login && mine === dseq && live('prices')) A.failed(wbox, draw); });
      }
      draw();
    }
    search();
    setTimeout(function () { var a = document.activeElement; if (live('prices') && (!a || a === document.body)) input.focus(); }, 0);
  });

  // --- cinema ---
  // Poster grids on the left («Хочу», «Премьеры», «Скоро» by month, «Предпремьеры»), tables on the right («Мои сеансы»,
  // Unlimited, «Смотрел»). Marks and ratings go to the webhook as cinemaView's do (film_mark, film_rate), then the
  // tab reloads. A tap on a poster opens «О фильме».
  var MONTHS = 'Январь Февраль Март Апрель Май Июнь Июль Август Сентябрь Октябрь Ноябрь Декабрь'.split(' ');
  view('cinema', function () {
    var page = el('div', 'dg da-cine'), lcol = D.span(el('div', 'da-col'), 8), rcol = D.span(el('div', 'da-col'), 4);
    var posters = add(el('div'), A.skeleton(2)), tables = add(el('div'), A.skeleton(1)), unl = el('div');
    A.main.appendChild(add(page, add(lcol, posters), add(rcol, tables, unl)));
    function act(params, done) {
      A.haptic();
      api('telegram-webhook', params).then(function (j) {
        A.toast(typeof done === 'function' ? done(j) : done);
        if (live('cinema')) load();
      }, noop);
    }
    function wantToast(j) { return j && j.status === 'want' ? '🎟 Хочу: отмечено' : 'Убрал из «хочу»'; }
    function mark(f, m, ic, s, done) { return pg(ic, s, function () { act({ action: 'film_mark', film: f.id, mark: m }, done); }); }
    function about(f) {
      return /^https?:\/\//i.test(String(f.link || '')) ? pg('link', 'О фильме', function () { A.openLink(f.link); }) : null;
    }
    // Five stars, each pressed on its left half (x,5) or right half (x) — cinemaView's star bar, smaller.
    function stars(id, rating) {
      var bar = el('div', 'stars da-stars');
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Оценка');
      for (var k = 1; k <= 5; k++) {
        var st = el('span', 'st' + (rating >= k ? ' on' : rating >= k - 0.5 ? ' half' : ''), '★');
        [k * 10 - 5, k * 10].forEach(function (t) {
          var b = el('button');
          b.type = 'button';
          b.setAttribute('aria-label', 'Оценка ' + A.rateText(t / 10));
          b.onclick = function (ev) {
            ev.stopPropagation();
            act({ action: 'film_rate', film: id, tenths: t }, '⭐ ' + A.rateText(t / 10) + ' — записал');
          };
          st.appendChild(b);
        });
        bar.appendChild(st);
      }
      return bar;
    }
    // The cinemas as small pills, a button where there is a ticket link.
    function pills(list) {
      if (!list || !list.length) return null;
      var row = el('div', 'da-pills');
      list.forEach(function (s) {
        var t = s.cinema + (s.ukrainian ? ' 🇺🇦' : '');
        row.appendChild(s.url ? btn('pill acc', t, function () { A.openLink(s.url); }) : A.pill(t));
      });
      return row;
    }
    function cell(f, line, actions, extra) {
      var c = D.posterCell(f, line, actions), box = c.querySelector('.pbox'), pn = c.querySelector('.pn');
      if (f.ukrainian && pn) pn.appendChild(document.createTextNode(' 🇺🇦'));
      if (/^https?:\/\//i.test(String(f.link || ''))) {
        box.classList.add('da-link');
        box.title = 'О фильме';
        box.onclick = function () { A.openLink(f.link); };
      }
      (extra || []).forEach(function (x) { if (x) c.appendChild(x); });
      return c;
    }
    function grid(cells) { return add.apply(null, [el('div', 'pgrid')].concat(cells)); }
    function from(f, today) { return !f.release_date ? '' : f.release_date <= today ? 'уже в прокате' : 'с ' + dm(f.release_date); }

    function render(j) {
      if (!live('cinema')) return;
      clear(posters);
      clear(tables);
      var shows = (j.my_shows || []).filter(function (s) { return !s.past; });
      var watched = j.watched || [], early = j.early || [], prem = j.premieres || [], want = j.want || [], soon = j.soon || [], c;
      if (want.length) {
        c = card('target', 'Хочу', want.length + ' ' + A.plural(want.length, ['фильм', 'фильма', 'фильмов']));
        c.appendChild(grid(want.map(function (f) {
          return cell(f, from(f, j.today), [mark(f, 'w', 'check', 'Смотрел', 'Отмечено: смотрел'),
            mark(f, 'x', 'x', 'Не интересно', 'Отмечено: не интересно'), mark(f, 'h', 'target', 'Убрать', wantToast), about(f)],
          [pills(f.cinemas)]);
        })));
        posters.appendChild(c);
      }
      c = card('film', 'Премьеры', 'ближайшие 14 дней');
      if (!prem.length) c.appendChild(el('div', 'row small mu', 'Новых премьер нет'));
      else {
        c.appendChild(grid(prem.map(function (f) {
          return cell(f, 'с ' + dm(f.release_date), [mark(f, 'w', 'check', 'Смотрел', 'Отмечено: смотрел'),
            mark(f, 'h', 'target', 'Хочу', wantToast), mark(f, 'x', 'x', 'Не интересно', 'Отмечено: не интересно'), about(f)],
          [pills(f.sale), stars(f.id, f.rating)]);
        })));
      }
      posters.appendChild(c);
      if (soon.length) {
        c = card('sparkles', 'Скоро', 'на полгода вперёд');
        var mon = '', g = null;
        soon.forEach(function (f) {
          var m = MONTHS[+f.release_date.slice(5, 7) - 1] + ' ' + f.release_date.slice(0, 4);
          if (m !== mon) { add(c, el('div', 'da-month', mon = m), g = el('div', 'pgrid')); }
          g.appendChild(cell(f, 'с ' + dm(f.release_date), [mark(f, 'h', 'target', 'Хочу', wantToast),
            mark(f, 'x', 'x', 'Не интересно', 'Отмечено: не интересно'), about(f)]));
        });
        posters.appendChild(c);
      }
      if (early.length) {
        c = card('calendar', 'Предпремьеры');
        c.appendChild(grid(early.map(function (e) {
          return cell(e.film, A.whenW(e.date) + ' · ' + e.cinema,
            [e.url ? pg('link', 'Билеты', function () { A.openLink(e.url); }) : null, about(e.film)]);
        })));
        posters.appendChild(c);
      }

      c = card('clock', 'Мои сеансы');
      if (!shows.length) c.appendChild(el('div', 'row small mu', 'Билетов впереди нет'));
      else {
        c.appendChild(D.table([{ h: 'Когда' }, { h: 'Фильм · кинотеатр, зал' }], shows.map(function (s) {
          return [num(A.whenW(s.starts_at)), two(s.film, [String(s.cinema || '').replace(/^Cinema City /, ''), s.hall].filter(Boolean).join(', '))];
        })));
      }
      tables.appendChild(c);
      if (watched.length) {
        c = card('check', 'Смотрел');
        c.appendChild(D.table([{ h: 'Дата' }, { h: 'Фильм' }, { h: 'Оценка' }, { h: '', w: '40px' }], watched.map(function (w) {
          var x = null;
          if (w.id && w.source === 'mark') {
            x = add(btn('btn ghost x hov', '', function () { act({ action: 'film_mark', film: w.id, mark: 'clear' }, 'Отметка снята'); }), icon('x'));
            x.setAttribute('aria-label', 'Снять отметку');
          }
          return [num(dm(w.date)), two(w.display, w.source === 'mark' ? 'отмечен' : null),
            w.id ? stars(w.id, w.rating) : w.rating != null ? num('⭐ ' + A.rateText(w.rating)) : '', x];
        })));
        tables.appendChild(c);
      }
      if (j.skipped) tables.appendChild(el('p', 'mu da-note', '🚫 не интересно: ' + j.skipped));
    }
    function load() {
      api('miniapp', { action: 'cinema' }, 25000, true).then(render, function (e) {
        if (!e.login && live('cinema')) { A.failed(posters, load); clear(tables); }
      });
    }
    // Cinema City Unlimited against tickets: the stats answer's cinema block, on its own.
    function loadUnl() {
      api('miniapp', { action: 'stats', period: '4w' }, undefined, true).then(function (j) {
        if (!live('cinema')) return;
        clear(unl);
        var u = j.cinema;
        if (!u || !u.month) return;
        function save(p) { var m = p.months > 1 ? ' · ' + p.months + ' мес' : ' · месяц'; return p.savings > 0 ? { k: 'экономия' + m, v: Math.round(p.savings) + ' zł' } : { k: 'до окупаемости' + m, v: p.need + ' ' + A.plural(p.need, ['сеанс', 'сеанса', 'сеансов']) }; }
        var c = card('film', 'Cinema City Unlimited', 'против билетов по ' + zl(u.ticket_price) + ' zł');
        add(c, add(el('div', 'da-kv'), D.tiles([{ k: 'сеансов в месяце', v: String(u.month.shows) }, save(u.month),
          { k: 'сеансов за ' + u.quarter.months + ' мес', v: String(u.quarter.shows) }, save(u.quarter)])),
        u.lines && u.lines.length > 2 ? el('div', 'sub da-fine', u.lines[u.lines.length - 1]) : null);
        unl.appendChild(c);
      }, function (e) { if (!e.login && live('cinema')) A.failed(unl, loadUnl); });
    }
    load();
    loadUnl();
  });

  // --- volleyball ---
  // The filter in one toolbar (the chips write volleyball_filter as vbView's do, the last chip of a row stays on),
  // «Мои игры» as a table, then the next weeks as seven-column strips.
  view('vb', function () {
    var top = add(el('div'), A.skeleton(1)), body = el('div'), saving = false;
    add(A.main, add(el('div', 'da-vb'), top, body));
    function save(patch) {
      if (saving) return;
      saving = true;
      A.haptic();
      api('miniapp', { action: 'volleyball_filter' }, 15000, false, patch)
        .then(load, noop).then(function () { saving = false; });
    }
    function chips(cur, key, opts) {
      var row = el('div', 'da-chips');
      opts.forEach(function (o) {
        var on = cur.indexOf(o[0]) >= 0, b = btn('pill' + (on ? ' acc' : ''), o[1], function () {
          if (on && cur.length < 2) return A.toast('Хотя бы один должен остаться');
          var p = {};
          p[key] = on ? cur.filter(function (x) { return x !== o[0]; }) : cur.concat([o[0]]);
          save(p);
        });
        b.setAttribute('aria-pressed', String(on));
        if (o[2]) b.title = o[2];
        row.appendChild(b);
      });
      return row;
    }
    function group(name, node) { return add(el('div', 'da-grp'), el('span', 'da-gl', name), node); }
    function time(ts) { var p = A.wp(ts); return p.hour + ':' + p.minute; }
    function date(ts) { var p = A.wp(ts); return p.year + '-' + p.month + '-' + p.day; }
    function render(j) {
      if (!live('vb')) return;
      if (!j || !j.filter) { A.failed(clear(top), load); return clear(body); } // an old function answers a watch run
      var f = j.filter, lv = {};
      j.levels.forEach(function (l) { lv[l.id] = l.label; });
      var sel = el('select');
      sel.setAttribute('aria-label', 'Начало не раньше');
      A.VB_FROM.concat(A.VB_FROM.indexOf(f.start_from) < 0 ? [f.start_from] : []).sort().forEach(function (t) {
        var o = el('option', '', 'с ' + t);
        o.value = t;
        sel.appendChild(o);
      });
      sel.value = f.start_from;
      sel.onchange = function () { save({ start_from: sel.value }); };
      add(clear(top), add(el('div', 'card da-filter'),
        group('Залы', chips(f.venue_ids, 'venue_ids', j.venues.map(function (v) { return [v.id, v.name, v.street]; }))),
        group('Уровень', chips(f.levels, 'levels', j.levels.map(function (l) { return [l.id, l.label]; }))),
        group('Дни', chips(f.weekdays, 'weekdays', A.WEEK.map(function (w, i) { return [i, w]; }))),
        group('Начало', sel),
        el('span', 'mu da-gnote', 'фильтр — он же для уведомлений')));
      clear(body);
      if (j.my_games.length) {
        var c = card('ball', 'Мои игры', j.my_games.length + ' ' + A.plural(j.my_games.length, ['игра', 'игры', 'игр']));
        c.appendChild(D.table([{ h: 'День' }, { h: 'Время' }, { h: 'Зал' }, { h: 'Статус' }],
          j.my_games.map(function (g) {
            var d = date(g.starts_at);
            return [num(A.WEEK[A.wd(d)] + ' ' + dm(d)), num(time(g.starts_at) + (g.ends_at ? '–' + time(g.ends_at) : '')),
              two(g.venue || '', g.address || null), g.status === 'paid' ? A.pill('оплачено', 'good') : A.pill('записан', 'acc')];
          }), { onRow: function (i) { var g = j.my_games[i]; if (g.activity_id > 0) A.openLink('https://pilkanahali.pl/zajecia/' + g.activity_id); } }));
        body.appendChild(c);
      }
      if (!j.games.length) return body.appendChild(add(el('div', 'card'), A.state('ball', 'Подходящих игр нет — переключи залы или уровни')));
      // From the week of the first game on: a Sunday with nothing left does not get a strip of its own.
      var byDay = {}, first = null, last = j.today;
      j.games.forEach(function (g) {
        (byDay[g.date] = byDay[g.date] || []).push(g);
        if (!first || g.date < first) first = g.date;
        if (g.date > last) last = g.date;
      });
      if (first < j.today) first = j.today;
      for (var mon = A.addDays(first, -A.wd(first)); mon <= last; mon = A.addDays(mon, 7)) body.appendChild(week(mon));
      function week(mon) {
        var strip = el('div', 'week7'), n = 0;
        for (var i = 0; i < 7; i++) {
          var d = A.addDays(mon, i), col = el('div', d < j.today ? 'da-past' : d === j.today ? 'da-today' : '');
          col.appendChild(add(el('div', 'd'), el('b', '', A.WEEK[i]), document.createTextNode(' ' + dm(d) + (f.priority_weekdays.indexOf(i) >= 0 ? ' 🔥' : ''))));
          (byDay[d] || []).forEach(function (g) { n++; col.appendChild(game(g)); });
          if (!byDay[d] && d >= j.today) col.appendChild(el('div', 'da-none', '—'));
          strip.appendChild(col);
        }
        var c = card('calendar', dm(mon) + ' – ' + dm(A.addDays(mon, 6)), n ? n + ' ' + A.plural(n, ['игра', 'игры', 'игр']) : 'игр нет');
        return add(c, strip);
      }
      function game(g) {
        var price = g.price == null ? '' : (g.price % 1 ? zl(g.price) : g.price) + ' zł';
        var b = add(el('div', 'da-g' + (g.mine ? ' mine' : '') + (g.full ? ' full' : '')),
          el('b', 'num da-gtm', g.start_at + '–' + g.stop_at),
          add(el('div', 'da-gt'), el('span', 'da-gv', g.venue + (g.verified_only ? ' 🪪' : '')), el('span', 'num', g.taken + '/' + g.max_players)),
          el('div', 'mu', [lv[g.lv] || g.lv, price].filter(Boolean).join(' · ')),
          g.mine ? A.pill('ты записан', 'acc') : g.busy ? A.pill('у тебя игра') : null);
        b.title = [g.venue, g.street].filter(Boolean).join(', ');
        if (g.url) A.tap(b, function () { A.openLink(g.url); });
        return b;
      }
    }
    function load() {
      return api('miniapp', { action: 'volleyball' }, 25000, true).then(render, function (e) {
        if (!e.login && live('vb')) { A.failed(clear(top), load); clear(body); }
      });
    }
    load();
  });

  // --- stats ---
  // The period as a toolbar, the period's numbers as tiles, the weekly chart beside the stores, the rest of
  // statsView's cards in two columns.
  view('stats', function () {
    var period = A.store('period');
    if (!/^(4w|12w|1y)$/.test(period)) period = '12w';
    var seg = el('div', 'seg'), body = el('div'), segs = {};
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Период');
    A.PERIODS.forEach(function (p) {
      segs[p[0]] = seg.appendChild(btn('', p[1], function () { period = p[0]; A.store('period', period); load(); }));
    });
    add(A.main, add(el('div', 'da-stats'), add(el('div', 'da-bar'), seg, el('span', 'mu', '')), body));
    var range = seg.nextSibling;
    function checks(n) { return n + ' ' + A.plural(n, ['чек', 'чека', 'чеков']); }
    function qty(q) { return String(Math.round(Number(q) * 1000) / 1000).replace('.', ','); }
    function buys(n) { return n + ' ' + A.plural(n, ['покупка', 'покупки', 'покупок']); }
    function meter(part, whole) {
      var m = el('div', 'meter'), f = el('i');
      f.style.width = (whole > 0 ? Math.max(2, part / whole * 100) : 0) + '%';
      return add(m, f);
    }
    function render(j) {
      clear(body);
      text(range, dm(j.from) + '.' + j.from.slice(0, 4) + ' – ' + dm(j.to) + '.' + j.to.slice(0, 4));
      var t = j.totals, p = j.savings, w = j.wishlist, h = j.health, grid = el('div', 'dg'), c;
      body.appendChild(grid);
      function put(node, n) { grid.appendChild(D.span(node, n)); return node; }
      if (!t.receipts) put(add(el('div', 'card'), A.state('receipt', 'Чеков за период нет. Присылай PDF из Moja Biedronka в тему Receipts.')), 12);
      else {
        put(D.tiles([{ k: 'потрачено за период', v: zl(t.spent) + ' zł' }, { k: 'чеков', v: String(t.receipts) },
          { k: 'средний чек', v: zl(t.avg_basket) + ' zł' }, { k: 'скидки магазина', v: zl(t.discounts) + ' zł' },
          { k: 'благодаря советам', v: zl(p.total) + ' zł', small: buys(p.items) }]), 12);
        c = put(card('chart', 'По неделям'), 8);
        c.appendChild(A.weekChart(j.by_week, A.addDays(j.to, -A.wd(j.to)), c.clientWidth - 16));
        c = put(card('bag', 'По магазинам'), 4);
        var top = j.by_store.length ? j.by_store[0].spent : 0;
        c.appendChild(D.table([{ h: 'Магазин' }, { h: 'Сумма', r: true }], j.by_store.map(function (s) {
          return [add(el('div', 'da-two'), el('div', 't', s.chain), el('div', 'mu', checks(s.receipts)), meter(s.spent, top)), num(zl(s.spent) + ' zł')];
        })));
        if (j.top_items.length) {
          c = put(card('top', 'Топ товаров'), 6);
          c.appendChild(D.table([{ h: 'Товар' }, { h: 'Кол-во', r: true }, { h: 'Скидка', r: true }, { h: 'Сумма', r: true }],
            j.top_items.map(function (i) {
              return [i.name, num('× ' + qty(i.qty)), num(i.discount > 0 ? zl(i.discount) : '—'), num(zl(i.spent) + ' zł')];
            })));
        }
      }
      var won = w.saved.reduce(function (a, s) { return a + s.first_price - s.target; }, 0);
      if (t.receipts || p.items || w.reached) {
        c = put(card('piggy', 'Экономия'), 6);
        var best = p.by_category.length ? p.by_category[0].saved : 0, rows = [['Благодаря советам', 'за период · ' + buys(p.items), p.total, null]];
        p.by_category.forEach(function (s) { rows.push([s.title, buys(s.items), s.saved, meter(s.saved, best)]); });
        rows.push(['Скидки магазина по чекам', null, t.discounts, null]);
        if (w.reached) {
          rows.push(['Вишлист: ' + w.reached + ' ' + A.plural(w.reached, ['цель достигнута', 'цели достигнуты', 'целей достигнуто']),
            null, won > 0 ? won : null, null]);
        }
        c.appendChild(D.table([{ h: 'Откуда' }, { h: 'Сэкономил', r: true }], rows.map(function (r) {
          return [add(el('div', 'da-two'), el('div', 't', r[0]), r[1] ? el('div', 'mu', r[1]) : null, r[3]), num(r[2] == null ? '' : zl(r[2]) + ' zł')];
        })));
      }
      if (h && h.days) {
        var ht = [];
        if (h.avg_steps != null) ht.push({ k: 'шаги в среднем', v: A.grouped(h.avg_steps) });
        if (h.workouts) ht.push({ k: 'тренировки', v: String(h.workouts), small: h.workout_min + ' мин' });
        if (h.avg_sleep_min != null) ht.push({ k: 'сон в среднем', v: A.sleepLine(h.avg_sleep_min) });
        c = put(card('watch', 'Здоровье', 'дней с данными: ' + h.days), 6);
        if (ht.length) c.appendChild(add(el('div', 'da-kv'), D.tiles(ht)));
      }
      if (j.cinema) {
        c = put(card('film', 'Кино', 'Cinema City Unlimited · этот месяц и 3 месяца'), 6);
        j.cinema.lines.forEach(function (l) { c.appendChild(A.hrow(l)); });
      }
    }
    function load() {
      for (var k in segs) segs[k].className = k === period ? 'on' : '';
      var mine = period;
      loading(body);
      api('miniapp', { action: 'stats', period: period }, undefined, true).then(function (j) {
        if (live('stats') && mine === period) render(j);
      }, function (e) { if (!e.login && live('stats') && mine === period) A.failed(body, load); });
    }
    load();
  });
})();
