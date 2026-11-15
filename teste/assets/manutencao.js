// OS de manutenção geradas pela inspeção (roda depois de inspecao.js, com window.D e window.MANUTENCAO de
// scripts/manutencao.py; as canceladas já ficaram de fora). "Insp→manut" no menu Camadas do mapa, com "Faixa" e
// "Inspeção": um losango por poste com as OS dele, na cor da pior situação; fica por cima do que estiver ligado (com a
// Manutenção, de executadas.js, também ligada, o losango dela no mesmo poste fica um pouco deslocado: os dois aparecem).
// Situação pela data do dia: vencida (não executada e o prazo já passou), no prazo, executada.
// Posição: o poste da ESTRUTURA da OS. Sem o poste no mapa, tocar na OS mostra o bloco da inspeção que a gerou.
// No painel: o alimentador ao lado do polo dele (as três situações), tipos e uma linha por situação (liga/desliga no mapa; abre as OS dela embaixo). Usa o visual do cartão da limpeza (classes limp-* do limpeza.js).
(function () {
  const MN = window.MANUTENCAO;
  if (!MN || !window.D) return;
  const map = window.__map;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const br = d => d ? d.split('-').reverse().join('/') : '—';
  const nf = n => n.toLocaleString('pt-BR');
  const guarda = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } return null; };
  const celular = () => matchMedia('(max-width:980px)').matches;
  const telaCheia = () => document.body.classList.contains('tela-cheia');
  const H = new Date();
  const HOJE = `${H.getFullYear()}-${String(H.getMonth() + 1).padStart(2, '0')}-${String(H.getDate()).padStart(2, '0')}`;

  const SIT = { venc: ['Vencidas', '#ef4444'], pend: ['No prazo', '#f59e0b'], exec: ['Executadas', '#22c55e'] };
  const ORDEM = ['venc', 'pend', 'exec'];
  const sitDe = o => o.sit === 'EXECUTADA' ? 'exec' : o.limite && o.limite < HOJE ? 'venc' : 'pend';
  const quando = o => sitDe(o) === 'exec' ? `executada ${br(o.exec)}` : sitDe(o) === 'venc' ? `venceu ${br(o.limite)}` : `prazo ${br(o.limite)}`;
  const POR_SIT = Object.fromEntries(ORDEM.map(s => [s, MN.os.map((o, k) => k).filter(k => sitDe(MN.os[k]) === s)]));
  // o polo do alimentador (assets/manutencao-polos.js, gera_trechos.manutencao_polos): a mesma conta por situação, somada
  // nos alimentadores do polo, para comparar no bloco
  const MP = window.MANUT_POLOS, PID = MP && MP.al[(D.meta || {}).al], PO = PID && MP.polos[PID];
  const DO_POLO = PO && {
    venc: Object.entries(PO.lim).reduce((s, [d, n]) => s + (d && d < HOJE ? n : 0), 0),
    pend: Object.entries(PO.lim).reduce((s, [d, n]) => s + (d && d < HOJE ? 0 : n), 0),
    exec: PO.exec,
  };
  const TIPOS = Object.entries(MN.os.reduce((m, o) => (m[o.tipo] = (m[o.tipo] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
  // um ponto por poste
  const POSTES = new Map();
  MN.os.forEach((o, k) => {
    if (!o.ll) return;
    if (!POSTES.has(o.poste)) POSTES.set(o.poste, { poste: o.poste, ll: o.ll, ks: [] });
    POSTES.get(o.poste).ks.push(k);
  });
  // postes de cada trecho (pontas dos vãos), para o detalhe do trecho
  const postesDoTrecho = {};
  D.vaos.forEach(v => { const n = D.trechos[v[4]].nome; (postesDoTrecho[n] = postesDoTrecho[n] || new Set()).add(v[6]); postesDoTrecho[n].add(v[7]); });

  const st = {
    ligado: guarda('mnt-ligado') === '1',
    sits: new Set(ORDEM),
    foco: null,
    grupos: new Set(),       // situações abertas, com as OS embaixo
  };

  const css = document.createElement('style');
  css.textContent = `
.ctl-card .ctl-mnt{background-image:linear-gradient(90deg,${SIT.venc[1]},${SIT.pend[1]},${SIT.exec[1]});background-repeat:no-repeat;background-size:100% 3px;background-position:0 100%}
.ctl-card .ctl-mnt[aria-pressed=false]{opacity:.6;text-decoration:line-through;background-image:none;box-shadow:inset 0 -3px 0 #5a636a}
.mnt-m{position:relative;width:0;height:0;cursor:pointer}
.mnt-m i{position:absolute;left:-7px;top:-7px;width:14px;height:14px;box-sizing:border-box;transform:rotate(45deg);border-radius:2px;background:var(--c);
  border:2px solid #fff;box-shadow:0 0 0 1.5px #0b0f14,0 1px 4px #0008}
.mnt-m b{position:absolute;left:6px;top:-18px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:#0b0f14;
  color:#fff;font:700 10.5px/16px var(--f-mono);text-align:center;box-shadow:0 0 0 1.5px #fff}
.mnt-m.foco i{left:-11px;top:-11px;width:22px;height:22px;border-width:3px;box-shadow:0 0 0 3px #fde047,0 2px 8px #000a}
.mnt-m.apaga{opacity:.35}
/* Manutenção (executadas.js) também ligada: o losango dela desce para a direita, para não cobrir o deste no mesmo poste */
.leaflet-marker-pane:has(.mnt-m) .exe-m{left:9px;top:9px}
.mnt-polo{margin-top:var(--s2)}.mnt-polo td:first-child{font:600 var(--t-sm) var(--f-body)}.mnt-polo small{font-weight:400;color:var(--muted)}
.mnt-lg{display:grid;gap:0;padding:var(--s1);background:var(--vidro);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:var(--vidro-fg);
  border:1px solid var(--vidro-borda);border-radius:var(--r2);box-shadow:var(--sh-vidro);font:var(--t-xs)/1.2 var(--f-body)}
.mnt-lg[hidden]{display:none}
.mnt-lg>span{padding:4px var(--s2) 2px;font-weight:700}
.mnt-lg button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:var(--s2);min-height:30px;padding:0 var(--s2);border-radius:var(--r1)}
.mnt-lg button:hover{background:var(--vidro-hover)}
.mnt-lg button:focus-visible{outline:2px solid var(--foco-mapa);outline-offset:-2px}
.mnt-lg button[aria-pressed=false]{opacity:.55;text-decoration:line-through}
.mnt-lg i{width:9px;height:9px;transform:rotate(45deg);background:var(--c);border:1.5px solid #fff;border-radius:1px;flex:none;margin:0 2px}
.mnt-lg em{font:600 var(--t-xs) var(--f-mono);font-style:normal;margin-left:auto;padding-left:var(--s2);opacity:.85}
@media (pointer:coarse){.mnt-lg button{min-height:40px}}
@media (max-width:640px){.mnt-lg>span,.mnt-lg button .nm{display:none}.mnt-lg button{gap:6px;padding:0 8px}.mnt-lg em{padding-left:0}}   /* celular: só o losango e o número */
.mnt-os-b{display:grid;gap:2px;text-align:left;width:100%;min-height:var(--alvo);padding:var(--s2) var(--s3);border:0;border-left:3px solid var(--c);border-radius:0 var(--r1) var(--r1) 0;
  background:color-mix(in srgb,var(--fg) 4%,transparent);color:var(--fg);cursor:pointer;font:var(--t-sm) var(--f-body)}
.mnt-os-b:hover{background:color-mix(in srgb,var(--fg) 8%,transparent)}
.mnt-os-b[aria-pressed=true]{background:var(--sel)}
.mnt-os-b:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.mnt-os-b .q{font:600 var(--t-xs) var(--f-mono);font-variant-numeric:tabular-nums}
.mnt-os-b .s{color:var(--muted);font-size:var(--t-xs)}
.mnt-tipos{margin:0;font-size:var(--t-xs);color:var(--muted)}
.mnt-tipos b{color:var(--fg);font-weight:600}
.mnt-pop .t{font:700 15px var(--f-display);margin-bottom:4px}
.mnt-pop .t small{font:500 12px var(--f-body);color:#5a636a;margin-left:4px}
.mnt-pop .lb-l{border-left:5px solid var(--c);padding:3px 0 3px 7px;margin:4px 0;font-size:12.5px;line-height:1.35}
.mnt-pop .lb-l b{font-family:var(--f-mono);font-size:12.5px}
.mnt-pop .lb-l small{display:block;color:#5a636a}
@media (prefers-reduced-motion:no-preference){.mnt-os-b,.mnt-lg button{transition:background-color var(--dur) var(--ease)}}`;
  document.head.append(css);

  // ---------- mapa ----------
  let camada = null;
  const marcadores = new Map();                       // poste -> marcador
  const visiveis = p => p.ks.filter(k => st.sits.has(sitDe(MN.os[k])));
  function desenha() {
    if (!map) return;
    if (camada) camada.remove();
    camada = null; marcadores.clear();
    if (!st.ligado) return;
    const foco = st.foco !== null ? MN.os[st.foco] : null;
    const ms = [];
    POSTES.forEach(p => {
      const ks = visiveis(p);
      if (!ks.length) return;
      const pior = ORDEM.find(s => ks.some(k => sitDe(MN.os[k]) === s));
      const cls = foco ? (foco.poste === p.poste ? ' foco' : ' apaga') : '';
      const m = L.marker(p.ll, { keyboard: false, zIndexOffset: foco && foco.poste === p.poste ? 3000 : 1500, title: `Poste ${p.poste}: ${ks.length} OS de manutenção`,
        icon: L.divIcon({ className: '', iconSize: null, html: `<div class="mnt-m${cls}" style="--c:${SIT[pior][1]}"><i></i>${ks.length > 1 ? `<b>${ks.length}</b>` : ''}</div>` }) })
        .on('click', e => balao(e, p));
      marcadores.set(p.poste, m);
      ms.push(m);
    });
    camada = L.layerGroup(ms).addTo(map);
  }
  const numInsp = o => o.insp.split(' ').pop();   // "ETO-INPS01 000421/2026" -> "000421/2026"
  function linhaOs(k) {
    const o = MN.os[k], s = sitDe(o);
    return `<div class="lb-l" style="--c:${SIT[s][1]}"><b>${esc(o.tipo)}</b> · ${quando(o)}${o.crit ? ' · ' + esc(o.crit) : ''}` +
      `<small>${esc(o.defeito)}</small><small>${o.insp ? `INSP <a href="#" data-i="${esc(o.insp)}">${esc(numInsp(o))}</a>${o.insp_data ? ' (' + br(o.insp_data) + ')' : ''} → ` : ''}MANUT ${esc(o.os)} · ${esc(o.eq)}</small></div>`;
  }
  function balao(e, p) {
    L.DomEvent.stopPropagation(e);
    const ks = visiveis(p).sort((a, b) => ORDEM.indexOf(sitDe(MN.os[a])) - ORDEM.indexOf(sitDe(MN.os[b])));
    const html = `<div class="mnt-pop"><div class="t">Poste ${esc(p.poste)} <small>${ks.length} OS de manutenção</small></div>${ks.map(linhaOs).join('')}</div>`;
    L.popup({ className: 'limp-popup', maxWidth: 320, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] }).setLatLng(p.ll).setContent(html).openOn(map);
  }
  // link da inspeção de origem (no balão e no painel): liga a Inspeção e foca a OS dela
  const vaiInspecao = num => window.__focaInspecao && window.__focaInspecao(num);
  vaiInspecao.tem = num => !!(num && window.__focaInspecao && window.__focaInspecao(num, true));
  if (map) map.getContainer().addEventListener('click', e => {
    const a = e.target.closest('.mnt-pop a[data-i]');
    if (a) { e.preventDefault(); map.closePopup(); vaiInspecao(a.dataset.i); }
  });

  function enquadra(ll) {
    if (!map) return;
    const mb = document.querySelector('.mapbox');
    if (celular() && !telaCheia() && getComputedStyle(mb).position !== 'sticky') mb.scrollIntoView({ block: 'start' });
    map.invalidateSize();
    map.setView(ll, Math.max(map.getZoom(), 17));
  }
  function focar(k, enquadrar, doPainel) {
    st.foco = st.foco === k ? null : k;
    if (st.foco !== null) {
      const o = MN.os[k];
      st.grupos.add(sitDe(o));                          // abre a linha da situação da OS
      if (o.ll) {
        if (!st.ligado) liga(true);
        st.sits.add(sitDe(o));
        if (enquadrar) enquadra(o.ll);
      } else if (o.insp) vaiInspecao(o.insp);     // sem o poste no mapa: o bloco da inspeção que a gerou
    }
    desenha(); pinta();
    if (!doPainel && window.__rolaPainel) window.__rolaPainel(card, st.foco);
  }
  function liga(on) {
    st.ligado = on; guarda('mnt-ligado', on ? '1' : '0');
    if (!on) st.foco = null;
    desenha(); pinta();
  }
  function alternaSit(s) { st.sits.has(s) ? st.sits.delete(s) : st.sits.add(s); desenha(); pinta(); }

  // legenda (filtro por situação), criada depois dos outros controles da página; extras.js a põe na coluna da direita,
  // embaixo do menu Camadas
  let lg = null;
  const poeLegenda = () => {
    if (!map || lg) return;
    const Leg = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const d = L.DomUtil.create('div', 'mnt-lg');
        d.setAttribute('role', 'group');
        d.setAttribute('aria-label', 'OS de manutenção no mapa');
        L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
        d.addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (b) { e.stopPropagation(); alternaSit(b.dataset.s); } });
        return d;
      },
    });
    lg = new Leg().addTo(map).getContainer();
    pinta();
  };

  // botão "Insp→manut" (OS de manutenção da inspeção) no menu Camadas do mapa (extras.js)
  const l2 = map && window.__ctlMapa ? window.__ctlMapa() : null;
  let btn = null;
  if (l2) {
    const c = document.createElement('div');
    c.className = 'ctl-card';
    c.innerHTML = '<button type="button" class="ctl-mnt" aria-pressed="false" title="Mostrar ou esconder as OS de manutenção geradas pela inspeção">Insp→manut</button>';
    l2.append(c);
    btn = c.querySelector('button');
    btn.addEventListener('click', () => liga(!st.ligado));
  }

  // ---------- cartão no painel ----------
  const card = document.createElement('section');
  card.className = 'limp-card mnt-card';
  card.setAttribute('aria-label', 'OS de manutenção geradas pela inspeção');
  const depois = document.querySelector('.insp-card') || document.querySelector('.limp-card') || $('det');
  if (depois) depois.after(card); else document.querySelector('.panel').append(card);

  const focoHtml = k => {
    const o = MN.os[k];
    return `<div class="limp-foco"><span class="q">${o.insp ? `INSP ${esc(o.insp)} → ` : ''}MANUT ${esc(o.os_completa)} · ${esc(o.tipo)} · ${quando(o)}</span>
      <span>${esc(o.defeito)}</span>
      <span class="limp-nota">Situação: ${esc(o.sit.toLowerCase())}${o.crit ? ' · criticidade ' + esc(o.crit) : ''} · criada ${br(o.criada)} · prazo ${br(o.limite)}${o.exec ? ' · executada ' + br(o.exec) : ''}</span>
      <span class="limp-nota">Equipe ${esc(o.eq)}${o.executora ? ' (' + esc(o.executora) + ')' : ''} · ${o.ll ? 'poste ' + esc(o.poste) : `poste ${esc(o.poste || '—')} não está no mapa: ${vaiInspecao.tem(o.insp) ? 'aparece o bloco da inspeção que a gerou' : 'a inspeção que a gerou também não está no mapa'}`}</span>
      ${o.insp ? `<span class="limp-nota">Gerada pela inspeção <a href="#" data-i="${esc(o.insp)}">${esc(o.insp)}</a>${o.insp_data ? ' de ' + br(o.insp_data) : ''}</span>` : ''}</div>`;
  };
  const osBtn = (k, comFoco) => {
    const o = MN.os[k];
    return `<button type="button" class="mnt-os-b" data-k="${k}" style="--c:${SIT[sitDe(o)][1]}" aria-pressed="${st.foco === k}">` +
      `<span class="q">${o.insp ? `INSP ${esc(numInsp(o))} → ` : ''}MANUT ${esc(o.os)} · ${esc(o.tipo)} · ${quando(o)}</span><span class="s">${esc(o.defeito.slice(0, 110))}${o.defeito.length > 110 ? '…' : ''}${o.ll ? '' : ' · sem o poste no mapa'}</span></button>` +
      (comFoco && st.foco === k ? focoHtml(k) : '');
  };
  // linha de uma situação (o mesmo visual da Faixa): a cor liga/desliga no mapa, o resto abre as OS logo abaixo
  // (montadas só com a linha aberta)
  function linha(s) {
    const ks = POR_SIT[s], aberto = st.grupos.has(s) && ks.length > 0, id = 'mnt-g-' + s, on = st.sits.has(s);
    const i = `<i style="--c:${SIT[s][1]}"></i>`;
    return `<div class="limp-ano-l${st.ligado && !on ? ' off' : ''}">` +
      (st.ligado ? `<button type="button" class="liga" data-a="${s}" data-foco="a${s}" aria-pressed="${on}" aria-label="${SIT[s][0]} no mapa" title="Mostrar/esconder no mapa">${i}</button>`
        : `<span class="cor" aria-hidden="true">${i}</span>`) +
      `<button type="button" class="abre" data-g="${s}" data-foco="g${s}" aria-expanded="${aberto}" aria-controls="${id}"${ks.length ? '' : ' disabled'}><span>${SIT[s][0]}</span><em>${nf(ks.length)} OS</em></button>` +
      `</div><div class="limp-oss" id="${id}" role="group" aria-label="OS ${SIT[s][0].toLowerCase()}"${aberto ? '' : ' hidden'}>${aberto ? ks.map(k => osBtn(k, true)).join('') : ''}</div>`;
  }

  function pinta() {
    const f = document.activeElement;
    const chave = card.contains(f) ? (f.dataset.k !== undefined ? `[data-k="${f.dataset.k}"]` : f.dataset.foco ? `[data-foco="${f.dataset.foco}"]` : null) : null;
    const n = MN.os.length;
    const sub = n ? `${nf(n)} OS · ${ORDEM.map(s => `${nf(POR_SIT[s].length)} ${SIT[s][0].toLowerCase()}`).join(' · ')}` : 'Nenhuma OS gerada pela inspeção';
    const tipos = n ? `<p class="mnt-tipos">${TIPOS.map(([t, c]) => `<b>${esc(t.charAt(0) + t.slice(1).toLowerCase())}</b> ${nf(c)}`).join(' · ')}</p>` : '';
    const polo = DO_POLO ? `<table class="resumo-classe mnt-polo"><tr><th></th>${ORDEM.map(s => `<th>${SIT[s][0]}</th>`).join('')}</tr>` +
      `<tr><td>${esc((D.meta || {}).al)}</td>${ORDEM.map(s => `<td>${nf(POR_SIT[s].length)}</td>`).join('')}</tr>` +
      `<tr><td>Polo ${esc(PO.nome)} <small>${nf(PO.als)} alim.</small></td>${ORDEM.map(s => `<td>${nf(DO_POLO[s])}</td>`).join('')}</tr></table>` : '';
    const resto = polo + (n ? tipos + `<div class="limp-anos">${ORDEM.map(linha).join('')}</div>` : '');
    card.hidden = !st.ligado && !!btn;                    // bloco do Insp→manut só com ele ligado no mapa
    card.innerHTML = `<div class="limp-top"><h2>Insp→manut<small>${sub}</small></h2></div>
      ${resto}`;
    if (chave) card.querySelector(chave)?.focus({ preventScroll: true });
    if (btn) btn.setAttribute('aria-pressed', String(st.ligado));
    if (lg) {
      lg.hidden = !st.ligado || !n;
      lg.innerHTML = '<span>Insp→manut</span>' + ORDEM.map(s => `<button type="button" data-s="${s}" aria-pressed="${st.sits.has(s)}" title="Mostrar/esconder ${SIT[s][0].toLowerCase()}"><i style="--c:${SIT[s][1]}"></i><span class="nm">${SIT[s][0]}</span><em>${nf(POR_SIT[s].length)}</em></button>`).join('');
    }
    if (det) det.querySelectorAll('.mnt-os-b').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.k === st.foco)));
  }
  card.addEventListener('click', e => {
    const a = e.target.closest('a[data-i]');
    if (a) { e.preventDefault(); vaiInspecao(a.dataset.i); return; }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k !== undefined) return focar(+b.dataset.k, true, true);
    if (b.classList.contains('abre')) { const g = b.dataset.g; st.grupos.has(g) ? st.grupos.delete(g) : st.grupos.add(g); return pinta(); }
    if (b.classList.contains('liga') && b.dataset.a) return alternaSit(b.dataset.a);
  });

  // ---------- detalhe do trecho: OS nos postes dele ----------
  const det = $('det');
  function secTrecho(nome) {
    const ps = postesDoTrecho[nome] || new Set();
    const ks = MN.os.map((o, k) => k).filter(k => MN.os[k].ll && ps.has(MN.os[k].poste))
      .sort((a, b) => ORDEM.indexOf(sitDe(MN.os[a])) - ORDEM.indexOf(sitDe(MN.os[b])));
    if (!ks.length) return '';
    const cont = ORDEM.map(s => [s, ks.filter(k => sitDe(MN.os[k]) === s).length]).filter(([, c]) => c);
    return `<section class="limp-sec mnt-sec" aria-live="off"><h3>Insp→manut</h3>
      <dl><dt>OS</dt><dd>${cont.map(([s, c]) => `${nf(c)} ${SIT[s][0].toLowerCase()}`).join(' · ')}</dd></dl>
      ${ks.map(k => osBtn(k, false)).join('')}</section>`;
  }
  function poeDetalhe() {
    if (!det || det.querySelector('.mnt-sec')) return;
    const h2 = det.querySelector('h2');
    if (!h2) return;
    const nome = [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (postesDoTrecho[nome]) det.insertAdjacentHTML('beforeend', secTrecho(nome));
  }
  if (det) {
    new MutationObserver(poeDetalhe).observe(det, { childList: true });
    det.addEventListener('click', e => { const b = e.target.closest('.mnt-os-b'); if (b) focar(+b.dataset.k, true); });
  }

  // ---------- Downloads (em "Dados", extras.js): todas as OS geradas pela inspeção ----------
  if (window.__baixar && window.__csv && MN.os.length) {
    const C = window.__csv;
    const SIT_CSV = { venc: 'vencida', pend: 'no prazo', exec: 'executada' };
    window.__baixar.botao('mnt', 'OS da inspeção (Excel)', () => {
      const ks = MN.os.map((o, k) => k).sort((a, b) => (MN.os[b].criada || '').localeCompare(MN.os[a].criada || ''));
      C(`OS_da_inspecao_${C.al}.csv`,
        ['Alimentador', 'OS', 'Situação', 'Situação hoje', 'Tipo', 'Defeito', 'Criticidade', 'Criada', 'Prazo', 'Execução', 'Equipe', 'Executora',
          'Inspeção', 'Data da inspeção', 'Poste', 'Trechos', 'Latitude', 'Longitude'],
        ks.map(k => {
          const o = MN.os[k];
          return [D.meta.al, o.os_completa || o.os, o.sit, SIT_CSV[sitDe(o)], o.tipo, o.defeito, o.crit, C.data(o.criada), C.data(o.limite),
            C.data(o.exec), o.eq, o.executora, o.insp, C.data(o.insp_data), o.poste, o.poste ? C.trechosPoste(o.poste) : '',
            o.ll ? C.num(o.ll[0]) : '', o.ll ? C.num(o.ll[1]) : ''];
        }));
    }, `Planilha (CSV para o Excel) com as ${MN.os.length} OS geradas pela inspeção`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poeLegenda); else poeLegenda();
  poeDetalhe();
  desenha();
  pinta();
})();
