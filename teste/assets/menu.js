// Menu do site: botão de três barras no canto superior esquerdo de todas as páginas, com os scripts para baixar e,
// no site publicado no GitHub Pages, "Atualizar bases": cada base abre a página de envio do GitHub na pasta dela
// (bases/critica, bases/limpeza, bases/inspecao, bases/manutencao, bases/executadas); a automação
// .github/workflows/atualiza-bases.yml processa e publica.
// O que o site tem de cada base vem de dados/bases.json (scripts/atualiza_bases.py).
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
  // repositório do site: <dono>.github.io/<repo>/ (fora do GitHub Pages, sem "Atualizar bases")
  const gh = window.__repoSite || (location.hostname.endsWith('.github.io') && location.pathname.split('/')[1]
    ? { dono: location.hostname.split('.')[0], repo: location.pathname.split('/')[1], ramo: 'gh-pages' } : null);
  const BASES = [
    { tipo: 'critica', nome: 'Crítica (NAE)', arq: 'Critica-…_MM-AAAA.txt (ou .zip): troca o mês do arquivo' },
    { tipo: 'limpeza', nome: 'OS de limpeza de faixa', arq: 'planilha de OS (.xlsx, aba Dados), com todas as OS' },
    { tipo: 'inspecao', nome: 'Base de inspeção', arq: 'base de inspeção (.xlsx, aba Dados); entram só as executadas' },
    { tipo: 'manutencao', nome: 'OS de manutenção da inspeção', arq: 'OS geradas pela inspeção (.xlsx); as canceladas ficam de fora' },
    { tipo: 'executadas', nome: 'OS de manutenção executadas', arq: 'OS_STATUS_Executadas (.zip com o .txt); entram as corretivas e preventivas' },
  ];
  const svg = (d, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICONE = {
    barras: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    script: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m10 12.5-2 2 2 2"/><path d="m14 12.5 2 2-2 2"/>',
    baixar: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    enviar: '<path d="M12 16V5"/><path d="m7 10 5-5 5 5"/><path d="M5 20h14"/>',
    fora: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v5H5V6h5"/>',
    andamento: '<path d="M3 12h4l3 7 4-14 3 7h4"/>',
  };
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mes = m => m ? MESES[+m.slice(5, 7) - 1] + '/' + m.slice(0, 4) : '';
  const br = d => d ? d.slice(0, 10).split('-').reverse().join('/') : '';
  const nf = n => Number(n).toLocaleString('pt-BR');
  // o que o site tem agora de cada base (dados/bases.json)
  const situacao = (t, b) => {
    if (!b) return '';
    const env = b.enviado ? ` · último envio ${br(b.enviado)}` : '';
    if (t === 'critica') return b.meses ? `No site: ${mes(b.meses[0])} a ${mes(b.meses[1])}${env}` : '';
    if (t === 'limpeza') return b.os != null ? `No site: ${nf(b.os)} OS · processada ${br(b.processado)}${env}` : '';
    if (t === 'manutencao') return b.os != null ? `No site: ${nf(b.os)} OS${b.ate ? ' criadas até ' + br(b.ate) : ''}${env}` : '';
    if (t === 'executadas') return b.os != null ? `No site: ${nf(b.os)} OS${b.ate ? ' executadas até ' + br(b.ate) : ''}${env}` : '';
    return b.os != null ? `No site: ${nf(b.os)} inspeções${b.ate ? ' até ' + br(b.ate) : ''}${env}` : '';
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
    '.mnu-lista small{grid-column:2;font:var(--t-xs,12px)/1.4 var(--f-body,system-ui);color:var(--muted,#5a636a)}' +
    '.mnu-lista small.mnu-st{color:var(--fg,#1b2024)}.mnu-lista small.mnu-st:empty{display:none}' +
    '.mnu-lista a[data-b]{grid-template-rows:auto auto auto}' +
    '.mnu-sep{height:1px;margin:6px 4px;background:var(--line,#dfe2de)}' +
    '.mnu-nota{padding:2px 10px 8px;font:var(--t-xs,12px)/1.4 var(--f-body,system-ui);color:var(--muted,#5a636a)}';
  document.head.append(css);
  const box = document.createElement('nav');
  box.className = 'mnu';
  box.setAttribute('aria-label', 'Menu');
  box.innerHTML = `<button type="button" class="mnu-btn" aria-expanded="false" aria-controls="mnu-lista" aria-label="Menu">${svg(ICONE.barras, '')}</button>` +
    `<ul class="mnu-lista" id="mnu-lista" hidden><li class="mnu-tit" aria-hidden="true">Scripts</li>` +
    ITENS.map(i => `<li><a href="${raiz}${i.href}" download>${svg(ICONE[i.icone], 'mnu-ic')}<b>${i.nome}</b>` +
      `<small>${i.desc}</small>${svg(ICONE.baixar, 'mnu-dl')}</a></li>`).join('') +
    (gh ? `<li class="mnu-sep" aria-hidden="true"></li><li class="mnu-tit" aria-hidden="true">Atualizar bases</li>` +
      BASES.map(b => `<li><a data-b="${b.tipo}" href="https://github.com/${esc(gh.dono)}/${esc(gh.repo)}/upload/${esc(gh.ramo)}/bases/${b.tipo}" ` +
        `target="_blank" rel="noopener" title="Enviar o arquivo novo pelo GitHub (abre em outra aba)">${svg(ICONE.enviar, 'mnu-ic')}<b>${b.nome}</b>` +
        `<small>${esc(b.arq)}</small><small class="mnu-st"></small>${svg(ICONE.fora, 'mnu-dl')}</a></li>`).join('') +
      `<li><a href="https://github.com/${esc(gh.dono)}/${esc(gh.repo)}/actions" target="_blank" rel="noopener">${svg(ICONE.andamento, 'mnu-ic')}` +
        `<b>Acompanhar a atualização</b><small>O site se atualiza sozinho uns 5 minutos depois do envio</small>${svg(ICONE.fora, 'mnu-dl')}</a></li>` +
      `<li class="mnu-nota">Para enviar, entre no GitHub com a conta que tem acesso ao repositório. O arquivo enviado fica público no repositório.</li>` : '') +
    '</ul>';
  wrap.prepend(box);
  const btn = box.querySelector('.mnu-btn'), lista = box.querySelector('.mnu-lista');
  let bases = null;
  const poeBases = () => {
    if (!gh || bases) return;
    bases = fetch(raiz + 'dados/bases.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
      .then(est => lista.querySelectorAll('a[data-b]').forEach(a => { a.querySelector('.mnu-st').textContent = situacao(a.dataset.b, est[a.dataset.b]); }));
  };
  const abre = sim => {
    lista.hidden = !sim;
    btn.setAttribute('aria-expanded', String(sim));
    if (sim) { poeBases(); lista.querySelector('a').focus(); }
  };
  btn.addEventListener('click', () => abre(lista.hidden));
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !lista.hidden) { e.preventDefault(); abre(false); btn.focus(); }
  });
  lista.addEventListener('click', e => { if (e.target.closest('a')) abre(false); });
  document.addEventListener('pointerdown', e => { if (!lista.hidden && !box.contains(e.target)) abre(false); });
})();
