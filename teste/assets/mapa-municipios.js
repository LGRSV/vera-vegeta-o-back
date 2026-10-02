// Mapa dos municípios do Tocantins na página de pesquisa por município (usa window.MUN de mapa-municipios-dados.js).
// Município com alimentador no site: colorido e clicável (mostra os alimentadores ao lado).
// A busca (#busca) e os blocos (.card[data-busca]) da página ficam ligados ao mapa.
(function () {
  const M = window.MUN, alvo = document.getElementById('mapa-to');
  if (!M || !alvo) return;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const kmTot = m => m.als.reduce((s, a) => s + a.m, 0);
  const porCod = Object.fromEntries(M.muns.map(m => [m.cod, m]));
  const porBusca = Object.fromEntries(M.muns.map(m => [m.busca, m]));

  const css = document.createElement('style');
  css.textContent = `
.wrap{max-width:1440px}
.mapa-to{display:grid;grid-template-columns:310px minmax(0,1fr) 320px;grid-template-areas:'rank mapa sel';gap:16px;align-items:start}
.mt-rank{grid-area:rank}.mt-mapa{grid-area:mapa}.mt-sel{grid-area:sel}
@media (max-width:1180px){.mapa-to{grid-template-columns:minmax(0,1fr) 320px;grid-template-areas:'mapa sel' 'rank sel'}}
@media (max-width:860px){.mapa-to{grid-template-columns:1fr;grid-template-areas:'mapa' 'sel' 'rank'}}
.mt-rank{border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:12px;display:grid;gap:8px;align-content:start}
.mt-rank h2{margin:0;font-size:18px;line-height:1.2}
.mt-rank h2 small{display:block;font-size:12.5px;font-weight:400;color:var(--muted);margin-top:2px}
.mt-ord{display:flex;border:1px solid var(--line);border-radius:7px;overflow:hidden}
.mt-ord button{flex:1;font:600 12.5px var(--f-body);min-height:34px;padding:4px 6px;border:0;background:var(--bg);color:var(--muted);cursor:pointer}
.mt-ord button[aria-pressed=true]{background:var(--fg);color:var(--paper)}
.mt-ord button:focus-visible,.mt-ra:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.mt-rl{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.mt-ra{display:grid;grid-template-columns:24px 1fr auto;gap:2px 8px;align-items:center;padding:8px 9px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--fg);text-decoration:none}
.mt-ra:hover,.mt-ra.acende{border-color:var(--accent)}
.mt-ra .p{grid-row:span 3;font:700 15px var(--f-mono);color:var(--muted);text-align:center}
.mt-ra b{font:600 14.5px var(--f-mono)}
.mt-ra .v{font:700 17px var(--f-mono);text-align:right}
.mt-ra .v small{font:500 11px var(--f-body);color:var(--muted);margin-left:3px}
.mt-ra .se{font-size:12px;color:var(--muted);grid-column:2/4}
.mt-ra .bar{grid-column:2/4;height:6px;border-radius:3px;background:var(--line);overflow:hidden}
.mt-ra .bar i{display:block;height:100%;background:var(--alerta)}
.mt-ra .ex{grid-column:2/4;font-size:12px;color:var(--muted)}
.mt-ra .ex em{font-style:normal;font-weight:600}
.mt-ra .ex em.velha{color:var(--alerta)}
.mt-ra.zero{opacity:.7}
.mt-mapa{position:relative;border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:10px}
.mt-mapa svg{display:block;height:min(74vh,820px);width:auto;max-width:100%;margin:0 auto}
@media (max-width:860px){.mt-mapa svg{height:auto;width:100%}}
.mun{fill:var(--mt-vazio);stroke:var(--mt-borda);stroke-width:.6;vector-effect:non-scaling-stroke;transition:fill .12s}
.mun.tem{fill:var(--mt-tem);cursor:pointer}
.mun.tem:hover,.mun.acende{fill:var(--accent)}
.mun.sem:hover{fill:var(--mt-vazio-h)}
.mun.achou{stroke:var(--fg);stroke-width:2}
.mun.foco{fill:var(--accent);stroke:var(--fg);stroke-width:2.6}
.mun:focus-visible{outline:none;stroke:var(--accent);stroke-width:3}
.mt-rot{font:600 15px var(--f-body);fill:var(--fg);paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round;pointer-events:none;text-anchor:middle}
.mt-rot.ref{font-weight:500;fill:var(--muted);font-size:14px}
.mt-dica{position:absolute;pointer-events:none;background:var(--fg);color:var(--paper);font:600 13px var(--f-body);padding:5px 9px;border-radius:6px;white-space:nowrap;transform:translate(-50%,-130%);display:none;z-index:2}
.mt-dica small{font-weight:400;opacity:.8}
.mt-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin:8px 4px 0}
.mt-leg i{display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;margin-right:6px;border:1px solid var(--mt-borda)}
.mt-sel{border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:14px 16px;display:grid;gap:8px;position:sticky;top:12px}
.mt-sel h2{margin:0;font-size:22px;line-height:1.15}
.mt-sel .al{display:grid;gap:2px;padding:9px 11px;border:1px solid var(--line);border-radius:7px;text-decoration:none;color:var(--fg);background:var(--bg)}
.mt-sel .al:hover{border-color:var(--accent)}
.mt-sel .al b{font:600 15px var(--f-mono)}
.mt-sel .al span{font-size:13px;color:var(--muted)}
.mt-sel .abre{font-weight:600}
.card.acende{border-color:var(--accent)}
:root{--mt-vazio:#e3e6e1;--mt-vazio-h:#d4d8d2;--mt-borda:#b4bab3;--mt-tem:#e9a07c}
@media (prefers-color-scheme: dark){:root{--mt-vazio:#252c31;--mt-vazio-h:#2f383e;--mt-borda:#46525a;--mt-tem:#9a4e2e}}`;
  document.head.append(css);

  alvo.className = 'mapa-to';
  alvo.innerHTML = `<aside class="mt-rank" aria-label="Ranking de alimentadores por NAE"></aside><div class="mt-mapa"><svg role="img" aria-label="Mapa dos municípios do Tocantins"></svg><div class="mt-dica"></div>
    <div class="mt-leg"><span><i style="background:var(--mt-tem)"></i>Com alimentador no site — toque para ver</span><span><i style="background:var(--mt-vazio)"></i>Sem dados ainda</span></div></div>
    <section class="mt-sel" aria-live="polite"></section>`;
  const svg = alvo.querySelector('svg'), dica = alvo.querySelector('.mt-dica'), sel = alvo.querySelector('.mt-sel'), caixa = svg.parentNode;
  svg.setAttribute('viewBox', `-6 -6 ${M.w + 12} ${M.h + 12}`);
  const NS = 'http://www.w3.org/2000/svg', el = {};
  let foco = null;
  M.muns.forEach(m => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', m.d);
    p.setAttribute('class', 'mun ' + (m.slug ? 'tem' : 'sem'));
    if (m.slug) { p.setAttribute('tabindex', '0'); p.setAttribute('role', 'button'); p.setAttribute('aria-label', m.nome); }
    p.dataset.cod = m.cod;
    svg.append(p);
    el[m.cod] = p;
  });
  // nomes: municípios com dados + algumas cidades de referência; os que se cruzam somem (aparecem no mouse)
  const REF = ['palmas', 'araguaina', 'gurupi', 'porto nacional', 'paraiso do tocantins', 'dianopolis', 'tocantinopolis'];
  const g = document.createElementNS(NS, 'g');
  M.muns.forEach(m => {
    if (!m.slug && !REF.includes(m.busca)) return;
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', m.c[0]); t.setAttribute('y', m.c[1] + 4);
    t.setAttribute('class', 'mt-rot' + (m.slug ? '' : ' ref'));
    t.textContent = m.nome;
    t.dataset.cod = m.cod;
    t.dataset.p = m.slug ? kmTot(m) : -1;
    g.append(t);
  });
  svg.append(g);
  function desamontoa() {
    const ts = [...g.children].sort((a, b) => (b.dataset.cod === foco) - (a.dataset.cod === foco) || b.dataset.p - a.dataset.p), ok = [];
    ts.forEach(t => {
      t.style.display = '';
      const r = t.getBBox();
      if (ok.some(q => r.x < q.x + q.width + 2 && r.x + r.width + 2 > q.x && r.y < q.y + q.height && r.y + r.height > q.y)) t.style.display = 'none';
      else ok.push(r);
    });
  }
  desamontoa();

  svg.addEventListener('mousemove', e => {
    const p = e.target.closest('.mun');
    if (!p) { dica.style.display = 'none'; return; }
    const m = porCod[p.dataset.cod], r = caixa.getBoundingClientRect();
    dica.innerHTML = `${esc(m.nome)} <small>${m.slug ? `· ${m.als.length} alimentador${m.als.length > 1 ? 'es' : ''} · ${km(kmTot(m))}` : '· sem dados ainda'}</small>`;
    dica.style.left = (e.clientX - r.left) + 'px'; dica.style.top = (e.clientY - r.top) + 'px'; dica.style.display = 'block';
  });
  svg.addEventListener('mouseleave', () => { dica.style.display = 'none'; });

  function resumo() {
    const n = M.muns.filter(m => m.slug).length;
    sel.innerHTML = `<h2>Tocantins</h2><p>${n} de ${M.muns.length} municípios com alimentador no site. Toque num município colorido, ou busque pelo nome abaixo.</p>`;
  }
  function escolhe(cod) {
    const m = porCod[cod];
    if (foco) el[foco].classList.remove('foco');
    foco = cod;
    el[cod].classList.add('foco');
    svg.insertBefore(el[cod], g);   // contorno por cima dos vizinhos
    desamontoa();
    sel.innerHTML = m.slug
      ? `<h2>${esc(m.nome)}</h2><p>${m.als.length} alimentador${m.als.length > 1 ? 'es' : ''} · ${km(kmTot(m))} de rede no município</p>` +
        m.als.map(a => `<a class="al" href="alimentadores/${esc(a.cod)}/?m=${esc(m.slug)}"><b>${esc(a.cod)}</b><span>${esc(a.se)} · ${km(a.m)} aqui</span></a>`).join('') +
        `<a class="abre" href="municipios/${esc(m.slug)}/">Abrir a página do município →</a>`
      : `<h2>${esc(m.nome)}</h2><p>Ainda sem alimentador processado no site.</p>`;
    if (matchMedia('(max-width:860px)').matches) sel.scrollIntoView({ block: 'nearest' });
  }
  svg.addEventListener('click', e => { const p = e.target.closest('.mun'); if (p) escolhe(p.dataset.cod); });
  svg.addEventListener('keydown', e => { const p = e.target.closest('.mun'); if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); escolhe(p.dataset.cod); } });

  // busca da página: destaca no mapa (também os municípios sem dados); um resultado só = já escolhe
  const busca = document.getElementById('busca');
  if (busca) {
    busca.placeholder = 'Buscar município (ex.: Arraias)';
    busca.addEventListener('input', () => {
      const q = semAcento(busca.value.trim());
      Object.values(el).forEach(p => p.classList.remove('achou'));
      if (!q) { if (foco) { el[foco].classList.remove('foco'); foco = null; desamontoa(); } resumo(); return; }
      const ms = M.muns.filter(m => m.busca.includes(q));
      ms.forEach(m => el[m.cod].classList.add('achou'));
      if (ms.length === 1) escolhe(ms[0].cod);
    });
  }
  // blocos da página: passar o mouse acende o município no mapa
  document.querySelectorAll('.card[data-busca]').forEach(c => {
    const m = porBusca[c.dataset.busca];
    if (!m) return;
    c.addEventListener('mouseenter', () => el[m.cod].classList.add('acende'));
    c.addEventListener('mouseleave', () => el[m.cod].classList.remove('acende'));
  });
  svg.addEventListener('mouseover', e => {
    const p = e.target.closest('.mun.tem');
    document.querySelectorAll('.card.acende').forEach(c => c.classList.remove('acende'));
    if (p) document.querySelector(`.card[data-busca="${CSS.escape(porCod[p.dataset.cod].busca)}"]`)?.classList.add('acende');
  });
  resumo();

  // ---------- ranking de alimentadores por NAE (window.RANK de ranking-nae.js) ----------
  const R = window.RANK, rank = alvo.querySelector('.mt-rank');
  if (!R || !R.als.length) { rank.remove(); return; }
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const rotMes = m => `${MES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}`;
  const nf = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const ORD = {
    nae: { rot: 'NAE', val: a => a.nae, un: 'NAE' },
    cons: { rot: 'Consumidores', val: a => a.cons, un: 'cons.' },
    km: { rot: 'NAE/100 km', val: a => a.km ? a.nae / a.km * 100 : 0, un: '/100 km' },
  };
  let ord = 'nae';
  const slugDe = cod => (porCod[cod] || {}).slug;
  const hoje = new Date();
  const anosDesde = d => d ? (hoje - new Date(d + 'T00:00:00')) / 31557600000 : Infinity;
  function pintaRank() {
    const o = ORD[ord];
    const ls = R.als.slice().sort((a, b) => o.val(b) - o.val(a) || b.nae - a.nae);
    const max = Math.max(...ls.map(o.val), 1);
    rank.innerHTML = `<h2>Alimentadores com mais NAE<small>Árvore/eucalipto na rede · ${R.meses.length ? rotMes(R.meses[0]) + ' a ' + rotMes(R.meses[1]) : ''}</small></h2>
      <div class="mt-ord" role="group" aria-label="Ordenar por">${Object.entries(ORD).map(([k, x]) => `<button type="button" data-o="${k}" aria-pressed="${k === ord}">${x.rot}</button>`).join('')}</div>
      <ol class="mt-rl">${ls.map((a, i) => {
        const v = o.val(a), slug = a.muns.map(slugDe).find(Boolean);
        const velha = anosDesde(a.ult_limpeza) > 3;
        return `<li><a class="mt-ra${a.nae ? '' : ' zero'}" href="alimentadores/${esc(a.al)}/${slug ? '?m=' + esc(slug) : ''}" data-al="${esc(a.al)}">
          <span class="p">${i + 1}º</span><b>${esc(a.al)}</b><span class="v">${nf(v)}<small>${o.un}</small></span>
          <span class="se">${esc(a.se)} · ${a.muns.map(c => esc((porCod[c] || {}).nome || c)).join(', ')}</span>
          <span class="bar"><i style="width:${100 * v / max}%"></i></span>
          <span class="ex">${a.nae} NAE · ${a.cons.toLocaleString('pt-BR')} cons. · ${nf(a.km)} km · limpeza: <em class="${velha ? 'velha' : ''}">${a.ult_limpeza ? a.ult_limpeza.split('-').reverse().join('/') : 'sem registro'}</em></span></a></li>`;
      }).join('')}</ol>`;
  }
  rank.addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (b) { ord = b.dataset.o; pintaRank(); } });
  // passar o mouse no alimentador acende os municípios dele no mapa
  const apaga = () => Object.values(el).forEach(p => p.classList.remove('acende'));
  rank.addEventListener('mouseover', e => {
    const a = e.target.closest('.mt-ra'); apaga();
    if (a) (R.als.find(x => x.al === a.dataset.al) || { muns: [] }).muns.forEach(c => el[c] && el[c].classList.add('acende'));
  });
  rank.addEventListener('mouseleave', apaga);
  rank.addEventListener('focusin', e => { const a = e.target.closest('.mt-ra'); apaga(); if (a) (R.als.find(x => x.al === a.dataset.al) || { muns: [] }).muns.forEach(c => el[c] && el[c].classList.add('acende')); });
  pintaRank();
})();
