// Limpeza de faixa (roda depois de alimentador.js e extras.js, com window.D e window.LIMPEZA).
// Duas vistas no mapa:
//   Por ano  — cada ano de limpeza executada com uma cor; liga/desliga por ano; a rede sem limpeza fica cinza-claro.
//   Situação — pela regra T1 a cada 3 anos, T2 a cada 4, T3 a cada 5 (em dia / vence em 12 meses / vencida).
// No painel: anos e OS por ano; tocar numa OS mostra e enquadra no mapa onde ela foi (com ‹ › no mapa para a próxima).
// A posição vem das chaves/ativos citados na OS e dos km da descrição: é aproximada.
(function () {
  const LP = window.LIMPEZA;
  if (!LP || !window.D) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  const br = d => d ? d.split('-').reverse().join('/') : '—';
  const REGRA = LP.regra_anos;
  // executadas só das equipes da regra (prefixo do número da OS); pendentes aparecem de qualquer equipe
  const EQ = (LP.equipes || []).length ? ' pelas equipes ' + (LP.equipes.every(e => e.startsWith('ETO-RD-'))
    ? 'ETO-RD-' + LP.equipes.map(e => e.slice(7)).join('/') : LP.equipes.join(', ')) : '';
  const HOJE = new Date(); HOJE.setHours(0, 0, 0, 0);
  const somaAnos = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setFullYear(x.getFullYear() + n); return x; };
  const iso = x => x.toISOString().slice(0, 10);
  const classeDe = nome => nome.split('-')[0];
  const guarda = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } return null; };
  const celular = () => matchMedia('(max-width:980px)').matches;
  const telaCheia = () => document.body.classList.contains('tela-cheia');

  // cores fixas por ano (iguais em todos os alimentadores), de frio (antigo) a quente (recente)
  const COR_ANO = { 2021: '#a78bfa', 2022: '#60a5fa', 2023: '#22d3ee', 2024: '#4ade80', 2025: '#facc15', 2026: '#fb923c', 2027: '#f87171', 2028: '#f472b6' };
  const corAno = a => COR_ANO[a] || (a < 2021 ? '#c4b5fd' : '#fb7185');
  const SEMCOR = '#cbd5e1';
  const SIT = { dia: ['Em dia', '#22c55e'], vence: ['Vence em até 12 meses', '#facc15'], vencida: ['Vencida', '#ef4444'], sem: ['Sem registro', SEMCOR] };
  function situacao(data, classe) {
    if (!data) return 'sem';
    const v = somaAnos(data, REGRA[classe]);
    if (v < HOJE) return 'vencida';
    const um = new Date(HOJE); um.setFullYear(um.getFullYear() + 1);
    return v < um ? 'vence' : 'dia';
  }

  // ---------- dados (calculados uma vez) ----------
  const vaoPorId = Object.fromEntries(D.vaos.map(v => [v[5], v]));
  const vaosDaOs = LP.os.map(() => []);
  Object.entries(LP.vaos).forEach(([id, ks]) => ks.forEach(k => vaoPorId[id] && vaosDaOs[k].push(vaoPorId[id])));
  const porVao = {};
  D.vaos.forEach(v => {
    const ks = LP.vaos[v[5]] || [];
    const datas = ks.map(k => LP.os[k].data).filter(Boolean).sort();
    porVao[v[5]] = { ks, ult: datas[datas.length - 1] || null };
  });
  const anoDe = o => o.data ? +o.data.slice(0, 4) : null;
  const ANOS = [...new Set(LP.os.map(anoDe).filter(Boolean))].sort((a, b) => b - a);
  const OS_ANO = Object.fromEntries(ANOS.map(a => [a, LP.os.map((o, k) => k).filter(k => anoDe(LP.os[k]) === a)
    .sort((x, y) => LP.os[y].data.localeCompare(LP.os[x].data))]));
  const PEND = LP.os.map((o, k) => k).filter(k => LP.os[k].sit !== 'EXECUTADA');
  const uniao = ks => { const s = new Set(); ks.forEach(k => vaosDaOs[k].forEach(v => s.add(v))); return [...s]; };
  const somaM = vs => vs.reduce((m, v) => m + v[8], 0);
  const VAOS_ANO = Object.fromEntries(ANOS.map(a => [a, uniao(OS_ANO[a])]));
  const KM_ANO = Object.fromEntries(ANOS.map(a => [a, somaM(VAOS_ANO[a])]));
  const VAOS_PEND = uniao(PEND), KM_PEND = somaM(VAOS_PEND);
  const KM_LIMPO = somaM(uniao(LP.os.map((o, k) => k).filter(k => LP.os[k].data)));
  const KM_REDE = somaM(D.vaos);
  const ORDEM = [...ANOS.flatMap(a => OS_ANO[a]), ...PEND].filter(k => vaosDaOs[k].length); // ‹ › no mapa

  const vaosDoTrecho = {};
  D.vaos.forEach(v => (vaosDoTrecho[D.trechos[v[4]].nome] = vaosDoTrecho[D.trechos[v[4]].nome] || []).push(v));
  function resumoTrecho(nome) {
    const vs = vaosDoTrecho[nome] || [], classe = classeDe(nome);
    const m = { dia: 0, vence: 0, vencida: 0, sem: 0 }, ks = new Set();
    let ult = null, ext = 0;
    vs.forEach(v => {
      const p = porVao[v[5]];
      m[situacao(p.ult, classe)] += v[8]; ext += v[8];
      p.ks.forEach(k => ks.add(k));
      if (p.ult && (!ult || p.ult > ult)) ult = p.ult;
    });
    return { m, ext, ult, ks: [...ks], classe };
  }
  const RT = Object.fromEntries(D.trechos.map(t => [t.nome, resumoTrecho(t.nome)]));
  const sitTrecho = r => Object.entries(r.m).sort((a, b) => b[1] - a[1])[0][0];
  const TOT_SIT = { dia: 0, vence: 0, vencida: 0, sem: 0 };
  Object.values(RT).forEach(r => Object.keys(TOT_SIT).forEach(k => (TOT_SIT[k] += r.m[k])));

  // ---------- estado ----------
  const st = {
    ligado: guarda('limp-ligado') !== '0',
    vista: guarda('limp-vista') === 'sit' ? 'sit' : 'ano',
    anos: new Set(ANOS),
    pend: false,
    foco: null,
    lista: false,            // lista de OS aberta
    grupos: new Set(),       // grupos (anos) abertos na lista
    sel: null,               // trecho selecionado no mapa
  };

  const css = document.createElement('style');
  css.textContent = `
.limp-card{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--paper);display:grid;gap:8px;box-shadow:0 1px 0 var(--line)}
.limp-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.limp-top h2{margin:0;font:700 20px/1.1 var(--f-display);flex:1;min-width:160px}
.limp-top h2 small{display:block;margin-top:3px;font:500 12.5px var(--f-body);color:var(--muted)}
.limp-card button,.limp-sec button,.limp-maplg button,.limp-chip button{font-family:var(--f-body)}
.limp-card button:focus-visible,.limp-sec button:focus-visible,.limp-card summary:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.limp-sw{font-weight:600;font-size:13px;min-height:36px;padding:6px 14px;border-radius:999px;border:1px solid var(--line);background:var(--bg);color:var(--fg);cursor:pointer}
.limp-sw[aria-pressed=true]{background:#15803d;border-color:#15803d;color:#fff}
.limp-seg{display:flex;border:1px solid var(--line);border-radius:7px;overflow:hidden}
.limp-seg button{flex:1;font-weight:600;font-size:13px;min-height:36px;padding:6px 10px;border:0;background:var(--bg);color:var(--muted);cursor:pointer}
.limp-seg button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
.limp-anos{display:grid;gap:4px}
.limp-ano-l{display:flex;align-items:stretch;border:1px solid var(--line);border-radius:6px;background:var(--bg);overflow:hidden}
.limp-ano-l>button{all:unset;box-sizing:border-box;cursor:pointer;color:var(--fg)}
.limp-ano-l .liga{flex:1;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:7px 10px;min-height:38px;font-size:13.5px}
.limp-ano-l .liga:focus-visible,.limp-ano-l .so:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.limp-ano-l .liga i{width:24px;height:8px;border-radius:4px;background:var(--c);box-shadow:0 0 0 1px #0005}
.limp-ano-l .liga b{font:700 15px var(--f-mono)}
.limp-ano-l .liga em{font-style:normal;color:var(--muted);font-size:12.5px;white-space:nowrap}
.limp-ano-l .liga[aria-pressed=false]{color:var(--muted)}
.limp-ano-l .liga[aria-pressed=false] i{background:transparent;box-shadow:inset 0 0 0 2px var(--c)}
.limp-ano-l .liga[aria-pressed=false] b{text-decoration:line-through}
.limp-ano-l .so{display:grid;place-items:center;padding:0 12px;border-left:1px solid var(--line);font-size:12px;font-weight:600;color:var(--muted)}
.limp-ano-l .so:hover,.limp-ano-l .liga:hover{background:var(--paper)}
.limp-ano-l i.trac{background:repeating-linear-gradient(90deg,var(--c) 0 5px,transparent 5px 9px)!important;box-shadow:none!important}
.limp-ano-l.fixo .liga{cursor:default}
.limp-todos{justify-self:start;font-weight:600;font-size:12.5px;min-height:32px;padding:4px 10px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);cursor:pointer}
.limp-bar{display:flex;height:9px;border-radius:5px;overflow:hidden;background:#9ca3af}
.limp-bar span{display:block;height:100%}
.limp-nota{font-size:12px;color:var(--muted);margin:0}
.limp-lista>summary,.limp-grupo>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;min-height:40px}
.limp-lista>summary::-webkit-details-marker,.limp-grupo>summary::-webkit-details-marker{display:none}
.limp-lista>summary{font-weight:600;font-size:14px;border-top:1px solid var(--line);padding-top:6px}
.limp-lista>summary::before,.limp-grupo>summary::before{content:'▸';color:var(--muted);width:10px}
.limp-lista[open]>summary::before,.limp-grupo[open]>summary::before{content:'▾'}
.limp-lista>div{display:grid;gap:2px}
.limp-grupo{display:grid;gap:4px}
.limp-grupo>summary{font:700 14px var(--f-mono)}
.limp-grupo>summary i{width:14px;height:8px;border-radius:4px;background:var(--c)}
.limp-grupo>summary span{font:500 12.5px var(--f-body);color:var(--muted)}
.limp-grupo>div{display:grid;gap:4px;padding:0 0 6px 18px}
.limp-os-b{display:grid;gap:2px;text-align:left;width:100%;min-height:40px;padding:7px 9px;border-radius:6px;border:1px solid var(--line);border-left:5px solid var(--c);background:var(--bg);color:var(--fg);cursor:pointer;font-size:13px}
.limp-os-b[aria-pressed=true]{border-color:var(--fg);border-left-color:var(--c);background:var(--sel)}
.limp-os-b .q{font:600 12.5px var(--f-mono)}
.limp-os-b .s{color:var(--muted);font-size:12px}
.limp-os-b.pend{border-left-style:dashed}
.limp-foco{border-radius:0 0 6px 6px;margin-top:-6px;padding:8px 10px;background:var(--sel);border:1px solid var(--fg);border-top:0;font-size:13px;display:grid;gap:4px}
.limp-foco .q{font:700 13px var(--f-mono)}
.limp-sec{margin-top:10px;border-top:1px solid var(--line);padding-top:8px;display:grid;gap:6px}
.limp-sec h3{font:700 15px var(--f-display);margin:0}
.limp-selo{font:600 11px var(--f-mono);padding:1px 5px;border-radius:5px;color:#111;background:var(--c);margin-left:auto;white-space:nowrap}
.limp-selo.nada{background:transparent;color:var(--muted);border:1px solid var(--line)}
.limp-maplg{position:absolute;left:10px;bottom:34px;z-index:800;background:rgba(15,20,23,.88);color:#f3f4f4;border-radius:8px;padding:5px 6px;font:12px/1.2 var(--f-body);display:grid;gap:1px;max-width:calc(100% - 20px)}
.limp-maplg button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:7px;min-height:28px;padding:3px 6px;border-radius:4px}
.limp-maplg button:focus-visible{outline:2px solid #fde047;outline-offset:1px}
.limp-maplg button[aria-pressed=false]{opacity:.6;text-decoration:line-through}
.limp-maplg button[aria-pressed=false] i{background:transparent;box-shadow:inset 0 0 0 2px var(--c)}
.limp-maplg span{display:flex;align-items:center;gap:7px;min-height:24px;padding:2px 6px}
.limp-maplg i{width:20px;height:6px;border-radius:3px;background:var(--c);flex:none}
.limp-maplg b{font-family:var(--f-mono)}
.limp-chip{position:absolute;right:10px;bottom:34px;z-index:805;display:flex;align-items:center;gap:2px;max-width:calc(100% - 20px);background:rgba(15,20,23,.92);color:#f3f4f4;border-radius:8px;padding:3px;border-left:5px solid var(--c);font:600 12.5px var(--f-mono);box-shadow:0 2px 10px #0007}
.limp-chip span{padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.limp-chip button{all:unset;cursor:pointer;display:grid;place-items:center;min-width:36px;min-height:36px;border-radius:6px;font-size:17px}
.limp-chip button:hover{background:#ffffff1f}
.limp-chip button:focus-visible{outline:2px solid #fde047}
.limp-tag{display:inline-flex;align-items:baseline;gap:6px;transform:translate(-50%,-140%);white-space:nowrap;cursor:pointer;
  font:700 12.5px/1 var(--f-mono);color:#111;background:var(--c);padding:5px 8px;border-radius:6px;border:2px solid #0b0f14;box-shadow:0 2px 6px #0008}
.limp-tag::after{content:'';position:absolute;left:50%;bottom:-8px;margin-left:-6px;border:6px solid transparent;border-top-color:#0b0f14;border-bottom:0}
.limp-tag small{font:600 11px var(--f-body);opacity:.8}
.limp-tag em{font:700 11px var(--f-body);font-style:normal;background:#0b0f14;color:#fff;padding:2px 5px;border-radius:4px;margin:-2px 0 -2px -4px}
.limp-popup .leaflet-popup-content{margin:10px 12px;font:13px/1.45 var(--f-body)}
.limp-pop .t{font:700 15px var(--f-display);margin-bottom:4px}
.limp-pop .t small{font:500 12px var(--f-body);color:#5a636a;margin-left:4px}
.limp-pop .lb-l{border-left:5px solid var(--c);padding:2px 0 2px 7px;margin:3px 0}
.limp-pop .lb-l b{font-family:var(--f-mono);font-size:12.5px}
.limp-pop .sit{margin-top:5px;font-weight:600;font-size:12.5px;color:#1b2024}
.limp-pop .sit::before{content:'';display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--c);margin-right:6px;box-shadow:0 0 0 1px #0004}
.limp-pop .nada{color:#5a636a;font-style:italic}
body.limp-on #legenda{display:none}
body.limp-on .classes button{border-color:#9ca3af}
body.limp-on .lb{border-left-color:#9ca3af}
body.limp-on #map.longe .lb:not(.sel),body.limp-on #map.longe .at{display:none}
@media (max-width:640px){
  .limp-maplg{top:56px;bottom:auto;left:52px;right:10px;display:flex;flex-wrap:wrap;gap:0 2px;max-width:none}
  .limp-maplg button,.limp-maplg span{min-height:30px;padding:2px 5px}
  .limp-chip{left:10px;right:10px;bottom:30px}
  .limp-chip span{flex:1}
}`;
  document.head.append(css);

  // ---------- mapa ----------
  const map = window.__map;
  const seg = v => [[v[0], v[1]], [v[2], v[3]]];
  let camada = null, realce = null, selL = null, fundoCache = null;
  const vis = v => !window.__visivel || window.__visivel[classeDe(D.trechos[v[4]].nome)];
  function linhaDupla(vs, cor, peso, opacidade, extra) {
    // contorno escuro por baixo: a cor aparece igual sobre mata escura ou solo claro
    return [L.polyline(vs.map(seg), { color: '#0b0f14', weight: peso + 4, opacity: .75 * opacidade, interactive: false, lineCap: 'round' }),
      L.polyline(vs.map(seg), Object.assign({ color: cor, weight: peso, opacity: opacidade, interactive: false, lineCap: 'round' }, extra))];
  }
  function fundo() {
    const chave = JSON.stringify(window.__visivel || {});
    if (!fundoCache || fundoCache.chave !== chave) {
      const vs = D.vaos.filter(vis);
      fundoCache = { chave, ls: linhaDupla(vs, SEMCOR, 2.5, .9) };
    }
    return fundoCache.ls;
  }
  function fusiveis() {
    const f = window.__fusMarcas;
    if (!map || !f) return;
    const quer = (!st.ligado || map.getZoom() >= 14) && (!window.__visivel || window.__visivel.T3);
    if (quer && !map.hasLayer(f)) f.addTo(map); else if (!quer && map.hasLayer(f)) f.remove();
  }
  // balão ao tocar na rede: trecho + datas de limpeza naquele vão
  function maisPerto(vs, ll) {
    const k = Math.cos(ll.lat * Math.PI / 180);
    let melhor = null, dmin = Infinity;
    vs.forEach(v => {
      const ax = v[1] * k, ay = v[0], bx = v[3] * k, by = v[2], px = ll.lng * k, py = ll.lat;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const f = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const d = (ax + f * dx - px) ** 2 + (ay + f * dy - py) ** 2;
      if (d < dmin) { dmin = d; melhor = v; }
    });
    return melhor;
  }
  function balao(e, vs) {
    L.DomEvent.stopPropagation(e);
    const v = maisPerto(vs, e.latlng);
    if (!v) return;
    const nome = D.trechos[v[4]].nome, classe = classeDe(nome);
    if (window.__sel) window.__sel(nome, false);
    const ks = (porVao[v[5]] || { ks: [] }).ks.slice().sort((a, b) => (LP.os[b].data || '9' + LP.os[b].criada).localeCompare(LP.os[a].data || '9' + LP.os[a].criada));
    const exec = ks.filter(k => LP.os[k].data), pend = ks.filter(k => !LP.os[k].data);
    const ult = exec.length ? LP.os[exec[0]].data : null;
    const sit = situacao(ult, classe);
    const linha = (k, rot) => { const o = LP.os[k]; return `<div class="lb-l" style="--c:${o.data ? corAno(anoDe(o)) : '#9ca3af'}"><b>${rot} ${o.data ? br(o.data) : esc(o.sit.toLowerCase())}</b> · <a href="#" data-k="${k}">OS ${esc(o.os)}</a></div>`; };
    const html = `<div class="limp-pop"><div class="t">Trecho ${esc(nome)} <small>${classe} · a cada ${REGRA[classe]} anos</small></div>` +
      (exec.length ? linha(exec[0], 'Limpo em') + exec.slice(1).map(k => linha(k, 'Antes:')).join('') +
        `<div class="sit" style="--c:${SIT[sit][1]}">${SIT[sit][0]} · próxima até ${br(iso(somaAnos(ult, REGRA[classe])))}</div>`
        : '<div class="nada">Sem registro de limpeza aqui</div>') +
      pend.map(k => linha(k, 'Programada:')).join('') + '</div>';
    L.popup({ className: 'limp-popup', maxWidth: 300, autoPanPadding: [20, 20] }).setLatLng(e.latlng).setContent(html).openOn(map);
  }
  if (map) map.getContainer().addEventListener('click', e => {
    const a = e.target.closest('.limp-pop a[data-k]');
    if (a) { e.preventDefault(); map.closePopup(); focar(+a.dataset.k, false); }
  });
  const clicavel = (ls, vs) => { const l = ls[ls.length - 1]; l.options.interactive = true; l.on('click', e => balao(e, vs)); return ls; };

  // etiqueta com a data em cada OS executada visível (no meio do caminho dela)
  function etiquetas() {
    const ms = [], usados = new Map();
    // ano que aparece por cima em cada vão (o mais recente entre os anos ligados)
    const topo = {};
    ANOS.filter(a => st.anos.has(a)).forEach(a => VAOS_ANO[a].forEach(v => { if (!topo[v[5]] || a > topo[v[5]]) topo[v[5]] = a; }));
    ANOS.filter(a => st.anos.has(a)).forEach(a => OS_ANO[a].forEach(k => {
      // etiqueta só onde a cor que aparece é a do ano dela (se foi toda limpa de novo depois, o balão mostra o histórico)
      const vs = vaosDaOs[k].filter(v => vis(v) && topo[v[5]] === a);
      if (!vs.length) return;
      const lat = vs.reduce((s, v) => s + v[0], 0) / vs.length, lon = vs.reduce((s, v) => s + v[1], 0) / vs.length;
      const v = maisPerto(vs, L.latLng(lat, lon));
      const id = v[5];
      if (usados.has(id)) { usados.get(id).push(k); return; }   // mesma área: junta as datas numa etiqueta só
      usados.set(id, [k]);
      ms.push([v, usados.get(id)]);
    }));
    return ms.map(([v, ks]) => {
      const o = LP.os[ks[0]];
      const txt = ks.map(k => br(LP.os[k].data)).join(' · ');
      // trecho com mais metros da OS (é onde ela "está")
      const mt = {};
      vaosDaOs[ks[0]].forEach(x => { const n = D.trechos[x[4]].nome; mt[n] = (mt[n] || 0) + x[8]; });
      // prefere os troncos/ramais (T1, T2…) por onde a OS passa; senão, o ramal de fusível com mais metros
      const nomes = Object.entries(mt).sort((a, b) => b[1] - a[1]).map(e => e[0]);
      const tronco = nomes.filter(n => classeDe(n) !== 'T3');
      const tr = (tronco.length ? tronco.slice(0, 2) : nomes.slice(0, 1)).join(' / ');
      return L.marker([(v[0] + v[2]) / 2, (v[1] + v[3]) / 2], {
        zIndexOffset: 1000,
        icon: L.divIcon({ className: '', iconSize: null, html: `<div class="limp-tag" data-d="${esc(o.data)}" style="--c:${corAno(anoDe(o))}"><em>${esc(tr)}</em>${txt}<small>${ks.length > 1 ? ks.length + ' OS' : km(o.m)}</small></div>` }),
      }).on('click', e => { L.DomEvent.stopPropagation(e); focar(ks[0], true); });
    });
  }

  function desenha() {
    if (!map) return;
    if (camada) camada.remove();
    camada = null;
    document.body.classList.toggle('limp-on', st.ligado);
    fusiveis();
    if (st.ligado) {
      const op = st.foco === null ? 1 : .35;
      const ls = [];
      if (st.vista === 'ano') {
        ls.push(...fundo());
        if (!fundo().clicavel) { clicavel(fundo(), D.vaos.filter(vis)); fundo().clicavel = true; }
        if (st.pend && VAOS_PEND.length) ls.push(L.polyline(VAOS_PEND.filter(vis).map(seg), { color: '#fff', weight: 4, dashArray: '6 7', opacity: op, interactive: false }));
        ANOS.slice().reverse().filter(a => st.anos.has(a)).forEach(a => {   // o ano mais recente fica por cima
          const vs = VAOS_ANO[a].filter(vis);
          if (vs.length) ls.push(...clicavel(linhaDupla(vs, corAno(a), 5, op), vs));
        });
        if (st.foco === null) ls.push(...etiquetas());
      } else {
        const g = { sem: [], vencida: [], vence: [], dia: [] };
        D.vaos.filter(vis).forEach(v => g[situacao(porVao[v[5]].ult, classeDe(D.trechos[v[4]].nome))].push(v));
        Object.entries(g).forEach(([k, vs]) => vs.length && ls.push(...clicavel(linhaDupla(vs, SIT[k][1], k === 'sem' ? 2.5 : 5, k === 'sem' ? .9 : op), vs)));
      }
      camada = L.layerGroup(ls).addTo(map);
      requestAnimationFrame(desamontoa);
    }
    [selL, realce].forEach(g => g && g.eachLayer(l => l.bringToFront()));
  }
  // trecho tocado no mapa ou na lista: contorno amarelo por cima da camada de limpeza
  window.__onSel = nome => {
    st.sel = nome;
    if (selL) { selL.remove(); selL = null; }
    if (map && nome && st.ligado) {
      const vs = vaosDoTrecho[nome] || [];
      selL = L.layerGroup(linhaDupla(vs, '#fde047', 4, 1, { dashArray: '1 0' })).addTo(map);
      if (realce) realce.eachLayer(l => l.bringToFront());
    }
  };
  window.__onClasses = () => { desenha(); };
  // etiquetas que se cruzam: fica a mais recente; as outras aparecem ao aproximar o zoom
  function desamontoa() {
    const tags = [...document.querySelectorAll('#map .limp-tag')].sort((a, b) => b.dataset.d.localeCompare(a.dataset.d));
    tags.forEach(t => { t.style.visibility = ''; });
    const ok = [];
    tags.forEach(t => {
      const r = t.getBoundingClientRect();
      if (ok.some(q => r.left < q.right + 2 && r.right > q.left - 2 && r.top < q.bottom + 2 && r.bottom > q.top - 2)) t.style.visibility = 'hidden';
      else ok.push(r);
    });
  }
  if (map) map.on('zoomend', () => { fusiveis(); requestAnimationFrame(desamontoa); });

  function enquadra(vs) {
    if (!map || !vs.length) return;
    if (celular() && !telaCheia()) document.querySelector('.mapbox').scrollIntoView({ block: 'start' });
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(vs.flatMap(seg)).pad(0.15), { maxZoom: 16 });
  }
  function focar(k, enquadrar) {
    st.foco = st.foco === k ? null : k;
    if (realce) { realce.remove(); realce = null; }
    if (st.foco !== null && map) {
      const vs = vaosDaOs[k], o = LP.os[k];
      const cor = o.data ? corAno(anoDe(o)) : '#fff';
      realce = L.layerGroup([
        L.polyline(vs.map(seg), { color: '#fff', weight: 14, opacity: 1, interactive: false, lineCap: 'round' }),
        L.polyline(vs.map(seg), { color: cor, weight: 8, opacity: 1, interactive: false, lineCap: 'round', dashArray: o.data ? null : '8 6' }),
      ]).addTo(map);
      if (o.data) { st.grupos.add(String(anoDe(o))); } else st.grupos.add('pend');
      st.lista = true;
      if (enquadrar) enquadra(vs);
    }
    desenha();
    pinta();
  }
  function soAno(a) {
    st.anos = new Set([a]);
    desenha(); pinta();
    enquadra(VAOS_ANO[a]);
  }
  function alternaAno(a) {
    if (a === 'pend') st.pend = !st.pend;
    else { a = +a; st.anos.has(a) ? st.anos.delete(a) : st.anos.add(a); }
    desenha(); pinta();
  }

  // legenda (anos clicáveis) e chip da OS em foco, dentro do mapa
  let maplg = null, chip = null;
  if (map && window.L) {
    const mb = document.querySelector('.mapbox');
    maplg = document.createElement('div');
    maplg.className = 'limp-maplg';
    maplg.setAttribute('role', 'group');
    maplg.setAttribute('aria-label', 'Anos de limpeza no mapa');
    chip = document.createElement('div');
    chip.className = 'limp-chip';
    chip.hidden = true;
    mb.append(maplg, chip);
    [maplg, chip].forEach(el => { L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el); });
    maplg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) alternaAno(b.dataset.a); });
    chip.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v === 'x') return focar(st.foco, false);
      const i = ORDEM.indexOf(st.foco), n = ORDEM.length;
      focar(ORDEM[(i + (b.dataset.v === '+' ? 1 : -1) + n) % n], true);
    });
  }

  // ---------- cartão no painel ----------
  const card = document.createElement('section');
  card.className = 'limp-card';
  card.setAttribute('aria-label', 'Limpeza de faixa');
  const legenda = $('legenda');
  (legenda || document.querySelector('.panel').firstChild).before(card);

  function focoHtml(k) {
    const o = LP.os[k];
    const ts = [...new Set(vaosDaOs[k].map(v => D.trechos[v[4]].nome))];
    return `<div class="limp-foco"><span class="q">OS ${esc(o.os_completa)} · ${o.data ? 'executada ' + br(o.data) : esc(o.sit.toLowerCase()) + ' · criada ' + br(o.criada)}</span>
      <span>${esc(o.desc)}</span>
      <span class="limp-nota">No mapa: ${vaosDaOs[k].length ? km(o.m) : 'sem localização'}${o.km_desc ? ` · descrição: ${String(o.km_desc).replace('.', ',')} km` : ''} · ${esc(o.metodo)}${o.al_os && o.al_os !== (D.meta || {}).al ? ` · OS lançada no ${esc(o.al_os)}` : ''}</span>
      ${o.ativos.length ? `<span class="limp-nota">Ativos: ${o.ativos.map(esc).join('; ')}</span>` : ''}
      ${ts.length ? `<span class="limp-nota">Trechos: ${ts.slice(0, 30).map(esc).join(', ')}${ts.length > 30 ? ` e mais ${ts.length - 30}` : ''}</span>` : ''}</div>`;
  }
  const osBtn = (k, comFoco) => {
    const o = LP.os[k], pend = o.sit !== 'EXECUTADA';
    const cor = pend ? '#9ca3af' : corAno(anoDe(o));
    return `<button type="button" class="limp-os-b${pend ? ' pend' : ''}" data-k="${k}" style="--c:${cor}" aria-pressed="${st.foco === k}">` +
      `<span class="q">${pend ? esc(o.sit.toLowerCase()) : br(o.data)} · OS ${esc(o.os)} · ${vaosDaOs[k].length ? km(o.m) : 'sem localização'}</span>` +
      `<span class="s">${esc(o.desc.slice(0, 110))}${o.desc.length > 110 ? '…' : ''}</span></button>` +
      (comFoco && st.foco === k ? focoHtml(k) : '');
  };
  const grupo = (g, titulo, cor, info, ks) =>
    `<details class="limp-grupo" data-g="${g}"${st.grupos.has(g) ? ' open' : ''}><summary style="--c:${cor}"><i></i>${titulo} <span>${info}</span></summary><div>${ks.map(k => osBtn(k, true)).join('')}</div></details>`;

  function pinta() {
    // guarda quem tinha o foco do teclado para devolver depois de refazer o cartão
    const f = document.activeElement;
    const chave = card.contains(f) ? (f.dataset.k !== undefined ? `[data-k="${f.dataset.k}"]` : f.dataset.foco ? `[data-foco="${f.dataset.foco}"]` : null) : null;

    const exec = LP.os.filter(o => o.sit === 'EXECUTADA').length;
    const sub = `${exec} OS executada${exec === 1 ? '' : 's'} · ${km(KM_LIMPO)} de ${km(KM_REDE)} com registro`;
    let corpo = '';
    if (st.ligado && st.vista === 'ano') {
      corpo = ANOS.length ? `<div class="limp-anos">${ANOS.map(a => `<div class="limp-ano-l">
          <button type="button" class="liga" data-a="${a}" data-foco="a${a}" aria-pressed="${st.anos.has(a)}" title="Mostrar/esconder ${a} no mapa"><i style="--c:${corAno(a)}"></i><span><b>${a}</b> · ${OS_ANO[a].length} OS</span><em>${km(KM_ANO[a])}</em></button>
          <button type="button" class="so" data-so="${a}" data-foco="s${a}" title="Mostrar só ${a} e enquadrar no mapa">Ver só</button></div>`).join('')}
        ${PEND.length ? `<div class="limp-ano-l"><button type="button" class="liga" data-a="pend" data-foco="pend" aria-pressed="${st.pend}" title="Mostrar/esconder as OS ainda não executadas"><i class="trac" style="--c:#9ca3af"></i><span>Programadas / pendentes · ${PEND.length} OS</span><em>${km(KM_PEND)}</em></button></div>` : ''}</div>
        ${st.anos.size < ANOS.length ? '<button type="button" class="limp-todos" data-acao="todos" data-foco="todos">Mostrar todos os anos</button>' : ''}
        <p class="limp-nota">Só limpezas executadas${EQ}, pela data de execução. Cinza-claro: sem registro de limpeza.</p>`
        : `<p class="limp-nota">Nenhuma OS executada${EQ} caiu neste alimentador.</p>`;
    } else if (st.ligado) {
      corpo = `<div class="limp-bar">${['dia', 'vence', 'vencida', 'sem'].map(k => TOT_SIT[k] ? `<span style="width:${100 * TOT_SIT[k] / KM_REDE}%;background:${SIT[k][1]}"></span>` : '').join('')}</div>
        <div class="limp-anos">${Object.entries(SIT).map(([k, [n, c]]) => `<div class="limp-ano-l fixo"><button type="button" class="liga" tabindex="-1" aria-disabled="true"><i style="--c:${c}"></i><span>${n}</span><em>${km(TOT_SIT[k])}</em></button></div>`).join('')}</div>
        <p class="limp-nota">T1 a cada ${REGRA.T1} anos · T2 a cada ${REGRA.T2} · T3 a cada ${REGRA.T3}, contando da última limpeza de cada vão${EQ ? ' (executadas' + EQ + ')' : ''}.</p>`;
    }
    const nOs = LP.os.length;
    const lista = nOs ? `<details class="limp-lista"${st.lista ? ' open' : ''}><summary data-foco="lista">Ver as ${nOs} OS por ano</summary><div>
        ${ANOS.map(a => grupo(String(a), a, corAno(a), `${OS_ANO[a].length} OS · ${km(KM_ANO[a])}`, OS_ANO[a])).join('')}
        ${PEND.length ? grupo('pend', 'Pendentes', '#9ca3af', `${PEND.length} OS`, PEND) : ''}</div></details>` : '';
    card.innerHTML = `<div class="limp-top"><h2>Limpeza de faixa<small>${sub}</small></h2>
      <button type="button" class="limp-sw" data-acao="liga" data-foco="liga" aria-pressed="${st.ligado}">${st.ligado ? 'Ligada no mapa' : 'Mostrar no mapa'}</button></div>
      ${st.ligado ? `<div class="limp-seg" role="group" aria-label="Pintar o mapa por"><button type="button" data-acao="ano" data-foco="ano" aria-pressed="${st.vista === 'ano'}">Por ano</button><button type="button" data-acao="sit" data-foco="sit" aria-pressed="${st.vista === 'sit'}">Vencimento</button></div>` : ''}
      ${corpo}${lista}`;
    if (chave) card.querySelector(chave)?.focus({ preventScroll: true });

    if (maplg) {
      maplg.hidden = !st.ligado;
      maplg.innerHTML = st.vista === 'ano'
        ? ANOS.map(a => `<button type="button" data-a="${a}" aria-pressed="${st.anos.has(a)}" title="Mostrar/esconder ${a}"><i style="--c:${corAno(a)}"></i><b>${a}</b></button>`).join('') +
          `<span><i style="--c:${SEMCOR};box-shadow:0 0 0 1px #000"></i>sem registro</span>`
        : Object.values(SIT).map(([n, c]) => `<span><i style="--c:${c}"></i>${n}</span>`).join('');
    }
    if (chip) {
      chip.hidden = st.foco === null;
      if (st.foco !== null) {
        const o = LP.os[st.foco];
        chip.style.setProperty('--c', o.data ? corAno(anoDe(o)) : '#9ca3af');
        chip.innerHTML = `<button type="button" data-v="-" title="OS anterior" aria-label="OS anterior">‹</button>` +
          `<span title="${esc(o.desc)}">OS ${esc(o.os)} · ${o.data ? br(o.data) : esc(o.sit.toLowerCase())} · ${km(o.m)}</span>` +
          `<button type="button" data-v="+" title="Próxima OS" aria-label="Próxima OS">›</button>` +
          `<button type="button" data-v="x" title="Fechar" aria-label="Fechar OS">✕</button>`;
      }
    }
    det.querySelectorAll('.limp-os-b').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.k === st.foco)));
    if (vistaSelos !== st.vista) { vistaSelos = st.vista; poeSelos(true); }
  }
  // <details> abertos/fechados pelo usuário ficam guardados (pinta() refaz o cartão)
  card.addEventListener('toggle', e => {
    const d = e.target;
    if (d.classList.contains('limp-lista')) st.lista = d.open;
    else if (d.dataset.g) d.open ? st.grupos.add(d.dataset.g) : st.grupos.delete(d.dataset.g);
  }, true);
  card.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k !== undefined) return focar(+b.dataset.k, true);
    if (b.dataset.so) return soAno(+b.dataset.so);
    if (b.classList.contains('liga') && b.dataset.a) return alternaAno(b.dataset.a);
    const ac = b.dataset.acao;
    if (ac === 'liga') {
      st.ligado = !st.ligado; guarda('limp-ligado', st.ligado ? '1' : '0');
      window.__onSel(st.sel);
    } else if (ac === 'ano' || ac === 'sit') { st.vista = ac; guarda('limp-vista', ac); }
    else if (ac === 'todos') st.anos = new Set(ANOS);
    else return;
    desenha(); pinta();
  });

  // ---------- detalhe do trecho ----------
  function secTrecho(nome) {
    const r = RT[nome], anos = REGRA[r.classe];
    const prox = r.ult ? somaAnos(r.ult, anos) : null;
    const s = sitTrecho(r);
    const ks = r.ks.slice().sort((a, b) => (LP.os[b].data || LP.os[b].criada || '').localeCompare(LP.os[a].data || LP.os[a].criada || ''));
    return `<section class="limp-sec" aria-live="off"><h3>Limpeza de faixa · ${esc(r.classe)} a cada ${anos} anos</h3>
      <div class="limp-bar">${['dia', 'vence', 'vencida', 'sem'].map(k => r.m[k] ? `<span style="width:${100 * r.m[k] / (r.ext || 1)}%;background:${SIT[k][1]}" title="${SIT[k][0]}: ${km(r.m[k])}"></span>` : '').join('')}</div>
      <dl><dt>Situação</dt><dd><b>${SIT[s][0]}</b> · ${['dia', 'vence', 'vencida', 'sem'].filter(k => r.m[k]).map(k => `${SIT[k][0].toLowerCase()} ${km(r.m[k])}`).join(' · ')}</dd>
      <dt>Última</dt><dd>${r.ult ? br(r.ult) + ` · próxima até ${br(iso(prox))}` : 'nenhuma OS executada encontrada neste trecho'}</dd></dl>
      ${ks.map(k => osBtn(k, false)).join('')}
      <p class="limp-nota">Posição aproximada: vem das chaves/ativos citados na OS e dos km da descrição.</p></section>`;
  }
  const det = $('det');
  function poeDetalhe() {
    if (det.querySelector('.limp-sec')) return;
    const h2 = det.querySelector('h2');
    if (!h2) return;
    const nome = [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (RT[nome]) det.insertAdjacentHTML('beforeend', secTrecho(nome));
  }
  new MutationObserver(poeDetalhe).observe(det, { childList: true });
  det.addEventListener('click', e => { const b = e.target.closest('.limp-os-b'); if (b) focar(+b.dataset.k, true); });

  // ---------- lista: ano da última limpeza ----------
  const lista = $('lista');
  let vistaSelos = null;
  function poeSelos(refaz) {
    lista.querySelectorAll(refaz ? '.row' : '.row:not([data-limp])').forEach(b => {
      b.dataset.limp = '1';
      const r = RT[b.dataset.t];
      if (!r) return;
      const s = sitTrecho(r);
      let el = b.querySelector('.limp-selo');
      if (!el) { el = document.createElement('span'); b.querySelector('em')?.before(el); }
      el.className = 'limp-selo' + (r.ult ? '' : ' nada');
      el.style.setProperty('--c', r.ult ? (st.vista === 'sit' ? SIT[s][1] : corAno(+r.ult.slice(0, 4))) : 'transparent');
      el.title = `Limpeza de faixa: ${SIT[s][0].toLowerCase()}${r.ult ? ' · última ' + br(r.ult) : ''}`;
      el.textContent = r.ult ? r.ult.slice(0, 4) : 'sem limpeza';
    });
  }
  new MutationObserver(() => poeSelos(false)).observe(lista, { childList: true });

  poeDetalhe();
  desenha();
  pinta();
})();
