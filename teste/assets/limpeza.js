// Limpeza de faixa (roda depois de alimentador.js e extras.js, com window.D e window.LIMPEZA).
// Duas vistas no mapa:
//   Por ano  — cada ano de limpeza executada com uma cor; liga/desliga por ano; a rede sem limpeza fica cinza.
//   Situação — pela regra T1 a cada 3 anos, T2 a cada 4, T3 a cada 5 (em dia / vence em 12 meses / vencida).
// No painel: OS agrupadas por ano; tocar numa OS mostra e enquadra no mapa onde ela foi.
// A posição vem das chaves/ativos citados na OS e dos km da descrição: é aproximada.
(function () {
  const LP = window.LIMPEZA;
  if (!LP || !window.D) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  const br = d => d ? d.split('-').reverse().join('/') : '—';
  const REGRA = LP.regra_anos;
  const HOJE = new Date(); HOJE.setHours(0, 0, 0, 0);
  const somaAnos = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setFullYear(x.getFullYear() + n); return x; };
  const iso = x => x.toISOString().slice(0, 10);
  const classeDe = nome => nome.split('-')[0];
  const guarda = (k, v) => { try { v === undefined ? (v = localStorage.getItem(k)) : localStorage.setItem(k, v); } catch (e) { v = null; } return v; };

  // cores fixas por ano (iguais em todos os alimentadores); antigas mais frias, recentes mais quentes
  const COR_ANO = { 2021: '#a78bfa', 2022: '#3b82f6', 2023: '#06b6d4', 2024: '#22c55e', 2025: '#eab308', 2026: '#f97316', 2027: '#ef4444', 2028: '#ec4899' };
  const corAno = a => COR_ANO[a] || (a < 2021 ? '#c4b5fd' : '#f43f5e');
  const CINZA = '#4b5563';
  const SIT = { dia: ['Em dia', '#16a34a'], vence: ['Vence em até 12 meses', '#eab308'], vencida: ['Vencida', '#dc2626'], sem: ['Sem registro', CINZA] };
  function situacao(data, classe) {
    if (!data) return 'sem';
    const v = somaAnos(data, REGRA[classe]);
    if (v < HOJE) return 'vencida';
    const um = new Date(HOJE); um.setFullYear(um.getFullYear() + 1);
    return v < um ? 'vence' : 'dia';
  }

  // ---------- dados ----------
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
  const osDoAno = a => LP.os.map((o, k) => k).filter(k => anoDe(LP.os[k]) === a).sort((x, y) => LP.os[y].data.localeCompare(LP.os[x].data));
  const PEND = LP.os.map((o, k) => k).filter(k => LP.os[k].sit !== 'EXECUTADA');
  const kmDe = ks => { const s = new Set(); ks.forEach(k => vaosDaOs[k].forEach(v => s.add(v))); let m = 0; s.forEach(v => (m += v[8])); return m; };
  const KM_ANO = Object.fromEntries(ANOS.map(a => [a, kmDe(osDoAno(a))]));
  const KM_LIMPO = kmDe(LP.os.map((o, k) => k).filter(k => LP.os[k].data));
  const KM_REDE = D.vaos.reduce((s, v) => s + v[8], 0);

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

  // ---------- estado ----------
  const st = {
    ligado: guarda('limp-ligado') !== '0',
    vista: guarda('limp-vista') === 'sit' ? 'sit' : 'ano',
    anos: new Set(ANOS),
    pend: false,
    foco: null,
  };

  const css = document.createElement('style');
  css.textContent = `
.limp-card{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--bg);display:grid;gap:8px}
.limp-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.limp-top h2{margin:0;font:700 18px/1.1 var(--f-display,inherit);flex:1;min-width:150px}
.limp-top h2 small{display:block;font:500 12.5px var(--f-body,inherit);color:var(--muted)}
.limp-sw{font:600 13px var(--f-body,inherit);padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--paper);color:var(--fg);cursor:pointer}
.limp-sw[aria-pressed=true]{background:#15803d;border-color:#15803d;color:#fff}
.limp-seg{display:inline-flex;border:1px solid var(--line);border-radius:7px;overflow:hidden}
.limp-seg button{font:600 12.5px var(--f-body,inherit);padding:5px 11px;border:0;background:var(--paper);color:var(--muted);cursor:pointer}
.limp-seg button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
.limp-anos{display:grid;gap:4px}
.limp-ano-l{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:6px 8px;border-radius:6px;border:1px solid var(--line);background:var(--paper);cursor:pointer;font-size:13.5px;color:var(--fg);text-align:left;width:100%}
.limp-ano-l[aria-pressed=false]{opacity:.45}
.limp-ano-l i{width:22px;height:8px;border-radius:4px;background:var(--c)}
.limp-ano-l b{font:700 15px var(--f-mono,monospace)}
.limp-ano-l em{font-style:normal;color:var(--muted);font-size:12.5px;white-space:nowrap}
.limp-ano-l i.trac{background:repeating-linear-gradient(90deg,var(--c) 0 5px,transparent 5px 9px)}
.limp-acoes{display:flex;gap:6px;flex-wrap:wrap}
.limp-acoes button{font:600 12px var(--f-body,inherit);padding:4px 9px;border-radius:6px;border:1px solid var(--line);background:var(--paper);color:var(--fg);cursor:pointer}
.limp-grupo{display:grid;gap:4px}
.limp-grupo>summary{cursor:pointer;font:700 13.5px var(--f-mono,monospace);list-style:none;display:flex;align-items:center;gap:8px;padding:4px 0}
.limp-grupo>summary::-webkit-details-marker{display:none}
.limp-grupo>summary::before{content:'▸';color:var(--muted)}
.limp-grupo[open]>summary::before{content:'▾'}
.limp-grupo>summary i{width:14px;height:8px;border-radius:4px;background:var(--c)}
.limp-grupo>summary span{font:500 12.5px var(--f-body,inherit);color:var(--muted)}
.limp-os-b{display:grid;gap:2px;text-align:left;width:100%;padding:7px 9px;border-radius:6px;border:1px solid var(--line);border-left:5px solid var(--c);background:var(--paper);color:var(--fg);cursor:pointer;font-size:13px}
.limp-os-b[aria-pressed=true]{outline:2px solid var(--fg);outline-offset:1px}
.limp-os-b .q{font:600 12.5px var(--f-mono,monospace)}
.limp-os-b .s{color:var(--muted);font-size:12px}
.limp-os-b.pend{border-left-style:dashed}
.limp-foco{border-radius:6px;padding:8px 10px;background:var(--paper);border:1px solid var(--line);font-size:13px;display:grid;gap:4px}
.limp-foco .q{font:700 13px var(--f-mono,monospace)}
.limp-bar{display:flex;height:9px;border-radius:5px;overflow:hidden;background:${CINZA}}
.limp-bar span{display:block;height:100%}
.limp-nota{font-size:12px;color:var(--muted);margin:0}
.limp-sec{margin-top:10px;border-top:1px solid var(--line);padding-top:8px;display:grid;gap:6px}
.limp-sec h3{font-size:14px;margin:0}
.limp-selo{font:600 11px var(--f-mono,monospace);padding:1px 5px;border-radius:5px;color:#111;background:var(--c);margin-left:auto;white-space:nowrap}
.limp-selo.nada{background:transparent;color:var(--muted);border:1px solid var(--line)}
.limp-maplg{position:absolute;left:10px;bottom:24px;z-index:800;background:#111827e6;color:#f9fafb;border-radius:8px;padding:6px 8px;font:12px/1.2 var(--f-body,sans-serif);display:grid;gap:3px;max-width:calc(100% - 20px)}
.limp-maplg button{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:2px 3px;border-radius:4px}
.limp-maplg button[aria-pressed=false]{opacity:.4}
.limp-maplg i{width:18px;height:6px;border-radius:3px;background:var(--c)}
.limp-maplg b{font-family:var(--f-mono,monospace)}
@media (max-width:640px){.limp-maplg{font-size:11px;bottom:20px}}`;
  document.head.append(css);

  // ---------- mapa ----------
  const map = window.__map;
  let camada = null, realce = null;
  const pesoDe = v => (D.trechos[v[4]].peso || 4);
  const seg = v => [[v[0], v[1]], [v[2], v[3]]];
  function desenha() {
    if (!map) return;
    if (camada) camada.remove();
    camada = null;
    if (!st.ligado) return;
    const ls = [];
    if (st.vista === 'ano') {
      // fundo: toda a rede em cinza (apaga as cores dos trechos para os anos aparecerem)
      ls.push(L.polyline(D.vaos.map(seg), { color: CINZA, weight: 5, opacity: .9, interactive: false }));
      if (st.pend) PEND.forEach(k => vaosDaOs[k].length && ls.push(L.polyline(vaosDaOs[k].map(seg), { color: '#fff', weight: 4, dashArray: '6 7', opacity: .95, interactive: false })));
      // anos do mais antigo para o mais novo: o mais recente fica por cima
      ANOS.slice().reverse().filter(a => st.anos.has(a)).forEach(a => {
        const vs = new Set(); osDoAno(a).forEach(k => vaosDaOs[k].forEach(v => vs.add(v)));
        if (vs.size) ls.push(L.polyline([...vs].map(seg), { color: corAno(a), weight: 7, opacity: 1, interactive: false, lineCap: 'round' }));
      });
    } else {
      const g = { sem: [], vencida: [], vence: [], dia: [] };
      D.vaos.forEach(v => g[situacao(porVao[v[5]].ult, classeDe(D.trechos[v[4]].nome))].push(seg(v)));
      Object.entries(g).forEach(([k, s]) => s.length && ls.push(L.polyline(s, { color: SIT[k][1], weight: k === 'sem' ? 5 : 7, opacity: k === 'sem' ? .9 : 1, interactive: false, lineCap: 'round' })));
    }
    camada = L.layerGroup(ls).addTo(map);
    if (realce) realce.eachLayer(l => l.bringToFront());
  }
  function focar(k, enquadrar) {
    st.foco = st.foco === k ? null : k;
    if (realce) { realce.remove(); realce = null; }
    if (st.foco !== null && map) {
      const vs = vaosDaOs[k], o = LP.os[k];
      const cor = o.data ? corAno(anoDe(o)) : '#fff';
      realce = L.layerGroup([
        L.polyline(vs.map(seg), { color: '#fff', weight: 14, opacity: 1, interactive: false }),
        L.polyline(vs.map(seg), { color: cor, weight: 8, opacity: 1, interactive: false, dashArray: o.data ? null : '8 6' }),
      ]).addTo(map);
      if (enquadrar && vs.length) {
        map.fitBounds(L.latLngBounds(vs.flatMap(seg)).pad(0.2), { maxZoom: 16 });
        document.querySelector('.mapbox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    pinta();
  }

  // legenda flutuante no mapa (anos clicáveis)
  let maplg = null;
  if (map && window.L) {
    maplg = document.createElement('div');
    maplg.className = 'limp-maplg';
    document.querySelector('.mapbox').append(maplg);
    L.DomEvent.disableClickPropagation(maplg);
    L.DomEvent.disableScrollPropagation(maplg);
    maplg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) alternaAno(b.dataset.a); });
  }
  function alternaAno(a) {
    if (a === 'pend') st.pend = !st.pend;
    else { a = +a; st.anos.has(a) ? st.anos.delete(a) : st.anos.add(a); }
    desenha(); pinta();
  }

  // ---------- cartão no painel ----------
  const card = document.createElement('section');
  card.className = 'limp-card';
  card.setAttribute('aria-label', 'Limpeza de faixa');
  document.querySelector('.panel').prepend(card);
  const linhaOsBtn = k => {
    const o = LP.os[k], pend = o.sit !== 'EXECUTADA';
    const cor = pend ? '#9ca3af' : corAno(anoDe(o));
    return `<button type="button" class="limp-os-b${pend ? ' pend' : ''}" data-k="${k}" style="--c:${cor}" aria-pressed="${st.foco === k}">` +
      `<span class="q">${pend ? esc(o.sit.toLowerCase()) : br(o.data)} · OS ${esc(o.os)} · ${vaosDaOs[k].length ? km(o.m) : 'sem localização'}</span>` +
      `<span class="s">${esc(o.desc.slice(0, 110))}${o.desc.length > 110 ? '…' : ''}</span></button>`;
  };
  function focoHtml() {
    if (st.foco === null) return '';
    const o = LP.os[st.foco];
    const ts = [...new Set(vaosDaOs[st.foco].map(v => D.trechos[v[4]].nome))];
    return `<div class="limp-foco"><span class="q">OS ${esc(o.os_completa)} · ${o.data ? 'executada ' + br(o.data) : esc(o.sit.toLowerCase()) + ' · criada ' + br(o.criada)}</span>
      <span>${esc(o.desc)}</span>
      <span class="limp-nota">No mapa: ${km(o.m)}${o.km_desc ? ` · descrição: ${String(o.km_desc).replace('.', ',')} km` : ''} · ${esc(o.metodo)}${o.al_os && o.al_os !== (D.meta || {}).al ? ` · OS lançada no ${esc(o.al_os)}` : ''}</span>
      ${o.ativos.length ? `<span class="limp-nota">Ativos: ${o.ativos.map(esc).join('; ')}</span>` : ''}
      ${ts.length ? `<span class="limp-nota">Trechos: ${ts.slice(0, 30).map(esc).join(', ')}${ts.length > 30 ? ` e mais ${ts.length - 30}` : ''}</span>` : ''}
      <div class="limp-acoes"><button type="button" data-acao="fecha">Fechar</button></div></div>`;
  }
  function pinta() {
    const exec = LP.os.filter(o => o.sit === 'EXECUTADA').length;
    const sub = `${exec} OS executada${exec === 1 ? '' : 's'} · ${km(KM_LIMPO)} de ${km(KM_REDE)} com registro`;
    let corpo = '';
    if (st.ligado && st.vista === 'ano') {
      corpo = (ANOS.length ? `<div class="limp-anos">${ANOS.map(a => { const n = osDoAno(a).length;
        return `<button type="button" class="limp-ano-l" data-a="${a}" aria-pressed="${st.anos.has(a)}"><i style="--c:${corAno(a)}"></i><span><b>${a}</b> · ${n} OS</span><em>${km(KM_ANO[a])}</em></button>`; }).join('')}
        ${PEND.length ? `<button type="button" class="limp-ano-l" data-a="pend" aria-pressed="${st.pend}"><i class="trac" style="--c:#9ca3af"></i><span>Programadas / pendentes · ${PEND.length} OS</span><em>${km(kmDe(PEND))}</em></button>` : ''}</div>
        <div class="limp-acoes"><button type="button" data-acao="todos">Todos os anos</button>${ANOS.map(a => `<button type="button" data-acao="so" data-a="${a}">Só ${a}</button>`).join('')}</div>`
        : '<p class="limp-nota">Nenhuma OS executada caiu neste alimentador.</p>') +
        `<p class="limp-nota">Cinza: sem registro de limpeza. Toque num ano para mostrar/esconder; toque numa OS para ver onde foi.</p>`;
    } else if (st.ligado) {
      const tot = { dia: 0, vence: 0, vencida: 0, sem: 0 };
      Object.values(RT).forEach(r => Object.keys(tot).forEach(k => (tot[k] += r.m[k])));
      corpo = `<div class="limp-bar">${['dia', 'vence', 'vencida', 'sem'].map(k => tot[k] ? `<span style="width:${100 * tot[k] / KM_REDE}%;background:${SIT[k][1]}"></span>` : '').join('')}</div>
        <div class="limp-anos">${Object.entries(SIT).map(([k, [n, c]]) => `<div class="limp-ano-l" style="cursor:default"><i style="--c:${c}"></i><span>${n}</span><em>${km(tot[k])}</em></div>`).join('')}</div>
        <p class="limp-nota">Regra: T1 a cada ${REGRA.T1} anos · T2 a cada ${REGRA.T2} · T3 a cada ${REGRA.T3}, contando da última limpeza de cada vão.</p>`;
    }
    const grupos = ANOS.map(a => `<details class="limp-grupo"${st.foco !== null && anoDe(LP.os[st.foco]) === a ? ' open' : ''}><summary style="--c:${corAno(a)}"><i></i>${a} <span>${osDoAno(a).length} OS · ${km(KM_ANO[a])}</span></summary>${osDoAno(a).map(linhaOsBtn).join('')}</details>`).join('') +
      (PEND.length ? `<details class="limp-grupo"${st.foco !== null && LP.os[st.foco].sit !== 'EXECUTADA' ? ' open' : ''}><summary style="--c:#9ca3af"><i></i>Pendentes <span>${PEND.length} OS</span></summary>${PEND.map(linhaOsBtn).join('')}</details>` : '');
    const abertos = [...card.querySelectorAll('.limp-grupo[open] summary')].map(s => s.firstChild?.nextSibling?.textContent?.trim());
    card.innerHTML = `<div class="limp-top"><h2>Limpeza de faixa<small>${sub}</small></h2>
      <button type="button" class="limp-sw" data-acao="liga" aria-pressed="${st.ligado}">${st.ligado ? 'No mapa' : 'Mostrar no mapa'}</button></div>
      ${st.ligado ? `<div class="limp-seg" role="group" aria-label="Pintar por"><button type="button" data-acao="ano" aria-pressed="${st.vista === 'ano'}">Por ano</button><button type="button" data-acao="sit" aria-pressed="${st.vista === 'sit'}">Situação (vencimento)</button></div>` : ''}
      ${corpo}${focoHtml()}
      ${LP.os.length ? `<div class="limp-grupo-lista">${grupos}</div>` : ''}`;
    abertos.forEach(t => card.querySelectorAll('.limp-grupo summary').forEach(s => { if (s.firstChild?.nextSibling?.textContent?.trim() === t) s.parentNode.open = true; }));
    if (maplg) {
      maplg.hidden = !st.ligado;
      maplg.innerHTML = st.vista === 'ano'
        ? ANOS.map(a => `<button type="button" data-a="${a}" aria-pressed="${st.anos.has(a)}"><i style="--c:${corAno(a)}"></i><b>${a}</b></button>`).join('') +
          `<span style="display:flex;align-items:center;gap:6px;padding:2px 3px"><i style="--c:${CINZA};border:1px solid #9ca3af"></i>sem registro</span>`
        : Object.values(SIT).map(([n, c]) => `<span style="display:flex;align-items:center;gap:6px;padding:2px 3px"><i style="--c:${c}"></i>${n}</span>`).join('');
    }
    poeSelos(true);
  }
  card.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k !== undefined) return focar(+b.dataset.k, true);
    if (b.classList.contains('limp-ano-l') && b.dataset.a) return alternaAno(b.dataset.a);
    const ac = b.dataset.acao;
    if (ac === 'liga') { st.ligado = !st.ligado; guarda('limp-ligado', st.ligado ? '1' : '0'); }
    else if (ac === 'ano' || ac === 'sit') { st.vista = ac; guarda('limp-vista', ac); }
    else if (ac === 'todos') st.anos = new Set(ANOS);
    else if (ac === 'so') st.anos = new Set([+b.dataset.a]);
    else if (ac === 'fecha') return focar(st.foco, false);
    else return;
    desenha(); pinta();
  });

  // ---------- detalhe do trecho ----------
  function secTrecho(nome) {
    const r = RT[nome], anos = REGRA[r.classe];
    const prox = r.ult ? somaAnos(r.ult, anos) : null;
    const s = sitTrecho(r);
    const ks = r.ks.slice().sort((a, b) => (LP.os[b].data || LP.os[b].criada || '').localeCompare(LP.os[a].data || LP.os[a].criada || ''));
    return `<section class="limp-sec"><h3>Limpeza de faixa · ${esc(r.classe)} a cada ${anos} anos</h3>
      <div class="limp-bar">${['dia', 'vence', 'vencida', 'sem'].map(k => r.m[k] ? `<span style="width:${100 * r.m[k] / (r.ext || 1)}%;background:${SIT[k][1]}" title="${SIT[k][0]}: ${km(r.m[k])}"></span>` : '').join('')}</div>
      <dl><dt>Situação</dt><dd><b style="color:${SIT[s][1]}">${SIT[s][0]}</b> · ${['dia', 'vence', 'vencida', 'sem'].filter(k => r.m[k]).map(k => `${SIT[k][0].toLowerCase()} ${km(r.m[k])}`).join(' · ')}</dd>
      <dt>Última</dt><dd>${r.ult ? br(r.ult) + ` · próxima até ${br(iso(prox))}` : 'nenhuma OS executada encontrada neste trecho'}</dd></dl>
      ${ks.length ? ks.map(linhaOsBtn).join('') : ''}
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
  poeDetalhe();

  // ---------- lista: ano da última limpeza ----------
  const lista = $('lista');
  function poeSelos(refaz) {
    lista.querySelectorAll(refaz ? '.row' : '.row:not([data-limp])').forEach(b => {
      b.dataset.limp = '1';
      b.querySelector('.limp-selo')?.remove();
      const r = RT[b.dataset.t];
      if (!r) return;
      const s = sitTrecho(r);
      const el = document.createElement('span');
      el.className = 'limp-selo' + (r.ult ? '' : ' nada');
      el.style.setProperty('--c', r.ult ? (st.vista === 'sit' ? SIT[s][1] : corAno(+r.ult.slice(0, 4))) : 'transparent');
      el.title = `Limpeza de faixa: ${SIT[s][0].toLowerCase()}${r.ult ? ' · última ' + br(r.ult) : ''}`;
      el.textContent = r.ult ? r.ult.slice(0, 4) : 'sem limpeza';
      b.querySelector('em')?.before(el);
    });
  }
  new MutationObserver(() => poeSelos(false)).observe(lista, { childList: true });

  desenha();
  pinta();
})();
