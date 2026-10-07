// Mapa em tela cheia (roda depois de alimentador.js, com window.__map).
// Usa a tela cheia do navegador quando existe; no iPhone (sem essa função) o mapa ocupa a janela por CSS.
// Em tela cheia, o botão "Painel" abre o painel lateral (limpeza, busca, detalhe) como gaveta sobre o mapa.
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
.tc-btn .sai,.tc-btn[aria-pressed="true"] .abre{display:none}
.tc-btn[aria-pressed="true"] .sai{display:block}
.tc-ctl .tc-painel{width:auto;padding:0 var(--s3);font:600 var(--t-sm) var(--f-body);gap:6px;display:none}
body.tela-cheia{overflow:hidden}
body.tela-cheia .mapbox{position:fixed;inset:0;z-index:1000;border-radius:0;border:0;box-shadow:none}
body.tela-cheia #map{height:100vh;height:100dvh;min-height:0}
body.tela-cheia .tc-ctl .tc-painel{display:flex;align-items:center}
/* gaveta: o painel desliza da direita sobre o mapa e rola por dentro */
body.tela-cheia .panel{position:fixed;top:0;right:0;bottom:0;z-index:1100;width:min(420px,92vw);max-height:none;overflow-y:auto;overscroll-behavior:contain;align-content:start;
  background:var(--paper);padding:var(--s4);border-radius:var(--r3) 0 0 var(--r3);box-shadow:-12px 0 32px rgb(0 0 0/.35);transform:translateX(100%);visibility:hidden}
@media (prefers-reduced-motion:no-preference){body.tela-cheia.tc-anima .panel{transition:transform var(--dur-l) var(--ease),visibility 0s var(--dur-l)}}
body.tela-cheia.tc-gaveta .panel{transform:none;visibility:visible;transition-delay:0s}
body.tela-cheia .grp{background:var(--paper)}
@media (min-width:701px){body.tela-cheia.tc-gaveta .classes{right:calc(min(420px,92vw) + 12px)}}
.tc-fecha-gaveta{display:none;position:sticky;top:0;z-index:2;justify-self:end;width:40px;height:40px;place-items:center;padding:0;border:0;border-radius:var(--r2);
  background:var(--paper);color:var(--fg);font:400 var(--t-lg)/1 var(--f-body);cursor:pointer}
.tc-fecha-gaveta:hover{background:color-mix(in srgb,var(--fg) 6%,var(--paper))}
body.tela-cheia .tc-fecha-gaveta{display:grid}
@media (min-width:457px){   /* gaveta de 420 px: o ✕ fica na mesma linha da busca */
  body.tela-cheia .panel{grid-template-columns:minmax(0,1fr) auto;column-gap:var(--s2)}
  body.tela-cheia .panel>*{grid-column:1/-1}
  body.tela-cheia .panel>.busca{grid-column:1;grid-row:1}
  body.tela-cheia .panel>.tc-fecha-gaveta{grid-column:2;grid-row:1}
}
@media (prefers-reduced-motion:no-preference){.tc-ctl button,.tc-fecha-gaveta{transition:background-color var(--dur) var(--ease),color var(--dur) var(--ease),box-shadow var(--dur) var(--ease)}}`;
  document.head.append(css);

  // os dois ícones ficam no botão e o CSS mostra um ou outro (aria-pressed): trocar o HTML durante o clique soltava o alvo do clique,
  // e o Leaflet tomava isso por um clique no mapa, que desfazia o trecho escolhido
  const ICON_ABRE = '<svg class="abre" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const ICON_SAI = '<svg class="sai" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

  const Ctl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const d = L.DomUtil.create('div', 'tc-ctl');
      d.innerHTML = `<button type="button" class="tc-btn" aria-pressed="false" title="Tela cheia" aria-label="Mapa em tela cheia">${ICON_ABRE}${ICON_SAI}</button>` +
        `<button type="button" class="tc-painel" aria-expanded="false" title="Abrir o painel (limpeza, busca, detalhe)">☰ Painel</button>`;
      L.DomEvent.disableClickPropagation(d);
      L.DomEvent.on(d, 'click', L.DomEvent.stopPropagation);   // clique nos botões não chega ao mapa (que limparia a seleção)
      d.querySelector('.tc-btn').addEventListener('click', alterna);
      d.querySelector('.tc-painel').addEventListener('click', () => gaveta(!document.body.classList.contains('tc-gaveta'), true));
      return d;
    },
  });
  const ctl = new Ctl().addTo(map);
  const btn = ctl.getContainer().querySelector('.tc-btn');
  const btnPainel = ctl.getContainer().querySelector('.tc-painel');

  const fecha = document.createElement('button');
  fecha.type = 'button';
  fecha.className = 'tc-fecha-gaveta';
  fecha.textContent = '✕';
  fecha.title = 'Fechar painel';
  fecha.setAttribute('aria-label', 'Fechar painel');
  fecha.addEventListener('click', () => gaveta(false, true));
  painel.prepend(fecha);

  const nativo = () => document.fullscreenElement || document.webkitFullscreenElement;
  let centro = null, yAntes = 0, voltar = null;
  const volta = () => { if (voltar !== null) window.scrollTo(0, voltar); };
  function aplica(ligado) {
    if (document.body.classList.contains('tela-cheia') === ligado) return;
    centro = [map.getCenter(), map.getZoom()];
    if (ligado) yAntes = window.scrollY;               // em tela cheia a página encolhe e a rolagem vai a 0: ao sair, volta ao mesmo lugar
    if (!ligado) document.body.classList.remove('tc-anima');
    document.body.classList.toggle('tela-cheia', ligado);
    if (!ligado) { gaveta(false); voltar = yAntes; volta(); }
    // a gaveta só anima depois de já estar fora da tela (sem isso, ela passaria deslizando ao entrar na tela cheia)
    else { void painel.offsetWidth; document.body.classList.add('tc-anima'); }
    btn.title = ligado ? 'Sair da tela cheia (Esc)' : 'Tela cheia';
    btn.setAttribute('aria-pressed', ligado);
    btn.setAttribute('aria-label', ligado ? 'Sair da tela cheia' : 'Mapa em tela cheia');
    requestAnimationFrame(() => { map.invalidateSize(); map.setView(centro[0], centro[1], { animate: false }); if (!ligado) volta(); });
  }
  function alterna() {
    const ligar = !document.body.classList.contains('tela-cheia');
    const el = document.documentElement;
    if (ligar) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { try { const p = req.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) { /* sem tela cheia nativa: fica só o CSS */ } }
      aplica(true);
    } else {
      if (nativo()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      aplica(false);
    }
  }
  function gaveta(abrir, foco) {
    document.body.classList.toggle('tc-gaveta', abrir);
    btnPainel.setAttribute('aria-expanded', abrir);
    if (abrir) painel.scrollTop = 0;
    if (foco) (abrir ? fecha : btnPainel).focus({ preventScroll: true });   // teclado: o foco vai para dentro e volta ao botão
  }
  // saiu da tela cheia nativa pelo Esc / gesto do sistema: volta o layout
  // (a saída da tela cheia nativa chega depois e muda o tamanho da janela: devolve a rolagem de novo)
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
    if (nativo()) return;
    aplica(false); volta(); voltar = null;
  }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !document.body.classList.contains('tela-cheia')) return;
    if (document.body.classList.contains('tc-gaveta')) gaveta(false, painel.contains(document.activeElement)); else if (!nativo()) aplica(false);
  });
  // tocar numa OS ou trecho dentro da gaveta no celular: fecha a gaveta para mostrar o mapa
  painel.addEventListener('click', e => {
    if (!document.body.classList.contains('tc-gaveta') || window.innerWidth > 700) return;
    if (e.target.closest('.limp-os-b, .row, .chip[data-t], .ir')) setTimeout(() => gaveta(false), 50);
  });
  window.__telaCheia = alterna;
})();
