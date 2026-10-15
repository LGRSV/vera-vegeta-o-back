// Mapa em tela cheia (roda depois de alimentador.js, com window.__map).
// Usa a tela cheia do navegador quando existe; no iPhone (sem essa função) o mapa ocupa a janela por CSS.
// Em tela cheia, o painel lateral (limpeza, busca, detalhe) vira uma gaveta à direita: no PC (≥ 1000 px) já entra aberto
// (menos no modo Limpeza de faixa, .mapbox.fx-modo) e o mapa fica só na parte livre, à esquerda dela (enquadrar um trecho,
// centrar e os balões contam com isso); no celular e no tablet fica fechado e, aberto, passa por cima do mapa. Fechado
// (✕ ou Esc), uma aba na borda direita do mapa abre de novo. window.__gaveta(true/false) abre e fecha (o modo Limpeza
// de faixa usa). A barra de busca e município (acima do mapa, de extras.js) entra no alto da gaveta e volta para cima do
// mapa ao sair.
// O botão "Tela cheia" fica num card no canto inferior direito do mapa (o card .ctl-card de extras.js); o chip da OS em
// foco anda para não ficar embaixo dele (--tc-w: largura do card).
// Sem extras.js (sem o card), volta ao ícone no canto esquerdo.
(function () {
  const map = window.__map;
  const box = document.querySelector('.mapbox');
  const painel = document.querySelector('.panel');
  if (!map || !window.L || !box) return;

  const css = document.createElement('style');
  css.textContent = `
.tc-ctl{display:flex;flex-direction:column;gap:var(--s2)}
.tc-ctl button{width:40px;height:40px;display:grid;place-items:center;padding:0;border:1px solid var(--vidro-borda);border-radius:var(--r2);background:var(--vidro);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:var(--vidro-fg);cursor:pointer;box-shadow:var(--sh-vidro)}
.tc-ctl button:hover{background:#262d33}
.tc-ctl button:focus-visible{outline:2px solid var(--foco-mapa);outline-offset:2px}
.tc-ctl svg{width:20px;height:20px;pointer-events:none}   /* o clique é sempre do botão */
.ctl-card .tc-btn svg{width:20px;height:20px;flex:none;pointer-events:none}
.tc-canto .tc-btn{width:40px;padding:0;justify-content:center}   /* só o ícone (o nome fica no title e no aria-label) */
.tc-btn .sai,.tc-btn[aria-pressed="true"] .abre{display:none}
.tc-btn[aria-pressed="true"] .sai{display:block}
body.tela-cheia{overflow:hidden}
body.tela-cheia .mapbox{position:fixed;inset:0;z-index:1000;border-radius:0;border:0;box-shadow:none}
body.tela-cheia #map{height:100vh;height:100dvh;min-height:0}
/* gaveta: o painel desliza da direita sobre o mapa e rola por dentro */
body.tela-cheia .panel{position:fixed;top:0;right:0;bottom:0;z-index:1100;width:min(420px,92vw);max-height:none;overflow-y:auto;overscroll-behavior:contain;align-content:start;
  background:var(--paper);padding:var(--s4);border-radius:var(--r3) 0 0 var(--r3);box-shadow:-12px 0 32px rgb(0 0 0/.35);transform:translateX(100%);visibility:hidden}
@media (prefers-reduced-motion:no-preference){body.tela-cheia.tc-anima .panel{transition:transform var(--dur-l) var(--ease),visibility 0s var(--dur-l)}}
body.tela-cheia.tc-gaveta .panel{transform:none;visibility:visible;transition-delay:0s}
body.tela-cheia .grp{background:var(--paper)}
@media (min-width:701px) and (max-width:999px){body.tela-cheia.tc-gaveta .tc-canto{right:calc(min(420px,92vw) + 12px)}}   /* a gaveta por cima não cobre o card */
/* PC: com a gaveta aberta o mapa termina onde ela começa (o que estava embaixo dela continua no mesmo lugar) */
@media (min-width:1000px){body.tela-cheia.tc-encolhe .mapbox{right:min(420px,92vw)}}
/* canto inferior direito, acima do crédito do mapa; o chip da OS em foco fica à esquerda dele */
.tc-canto{position:absolute;right:12px;bottom:28px;z-index:810}
.mapbox .limp-chip{right:calc(20px + var(--tc-w,0px))}
@media (min-width:701px) and (max-width:999px){body.tela-cheia.tc-gaveta .mapbox .limp-chip{right:calc(min(420px,92vw) + 20px + var(--tc-w,0px))}}
@media (min-width:1000px){body.tela-cheia.tc-gaveta .mapbox .limp-chip{right:calc(20px + var(--tc-w,0px))}}   /* o mapa já acaba antes da gaveta */
/* aba do painel: só na tela cheia com a gaveta fechada, colada na borda direita, no meio da altura (longe do card Tela cheia,
   do chip da OS e do crédito, no pé, e do aviso do modo Limpeza de faixa, no alto). Ao abrir, a gaveta passa por cima e ela some */
.tc-aba{display:none}
body.tela-cheia .tc-aba{position:absolute;right:0;top:50%;z-index:810;transform:translateY(-50%);display:grid;place-items:center;width:44px;height:64px;padding:0;
  border:1px solid var(--vidro-borda);border-right:0;border-radius:var(--r2) 0 0 var(--r2);background:var(--vidro);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  color:var(--vidro-fg);cursor:pointer;box-shadow:var(--sh-vidro)}
body.tela-cheia.tc-gaveta .tc-aba{visibility:hidden}
body.tela-cheia .tc-aba:hover{background:#262d33}
.tc-aba:focus-visible{outline:2px solid var(--foco-mapa);outline-offset:-4px}
.tc-aba svg{width:22px;height:22px;pointer-events:none}
@media (prefers-reduced-motion:no-preference){body.tela-cheia.tc-anima.tc-gaveta .tc-aba{transition:visibility 0s var(--dur-l)}}
.tc-fecha-gaveta{display:none;position:sticky;top:0;z-index:2;justify-self:end;width:40px;height:40px;place-items:center;padding:0;border:0;border-radius:var(--r2);
  background:var(--paper);color:var(--fg);font:400 var(--t-lg)/1 var(--f-body);cursor:pointer}
.tc-fecha-gaveta:hover{background:color-mix(in srgb,var(--fg) 6%,var(--paper))}
body.tela-cheia .tc-fecha-gaveta{display:grid}
/* na gaveta, a barra de busca fica em pé: busca e, embaixo, o município */
body.tela-cheia .panel .barra-linha{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s2)}
@media (min-width:457px){   /* gaveta de 420 px: o ✕ fica na mesma linha da busca */
  body.tela-cheia .panel{grid-template-columns:minmax(0,1fr) auto;column-gap:var(--s2)}
  body.tela-cheia .panel>*{grid-column:1/-1}
  body.tela-cheia .panel>:is(.busca,.barra-busca){grid-column:1;grid-row:1}
  body.tela-cheia .panel>.tc-fecha-gaveta{grid-column:2;grid-row:1}
}
@media (prefers-reduced-motion:no-preference){.tc-ctl button,.tc-fecha-gaveta,.tc-aba{transition:background-color var(--dur) var(--ease),color var(--dur) var(--ease),box-shadow var(--dur) var(--ease)}}`;
  document.head.append(css);

  // os dois ícones ficam no botão e o CSS mostra um ou outro (aria-pressed): trocar o HTML durante o clique soltava o alvo do clique,
  // e o Leaflet tomava isso por um clique no mapa, que desfazia o trecho escolhido
  const ICON_ABRE = '<svg class="abre" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const ICON_SAI = '<svg class="sai" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

  const canto = window.__ctlMapa && window.__ctlMapa() ? document.createElement('div') : null;   // canto inferior direito
  const BTN_TC = `<button type="button" class="tc-btn" aria-pressed="false" title="Tela cheia" aria-label="Mapa em tela cheia">${ICON_ABRE}${ICON_SAI}</button>`;
  const Ctl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const d = L.DomUtil.create('div', 'tc-ctl');
      d.innerHTML = BTN_TC;
      L.DomEvent.disableClickPropagation(d);
      L.DomEvent.on(d, 'click', L.DomEvent.stopPropagation);   // clique nos botões não chega ao mapa (que limparia a seleção)
      return d;
    },
  });
  const ctl = canto ? null : new Ctl().addTo(map);   // sem o card (sem extras.js): o botão no canto esquerdo
  if (canto) {                                            // card "Tela cheia"
    canto.className = 'tc-canto ctl-card';
    canto.innerHTML = BTN_TC;
    box.append(canto);
    L.DomEvent.disableClickPropagation(canto);
    canto.addEventListener('click', e => e.stopPropagation());   // clique no card não chega ao mapa (que limparia a seleção)
    const larg = () => box.style.setProperty('--tc-w', canto.offsetWidth + 'px');
    if (window.ResizeObserver) new ResizeObserver(larg).observe(canto);
    larg();
  }
  const btn = (canto || ctl.getContainer()).querySelector('.tc-btn');
  btn.addEventListener('click', alterna);
  // aba na borda direita do mapa: abre a gaveta (só aparece em tela cheia, com ela fechada)
  const aba = document.createElement('button');
  aba.type = 'button';
  aba.className = 'tc-aba';
  aba.title = 'Abrir painel (resumo, lista dos trechos e detalhe)';
  aba.setAttribute('aria-label', 'Abrir painel');
  aba.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16M10.5 9.5 8 12l2.5 2.5"/></svg>';
  box.append(aba);
  L.DomEvent.disableClickPropagation(aba);
  aba.addEventListener('click', e => { e.stopPropagation(); gaveta(true, true); });   // clique na aba não chega ao mapa

  const fecha = document.createElement('button');
  fecha.type = 'button';
  fecha.className = 'tc-fecha-gaveta';
  fecha.textContent = '✕';
  fecha.title = 'Fechar painel';
  fecha.setAttribute('aria-label', 'Fechar painel');
  fecha.addEventListener('click', () => gaveta(false, true));
  painel.prepend(fecha);
  const barra = document.querySelector('.barra-busca'), stage = document.querySelector('.stage');
  // a barra de busca vai para a gaveta (logo depois do ✕) e volta para cima do mapa; quem digitava continua no campo
  function moveBarra(ligado) {
    if (!barra || !stage) return;
    const f = barra.contains(document.activeElement) ? document.activeElement : null;
    if (ligado) fecha.after(barra); else stage.before(barra);
    if (f) f.focus({ preventScroll: true });
  }

  const nativo = () => document.fullscreenElement || document.webkitFullscreenElement;
  let centro = null, yAntes = 0, voltar = null;
  const volta = () => { if (voltar !== null) window.scrollTo(0, voltar); };
  // PC (≥ 1000 px): a gaveta abre sozinha e o mapa encolhe para a parte livre, depois que ela desliza (antes, ficaria um
  // vão sem mapa atrás dela); ao fechar, o mapa volta logo (fica por baixo dela enquanto ela sai). pan: false = o que se vê não anda
  const PC = () => window.innerWidth >= 1000;
  let tEnc = 0;
  function encolhe(sim) {
    clearTimeout(tEnc);
    if (document.body.classList.contains('tc-encolhe') === sim) return;
    document.body.classList.toggle('tc-encolhe', sim);
    map.invalidateSize({ pan: false });
  }
  function aplica(ligado) {
    if (document.body.classList.contains('tela-cheia') === ligado) return;
    centro = [map.getCenter(), map.getZoom()];           // com a gaveta aberta no PC o mapa já é só a parte livre
    if (ligado) yAntes = window.scrollY;               // em tela cheia a página encolhe e a rolagem vai a 0: ao sair, volta ao mesmo lugar
    if (!ligado) document.body.classList.remove('tc-anima');
    document.body.classList.toggle('tela-cheia', ligado);
    moveBarra(ligado);
    if (!ligado) {
      if (document.activeElement === aba || document.activeElement === fecha) btn.focus({ preventScroll: true });   // a aba e o ✕ somem: o foco fica no botão Tela cheia
      gaveta(false); voltar = yAntes; volta();
    }
    else {
      // PC: o painel já vem aberto (sem deslizar); no celular, no tablet e no modo Limpeza de faixa, fechado (a aba abre)
      if (PC() && !box.classList.contains('fx-modo')) gaveta(true);
      // a gaveta só anima depois de já estar no lugar (sem isso, ela passaria deslizando ao entrar na tela cheia)
      void painel.offsetWidth; document.body.classList.add('tc-anima');
    }
    btn.title = ligado ? 'Sair da tela cheia (Esc)' : 'Tela cheia';
    btn.setAttribute('aria-pressed', ligado);
    btn.setAttribute('aria-label', ligado ? 'Sair da tela cheia' : 'Mapa em tela cheia');
    requestAnimationFrame(() => {
      map.invalidateSize(); map.setView(centro[0], centro[1], { animate: false });   // entrou com a gaveta aberta: no meio da parte livre
      if (!ligado) volta();
    });
  }
  // pedidos de tela cheia do navegador ainda sem resposta: uma saída que chega atrasada (sair e entrar logo em seguida,
  // como o modo Limpeza de faixa faz) não desfaz a entrada nova
  let pede = 0;
  const fimPede = () => { pede = Math.max(0, pede - 1); };
  function alterna() {
    const ligar = !document.body.classList.contains('tela-cheia');
    const el = document.documentElement;
    if (ligar) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { try { const p = req.call(el); if (p && p.then) { pede++; p.then(fimPede, fimPede); } } catch (e) { /* sem tela cheia nativa: fica só o CSS */ } }
      aplica(true);
    } else {
      if (nativo()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      aplica(false);
    }
  }
  function gaveta(abrir, foco) {
    const tc = document.body.classList.contains('tela-cheia'), dentro = painel.contains(document.activeElement);
    abrir = abrir && tc;                                   // fora da tela cheia o painel já fica à vista
    document.body.classList.toggle('tc-gaveta', abrir);
    if (!abrir) encolhe(false);
    else if (PC()) { const d = parseFloat(getComputedStyle(painel).transitionDuration) * 1000 || 0; if (d) { clearTimeout(tEnc); tEnc = setTimeout(() => encolhe(document.body.classList.contains('tc-gaveta')), d + 30); } else encolhe(true); }
    if (abrir) painel.scrollTop = 0;
    // teclado: o foco vai para dentro (o ✕; também se estava na aba, que some); ao fechar com o foco lá dentro (ou pelo ✕),
    // vai para a aba, e não fica perdido
    if (abrir ? foco || document.activeElement === aba : tc && (foco || dentro)) (abrir ? fecha : aba).focus({ preventScroll: true });
  }
  // saiu da tela cheia nativa pelo Esc / gesto do sistema: volta o layout
  // (a saída da tela cheia nativa chega depois e muda o tamanho da janela: devolve a rolagem de novo)
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
    if (nativo() || pede) return;
    aplica(false); volta(); voltar = null;
  }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !document.body.classList.contains('tela-cheia')) return;
    if (document.body.classList.contains('tc-gaveta')) gaveta(false, painel.contains(document.activeElement)); else if (!nativo()) aplica(false);
  });
  // tocar numa OS ou trecho dentro da gaveta no celular: fecha a gaveta para mostrar o mapa
  painel.addEventListener('click', e => {
    if (!document.body.classList.contains('tc-gaveta') || window.innerWidth > 700) return;
    if (e.target.closest('.limp-os-b, .insp-os-b, .row, .chip[data-t], .ir, .ativo-hit button')) setTimeout(() => gaveta(false), 50);
  });
  window.__telaCheia = alterna;
  window.__gaveta = abrir => gaveta(!!abrir);             // modo Limpeza de faixa: fecha ao começar e devolve ao sair
})();
