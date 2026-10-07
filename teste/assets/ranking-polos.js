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
  const SIT = { dia: ['Em dia', '#22c55e'], vence: ['Vence em até 12 meses', '#facc15'], vencida: ['Vencida', '#ef4444'], sem: ['Sem registro', 'var(--sem)'] };

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
  const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const regs = [...new Set(P.polos.map(p => p.regional))];
  const totNae = p => p.als.reduce((s, a) => s + a.nae, 0);
  // escopos: cada polo, cada regional e a ETO (Tocantins inteiro)
  const ESC = {};
  P.polos.forEach(p => { ESC[p.id] = { id: p.id, tipo: 'polo', nome: 'Polo ' + p.nome, polos: [p], als: p.als, trs: p.trs || [] }; });
  const agrega = (id, tipo, nome, ps) => { ESC[id] = { id, tipo, nome, polos: ps, get als() { return this._a || (this._a = juntaAls(ps)); }, trs: ps.flatMap(p => p.trs || []) }; };
  agrega('eto', 'eto', 'ETO · Tocantins', P.polos);
  regs.forEach(r => agrega('regional-' + slug(r), 'reg', 'Regional ' + r, P.polos.filter(p => p.regional === r)));
  const naeEsc = e => e.polos.reduce((s, p) => s + totNae(p), 0);
  const regId = r => 'regional-' + slug(r);
  const polosDe = r => P.polos.filter(p => p.regional === r);

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
  const cel = matchMedia('(max-width:900px)');             // o seletor de escopo muda de forma no celular
  const seta = c => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%23${c}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
  const css = document.createElement('style');
  css.textContent = `
/* tokens do sistema visual usados aqui (mesmos nomes e valores de site.css) */
:root{
  --on-accent:#ffffff; --line-forte:#8c948f; --sel:#f4e6df; --hover:rgb(27 32 36 / .05); --sem:#dfe3df;
  --f-display:"IBM Plex Sans Condensed","Arial Narrow",system-ui,sans-serif;
  --t-xs:12px; --t-sm:13px; --t-md:14px; --t-base:15px; --t-lg:17px; --t-xl:20px; --t-2xl:24px; --t-kpi:32px;
  --t-h1:clamp(26px,3.4vw,32px);
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px; --s7:48px;
  --r1:6px; --r2:10px; --r3:14px; --rp:999px;
  --sh1:0 1px 2px rgb(0 0 0 / .12);
  --sh2:0 1px 2px rgb(0 0 0 / .06),0 12px 32px -12px rgb(0 0 0 / .28);
  --dur:160ms; --dur-l:220ms; --ease:cubic-bezier(.2,.7,.2,1);
  --wrap:1360px; --alvo:40px;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --on-accent:#14181b; --line-forte:#5f6b73; --sel:#352b27; --hover:rgb(231 234 235 / .06); --sem:#343c42;
  --sh1:0 1px 2px rgb(0 0 0 / .45);
  --sh2:0 1px 2px rgb(0 0 0 / .3),0 12px 32px -12px rgb(0 0 0 / .7);
}}
:root[data-theme="dark"]{
  --on-accent:#14181b; --line-forte:#5f6b73; --sel:#352b27; --hover:rgb(231 234 235 / .06); --sem:#343c42;
  --sh1:0 1px 2px rgb(0 0 0 / .45);
  --sh2:0 1px 2px rgb(0 0 0 / .3),0 12px 32px -12px rgb(0 0 0 / .7);
}
@keyframes esmaece{from{opacity:.35}}

.wrap{max-width:var(--wrap)}
#polos{display:grid;gap:var(--s5);min-width:0}
#polos :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#polos button{cursor:pointer;-webkit-tap-highlight-color:transparent}

/* seletor de escopo: ETO e regionais na 1ª coluna, os polos de cada regional ao lado */
.pl-esc{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:var(--s1) var(--s4);align-items:center;justify-items:start}
.pl-polos{display:flex;flex-wrap:wrap;gap:var(--s1)}
.pl-pil{border:0;background:transparent;border-radius:var(--rp);padding:var(--s2) 14px;min-height:var(--alvo);
  font:600 var(--t-md)/1.2 var(--f-body);color:var(--fg);white-space:nowrap}
.pl-pil small{font-size:var(--t-sm);font-weight:400;color:var(--muted);margin-left:2px;font-variant-numeric:tabular-nums}
.pl-pil:hover{background:var(--hover)}
.pl-pil[aria-pressed=true]{background:color-mix(in srgb,var(--accent) 10%,var(--paper));box-shadow:inset 0 0 0 1.5px var(--accent)}

/* segmentado (ETO/regionais no celular e filtro de classe) */
.pl-seg{display:inline-flex;gap:2px;padding:3px;border:0;border-radius:var(--r2);background:var(--hover)}
.pl-seg button{min-height:var(--alvo);padding:0 var(--s3);border:0;border-radius:7px;background:transparent;color:var(--muted);
  font:600 var(--t-sm)/1.2 var(--f-body);white-space:nowrap}
.pl-seg button:hover{color:var(--fg)}
.pl-seg button[aria-pressed=true]{background:var(--seg-on,var(--paper));color:var(--fg);box-shadow:var(--sh1)}
.pl-seg small{font-size:var(--t-xs);font-weight:400;color:var(--muted);margin-left:2px;font-variant-numeric:tabular-nums}

/* cabeçalho do escopo */
.pl-cab{display:grid;gap:var(--s2);margin-top:var(--s2)}
#polos .pl-sup{margin:0;max-width:none;font:600 var(--t-xs)/1.4 var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.pl-cab h2{margin:0;font:700 var(--t-2xl)/1.15 var(--f-display);letter-spacing:-.01em;color:var(--fg)}
.pl-kpi{display:flex;flex-wrap:wrap;align-items:flex-end;gap:var(--s2) var(--s6);margin:var(--s1) 0 0}
.pl-kpi>div{display:flex;flex-direction:column-reverse}
.pl-kpi dt{font-size:var(--t-xs);line-height:1.4;color:var(--muted)}
.pl-kpi dd{margin:0;font:600 var(--t-xl)/1.2 var(--f-body);font-variant-numeric:tabular-nums;color:var(--fg)}
.pl-kpi>div:first-child dd{font:700 var(--t-kpi)/1 var(--f-display);font-variant-numeric:tabular-nums;color:var(--fg)}

/* lista: abas, ferramentas, tabela */
.pl-lista{display:grid;gap:var(--s3);min-width:0}
.pl-vis{display:flex;gap:var(--s5);border:0;border-radius:0;box-shadow:inset 0 -1px var(--line);justify-self:stretch}
.pl-vis button{background:none;border:0;padding:0 2px;min-height:var(--alvo);color:var(--muted);font:600 var(--t-md) var(--f-body)}
.pl-vis button:hover{color:var(--fg)}
.pl-vis button[aria-pressed=true]{color:var(--fg);box-shadow:inset 0 -2px var(--accent)}
.pl-ferr{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:var(--s3)}
.pl-leg{margin-left:auto;display:flex;flex-wrap:wrap;align-items:center;gap:var(--s1) var(--s3);font-size:var(--t-xs);line-height:1.4;color:var(--muted)}
.pl-leg>span{display:inline-flex;align-items:center;gap:6px}
.pl-leg .pl-leg-t{font-weight:600}
.pl-leg i{width:8px;height:8px;border-radius:50%;flex:none}
.pl-leg i.vz{background:transparent;box-shadow:inset 0 0 0 1.5px var(--muted)}
.pl-ordw{display:none}

.pl-tab{width:100%;border:0;background:none;border-collapse:separate;border-spacing:0;border-radius:0;overflow:visible;font-size:var(--t-md)}
.pl-tab th,.pl-tab td{text-align:right}
.pl-tab th{position:sticky;top:0;z-index:2;background:var(--bg);vertical-align:bottom;border-bottom:1px solid var(--line);padding:0 10px;
  font:600 var(--t-xs)/1.3 var(--f-body);color:var(--muted);white-space:nowrap}
.pl-tab th>span{display:block;line-height:var(--alvo)}
.pl-tab th button{font:inherit;color:inherit;background:none;border:0;min-height:var(--alvo);padding:0;text-align:inherit;white-space:nowrap}
.pl-tab th button:hover,.pl-tab th[aria-sort] button{color:var(--fg)}
.pl-tab th[aria-sort=descending] button::after{content:' ↓'}
.pl-tab th[aria-sort=ascending] button::after{content:' ↑'}
.pl-tab th:not([aria-sort]) button:hover::after{content:' ↓';opacity:.5}
.pl-tab .t{text-align:left}
.pl-tab td{padding:var(--s3) 10px;vertical-align:top;line-height:21px;font-variant-numeric:tabular-nums;
  border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent)}
.pl-tab tbody tr{position:relative}
.pl-tab td.n{width:36px;font:600 var(--t-xs)/21px var(--f-mono);color:var(--muted)}
.pl-tab td.al a{font:600 var(--t-base)/21px var(--f-mono);color:var(--fg);text-decoration:none;white-space:nowrap}
.pl-tab td.al a::after{content:'';position:absolute;inset:0}
#polos .pl-tab td.al a:focus-visible{outline:none}   /* o contorno vai na linha inteira */
.pl-tab tbody tr:focus-within{outline:2px solid var(--accent);outline-offset:-2px}
.pl-tab .al-cod{margin-left:var(--s2);font:var(--t-sm)/21px var(--f-mono);color:var(--muted);white-space:nowrap}
.pl-tab .det{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:46ch;
  font-size:var(--t-sm);line-height:1.45;color:var(--muted)}
.pl-tab td small{display:block;font-size:var(--t-xs);line-height:1.5;color:var(--muted)}
.pl-tab td b{font-weight:700}
.pl-vazio{font-size:var(--t-md);color:var(--muted)}
.pl-limw{display:flex;align-items:center;gap:var(--s2);min-height:21px}
.pl-bar{position:relative;z-index:1;display:flex;flex:none;width:96px;min-width:96px;height:6px;border-radius:3px;overflow:hidden;background:var(--sem);margin:0}
.pl-bar i{display:block;height:100%;min-width:2px}
.pl-bar i+i{box-shadow:-1px 0 0 var(--paper)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .pl-bar i+i{box-shadow:none}}
:root[data-theme="dark"] .pl-bar i+i{box-shadow:none}
.pl-pc{min-width:4ch;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.pl-np{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
@media (hover:hover) and (min-width:761px){
  .pl-tab tbody tr:hover td{background:color-mix(in srgb,var(--accent) 5%,var(--bg))}
  .pl-tab tbody tr:hover td.al a{text-decoration:underline;text-underline-offset:3px}
}
#polos .pl-nada{margin:var(--s2) 0;color:var(--muted)}
.pl-mais{border:0;background:var(--hover);border-radius:var(--rp);min-height:var(--alvo);padding:0 var(--s5);margin-top:var(--s2);
  font:600 var(--t-md) var(--f-body);color:var(--fg);justify-self:center}
.pl-mais:hover{background:color-mix(in srgb,var(--fg) 10%,transparent)}

/* notas de método: fechadas até alguém pedir */
.pl-nota summary{display:flex;align-items:center;gap:var(--s2);width:fit-content;min-height:var(--alvo);cursor:pointer;list-style:none;
  font:600 var(--t-md) var(--f-body);color:var(--fg)}
.pl-nota summary::-webkit-details-marker{display:none}
.pl-nota summary::before{content:'';width:6px;height:6px;margin:0 3px;border:solid var(--muted);border-width:0 1.5px 1.5px 0;transform:rotate(-45deg)}
.pl-nota[open] summary::before{transform:rotate(45deg) translate(-2px,-2px)}
.pl-nota-c{display:grid;gap:var(--s2);padding:var(--s1) 0 0 20px}
#polos .pl-nota p{margin:0;max-width:80ch;font-size:var(--t-sm);line-height:1.55;color:var(--muted)}
.pl-nota b{color:var(--fg);font-weight:600}
.pl-nota code{font:var(--t-xs) var(--f-mono);overflow-wrap:anywhere}

@media (prefers-reduced-motion:no-preference){
  #polos button,.pl-tab td,.pl-tab td.al a{transition:background-color var(--dur) var(--ease),color var(--dur) var(--ease),border-color var(--dur) var(--ease),box-shadow var(--dur) var(--ease),opacity var(--dur) var(--ease)}
  .pl-nota summary::before{transition:transform var(--dur) var(--ease)}
  .pl-anima .pl-tab tbody,.pl-anima .pl-kpi{animation:esmaece var(--dur) var(--ease)}
}
@media (prefers-reduced-motion:reduce){#polos *,#polos *::before,#polos *::after{transition-duration:0s!important;animation:none!important}}

@media (min-width:761px){
  #polos{gap:var(--s6)}
  .pl-cab h2{font-size:28px}
}
@media (min-width:901px) and (max-width:1000px){   /* tablet: a tabela inteira cabe na largura (sem rolagem lateral da página) */
  .pl-tab th{white-space:normal;padding:0 6px}
  .pl-tab td{padding:var(--s3) 6px}
  .pl-tab .al-cod{display:block;margin-left:0}
  .pl-bar{width:56px;min-width:56px}
}
@media (max-width:900px){
  .pl-esc{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s2);justify-items:stretch}
  .pl-topo{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
  .pl-topo button{min-height:52px;padding:var(--s1) 2px;font-size:var(--t-md);white-space:normal}
  .pl-topo small{display:block;margin:2px 0 0}
  .pl-polos{gap:6px}
  .pl-polos .pl-pil{padding:var(--s2) var(--s3)}
  .pl-kpi{gap:var(--s2) var(--s5)}
  .pl-ferr{gap:var(--s3)}
  .pl-cl{display:flex;flex:1 1 100%}
  .pl-cl button{flex:1 1 0;padding:0 var(--s1)}
  .pl-ordw{display:flex;flex:1 1 100%;gap:var(--s2);align-items:center}
  .pl-ord{flex:1;min-width:0;display:flex;align-items:center;gap:var(--s2);font-size:var(--t-sm);color:var(--muted);white-space:nowrap}
  .pl-ord select{flex:1;min-width:0;min-height:44px;padding:0 32px 0 var(--s3);border:1px solid var(--line-forte);border-radius:var(--r2);
    background:var(--paper) ${seta('5a636a')} no-repeat right 12px center/12px;color:var(--fg);font:16px var(--f-body);
    -webkit-appearance:none;appearance:none}
  .pl-inv{flex:none;width:44px;height:44px;border:1px solid var(--line-forte);border-radius:var(--r2);background:var(--paper);color:var(--fg);
    font:600 var(--t-lg)/1 var(--f-body)}
  .pl-leg{margin-left:0;flex:1 1 100%}
  .pl-tab,.pl-tab tbody,.pl-tab tr,.pl-tab td{display:block;width:100%}
  .pl-tab thead{display:none}
  .pl-tab tbody tr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s2) var(--s3);padding:var(--s3) 14px;margin-bottom:var(--s2);
    border:0;border-radius:var(--r2);background:var(--paper)}
  .pl-tab td{padding:0;border:0;text-align:left;min-width:0}
  .pl-tab td.n{display:none}
  .pl-tab td.al{grid-column:1/3;grid-row:1}
  .pl-tab td[data-r=NAE]{grid-column:3;grid-row:1;text-align:right}
  .pl-tab td[data-r=NAE] b{font:700 22px/1.1 var(--f-display);font-variant-numeric:tabular-nums}
  .pl-tab td.lim{order:9;grid-column:1/-1}
  .pl-tab td[data-r]::before{content:attr(data-r);display:block;font-size:var(--t-xs);line-height:1.5;color:var(--muted);text-transform:none;letter-spacing:0}
  .pl-tab td.al a::before{content:attr(data-pos) 'º · ';font:400 var(--t-md) var(--f-body);color:var(--muted)}
  .pl-tab td.lim::before{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%)}   /* "45% no prazo" já diz */
  .pl-tab .det{display:block;max-width:none;overflow:visible}
  .pl-bar{flex:1 1 auto;width:auto;min-width:0}
  .pl-np{position:static;width:auto;height:auto;overflow:visible;clip:auto;clip-path:none}
}
@media (max-width:900px) and (prefers-color-scheme:dark){:root:not([data-theme="light"]) .pl-ord select{background-image:${seta('9aa4ab')}}}
@media (max-width:900px){:root[data-theme="dark"] .pl-ord select{background-image:${seta('9aa4ab')}}}`;
  document.head.append(css);

  // endereço: #<polo|regional-x|eto>[/trechos][/T1|T2|T3]
  const doHash = () => { const ps = location.hash.slice(1).split('/');
    return [ESC[ps[0]], ps.includes('trechos') ? 'tr' : 'al', ps.find(x => /^T[123]$/.test(x)) || '']; };
  let [esc0, vista, classe] = doHash(), ord = 'nae', desc = true, mostra = POR_VEZ;   // vista: 'al' alimentadores, 'tr' trechos
  let sel = esc0 || ESC[P.polos[0].id];
  let notaAberta = false, anima = false;                  // "Como contamos" aberto; esmaecer a troca de escopo/aba/classe
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
    const pil = (id, nome, n) => `<button type="button" class="pl-pil" data-p="${id}" aria-pressed="${sel.id === id}">${esc(nome)} <small>${nf(n)} NAE</small></button>`;
    const th = (k, cls = '') => `<th scope="col" class="${cls}"${k === ord ? ` aria-sort="${desc ? 'descending' : 'ascending'}"` : ''}><button type="button" data-o="${k}">${k === 'km' ? rotKm : COLS[k].rot}</button></th>`;
    const vis = als.slice(0, mostra);
    // seletor: no computador, uma linha por regional (a regional e os polos dela); no celular, ETO/regionais em segmentos e os polos numa nuvem
    const seletor = cel.matches
      ? `<div class="pl-seg pl-topo">${[['eto', 'ETO', 'ETO · Tocantins'], ...regs.map(r => [regId(r), r, ''])].map(([id, rot, nome]) => {
          const n = nf(naeEsc(ESC[id]));
          return `<button type="button" data-p="${id}" aria-pressed="${sel.id === id}"${nome ? ` aria-label="${esc(nome)} · ${n} NAE"` : ''}>${esc(rot)} <small>${n} NAE</small></button>`;
        }).join('')}</div>
        <div class="pl-polos">${regs.flatMap(polosDe).map(p => pil(p.id, p.nome, totNae(p))).join('')}</div>`
      : `${pil('eto', 'ETO · Tocantins', naeEsc(ESC.eto))}<span aria-hidden="true"></span>${regs.map(r =>
          pil(regId(r), r, naeEsc(ESC[regId(r)])) + `<div class="pl-polos">${polosDe(r).map(p => pil(p.id, p.nome, totNae(p))).join('')}</div>`).join('')}`;
    const sup = varios ? esc(sel.polos.map(p => p.nome).join(', ')) : `Regional ${esc(polo.regional)} · equipe ${esc(polo.equipe)}`;
    const kpi = [[nf(nae), 'NAE árvore/eucalipto'], [nf(sel.als.length), 'alimentadores'], [nf(nTr), 'trechos com NAE'], [km(kmPolo), 'km de rede'],
      [nf(nMuns), 'municípios'], ...(varios ? [[nf(sel.polos.length), 'polos']] : [])];
    alvo.innerHTML = `<div class="pl-esc" role="group" aria-label="Escolher a visão">${seletor}</div>
      <div class="pl-cab"><p class="pl-sup">${sup}${periodo ? ' · ' + periodo : ''}</p><h2>${esc(sel.nome)}</h2>
        <dl class="pl-kpi">${kpi.map(([v, r]) => `<div><dt>${r}</dt><dd>${v}</dd></div>`).join('')}</dl></div>
      <div class="pl-lista">
      <div class="pl-vis" role="group" aria-label="Ver ranking de"><button type="button" data-v="al" aria-pressed="${!tr}">Alimentadores</button><button type="button" data-v="tr" aria-pressed="${tr}">Trechos</button></div>
      <div class="pl-ferr">${tr ? `<div class="pl-seg pl-cl" role="group" aria-label="Classe do trecho"><button type="button" data-c="" aria-pressed="${!classe}">Todos <small>${nf(nTr)}</small></button>${
          ['T1', 'T2', 'T3'].map(c => `<button type="button" data-c="${c}" aria-pressed="${classe === c}">${c} <small>${nf(nCl(c))}</small></button>`).join('')}</div>` : ''}
        <div class="pl-ordw"><label class="pl-ord">Ordenar por <select id="pl-ord">${Object.keys(COLS).map(k =>
          `<option value="${k}"${k === ord ? ' selected' : ''}>${k === 'km' ? rotKm : COLS[k].rot}</option>`).join('')}</select></label><button type="button" class="pl-inv" data-inv="1" aria-label="Inverter ordem">${desc ? '↓' : '↑'}</button></div>
        <div class="pl-leg" role="group" aria-label="Cores da limpeza"><span class="pl-leg-t">Limpeza:</span>${Object.entries(SIT).map(([k, [n, c]]) =>
          `<span><i${k === 'sem' ? ' class="vz"' : ` style="background:${c}"`}></i>${n}</span>`).join('')}</div></div>
      <table class="pl-tab">
        <thead><tr><th scope="col" class="t"><span>#</span></th><th scope="col" class="t"><span>${tr ? 'Trecho' : 'Alimentador'}</span></th>${th('nae')}${th('cons')}${th('chi')}${th('km')}${th('n100')}${th('prazo', 't')}${th('ult')}</tr></thead>
        <tbody>${vis.map((a, i) => {
          const L = a.limp, muns = tr ? [P.muns[a.mun] || a.mun].filter(Boolean) : a.muns.map(c => P.muns[c] || c);
          const q = [tr ? 't=' + encodeURIComponent(a.t) : '', a.m ? 'm=' + encodeURIComponent(a.m) : ''].filter(Boolean).join('&');
          const href = `../alimentadores/${encodeURIComponent(a.al)}/${q ? '?' + q : ''}`;
          const det = esc(a.se + (varios ? ' · ' + (tr ? a.polo : a.polos.join(' + ')) : '')
            + (muns.length ? ' · ' + muns.slice(0, 4).join(', ') + (muns.length > 4 ? ` e mais ${muns.length - 4}` : '') : ''));
          return `<tr><td class="n">${i + 1}º</td>
            <td class="al t"><a href="${href}" data-pos="${i + 1}">${esc(tr ? a.t : a.al)}</a>${tr ? `<span class="al-cod">${esc(a.al)}</span>` : ''}<span class="det" title="${det}">${det}</span></td>
            <td data-r="NAE"><b>${nf(a.nae)}</b>${a.sem ? `<small>${nf(a.sem)} sem trecho</small>` : ''}</td>
            <td data-r="Consumidores">${nf(a.cons)}</td>
            <td data-r="CHI (h)">${nf(a.chi)}</td>
            <td data-r="${rotKm}">${km(a.km)}${a.km_total > a.km + 50 ? `<small>de ${km(a.km_total)} km</small>` : ''}</td>
            <td data-r="NAE / 100 km">${nf(a.n100, 1)}</td>
            <td class="t lim" data-r="Limpeza no prazo">${L.tot ? `<div class="pl-limw"><span class="pl-bar" title="${Object.entries(SIT).map(([k, [n]]) => `${n}: ${km(L.s[k])} km`).join(' · ')}">${
              Object.entries(SIT).map(([k, [, c]]) => L.s[k] ? `<i style="width:${100 * L.s[k] / L.tot}%;background:${c}"></i>` : '').join('')}</span><span class="pl-pc">${nf(100 * L.prazo)}%<span class="pl-np"> no prazo</span></span></div>`
              : '<span class="pl-vazio">sem dados de limpeza</span>'}</td>
            <td data-r="Última limpeza">${L.ult ? br(L.ult) : '<span class="pl-vazio">sem registro</span>'}</td></tr>`;
        }).join('')}</tbody></table>
      ${!als.length ? '<p class="pl-nada">Nenhum trecho dessa classe com NAE no período.</p>' : ''}
      ${als.length > mostra ? `<button type="button" class="pl-mais" data-m="1">Mostrar mais ${nf(Math.min(POR_VEZ, als.length - mostra))} (de ${nf(als.length - mostra)} restantes)</button>` : ''}
      </div>
      <details class="pl-nota"${notaAberta ? ' open' : ''}><summary>Como contamos</summary><div class="pl-nota-c">
        <p><b>Como conta:</b> alimentador que passa por mais de um polo aparece em cada um, com a rede e a NAE dos trechos que estão no polo (o trecho conta no município onde tem mais rede). NAE sem trecho localizado conta no polo onde o alimentador tem mais rede.${varios ? ' Na regional e na ETO, o alimentador aparece uma vez só, somando os polos.' : ''}</p>
        ${tr ? '<p><b>Trechos:</b> só os que tiveram NAE no período; o trecho conta no polo do município onde tem mais rede. A NAE do trecho soma todos os ativos dele (chaves e transformadores), inclusive NAE registrada em outro alimentador cujo ativo hoje está no trecho. Tocar no trecho abre o mapa com ele selecionado.</p>' : ''}
        <p><b>Limpeza:</b> só OS executadas${P.equipes ? ' pelas equipes ' + esc(P.equipes.join(', ')) : ''}, pela data de execução; T1 a cada ${P.regra.T1} anos, T2 a cada ${P.regra.T2}, T3 a cada ${P.regra.T3}, contando da última limpeza de cada vão (situação de hoje).</p>
        <p>Polo de cada município: <code>${esc(P.fonte)}</code>.${P.fora.length ? ' ' + esc(P.fora.join('; ')) + '.' : ''}</p></div></details>`;
    alvo.classList.toggle('pl-anima', anima);
    anima = false;
  }
  alvo.addEventListener('click', e => {
    const b = e.target.closest('[data-p],[data-o],[data-v],[data-c],[data-m],[data-inv]');
    if (!b || b.tagName === 'A') return;
    const y = b.getBoundingClientRect().top;
    if (b.dataset.m) mostra += POR_VEZ;
    else if (b.dataset.p) { sel = ESC[b.dataset.p]; mostra = POR_VEZ; anima = true; poeHash(); }
    else if (b.dataset.v) { vista = b.dataset.v; mostra = POR_VEZ; anima = true; poeHash(); }
    else if (b.dataset.inv) desc = !desc;
    else if (b.dataset.c !== undefined) { classe = b.dataset.c; ord = 'nae'; desc = true; mostra = POR_VEZ; anima = true; poeHash(); }   // classe: maior NAE primeiro
    else if (b.dataset.o === ord) desc = !desc;
    else { ord = b.dataset.o; desc = true; }
    desenha();
    const f = b.dataset.m ? alvo.querySelector(`.pl-tab tbody tr:nth-child(${mostra - POR_VEZ + 1}) a`)
      : alvo.querySelector(b.dataset.inv ? '[data-inv]' : b.dataset.o ? `[data-o="${ord}"]` : b.dataset.p ? `[data-p="${sel.id}"]` : b.dataset.v ? `[data-v="${vista}"]` : `[data-c="${classe}"]`);
    if (f) { f.focus({ preventScroll: true }); if (!b.dataset.m) window.scrollBy(0, f.getBoundingClientRect().top - y); }   // a tela não pula
  });
  alvo.addEventListener('change', e => {                  // ordenar pelo select (celular)
    if (e.target.id !== 'pl-ord') return;
    const y = e.target.getBoundingClientRect().top;
    ord = e.target.value; desc = true; desenha();
    const f = alvo.querySelector('#pl-ord');
    if (f) { f.focus({ preventScroll: true }); window.scrollBy(0, f.getBoundingClientRect().top - y); }
  });
  alvo.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('pl-nota')) notaAberta = e.target.open; }, true);   // 'toggle' não sobe
  const muda = () => desenha();
  if (cel.addEventListener) cel.addEventListener('change', muda); else cel.addListener(muda);
  addEventListener('hashchange', () => { const [p, v, c] = doHash(); if (p) { sel = p; vista = v; classe = c; mostra = POR_VEZ; anima = true; desenha(); } });
  desenha();
})();
