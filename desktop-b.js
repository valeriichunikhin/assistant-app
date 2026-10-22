// The desktop layer, lane 3 (docs/specs/miniapp-desktop.md): the wide views of «Список», «Акции», «Вишлист»,
// «Дела», «Деньги», «Инбокс» and «Новости». Each reads and writes through the same APP.api calls as its phone view in
// index.html (listView, picksView, wishView, delaView, inboxView, feedView) and checks APP.current before touching
// the DOM after an answer. Nodes are built with el()/add(), never from HTML strings.
(function () {
  var A = window.APP, D = window.DESKTOP = window.DESKTOP || { views: {} };
  if (!A) return;
  var el = A.el, add = A.add, text = A.text, clear = A.clear, icon = A.icon, label = A.label, api = A.api;
  var zl = A.zl, dm = A.dm, pill = A.pill, toast = A.toast;
  function noop() {}
  function on(tab) { return A.current === tab; }

  // The scripts load in parallel, so desktop.js (D.table, D.panes…) may still be on its way: until it lands the
  // phone view stands in, and desktop.js's own onload redraws the tab with the wide one.
  function view(tab, fn) {
    D.views[tab] = function () {
      if (!D.table) return A.views[tab]();
      fn(add(A.main, el('div', 'dlane-b')).lastChild);
    };
  }

  // --- small building blocks ---
  function input(ph, value, type) {
    var i = el('input');
    i.placeholder = ph;
    i.setAttribute('aria-label', ph);
    if (type) i.type = type;
    i.value = value || '';
    return i;
  }
  function field(ic, inp, cls) { return add(el('label', 'field' + (cls ? ' ' + cls : '')), icon(ic), inp); }
  // A small outlined button; a press does not reach the row under it.
  function pg(ic, s, fn, off) {
    var b = label(el('button', 'pg'), ic, s);
    b.type = 'button';
    if (off) b.disabled = true;
    b.onclick = function (ev) { ev.stopPropagation(); fn(b); };
    return b;
  }
  // «Точно?» on the first press, fn on a second one within 3 s (the phone's ✕ and «Сделано»); the button is itself
  // again before fn runs, so a failed call does not leave it asking.
  function confirmed(ic, s, fn) {
    var timer = null;
    var b = pg(ic, s, function () {
      if (!timer) {
        label(b, null, 'Точно?');
        b.classList.add('warn');
        timer = setTimeout(function () { timer = null; b.classList.remove('warn'); label(b, ic, s); }, 3000);
        return;
      }
      clearTimeout(timer);
      timer = null;
      b.classList.remove('warn');
      label(b, ic, s);
      fn(b);
    });
    return b;
  }
  function num(s) { return el('span', 'num', s); }
  // A product cell: the picture, the name, a muted line under it.
  function nameCell(pic, name, sub) {
    return add(el('div', 'dname'), pic, add(el('div', 'tx'), el('div', 't', name), sub ? el('div', 'mu', sub) : null));
  }
  function hovActs() {
    var box = el('div', 'acts hov');
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) box.appendChild(arguments[i]);
    return box;
  }
  function link(s, url) {
    var a = el('a', 'lnk', s);
    if (/^https?:\/\//i.test(String(url || ''))) a.href = url;
    a.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); A.openLink(url); };
    return a;
  }
  function cardWith(ic, title, sub, body) { return add(A.mkCard(ic, title, sub), body); }
  function countPill(card, n, kind) { card.firstChild.appendChild(pill(String(n), kind)); return card; }
  function stripStar(s) { return String(s || '').replace(/^⭐ /, ''); }

  // A deal product as a grid cell: a big picture, the name, the price and the old one, the chain, a target when it is
  // one he waits for (deal_batch prefixes the label with «⭐ »), actions on hover.
  // The line (deal_batch) holds the full name, the mechanic, 🪪 and the 90-day verdict; the label is cut to 21 characters.
  // The rest drops the price segment («7,98 13,99») and «−43%»: the cell shows both already (a trailing 🪪 stays).
  function lineParts(c) {
    if (A.dealParts) {  // index.html's reading: the full name and a Russian note of the deal
      var dp = A.dealParts(c);
      return { name: dp.name, rest: dp.note, warn: dp.warn };
    }
    var s = A.plain(c.line).replace(/^⭐ /, ''), warn = /^⚠️/.test(s);
    s = s.replace(/^⚠️ не скидка · /, '');
    var i = s.indexOf(' · ');
    if (!s) return { name: stripStar(c.label), rest: '', warn: false };
    var rest = i < 0 ? [] : s.slice(i + 3).split(' · ').map(function (x) {
      return x.replace(/^\d[\d,]*( \d[\d,]*)?(?= 🪪$|$)/, '').replace(/^[−-]\d+%(?= 🪪$|$)/, '').trim();
    }).filter(Boolean);
    return { name: i < 0 ? s : s.slice(0, i), rest: rest.join(' · '), warn: warn };
  }
  function prodCell(c, chain, actions) {
    var lp = lineParts(c), name = lp.name;
    var cell = el('div', 'dprod' + (c.selected ? ' on' : ''));
    var pr = el('div', 'dpr');
    if (c.price != null) pr.appendChild(el('span', '', zl(c.price) + ' zł'));
    if (c.old_price != null) pr.appendChild(el('span', 'old', zl(c.old_price)));
    var meta = add(el('div', 'dmeta'), chain ? pill(chain) : null, lp.warn ? pill('не скидка', 'warn') : null,
      c.valid_to ? el('span', 'mu', 'до ' + dm(c.valid_to)) : null);
    add(cell, add(el('div', 'dpic'), A.prodPic(name, c.image_url, chain, c.category, true, c.emoji)),
      el('div', 'pn', name), pr, lp.rest ? el('div', 'dln mu', lp.rest) : null, meta);
    if (/^⭐ /.test(c.label || '')) cell.appendChild(add(el('span', 'dstar'), icon('target')));
    if (c.selected) cell.appendChild(add(el('span', 'dmk'), icon('check')));
    if (actions) cell.appendChild(actions);
    return cell;
  }

  // --- list: the list on the left, the open batches' products on the right ---
  var listDraft = '';
  view('list', function (main) {
    var left = A.mkCard('cart', 'Список'), right = A.mkCard('tag', 'Из подборок');
    var head = el('div', 'summary dsum');
    left.firstChild.appendChild(head);
    var form = el('form', 'dform'), inp = input('Добавить…', listDraft);
    inp.enterKeyHint = 'done';
    inp.oninput = function () { listDraft = inp.value; };
    var plus = label(el('button', 'btn'), 'plus', 'Добавить');
    plus.type = 'submit';
    form.onsubmit = function (ev) {
      ev.preventDefault();
      var s = inp.value.trim();
      if (!s) return;
      api('telegram-webhook', { action: 'add', text: s }).then(function () {
        listDraft = '';
        inp.value = '';
        load();
      }, noop);
    };
    var lbody = add(el('div'), A.skeleton(1)), rbody = add(el('div'), A.skeleton(1));
    add(left, add(form, field('cart', inp, 'grow'), plus), lbody);
    right.appendChild(rbody);
    main.appendChild(D.panes(left, right, true));
    var items = [];

    function inList(name) {
      var n = name.toLowerCase();
      return items.some(function (i) { return !i.done && String(i.text || '').toLowerCase().indexOf(n) === 0; });
    }
    function stat(s, n) { return add(el('span'), document.createTextNode(s + ' '), el('b', '', n)); }
    // At once on the screen, saved in the background as on the phone (APP.markItem); the focus stays on the row (k).
    function toggle(i, k) {
      A.haptic();
      A.markItem(i, function () { render(k); });
    }
    function render(k) {
      if (!A.shopIs('list') || !lbody.isConnected) return;
      var back = typeof k === 'number' && lbody.contains(document.activeElement) ? k : -1;
      var open = items.filter(function (i) { return !i.done; }).length, bought = items.length - open;
      add(clear(head), stat('осталось', open), stat('куплено', bought));
      clear(lbody);
      if (!items.length) {
        lbody.appendChild(A.state('cart', 'Пусто. Напиши, что добавить.'));
        try { inp.focus(); } catch (e) {}
        return;
      }
      lbody.appendChild(D.table([{ h: '', w: '40px' }, { h: 'Товар' }, { h: 'Шт', r: true, w: '48px' },
        { h: 'Откуда', w: '84px' }, { h: '', w: '96px' }], items.map(function (i) {
        var x = confirmed('x', '', function () {
          A.dropMark(A.itemKey(i));
          items = items.filter(function (y) { return y !== i; });
          render();
          api('telegram-webhook', { action: 'delete', id: i.id }).then(function (j) {
            A.undoToast('Убрал', [j.id], load);
          }, load);
        });
        x.setAttribute('aria-label', 'Убрать');
        return [icon(i.done ? 'check-square' : 'square', 'mk' + (i.done ? ' on' : '')),
          nameCell(A.prodPic(i.text, i.image_url, i.chain, i.category, false, i.emoji), i.text),
          i.qty > 1 ? i.qty : '', el('span', 'mu', i.chain || 'вручную'), hovActs(x)];
      }), {
        onRow: function (k) { toggle(items[k], k); },
        cls: function (k) { return items[k].done ? 'done' : ''; }
      }));
      var row = back >= 0 && lbody.querySelectorAll('tbody tr')[back];
      if (row) try { row.focus({ preventScroll: true }); } catch (e) {}
      if (bought) {
        var timer = null, btn = label(el('button', 'btn ghost'), 'trash', 'Убрать купленное');
        btn.type = 'button';
        btn.onclick = function () {
          if (!timer) {
            label(btn, null, 'Точно? Убрать ' + bought);
            btn.className = 'btn warn';
            timer = setTimeout(function () { timer = null; label(btn, 'trash', 'Убрать купленное'); btn.className = 'btn ghost'; }, 3000);
            return;
          }
          clearTimeout(timer);
          timer = null;
          api('telegram-webhook', { action: 'clear' }).then(function (j) {
            if (j.ids && j.ids.length) A.undoToast('Убрал ' + j.ids.length, j.ids, load);
            load();
          }, noop);
        };
        lbody.appendChild(add(el('div', 'foot'), btn));
      }
    }
    function load() {
      api('telegram-webhook', { action: 'items' }, undefined, true).then(function (j) {
        items = j.items || [];
        A.keepItems(items, render);
        render();
      }, function (e) { if (!e.login && A.shopIs('list')) A.failed(lbody, load); });
    }
    function loadPicks() {
      api('telegram-webhook', { action: 'picks' }, undefined, true).then(function (j) {
        if (!A.shopIs('list') || !rbody.isConnected) return;
        clear(rbody);
        var bs = (j.batches || []).filter(function (b) { return (b.candidates || []).length; });
        if (!bs.length) return rbody.appendChild(A.state('tag', 'Подборок акций пока нет — новые приходят с газетками (вс, пн, чт)'));
        if (!right.querySelector('.sub')) right.insertBefore(el('div', 'sub', 'Наведи на товар — «+ в список»'), rbody);
        bs.forEach(function (b) {
          rbody.appendChild(add(el('div', 'dgh'), el('b', '', b.title), b.chain ? el('span', 'mu', b.chain) : null,
            el('span', 'mu', b.candidates.length + ' ' + A.plural(b.candidates.length, ['товар', 'товара', 'товаров']))));
          var grid = el('div', 'dprods');
          b.candidates.forEach(function (c) {
            var full = lineParts(c).name, name = full + ' (' + b.chain + ')', have = inList(full);
            grid.appendChild(prodCell(c, b.chain, hovActs(pg('plus', have ? 'в списке' : 'в список', function (btn) {
              btn.disabled = true;
              api('telegram-webhook', { action: 'add', text: name, one: 1 }).then(function (r) {
                label(btn, 'check', 'в списке');
                toast('Добавил: ' + (r.added || [name]).join(', '));
                load();
              }, function () { btn.disabled = false; });
            }, have))));
          });
          rbody.appendChild(grid);
        });
      }, function (e) { if (!e.login && A.shopIs('list')) A.failed(rbody, loadPicks); });
    }
    load();
    loadPicks();
  });

  // --- picks: the compare table, then every open batch as a product grid ---
  // Category names for the filter, by deal_batch's ids (the emoji is the page's CAT_EMO).
  var CAT_RU = { pets: 'животным', kids: 'детям', alcohol: 'алкоголь', household: 'дом', cosmetics: 'косметика',
    sweets: 'сладкое', dairy: 'молочное', meat: 'мясо и рыба', produce: 'овощи и фрукты', ready: 'готовое',
    bakery: 'бакалея', coffee: 'кофе и чай', drinks: 'напитки', other: 'прочее' };
  var pickQ = '', pickCat = '';
  view('picks', function (main) {
    var bar = el('div', 'dtool'), inp = input('Поиск по акциям', pickQ, 'search'), cats = el('div', 'chips dchips');
    inp.oninput = function () { pickQ = inp.value; render(); };
    var body = add(el('div'), A.skeleton(2));
    add(main, A.pickSeg(), add(bar, field('search', inp, 'dq'), cats), body);
    // «Все акции»: the phone's view (APP.dealsAll) in the wide grid, filtered by this search field.
    if (A.pickAll()) {
      body.className = 'cols';
      var redraw = A.dealsAll(body, function () { return pickQ; });
      inp.oninput = function () { pickQ = inp.value; redraw(); };
      return;
    }
    var batches = null, cmp = null;

    function catOf(c) { return c.category || A.categoryOf(c.label); }
    function chips() {
      var n = {}, all = 0;
      batches.forEach(function (b) {
        (b.candidates || []).forEach(function (c) { n[catOf(c)] = (n[catOf(c)] || 0) + 1; all++; });
      });
      if (pickCat && !n[pickCat]) pickCat = '';
      clear(cats);
      if (!all) return;
      [['', 'все', all]].concat(Object.keys(CAT_RU).filter(function (k) { return n[k]; }).map(function (k) {
        return [k, (A.CAT_EMO[k] || '') + ' ' + CAT_RU[k], n[k]];
      })).forEach(function (o) {
        var b = add(el('button', 'pill' + (o[0] === pickCat ? ' acc' : '')), document.createTextNode(o[1] + ' '),
          el('span', 'num', o[2]));
        b.type = 'button';
        b.setAttribute('aria-pressed', o[0] === pickCat ? 'true' : 'false');
        b.onclick = function () { pickCat = o[0]; render(); };
        cats.appendChild(b);
      });
    }
    // The week's Aldi vs Biedronka pairs as a table; hidden while searching or filtering, as on the phone.
    function compareCard() {
      var ps = cmp && cmp.pairs || [];
      if (!ps.length || pickQ.trim() || pickCat) return;
      var save = 0, n = 0;
      function side(p, chain, price, cardOnly) {
        return add(el('span', 'num' + (p.cheaper === chain ? ' cw' : ''), zl(price)), cardOnly ? icon('wallet-cards', 'sx') : null);
      }
      var t = D.table([{ h: 'Товар' }, { h: 'Aldi', r: true, w: '120px' }, { h: 'Biedronka', r: true, w: '120px' },
        { h: 'Экономия', r: true, w: '110px' }], ps.map(function (p) {
        if (p.cheaper !== 'equal') { save += p.diff; n++; }
        return [nameCell(A.prodPic(p.product, null, p.cheaper, null, false, p.emoji), p.product,
          p.tier === 'kind' ? [p.aldi_brand, p.biedronka_brand].filter(Boolean).join(' / ') : null),
        side(p, 'Aldi', p.aldi_price, p.aldi_card), side(p, 'Biedronka', p.biedronka_price, p.biedronka_card),
        num(p.cheaper === 'equal' ? '=' : '−' + zl(p.diff))];
      }));
      t.classList.add('cmp');
      var card = cardWith('scale', 'Aldi vs Biedronka', 'Неделя ' + dm(cmp.week_start) + '–' + dm(A.addDays(cmp.week_start, 6)), t);
      if (n) card.appendChild(el('div', 'foot mu', 'Если брать там, где дешевле: ≈ ' + zl(save) + ' zł на ' + n + ' ' +
        A.plural(n, ['товаре', 'товарах', 'товарах'])));
      body.appendChild(card);
    }
    function drop(b) {
      batches = batches.filter(function (x) { return x !== b; });
      render();
    }
    function render() {
      if (!A.shopIs('picks') || !body.isConnected || !batches) return;
      chips();
      clear(body);
      var q = pickQ.trim().toLowerCase(), shown = 0;
      compareCard();
      batches.forEach(function (b) {
        var cs = b.candidates || [];
        var hits = cs.filter(function (c) {
          return (!q || (c.label + ' ' + A.plain(c.line)).toLowerCase().indexOf(q) >= 0) && (!pickCat || catOf(c) === pickCat);
        });
        if ((q || pickCat) && !hits.length) return;
        shown++;
        var sel = cs.filter(function (c) { return c.selected; }).length;
        var head = D.section(b.title, [b.chain, 'выбрано ' + sel + ' из ' + cs.length].filter(Boolean).join(' · '));
        var done = label(el('button', 'btn'), 'check', 'Готово → в список');
        var skip = label(el('button', 'btn ghost'), 'x', 'Пропустить');
        done.type = skip.type = 'button';
        done.onclick = function () {
          A.flushBatch(b).then(function () {
            api('telegram-webhook', { action: 'pick_done', batch: b.id }).then(function (j) {
              toast('Добавил ' + j.added);
              drop(b);
            }, function (e) { if (e.code === 'closed') drop(b); });
          });
        };
        skip.onclick = function () {
          A.flushBatch(b).then(function () {
            api('telegram-webhook', { action: 'pick_skip', batch: b.id }).then(function () { drop(b); },
              function (e) { if (e.code === 'closed') drop(b); });
          });
        };
        head.appendChild(add(el('div', 'dbtns'), done, skip));
        var grid = el('div', 'dprods');
        hits.forEach(function (c) {
          var cell = prodCell(c, b.chain);
          var tb = cell.querySelector('.dpic .tb');
          if (tb) { tb.tabIndex = -1; tb.onclick = null; }
          cell.setAttribute('aria-pressed', c.selected ? 'true' : 'false');
          A.tap(cell, function () {
            A.haptic();
            A.markPick(c, b, render, function () { drop(b); });
          });
          grid.appendChild(cell);
        });
        add(body, head, grid);
      });
      if (!shown) body.appendChild(A.state(q || pickCat ? 'search' : 'tag',
        q || pickCat ? 'Ничего не нашлось' : 'Подборок акций пока нет — новые приходят с газетками (вс, пн, чт)'));
    }
    function load() {
      add(clear(body), A.skeleton(2));
      api('telegram-webhook', { action: 'compare' }, undefined, true).then(function (j) { cmp = j; render(); }, noop);
      api('telegram-webhook', { action: 'picks' }, undefined, true).then(function (j) {
        batches = j.batches || [];
        A.keepPicks(batches, render);
        render();
      }, function (e) { if (!e.login && A.shopIs('picks')) A.failed(body, load); });
    }
    load();
  });

  // --- «Покупки» (docs/specs/shop-tab.md): the phone's «Список · Акции · Цены» switch, then the wide view of the
  // segment registered above (or desktop-a's «Цены»); the phone's segment view while that file is still on its way ---
  D.views.shop = function () {
    if (!D.table) return A.views.shop();
    A.main.appendChild(A.shopSegs());
    var k = ['list', 'picks', 'prices'].filter(A.shopIs)[0];
    (D.views[k] || A.views[k])();
  };

  // --- wish: the add form in one row, then the watched products as a table ---
  var wishUrl = '', wishTarget = '';
  view('wish', function (main) {
    // Whose list (docs/specs/wishlist-tetyana.md): the segment filters rows, the chip files the add under her.
    var person = A.store('wishPerson') === 'tetyana' ? 'tetyana' : 'me', forHer = person === 'tetyana';
    var seg = el('div', 'seg fit'), segs = {};
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Чей список');
    [['me', 'Мой'], ['tetyana', 'Тетяна']].forEach(function (p) {
      var b = segs[p[0]] = el('button', '', p[1]);
      b.type = 'button';
      b.onclick = function () { if (person !== p[0]) pick(p[0]); };
      seg.appendChild(b);
    });
    var her = el('button', 'pill', 'для Тетяны');
    her.type = 'button';
    her.onclick = function () { setHer(!forHer); };
    function setHer(v) {
      forHer = v;
      her.className = 'pill' + (v ? ' acc' : '');
      her.setAttribute('aria-pressed', String(v));
    }
    function pick(p) {
      person = p;
      A.store('wishPerson', p);
      for (var k in segs) segs[k].className = k === p ? 'on' : '';
      setHer(p === 'tetyana');
      render();
    }
    for (var k in segs) segs[k].className = k === person ? 'on' : '';
    setHer(forHer);
    var form = el('form', 'dtool'), url = input('Ссылка на товар', wishUrl, 'url'), target = input('Цель, zł', wishTarget);
    url.oninput = function () { wishUrl = url.value; };
    target.setAttribute('inputmode', 'decimal');
    target.oninput = function () { wishTarget = target.value; };
    var go = el('button', 'btn', 'Следить');
    go.type = 'submit';
    form.onsubmit = function (ev) {
      ev.preventDefault();
      var u = url.value.trim(), t = target.value.replace(/\s/g, '');
      if (!u || !t) return toast('Нужны ссылка и цель');
      go.disabled = true;
      var whose = forHer ? 'tetyana' : 'me';
      api('telegram-webhook', { action: 'wish_add', url: u, target: t, person: whose }).then(function (j) {
        go.disabled = false;
        var host = u;
        try { host = new URL(u).hostname; } catch (e) {}
        toast('Слежу: ' + (j.title || host) + (j.price != null ? ' · сейчас ' + zl(j.price) + ' zł' : ''));
        wishUrl = wishTarget = url.value = target.value = '';
        if (whose !== person) pick(whose); // show the list the item went to
        load();
      }, function (e) {
        go.disabled = false;
        if (!e.code) load(); // a slow shop can outlast the timeout and still be added
      });
    };
    var body = add(el('div'), A.skeleton(1));
    add(main, seg, add(form, field('link', url, 'grow'), field('target', target, 'w180'), her, go), body);
    var rows = [];

    function render() {
      if (!on('wish') || !body.isConnected) return;
      clear(body);
      var shown = rows.filter(function (r) { return (r.person || 'me') === person; });
      if (!shown.length) {
        body.appendChild(A.state('gift', person === 'tetyana' ? 'Пусто. Вставь ссылку на её товар и цель.' : 'Пусто. Вставь ссылку и цель.'));
        try { url.focus(); } catch (e) {}
        return;
      }
      var t = D.table([{ h: 'Товар' }, { h: 'Сейчас', r: true, w: '130px' }, { h: 'Цель', r: true, w: '110px' },
        { h: 'До цели', w: '200px' }, { h: 'Статус', w: '170px' }, { h: 'Проверено', r: true, w: '110px' }, { h: '', w: '96px' }],
      shown.map(function (r) {
        var last = r.last_price == null ? null : Number(r.last_price), goal = Number(r.target);
        var gap = el('div', 'dgap');
        if (last != null && last > 0) {
          var meter = el('div', 'meter'), f = el('i');
          f.style.width = Math.max(2, Math.min(1, goal / last) * 100) + '%';
          add(gap, add(meter, f), el('span', 'mu dmono', last > goal ? 'ещё ' + zl(last - goal) + ' zł' : 'цель достигнута'));
        } else gap.appendChild(el('span', 'mu', '—'));
        var x = confirmed('x', 'Убрать', function () {
          api('telegram-webhook', { action: 'wish_remove', id: r.id }).then(function () {
            toast('Убрал');
            load();
          }, function (e) { if (e.code === 'no such item') load(); });
        });
        return [add(el('div', 'tx'), add(el('div', 't'), link(r.title || r.host, r.url),
          r.in_stock === false ? pill('нет в наличии') : null), el('div', 'mu', r.host)),
          num(last == null ? '—' : zl(last) + ' zł'), num(zl(r.target) + ' zł'), gap,
          pill(r.status === 'reached' ? A.ict('target', A.WISH_STATUS.reached) : A.WISH_STATUS[r.status] || r.status, A.WISH_PILL[r.status] || ''),
          num(r.last_checked ? A.dmt(r.last_checked) : '—'), hovActs(x)];
      }), { onRow: function (k) { A.openLink(shown[k].url); } });
      body.appendChild(countPill(cardWith('gift', 'Слежу за ценой', null, t), shown.length));
    }
    function load() {
      api('telegram-webhook', { action: 'wish' }, undefined, true).then(function (j) {
        rows = j.rows || [];
        render();
      }, function (e) { if (!e.login && on('wish')) A.failed(body, load); });
    }
    load();
  });

  // --- dela: the add row on top, the counts, then one table by date ---
  var delaText = '', delaDue = '';
  function left(n) { return n < 0 ? 'просрочено ' + -n + ' дн' : n === 0 ? 'сегодня' : 'через ' + n + ' дн'; }
  view('dela', function (main) {
    var p = A.wp(Date.now()), today = p.year + '-' + p.month + '-' + p.day;
    var form = el('form', 'dtool'), what = input('Что сделать', delaText), when = el('input');
    what.maxLength = 80;
    what.oninput = function () { delaText = what.value; };
    when.type = 'date';
    when.min = today;
    when.setAttribute('aria-label', 'Дата срока');
    when.value = delaDue;
    when.oninput = function () { delaDue = when.value; };
    var go = label(el('button', 'btn'), 'plus', 'Срок');
    go.type = 'submit';
    form.onsubmit = function (ev) {
      ev.preventDefault();
      var t = what.value.trim(), d = when.value;
      if (!t || !d) return toast('Нужны текст и дата');
      if (d < today) return toast('Дата — сегодня или позже');
      go.disabled = true;
      A.haptic();
      api('telegram-webhook', { action: 'deadline_add', title: t, date: d }).then(function (j) {
        go.disabled = false;
        toast(j.title + ' · ' + dm(j.due) + ' — напомню за 7 и за 1 день', 'calendar-clock');
        delaText = delaDue = what.value = when.value = '';
        load();
      }, function () { go.disabled = false; });
    };
    var body = add(el('div'), A.skeleton(2));
    add(main, add(form, field('file', what, 'grow'),
      add(el('label', 'field w240'), icon('calendar'), el('span', 'mu', 'дата срока'), when), go), body);

    function act(params, done) {
      A.haptic();
      api('telegram-webhook', params).then(function (j) { toast(done(j)); load(); }, function (e) {
        if (e.code === 'no such row') load();
      });
    }
    function render(items) {
      if (!on('dela') || !body.isConnected) return;
      clear(body);
      if (!items.length) {
        body.appendChild(A.state('check', 'Открытых дел нет'));
        try { what.focus(); } catch (e) {}
        return;
      }
      items = items.slice().sort(function (x, y) { return x.days - y.days; });
      var over = items.filter(function (i) { return i.days < 0; }).length;
      var week = items.filter(function (i) { return i.days >= 0 && i.days <= 7; }).length;
      body.appendChild(D.tiles([{ k: 'Просрочено', v: String(over) }, { k: 'Ближайшие 7 дней', v: String(week) },
        { k: 'Потом', v: String(items.length - over - week) }]));
      var t = D.table([{ h: '', w: '52px' }, { h: 'Что' }, { h: 'Срок', r: true, w: '90px' }, { h: 'Осталось', w: '150px' },
        { h: 'Вид', w: '120px' }, { h: '', w: '230px' }], items.map(function (i) {
        var tile = add(el('span', 'ptile'), icon(A.DELA_ICON[i.kind] || 'tack'));
        tile.setAttribute('aria-hidden', 'true');
        var acts = hovActs(i.can_done ? confirmed('check', A.DELA_DONE[i.kind] || 'Сделано', function () {
          act({ action: 'dela_done', kind: i.kind, id: i.id }, function () { return A.DELA_DONE[i.kind]; });
        }) : null, i.can_snooze ? pg('clock', '+3 дня', function () {
          act({ action: 'dela_snooze', kind: i.kind, id: i.id }, function (j) { return 'Отложено до ' + dm(j.snoozed_until); });
        }) : null);
        return [tile, add(el('div', 'tx'), add(el('div', 't', i.title), i.snoozed_until ? pill(A.ict('clock', 'до ' + dm(i.snoozed_until))) : null),
          A.delaHint(i) ? el('div', 'hint', A.delaHint(i)) : i.sub ? el('div', 'mu', i.sub) : null),
        num((i.approx ? '≈' : '') + dm(i.due)), pill(left(i.days), i.days <= 3 ? 'bad' : ''),
        el('span', 'mu', A.DELA_KIND[i.kind] || ''), acts];
      }), { cls: function (k) { return items[k].days < 0 ? 'over' : ''; } });
      body.appendChild(countPill(cardWith('tack', 'Дела по сроку', null, t), items.length, over ? 'bad' : ''));
    }
    function load() {
      api('telegram-webhook', { action: 'dela' }, undefined, true).then(function (j) { render(j.items || []); }, function (e) {
        if (!e.login && on('dela')) A.failed(body, load);
      });
    }
    load();
  });

  // --- money: the month switch and «Трата» on top, the sums, the spends table on the left, the categories, the
  // accounts and the subscriptions on the right (docs/specs/money.md, money-3.md). The month, the filter, the sheets and the formats are index.html's (APP.MONEY…), so
  // the phone and the Mac show the same month. ---
  view('money', function (main) {
    var tool = el('div', 'dtool'), body = add(el('div'), A.skeleton(2)), data = null, subs = el('div');
    add(main, tool, body);
    function load() {
      A.moneyLoad(body, render, load);
      A.moneySubs(subs, function () { return on('money'); });
    }
    function render(j) {
      if (!on('money') || !body.isConnected) return;
      data = j;
      var go = label(el('button', 'btn'), 'plus', 'Трата');
      go.type = 'button';
      go.onclick = function () { A.moneySheet(null, load, go); };
      add(clear(tool), A.moneyNav(function (n) { A.moneyGo(n, load); }), go);
      clear(body);
      var rows = j.rows || [], M = A.MONEY, d = Math.round(((j.total || 0) - (j.prev_total || 0)) * 100) / 100;
      var tiles = [{ k: 'За месяц', v: A.moneyFmt(j.total) }, { k: 'Прошлый месяц', v: A.moneyFmt(j.prev_total || 0) },
        { k: 'Разница', v: (d > 0 ? '+' : d < 0 ? '−' : '') + A.moneyFmt(Math.abs(d)) }, { k: 'Покупок', v: String(rows.length) }];
      (j.other || []).forEach(function (o) { tiles.push({ k: 'Не в злотых', v: A.moneyFmt(o.sum, o.currency) }); });
      body.appendChild(D.tiles(tiles));
      if (!rows.length) return body.appendChild(add(el('div', 'card'), A.moneyEmpty()));
      var cats = A.moneyCats(j, function (k) { M.filter = k; render(data); }, load);
      var accts = A.moneyAccts(j, function (k) { M.acct = k; render(data); });
      var list = rows.filter(A.moneyShown);
      var t = D.table([{ h: '', w: '52px' }, { h: 'Где' }, { h: 'Категория', w: '190px' }, { h: 'Когда', w: '210px' },
        { h: 'Сумма', r: true, w: '130px' }, { h: '', w: '120px' }], list.map(function (r) {
        // Under the merchant, as on the phone: the account, then the note.
        var c = A.moneyCat(r.category), tile = A.moneyTile(r.merchant, c[2]), sub = [A.moneyAcctName(r.account), r.note].filter(Boolean).join(' · ');
        return [tile, add(el('div', 'tx'), el('div', 't', r.merchant || 'Без названия'), sub ? el('div', 'mu', sub) : null),
          el('span', 'mu', c[1]), el('span', 'num nowrap', A.moneyDay(r.at) + ' · ' + A.moneyTime(r.at)), num(A.moneyFmt(r.amount, r.currency)),
          hovActs(confirmed('trash', 'Удалить', function () { A.moneyDelete(r, load); }))];
      }), { onRow: function (k) { A.moneySheet(list[k], load, t.tBodies[0].rows[k]); } });
      var card = cardWith('wallet', 'Траты', null, t);
      A.moneyFilterChips(card.firstChild, function () { render(data); });
      if (j.more) card.appendChild(el('div', 'mday', 'Показаны последние ' + rows.length + ' трат месяца'));
      var p = D.panes(card, add(el('div'), cats, accts, subs));
      p.classList.add('dmoney');
      body.appendChild(p);
    }
    load();
  });

  // --- inbox: the drops on the left, the selected one in full on the right ---
  var IB = { link: ['link', 'ссылка'], text: ['sticky-note', 'текст'], photo: ['image', 'фото'], document: ['file', 'файл'],
    voice: ['mic', 'голос'], video: ['video', 'кружок'], forward: ['forward', 'пересылка'], other: ['inbox', 'другое'] };
  var URLS = /(https?:\/\/\S+)/;
  var inboxStep = null; // ↑/↓ move the selection while «Инбокс» is open
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!inboxStep || !on('inbox') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); inboxStep(e.key === 'ArrowDown' ? 1 : -1); }
  });
  // The text with its URLs as links; newlines kept (the pane is pre-wrap).
  function linked(s, box) {
    String(s).split(URLS).forEach(function (x, k) {
      if (!x) return;
      box.appendChild(k % 2 ? link(x, x) : document.createTextNode(x));
    });
    return box;
  }
  function firstLine(r) {
    var s = String(r.text || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean)[0] || '';
    return s || (r.file_name || (IB[r.kind] || IB.other)[1]);
  }
  view('inbox', function (main) {
    var body = add(main, add(el('div'), A.skeleton(2))).lastChild;
    var rows = [], sel = 0;

    function act(r, what, ic, s) {
      var b = label(el('button', what === 'done' ? 'btn' : 'btn ghost'), ic, s);
      b.type = 'button';
      b.onclick = function () {
        A.haptic();
        b.disabled = true;
        api('telegram-webhook', { action: 'inbox_mark', id: r.id, what: what }, 30000, true)
          .then(function (j) { toast(j.answer); load(); }, function (e) { if (!e.login) { toast(e.answer); load(); } });
      };
      return b;
    }
    function detail(r) {
      var k = IB[r.kind] || IB.other, card = A.mkCard('inbox', k[1], [A.whenW(r.received_at), r.file_name].filter(Boolean).join(' · '));
      var tile = el('span', 'ptile', k[0]);
      tile.setAttribute('aria-hidden', 'true');
      card.firstChild.replaceChild(tile, card.firstChild.firstChild);
      card.appendChild(r.text ? linked(r.text, el('div', 'dfull')) : el('div', 'dfull mu', 'Без текста'));
      var urls = (r.urls || []).filter(function (u) { return String(r.text || '').indexOf(u) < 0; });
      if (urls.length) {
        var ul = el('div', 'durls');
        urls.forEach(function (u) { ul.appendChild(add(el('div'), link(u, u))); });
        card.appendChild(ul);
      }
      card.appendChild(add(el('div', 'foot'), act(r, 'done', 'check', 'Готово'), act(r, 'skip', 'x', 'Пропустить'),
        r.can_watch ? act(r, 'watch', 'target', 'Следить') : null, r.can_list ? act(r, 'list', 'cart', 'В список') : null));
      return card;
    }
    function render() {
      if (!on('inbox') || !body.isConnected) return;
      clear(body);
      inboxStep = null;
      if (!rows.length) return body.appendChild(A.state('inbox', 'Инбокс пуст'));
      if (sel >= rows.length) sel = rows.length - 1;
      var list = countPill(A.mkCard('inbox', 'Новые', '↑ ↓ — выбрать'), rows.length), pane = el('div');
      var nodes = rows.map(function (r, i) {
        var k = IB[r.kind] || IB.other, tile = add(el('span', 'ptile'), icon(k[0]));
        tile.setAttribute('aria-hidden', 'true');
        var row = add(el('div', 'row'), tile, add(el('span', 'tx'), el('div', 't one', firstLine(r)),
          el('div', 'mu num', A.whenW(r.received_at) + ' · ' + k[1])));
        A.tap(row, function () { pick(i); });
        list.appendChild(row);
        return row;
      });
      function pick(i) {
        sel = i;
        nodes.forEach(function (n, j) { n.classList.toggle('sel', j === i); n.setAttribute('aria-current', j === i ? 'true' : 'false'); });
        add(clear(pane), detail(rows[i]));
      }
      inboxStep = function (d) {
        var i = Math.max(0, Math.min(rows.length - 1, sel + d));
        pick(i);
        try { nodes[i].focus({ preventScroll: false }); } catch (e) {}
      };
      body.appendChild(D.panes(list, pane));
      pick(sel);
    }
    function load() {
      api('telegram-webhook', { action: 'inbox' }, undefined, true).then(function (j) { rows = j.rows || []; render(); }, function (e) {
        if (!e.login && on('inbox')) A.failed(body, load);
      });
    }
    load();
  });

  // --- feed: the digest and «Медицина» on the left, the stream on the right ---
  var STREAMS = [['events', 'События'], ['all', 'все'], ['city', 'Варшава'], ['transport', 'транспорт'], ['legal', 'легализация'], ['world', 'Мир']];
  var SOURCES = {
    'infor-legal': 'infor.pl', udsc: 'UdSC', muw: 'MUW', warszawa: 'warszawa.pl', wtp: 'WTP', ukrinform: 'Ukrinform',
    tvn24: 'TVN24', polsatnews: 'Polsat News', pravda: 'Українська правда'
  };
  view('feed', function (main) {
    var stream = A.store('stream');
    if (!/^(events|all|city|transport|legal|world)$/.test(stream)) stream = 'all';
    var seg = el('div', 'seg'), segs = {}, dig = el('div'), med = el('div'), body = el('div');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Поток');
    STREAMS.forEach(function (s) {
      var b = segs[s[0]] = el('button', '', s[1]);
      b.type = 'button';
      b.onclick = function () { stream = s[0]; A.store('stream', stream); load(); };
      seg.appendChild(b);
    });
    var right = add(el('div'), add(el('div', 'dtool'), seg), body);
    var panes = D.panes(add(el('div', 'dfl'), dig, med), right);
    main.appendChild(panes);
    function solo() { panes.classList.toggle('solo', !dig.firstChild && !med.firstChild); }
    right.classList.remove('side'); // the stream is the long column: it scrolls with the page

    // «Выжимка»: the group's morning digest; nothing when there is none.
    function digest(d) {
      var picks = (d && d.picks) || [];
      clear(dig);
      if (!on('feed') || !dig.isConnected || !picks.length) return solo();
      var card = A.mkCard('news', 'Выжимка · ' + dm(d.day));
      picks.forEach(function (p) {
        card.appendChild(add(el('div', 'row'), add(el('span', 'tx'), document.createTextNode(p.line + ' · '),
          link(SOURCES[p.source] || p.source, p.url))));
      });
      dig.appendChild(card);
      solo();
    }
    function money(v) { var n = Number(v); return Number.isInteger(n) ? String(n) : zl(n); }
    function loadMed() {
      api('miniapp', { action: 'med' }, undefined, true).then(function (j) {
        var rows = (j.rows || []).slice(0, 8);
        clear(med);
        if (!on('feed') || !med.isConnected || !rows.length) return solo();
        var card = A.mkCard('steth', 'Медицина');
        rows.forEach(function (r) {
          var dt = r.discount_text ? String(r.discount_text).replace(/^-/, '−') : '';
          var deal = dt ? dt + (r.code ? ' по коду ' + r.code : '') : r.code ? 'по коду ' + r.code : '';
          card.appendChild(add(el('div', 'row'), add(el('span', 'tx'), add(el('div'), el('span', 'mu', r.provider + ' · '), link(r.title, r.url)),
            el('div', 'mu', [r.price != null ? money(r.price) + ' zł' : '', deal, r.valid_to ? 'до ' + dm(r.valid_to) : '']
              .filter(Boolean).join(' · ')))));
        });
        med.appendChild(card);
        solo();
      }, function (e) { if (!e.login && on('feed')) A.failed(med, loadMed); });
    }
    function at(ts) { var q = A.wp(ts); return q.day + '.' + q.month + ' ' + q.hour + ':' + q.minute; }
    function render(rows) {
      clear(body);
      if (!rows.length) return body.appendChild(A.state('news', 'Новостей пока нет'));
      var t = D.table([{ h: 'Время', w: '124px' }, { h: 'Источник', w: '150px' }, { h: 'Заголовок' }], rows.map(function (r) {
        return [num(r.published_at ? at(r.published_at) : '—'), el('span', 'mu', SOURCES[r.source] || r.source),
          add(el('div', 'tx'), el('div', 't one', r.title), r.summary ? el('div', 'mu one', r.summary) : null)];
      }), { onRow: function (k) { A.openLink(rows[k].url); } });
      t.classList.add('fixed');
      body.appendChild(countPill(cardWith('news', 'Лента', null, t), rows.length));
    }
    // «События»: openings with the place, upcoming events by section, each a table with «В календарь» (the bot's .ics).
    function when(ts) {
      var q = A.wp(ts);
      return A.WEEK[A.wd(q.year + '-' + q.month + '-' + q.day)] + ' ' + q.day + '.' + q.month +
        (q.hour + q.minute === '0000' ? '' : ' ' + q.hour + ':' + q.minute);
    }
    function events(j) {
      clear(body);
      var up = j.upcoming || [];
      [['', 'Открытия', j.openings || []], ['free', 'Бесплатно и рядом'], ['malls', 'ТЦ: Wola Park, Arkadia, Blue City'],
        ['big', 'Фестивали и концерты']].forEach(function (g) {
        var rows = g[2] || up.filter(function (r) { return r.section === g[0]; });
        if (!rows.length) return;
        var t = D.table([{ h: 'Когда', w: '150px' }, { h: 'Что' }, { h: 'Где', w: '120px' }, { h: '', w: '148px' }], rows.map(function (r) {
          var ts = g[0] ? r.starts_at : r.published_at || r.seen_at, ics = null;
          if (r.starts_at && r.id) {
            ics = pg('calendar-plus', 'В календарь', function () {
              A.haptic();
              api('telegram-webhook', { action: 'calendar_ics', id: r.id }).then(function () { toast('Файл отправил в чат с ботом'); }, noop);
            });
            ics.setAttribute('aria-label', 'Событие в календарь (.ics)');
          }
          return [num(ts ? (g[0] ? when(ts) : A.dmt(ts)) : '—'), el('div', 't one', r.title), el('span', 'mu one', r.place || ''), hovActs(ics)];
        }), { onRow: function (k) { A.openLink(rows[k].url); } });
        t.classList.add('fixed');
        body.appendChild(countPill(cardWith(g[0] ? 'calendar' : 'pin', g[1], null, t), rows.length));
      });
      if (!body.firstChild) body.appendChild(A.state('calendar', 'Пока ничего — первый дайджест в 10:00'));
    }
    function load() {
      for (var k in segs) segs[k].className = k === stream ? 'on' : '';
      var mine = stream;
      add(clear(body), A.skeleton(1));
      api('miniapp', mine === 'events' ? { action: 'events' } : { action: 'news', stream: stream }, undefined, true).then(function (j) {
        if (!on('feed') || !body.isConnected || mine !== stream) return;
        if (mine === 'events') events(j); else { digest(j.digest); render(j.rows || []); }
      }, function (e) { if (!e.login && on('feed') && mine === stream) A.failed(body, load); });
    }
    // Opened on «События»: the digest still comes from the news answer.
    if (stream === 'events') api('miniapp', { action: 'news', stream: 'all' }, undefined, true).then(function (j) { digest(j.digest); }, noop);
    loadMed();
    load();
  });
})();
