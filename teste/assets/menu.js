// Menu do site: botão de três barras no canto superior esquerdo de todas as páginas, com os scripts para baixar.
// O caminho dos arquivos sai do endereço deste script (assets/menu.js), então funciona em qualquer nível de página.
(function () {
  const eu = document.currentScript && document.currentScript.src;
  const wrap = document.querySelector('.wrap');
  if (!eu || !wrap) return;
  const raiz = eu.replace(/assets\/menu\.js(\?.*)?$/, '');
  const ITENS = [
    { nome: 'Trechos a partir do KML', desc: 'Script Python: KML do alimentador → T1, T2, T3, mapa e KMZ (.zip)',
      href: 'assets/scripts/trechos-kml.zip', icone: 'script' },
  ];
  const svg = (d, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICONE = {
    barras: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    script: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m10 12.5-2 2 2 2"/><path d="m14 12.5 2 2-2 2"/>',
    baixar: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  };
  const css = document.createElement('style');
  css.textContent =
    '.mnu{position:relative;display:flex;align-items:center;min-height:40px;margin-bottom:calc(var(--s2,8px) * -1)}' +
    '.mnu-btn{width:40px;height:40px;display:grid;place-items:center;padding:0;border:1px solid var(--line-forte,#c4c9c4);' +
    'border-radius:var(--r2,10px);background:var(--paper,#fbfbf9);color:var(--fg,#1b2024);cursor:pointer}' +
    '.mnu-btn:hover,.mnu-btn[aria-expanded="true"]{border-color:var(--accent,#c2410c)}' +
    '.mnu-btn:focus-visible{outline:2px solid var(--accent,#c2410c);outline-offset:2px}' +
    '.mnu svg{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round}' +
    '.mnu-btn svg{width:20px;height:20px;stroke-width:1.8}' +
    '.mnu-lista{position:absolute;top:calc(100% + 6px);left:0;z-index:2000;width:min(360px,calc(100vw - 32px));margin:0;' +
    'padding:6px;list-style:none;background:var(--paper,#fbfbf9);border:1px solid var(--line,#dfe2de);' +
    'border-radius:var(--r2,10px);box-shadow:var(--sh2,0 12px 32px -12px rgb(0 0 0 / .28))}' +
    '.mnu-lista[hidden]{display:none}' +
    '.mnu-tit{padding:6px 10px 4px;font:600 var(--t-xs,11px)/1.3 var(--f-body,system-ui);letter-spacing:.06em;' +
    'text-transform:uppercase;color:var(--muted,#5a636a)}' +
    '.mnu-lista a{display:grid;grid-template-columns:24px minmax(0,1fr) 18px;column-gap:12px;row-gap:2px;align-items:center;' +
    'padding:10px;border-radius:calc(var(--r2,10px) - 2px);color:var(--fg,#1b2024);text-decoration:none}' +
    '.mnu-lista a:hover,.mnu-lista a:focus-visible{background:var(--hover,rgb(0 0 0 / .05));outline:none}' +
    '.mnu-lista a:focus-visible{box-shadow:inset 0 0 0 2px var(--accent,#c2410c)}' +
    '.mnu-ic{grid-row:1/3;width:24px;height:24px;stroke-width:1.5;color:var(--accent,#c2410c)}' +
    '.mnu-dl{grid-column:3;grid-row:1/3;width:18px;height:18px;stroke-width:1.6;color:var(--muted,#5a636a)}' +
    '.mnu-lista b{font:600 var(--t-base,15px)/1.3 var(--f-body,system-ui)}' +
    '.mnu-lista small{grid-column:2;font:var(--t-xs,12px)/1.4 var(--f-body,system-ui);color:var(--muted,#5a636a)}';
  document.head.append(css);
  const box = document.createElement('nav');
  box.className = 'mnu';
  box.setAttribute('aria-label', 'Menu');
  box.innerHTML = `<button type="button" class="mnu-btn" aria-expanded="false" aria-controls="mnu-lista" aria-label="Menu">${svg(ICONE.barras, '')}</button>` +
    `<ul class="mnu-lista" id="mnu-lista" hidden><li class="mnu-tit" aria-hidden="true">Scripts</li>` +
    ITENS.map(i => `<li><a href="${raiz}${i.href}" download>${svg(ICONE[i.icone], 'mnu-ic')}<b>${i.nome}</b>` +
      `<small>${i.desc}</small>${svg(ICONE.baixar, 'mnu-dl')}</a></li>`).join('') + '</ul>';
  wrap.prepend(box);
  const btn = box.querySelector('.mnu-btn'), lista = box.querySelector('.mnu-lista');
  const abre = sim => {
    lista.hidden = !sim;
    btn.setAttribute('aria-expanded', String(sim));
    if (sim) lista.querySelector('a').focus();
  };
  btn.addEventListener('click', () => abre(lista.hidden));
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !lista.hidden) { e.preventDefault(); abre(false); btn.focus(); }
  });
  lista.addEventListener('click', e => { if (e.target.closest('a')) abre(false); });
  document.addEventListener('pointerdown', e => { if (!lista.hidden && !box.contains(e.target)) abre(false); });
})();
