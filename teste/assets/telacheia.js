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
.tc-ctl{display:flex;flex-direction:column;gap:6px}
.tc-ctl button{width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:6px;background:#fff;color:#111;cursor:pointer;box-shadow:0 1px 5px #0006}
.tc-ctl button:focus-visible{outline:2px solid #fde047;outline-offset:1px}
.tc-ctl svg{width:20px;height:20px}
.tc-ctl .tc-painel{width:auto;padding:0 10px;font:600 13px var(--f-body,sans-serif);gap:6px;display:none}
body.tela-cheia{overflow:hidden}
body.tela-cheia .mapbox{position:fixed;inset:0;z-index:1000;border-radius:0;border:0}
body.tela-cheia #map{height:100vh;height:100dvh;min-height:0}
body.tela-cheia .tc-ctl .tc-painel{display:flex;align-items:center}
body.tela-cheia.tc-gaveta .panel{position:fixed;top:0;right:0;bottom:0;z-index:1100;width:min(420px,92vw);overflow-y:auto;border-radius:0;box-shadow:-6px 0 24px #0008;align-content:start}
body.tela-cheia.tc-gaveta .tc-fecha-gaveta{display:block}
.tc-fecha-gaveta{display:none;position:sticky;top:0;z-index:2;justify-self:end;font:600 13px var(--f-body,sans-serif);padding:6px 12px;border-radius:6px;border:1px solid var(--line);background:var(--paper);color:var(--fg);cursor:pointer}`;
  document.head.append(css);

  const ICON_ABRE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const ICON_SAI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

  const Ctl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const d = L.DomUtil.create('div', 'tc-ctl');
      d.innerHTML = `<button type="button" class="tc-btn" aria-pressed="false" title="Tela cheia" aria-label="Mapa em tela cheia">${ICON_ABRE}</button>` +
        `<button type="button" class="tc-painel" aria-expanded="false" title="Abrir o painel (limpeza, busca, detalhe)">☰ Painel</button>`;
      L.DomEvent.disableClickPropagation(d);
      d.querySelector('.tc-btn').addEventListener('click', alterna);
      d.querySelector('.tc-painel').addEventListener('click', () => gaveta(!document.body.classList.contains('tc-gaveta')));
      return d;
    },
  });
  const ctl = new Ctl().addTo(map);
  const btn = ctl.getContainer().querySelector('.tc-btn');
  const btnPainel = ctl.getContainer().querySelector('.tc-painel');

  const fecha = document.createElement('button');
  fecha.type = 'button';
  fecha.className = 'tc-fecha-gaveta';
  fecha.textContent = 'Fechar painel ✕';
  fecha.addEventListener('click', () => gaveta(false));
  painel.prepend(fecha);

  const nativo = () => document.fullscreenElement || document.webkitFullscreenElement;
  let centro = null;
  function aplica(ligado) {
    if (document.body.classList.contains('tela-cheia') === ligado) return;
    centro = [map.getCenter(), map.getZoom()];
    document.body.classList.toggle('tela-cheia', ligado);
    if (!ligado) gaveta(false);
    btn.innerHTML = ligado ? ICON_SAI : ICON_ABRE;
    btn.title = ligado ? 'Sair da tela cheia (Esc)' : 'Tela cheia';
    btn.setAttribute('aria-pressed', ligado);
    btn.setAttribute('aria-label', ligado ? 'Sair da tela cheia' : 'Mapa em tela cheia');
    requestAnimationFrame(() => { map.invalidateSize(); map.setView(centro[0], centro[1], { animate: false }); });
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
  function gaveta(abrir) {
    document.body.classList.toggle('tc-gaveta', abrir);
    btnPainel.setAttribute('aria-expanded', abrir);
    if (abrir) painel.scrollTop = 0;
  }
  // saiu da tela cheia nativa pelo Esc / gesto do sistema: volta o layout
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => { if (!nativo()) aplica(false); }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !document.body.classList.contains('tela-cheia')) return;
    if (document.body.classList.contains('tc-gaveta')) gaveta(false); else if (!nativo()) aplica(false);
  });
  // tocar numa OS ou trecho dentro da gaveta no celular: fecha a gaveta para mostrar o mapa
  painel.addEventListener('click', e => {
    if (!document.body.classList.contains('tc-gaveta') || window.innerWidth > 700) return;
    if (e.target.closest('.limp-os-b, .row, .chip[data-t]')) setTimeout(() => gaveta(false), 50);
  });
  window.__telaCheia = alterna;
})();
