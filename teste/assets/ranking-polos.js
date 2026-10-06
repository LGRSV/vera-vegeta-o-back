// Página "Alimentadores por polo" (usa window.POLOS de ranking-polos-dados.js, gerado por scripts/gera_trechos.py).
// Um polo, uma regional (Norte, Centro, Sul) ou a ETO inteira por vez (#id no endereço); tabela ordenável;
// trechos filtráveis por classe (T1, T2, T3); no celular cada linha vira um cartão.
(function () {
  const P = window.POLOS, alvo = document.getElementById('polos');
  if (!P || !alvo) return;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (n, d = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const km = m => nf(m / 1000, 1);
  const br = d => d ? d.split('-').reverse().join('/') : '';
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const rotMes = m => `${MES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}`;
  const periodo = P.meses.length ? `${rotMes(P.meses[0])} a ${rotMes(P.meses[1])}` : '';
  const HOJE = new Date(); HOJE.setHours(0, 0, 0, 0);
  const UM_ANO = new Date(HOJE); UM_ANO.setFullYear(UM_ANO.getFullYear() + 1);
  const SIT = { dia: ['Em dia', '#22c55e'], vence: ['Vence em até 12 meses', '#facc15'], vencida: ['Vencida', '#ef4444'], sem: ['Sem registro', '#cbd5e1'] };

  // limpeza: metros por situação (pela regra de cada classe, contando da última limpeza de cada vão)
  function limpeza(lp) {
    const s = { dia: 0, vence: 0, vencida: 0, sem: 0 };
    let ult = '';
    Object.entries(lp).forEach(([cl, ds]) => Object.entries(ds).forEach(([d, m]) => {
      if (!d) { s.sem += m; return; }
      if (d > ult) ult = d;
      const v = new Date(d + 'T00:00:00'); v.setFullYear(v.getFullYear() + (P.regra[cl] || 5));
      s[v < HOJE ? 'vencida' : v < UM_ANO ? 'vence' : 'dia'] += m;
    }));
    const tot = s.dia + s.vence + s.vencida + s.sem;
    return { s, tot, ult, prazo: tot ? (s.dia + s.vence) / tot : null };
  }
  const prepara = a => { a.limp = limpeza(a.lp); a.n100 = a.km ? a.nae / a.km * 100000 : 0; return a; };
  P.polos.forEach(p => { p.als.forEach(prepara); (p.trs || []).forEach(t => { t.polo = p.nome; prepara(t); }); });

  // regional e ETO: alimentador que passa por mais de um polo vira uma linha só (soma a rede, a NAE e a limpeza de cada polo)
  function juntaAls(ps) {
    const m = new Map();
    ps.forEach(p => p.als.forEach(a => {
      const x = m.get(a.al);
      if (!x) { m.set(a.al, { ...a, muns: a.muns.slice(), lp: JSON.parse(JSON.stringify(a.lp)), polos: [p.nome] }); return; }
      ['km', 'nae', 'cons', 'chi', 'sem'].forEach(k => { x[k] = (x[k] || 0) + (a[k] || 0); });
      a.muns.forEach(c => { if (!x.muns.includes(c)) x.muns.push(c); });
      Object.entries(a.lp).forEach(([cl, ds]) => Object.entries(ds).forEach(([d, v]) => { (x.lp[cl] = x.lp[cl] || {})[d] = (x.lp[cl][d] || 0) + v; }));
      x.polos.push(p.nome);
      delete x.m;                                           // mais de um polo: abre o alimentador inteiro
    }));
    return [...m.values()].map(prepara);
  }
  const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const regs = [...new Set(P.polos.map(p => p.regional))];
  const totNae = p => p.als.reduce((s, a) => s + a.nae, 0);
  // escopos: cada polo, cada regional e a ETO (Tocantins inteiro)
  const ESC = {};
  P.polos.forEach(p => { ESC[p.id] = { id: p.id, tipo: 'polo', nome: 'Polo ' + p.nome, polos: [p], als: p.als, trs: p.trs || [] }; });
  const agrega = (id, tipo, nome, ps) => { ESC[id] = { id, tipo, nome, polos: ps, get als() { return this._a || (this._a = juntaAls(ps)); }, trs: ps.flatMap(p => p.trs || []) }; };
  agrega('eto', 'eto', 'ETO · Tocantins', P.polos);
  regs.forEach(r => agrega('regional-' + slug(r), 'reg', 'Regional ' + r, P.polos.filter(p => p.regional === r)));
  const naeEsc = e => e.polos.reduce((s, p) => s + totNae(p), 0);

  const POR_VEZ = 100;                                     // linhas por vez (a ETO tem milhares de trechos)
  const COLS = {
    nae: { rot: 'NAE', val: a => a.nae },
    cons: { rot: 'Consumidores', val: a => a.cons },
    chi: { rot: 'CHI (h)', val: a => a.chi },
    km: { rot: 'Km no polo', val: a => a.km },
    n100: { rot: 'NAE / 100 km', val: a => a.n100 },
    prazo: { rot: 'Limpeza no prazo', val: a => a.limp.prazo ?? -1 },
    ult: { rot: 'Última limpeza', val: a => a.limp.ult || '' },
  };
  const css = document.createElement('style');
  css.textContent = `
.wrap{max-width:1240px}
.pl-esc{display:grid;gap:10px}
.pl-reg{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pl-reg>span{font:600 12px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);min-width:64px}
.pl-reg button{font:600 14px var(--f-body);padding:8px 14px;min-height:40px;border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--fg);cursor:pointer}
.pl-reg button small{font-weight:400;color:var(--muted);margin-left:6px}
.pl-reg button[aria-pressed=true]{background:var(--fg);color:var(--paper);border-color:var(--fg)}
.pl-reg button[aria-pressed=true] small{color:inherit;opacity:.75}
.pl-reg button:focus-visible,.pl-tab th button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pl-vis{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;justify-self:start}
.pl-vis button{font:600 14px var(--f-body);min-height:40px;padding:6px 18px;border:0;background:var(--paper);color:var(--muted);cursor:pointer}
.pl-vis button[aria-pressed=true]{background:var(--fg);color:var(--paper)}
.pl-vis button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.pl-cab{display:grid;gap:4px}
.pl-cab h2{margin:0;font-size:24px;line-height:1.15}
.pl-cab p{font-size:14px}
.pl-tab{width:100%;border-collapse:collapse;font-size:14px;background:var(--paper);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.pl-tab th,.pl-tab td{padding:8px 10px;text-align:right;border-bottom:1px solid var(--line);vertical-align:top;font-variant-numeric:tabular-nums}
.pl-tab th{font-size:12.5px;color:var(--muted);background:var(--bg);white-space:nowrap;position:sticky;top:0;z-index:1}
.pl-tab th button{font:inherit;color:inherit;background:none;border:0;padding:4px 0;cursor:pointer;text-align:inherit}
.pl-tab th[aria-sort] button{color:var(--fg);font-weight:700}
.pl-tab th[aria-sort=descending] button::after{content:' ↓'}
.pl-tab th[aria-sort=ascending] button::after{content:' ↑'}
.pl-tab .t{text-align:left}
.pl-tab td.n{color:var(--muted);font:600 13px var(--f-mono);width:36px}
.pl-tab td.al a{font:600 15px var(--f-mono);color:var(--fg)}
.pl-tab td.al span{display:block;font-size:12.5px;color:var(--muted);max-width:340px}
.pl-tab td small{display:block;font-size:12px;color:var(--muted)}
.pl-tab tr:hover td{background:var(--bg)}
.pl-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--line);min-width:110px;margin:4px 0 2px}
.pl-bar i{display:block;height:100%}
.pl-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:12.5px;color:var(--muted)}
.pl-leg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-2px}
.pl-glob{padding-bottom:10px;border-bottom:1px solid var(--line)}
.pl-cab .pl-vis{margin-top:4px}
.pl-vis button small{font-weight:400;opacity:.75;margin-left:4px}
.pl-mais{font:600 14px var(--f-body);min-height:40px;padding:8px 18px;border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--fg);cursor:pointer;justify-self:center}
.pl-mais:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pl-nota{font-size:13px;display:grid;gap:4px;overflow-wrap:anywhere}  /* nome longo da planilha */
@media (max-width:760px){
  .pl-reg>span{flex-basis:100%;min-width:0}
  .pl-reg button{padding:7px 11px;min-height:38px}
  .pl-tab,.pl-tab tbody,.pl-tab tr,.pl-tab td{display:block;width:100%}
  .pl-tab{border:0;background:none}
  .pl-tab thead{display:none}
  .pl-tab tr{border:1px solid var(--line);border-radius:8px;background:var(--paper);margin-bottom:10px;padding:6px 0;display:grid;grid-template-columns:1fr 1fr}
  .pl-tab td{border:0;text-align:left;padding:4px 12px}
  .pl-tab td.n{display:none}
  .pl-tab td.al{grid-column:1/3;padding-bottom:6px;border-bottom:1px solid var(--line);margin-bottom:4px}
  .pl-tab td.al a::before{content:attr(data-pos) 'º  ';color:var(--muted)}
  .pl-tab td.lim{grid-column:1/3}
  .pl-tab td[data-r]::before{content:attr(data-r);display:block;font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
}`;
  document.head.append(css);

  // endereço: #<polo|regional-x|eto>[/trechos][/T1|T2|T3]
  const doHash = () => { const ps = location.hash.slice(1).split('/');
    return [ESC[ps[0]], ps.includes('trechos') ? 'tr' : 'al', ps.find(x => /^T[123]$/.test(x)) || '']; };
  let [esc0, vista, classe] = doHash(), ord = 'nae', desc = true, mostra = POR_VEZ;   // vista: 'al' alimentadores, 'tr' trechos
  let sel = esc0 || ESC[P.polos[0].id];
  const poeHash = () => history.replaceState(null, '', '#' + sel.id + (vista === 'tr' ? '/trechos' + (classe ? '/' + classe : '') : ''));

  function desenha() {
    const col = COLS[ord];
    const tr = vista === 'tr', varios = sel.tipo !== 'polo', polo = sel.polos[0];
    const base = tr ? sel.trs.filter(a => !classe || a.t.split('-')[0] === classe) : sel.als;
    const als = base.slice().sort((a, b) => (desc ? -1 : 1) * (col.val(a) > col.val(b) ? 1 : col.val(a) < col.val(b) ? -1 : 0) || b.nae - a.nae
      || (a.al + (a.t || '') > b.al + (b.t || '') ? 1 : -1));
    const rotKm = tr ? 'Km do trecho' : COLS.km.rot;
    const kmPolo = sel.polos.reduce((s, p) => s + p.als.reduce((t, a) => t + a.km, 0), 0), nae = naeEsc(sel);
    const nMuns = sel.polos.reduce((s, p) => s + p.n_muns, 0), nTr = sel.trs.length;
    const nCl = c => sel.trs.filter(a => a.t.split('-')[0] === c).length;
    const btn = (id, nome, n) => `<button type="button" data-p="${id}" aria-pressed="${sel.id === id}">${esc(nome)}<small>${nf(n)} NAE</small></button>`;
    const th = (k, cls = '') => `<th scope="col" class="${cls}"${k === ord ? ` aria-sort="${desc ? 'descending' : 'ascending'}"` : ''}><button type="button" data-o="${k}">${k === 'km' ? rotKm : COLS[k].rot}</button></th>`;
    const vis = als.slice(0, mostra);
    alvo.innerHTML = `<div class="pl-esc" role="group" aria-label="Escolher a visão">
        <div class="pl-reg pl-glob"><span>Visão</span>${btn('eto', 'ETO · Tocantins', naeEsc(ESC.eto))}${regs.map(r => btn('regional-' + slug(r), r, naeEsc(ESC['regional-' + slug(r)]))).join('')}</div>
        ${regs.map(r => `<div class="pl-reg"><span>${esc(r)}</span>${P.polos.filter(p => p.regional === r).map(p => btn(p.id, p.nome, totNae(p))).join('')}</div>`).join('')}</div>
      <div class="pl-cab"><h2>${esc(sel.nome)}</h2>
        <p>${varios ? `${sel.polos.length} polos (${esc(sel.polos.map(p => p.nome).join(', '))})` : `Regional ${esc(polo.regional)} · equipe ${esc(polo.equipe)}`} · ${nMuns} municípios · ${sel.als.length} alimentadores · ${nTr} trechos com NAE · ${km(kmPolo)} km de rede · <b>${nf(nae)} NAE</b> árvore/eucalipto${periodo ? ' de ' + periodo : ''}</p>
        <div class="pl-vis" role="group" aria-label="Ver ranking de"><button type="button" data-v="al" aria-pressed="${!tr}">Alimentadores</button><button type="button" data-v="tr" aria-pressed="${tr}">Trechos</button></div>
        ${tr ? `<div class="pl-vis pl-cl" role="group" aria-label="Classe do trecho"><button type="button" data-c="" aria-pressed="${!classe}">Todos <small>${nf(nTr)}</small></button>${
          ['T1', 'T2', 'T3'].map(c => `<button type="button" data-c="${c}" aria-pressed="${classe === c}">${c} <small>${nf(nCl(c))}</small></button>`).join('')}</div>` : ''}</div>
      <table class="pl-tab">
        <thead><tr><th scope="col" class="t">#</th><th scope="col" class="t">${tr ? 'Trecho' : 'Alimentador'}</th>${th('nae')}${th('cons')}${th('chi')}${th('km')}${th('n100')}${th('prazo', 't')}${th('ult')}</tr></thead>
        <tbody>${vis.map((a, i) => {
          const L = a.limp, muns = tr ? [P.muns[a.mun] || a.mun].filter(Boolean) : a.muns.map(c => P.muns[c] || c);
          const q = [tr ? 't=' + encodeURIComponent(a.t) : '', a.m ? 'm=' + encodeURIComponent(a.m) : ''].filter(Boolean).join('&');
          const href = `../alimentadores/${encodeURIComponent(a.al)}/${q ? '?' + q : ''}`;
          return `<tr><td class="n">${i + 1}º</td>
            <td class="al t"><a href="${href}" data-pos="${i + 1}">${esc(tr ? a.t : a.al)}</a><span>${tr ? esc(a.al) + ' · ' : ''}${esc(a.se)}${varios ? ' · ' + esc(tr ? a.polo : a.polos.join(' + ')) : ''}${muns.length ? ' · ' + esc(muns.slice(0, 4).join(', ')) + (muns.length > 4 ? ` e mais ${muns.length - 4}` : '') : ''}</span></td>
            <td data-r="NAE"><b>${nf(a.nae)}</b>${a.sem ? `<small>${nf(a.sem)} sem trecho</small>` : ''}</td>
            <td data-r="Consumidores">${nf(a.cons)}</td>
            <td data-r="CHI (h)">${nf(a.chi)}</td>
            <td data-r="${rotKm}">${km(a.km)}${a.km_total > a.km + 50 ? `<small>de ${km(a.km_total)} km</small>` : ''}</td>
            <td data-r="NAE / 100 km">${nf(a.n100, 1)}</td>
            <td class="t lim" data-r="Limpeza no prazo">${L.tot ? `<span class="pl-bar" title="${Object.entries(SIT).map(([k, [n]]) => `${n}: ${km(L.s[k])} km`).join(' · ')}">${
              Object.entries(SIT).map(([k, [, c]]) => L.s[k] ? `<i style="width:${100 * L.s[k] / L.tot}%;background:${c}"></i>` : '').join('')}</span>${nf(100 * L.prazo)}% no prazo` : '<small>sem dados de limpeza</small>'}</td>
            <td data-r="Última limpeza">${L.ult ? br(L.ult) : '<small>sem registro</small>'}</td></tr>`;
        }).join('')}</tbody></table>
      ${!als.length ? '<p>Nenhum trecho dessa classe com NAE no período.</p>' : ''}
      ${als.length > mostra ? `<button type="button" class="pl-mais" data-m="1">Mostrar mais ${nf(Math.min(POR_VEZ, als.length - mostra))} (de ${nf(als.length - mostra)} restantes)</button>` : ''}
      <div class="pl-leg" aria-label="Cores da limpeza">${Object.values(SIT).map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div>
      <div class="pl-nota"><p><b>Como conta:</b> alimentador que passa por mais de um polo aparece em cada um, com a rede e a NAE dos trechos que estão no polo (o trecho conta no município onde tem mais rede). NAE sem trecho localizado conta no polo onde o alimentador tem mais rede.${varios ? ' Na regional e na ETO, o alimentador aparece uma vez só, somando os polos.' : ''}</p>
        ${tr ? '<p><b>Trechos:</b> só os que tiveram NAE no período; o trecho conta no polo do município onde tem mais rede. A NAE do trecho soma todos os ativos dele (chaves e transformadores), inclusive NAE registrada em outro alimentador cujo ativo hoje está no trecho. Tocar no trecho abre o mapa com ele selecionado.</p>' : ''}
        <p><b>Limpeza:</b> só OS executadas${P.equipes ? ' pelas equipes ' + esc(P.equipes.join(', ')) : ''}, pela data de execução; T1 a cada ${P.regra.T1} anos, T2 a cada ${P.regra.T2}, T3 a cada ${P.regra.T3}, contando da última limpeza de cada vão (situação de hoje).</p>
        <p>Polo de cada município: ${esc(P.fonte)}.${P.fora.length ? ' ' + esc(P.fora.join('; ')) + '.' : ''}</p></div>`;
  }
  alvo.addEventListener('click', e => {
    const b = e.target.closest('[data-p],[data-o],[data-v],[data-c],[data-m]');
    if (!b || b.tagName === 'A') return;
    const y = b.getBoundingClientRect().top;
    if (b.dataset.m) mostra += POR_VEZ;
    else if (b.dataset.p) { sel = ESC[b.dataset.p]; mostra = POR_VEZ; poeHash(); }
    else if (b.dataset.v) { vista = b.dataset.v; mostra = POR_VEZ; poeHash(); }
    else if (b.dataset.c !== undefined) { classe = b.dataset.c; ord = 'nae'; desc = true; mostra = POR_VEZ; poeHash(); }   // classe: maior NAE primeiro
    else if (b.dataset.o === ord) desc = !desc;
    else { ord = b.dataset.o; desc = true; }
    desenha();
    const f = b.dataset.m ? alvo.querySelector(`.pl-tab tbody tr:nth-child(${mostra - POR_VEZ + 1}) a`)
      : alvo.querySelector(b.dataset.o ? `[data-o="${ord}"]` : b.dataset.p ? `[data-p="${sel.id}"]` : b.dataset.v ? `[data-v="${vista}"]` : `[data-c="${classe}"]`);
    if (f) { f.focus({ preventScroll: true }); if (!b.dataset.m) window.scrollBy(0, f.getBoundingClientRect().top - y); }   // a tela não pula
  });
  addEventListener('hashchange', () => { const [p, v, c] = doHash(); if (p) { sel = p; vista = v; classe = c; mostra = POR_VEZ; desenha(); } });
  desenha();
})();
