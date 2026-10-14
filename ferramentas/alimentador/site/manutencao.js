// OS de manutenção geradas pela inspeção (roda depois de inspecao.js, com window.D e window.MANUTENCAO de
// scripts/manutencao.py; as canceladas já ficaram de fora). Card "Insp→manut" no mapa, ao lado do "Faixa" e do
// "Inspeção": um losango por poste com as OS dele, na cor da pior situação; fica por cima do que estiver ligado
// (menos a Manutenção, de executadas.js, que também é de losangos: ligar uma desliga a outra).
// Situação pela data do dia: vencida (não executada e o prazo já passou), no prazo, executada.
// Posição: o poste da ESTRUTURA da OS. Sem o poste no mapa, tocar na OS mostra o bloco da inspeção que a gerou.
// No painel: totais, tipos e as OS por situação. Usa o visual do cartão da limpeza (classes limp-* do limpeza.js).
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
  const TIPOS = Object.entries(MN.os.reduce((m, o) => (m[o.tipo] = (m[o.tipo] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
  const SEM_POSTE = MN.os.filter(o => !o.ll).length;
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
    mais: guarda('mnt-mais') === '1',
    lista: false,
    grupos: new Set(),
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
  function linhaOs(k) {
    const o = MN.os[k], s = sitDe(o);
    return `<div class="lb-l" style="--c:${SIT[s][1]}"><b>${esc(o.tipo)}</b> · ${quando(o)}${o.crit ? ' · ' + esc(o.crit) : ''}` +
      `<small>${esc(o.defeito)}</small><small>OS ${esc(o.os)} · ${esc(o.eq)}${o.insp ? ` · da inspeção <a href="#" data-i="${esc(o.insp)}">${esc(o.insp.split(' ').pop())}</a>` : ''}</small></div>`;
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
  function focar(k, enquadrar) {
    st.foco = st.foco === k ? null : k;
    if (st.foco !== null) {
      const o = MN.os[k];
      st.grupos.add(sitDe(o));
      st.mais = true; st.lista = true;
      if (o.ll) {
        if (!st.ligado) liga(true);
        st.sits.add(sitDe(o));
        if (enquadrar) enquadra(o.ll);
      } else if (o.insp) vaiInspecao(o.insp);     // sem o poste no mapa: o bloco da inspeção que a gerou
    }
    desenha(); pinta();
  }
  function liga(on) {
    st.ligado = on; guarda('mnt-ligado', on ? '1' : '0');
    if (on && window.__soEsteLosango) window.__soEsteLosango('mnt');
    if (!on) st.foco = null;
    desenha(); pinta();
  }
  if (window.__losangos) window.__losangos.mnt = { desliga: () => { if (st.ligado) liga(false); } };
  function alternaSit(s) { st.sits.has(s) ? st.sits.delete(s) : st.sits.add(s); desenha(); pinta(); }

  // legenda (filtro por situação) no canto de cima, embaixo do + e −; criada depois dos outros controles da página
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

  // botão "Insp→manut" (OS de manutenção da inspeção) no mapa, ao lado do "Faixa" e do "Inspeção"
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
    return `<div class="limp-foco"><span class="q">OS ${esc(o.os_completa)} · ${esc(o.tipo)} · ${quando(o)}</span>
      <span>${esc(o.defeito)}</span>
      <span class="limp-nota">Situação: ${esc(o.sit.toLowerCase())}${o.crit ? ' · criticidade ' + esc(o.crit) : ''} · criada ${br(o.criada)} · prazo ${br(o.limite)}${o.exec ? ' · executada ' + br(o.exec) : ''}</span>
      <span class="limp-nota">Equipe ${esc(o.eq)}${o.executora ? ' (' + esc(o.executora) + ')' : ''} · ${o.ll ? 'poste ' + esc(o.poste) : `poste ${esc(o.poste || '—')} não está no mapa: ${vaiInspecao.tem(o.insp) ? 'aparece o bloco da inspeção que a gerou' : 'a inspeção que a gerou também não está no mapa'}`}</span>
      ${o.insp ? `<span class="limp-nota">Gerada pela inspeção <a href="#" data-i="${esc(o.insp)}">${esc(o.insp)}</a>${o.insp_data ? ' de ' + br(o.insp_data) : ''}</span>` : ''}</div>`;
  };
  const osBtn = (k, comFoco) => {
    const o = MN.os[k];
    return `<button type="button" class="mnt-os-b" data-k="${k}" style="--c:${SIT[sitDe(o)][1]}" aria-pressed="${st.foco === k}">` +
      `<span class="q">${esc(o.tipo)} · ${quando(o)} · OS ${esc(o.os)}</span><span class="s">${esc(o.defeito.slice(0, 110))}${o.defeito.length > 110 ? '…' : ''}${o.ll ? '' : ' · sem o poste no mapa'}</span></button>` +
      (comFoco && st.foco === k ? focoHtml(k) : '');
  };
  const grupo = (g, titulo, cor, info, ks) =>
    `<details class="limp-grupo" data-g="${g}"${st.grupos.has(g) ? ' open' : ''}><summary style="--c:${cor}"><i></i>${titulo} <span>${info}</span></summary><div>${ks.map(k => osBtn(k, true)).join('')}</div></details>`;

  function pinta() {
    const f = document.activeElement;
    const chave = card.contains(f) ? (f.dataset.k !== undefined ? `[data-k="${f.dataset.k}"]` : f.dataset.foco ? `[data-foco="${f.dataset.foco}"]` : null) : null;
    const n = MN.os.length;
    const sub = n ? `${nf(n)} OS geradas pelas inspeções (sem as canceladas) · ${ORDEM.map(s => `${nf(POR_SIT[s].length)} ${SIT[s][0].toLowerCase()}`).join(' · ')}` +
      (MN.base_ate ? ` · base até ${br(MN.base_ate)}` : '') : 'Nenhuma OS de manutenção gerada pela inspeção neste alimentador';
    const corpo = st.ligado && n ? `<div class="limp-anos">${ORDEM.map(s => `<div class="limp-ano-l">
        <button type="button" class="liga" data-s="${s}" data-foco="s${s}" aria-pressed="${st.sits.has(s)}" title="Mostrar/esconder no mapa"><i style="--c:${SIT[s][1]}"></i><span>${SIT[s][0]}</span><em>${nf(POR_SIT[s].length)} OS</em></button></div>`).join('')}</div>` : '';
    const tipos = n ? `<p class="mnt-tipos">${TIPOS.map(([t, c]) => `<b>${esc(t.charAt(0) + t.slice(1).toLowerCase())}</b> ${nf(c)}`).join(' · ')}</p>` : '';
    const nota = n ? `<p class="limp-nota">No mapa, um losango por poste (o da ESTRUTURA da OS), na cor da pior situação; o número é a quantidade de OS no poste. Vencida: não executada e o prazo já passou (pela data de hoje).${SEM_POSTE ? ` ${nf(SEM_POSTE)} OS sem o poste no mapa: tocar mostra o bloco da inspeção que a gerou.` : ''}</p>` : '';
    const lista = n ? `<details class="limp-lista"${st.lista ? ' open' : ''}><summary data-foco="lista">Ver as ${nf(n)} OS por situação</summary><div>
        ${ORDEM.filter(s => POR_SIT[s].length).map(s => grupo(s, SIT[s][0], SIT[s][1], `${nf(POR_SIT[s].length)} OS`, POR_SIT[s])).join('')}</div></details>` : '';
    const resto = corpo + tipos + nota + lista;
    card.innerHTML = `<div class="limp-top"><h2>Insp→manut<small>${sub}</small></h2></div>
      ${!st.ligado && btn && n ? '<p class="limp-nota limp-desl">Desligada no mapa: toque em <b>Insp→manut</b>, no canto do mapa, para ver as OS de manutenção nos postes.</p>' : ''}
      ${n ? `<details class="limp-mais"${st.mais ? ' open' : ''}><summary data-foco="mais">Situação, tipos e OS</summary><div>${resto}</div></details>` : ''}`;
    if (chave) card.querySelector(chave)?.focus({ preventScroll: true });
    if (btn) btn.setAttribute('aria-pressed', String(st.ligado));
    if (lg) {
      lg.hidden = !st.ligado || !n;
      lg.innerHTML = '<span>Insp→manut</span>' + ORDEM.map(s => `<button type="button" data-s="${s}" aria-pressed="${st.sits.has(s)}" title="Mostrar/esconder ${SIT[s][0].toLowerCase()}"><i style="--c:${SIT[s][1]}"></i><span class="nm">${SIT[s][0]}</span><em>${nf(POR_SIT[s].length)}</em></button>`).join('');
    }
    if (det) det.querySelectorAll('.mnt-os-b').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.k === st.foco)));
  }
  card.addEventListener('toggle', e => {
    const d = e.target;
    if (d.classList.contains('limp-mais')) { st.mais = d.open; guarda('mnt-mais', d.open ? '1' : '0'); }
    else if (d.classList.contains('limp-lista')) st.lista = d.open;
    else if (d.dataset.g) d.open ? st.grupos.add(d.dataset.g) : st.grupos.delete(d.dataset.g);
  }, true);
  card.addEventListener('click', e => {
    const a = e.target.closest('a[data-i]');
    if (a) { e.preventDefault(); vaiInspecao(a.dataset.i); return; }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k !== undefined) return focar(+b.dataset.k, true);
    if (b.classList.contains('liga') && b.dataset.s) return alternaSit(b.dataset.s);
  });

  // ---------- detalhe do trecho: OS nos postes dele ----------
  const det = $('det');
  function secTrecho(nome) {
    const ps = postesDoTrecho[nome] || new Set();
    const ks = MN.os.map((o, k) => k).filter(k => MN.os[k].ll && ps.has(MN.os[k].poste))
      .sort((a, b) => ORDEM.indexOf(sitDe(MN.os[a])) - ORDEM.indexOf(sitDe(MN.os[b])));
    if (!ks.length) return '';
    const cont = ORDEM.map(s => [s, ks.filter(k => sitDe(MN.os[k]) === s).length]).filter(([, c]) => c);
    return `<section class="limp-sec mnt-sec" aria-live="off"><h3>Manutenção (da inspeção)</h3>
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poeLegenda); else poeLegenda();
  poeDetalhe();
  desenha();
  pinta();
})();
