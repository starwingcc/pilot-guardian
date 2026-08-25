import type { ChallengeStep, OfficialTemplateSource, PublicGateChallengeStep } from './types'

export const OFFICIAL_TEMPLATES = [
  {
    id: 'wooden-fish',
    name: '静心木鱼',
    description: '通过有节奏的点击完成一次短暂的注意力回收。',
  },
  {
    id: 'reaction-test',
    name: '反应力测试',
    description: '等待信号出现，并在限定时间内完成点击。',
  },
] as const

function woodenFishDocument(requiredHits: number): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; overflow: hidden; background: #edf4ef; color: #13231d; }
    body::before { content: ""; position: fixed; inset: -30%; background: radial-gradient(circle at 60% 44%, rgba(204, 111, 48, .2), transparent 20%), radial-gradient(circle at 36% 56%, rgba(70, 112, 90, .22), transparent 28%); filter: blur(50px); }
    main { position: relative; min-height: 100vh; display: grid; grid-template-columns: minmax(18rem, 1fr) minmax(20rem, 36rem); align-items: center; gap: clamp(2rem, 9vw, 10rem); padding: clamp(2rem, 7vw, 8rem); }
    .copy { align-self: end; padding-bottom: 4vh; }
    .eyebrow { margin: 0 0 1rem; font-size: .72rem; font-weight: 700; letter-spacing: .24em; text-transform: uppercase; color: #5d7369; }
    h1 { max-width: 8ch; margin: 0; font: 500 clamp(3.8rem, 9vw, 9rem)/.82 Georgia, serif; letter-spacing: -.07em; }
    .instruction { max-width: 30rem; margin: 2rem 0 0; color: #52635c; font-size: clamp(1rem, 1.5vw, 1.2rem); line-height: 1.7; }
    .ritual { display: grid; place-items: center; gap: 2rem; }
    button { position: relative; width: min(28rem, 72vw); aspect-ratio: 1; border: 0; border-radius: 50%; background: rgba(255,255,255,.48); box-shadow: 0 3rem 7rem rgba(31, 63, 49, .16), inset 0 0 0 1px rgba(255,255,255,.75); cursor: pointer; -webkit-tap-highlight-color: transparent; }
    button:focus-visible { outline: 3px solid #35644e; outline-offset: 8px; }
    .fish { position: absolute; inset: 21% 16%; border-radius: 52% 48% 44% 56% / 56% 54% 46% 44%; background: linear-gradient(145deg, #a95024, #dd874b 52%, #873b20); box-shadow: inset 1.2rem 1.3rem 2rem rgba(255, 209, 151, .24), inset -1rem -1.2rem 1.5rem rgba(72, 24, 13, .24), 0 2.3rem 3rem rgba(107, 52, 26, .25); transition: transform .16s cubic-bezier(.2,.8,.2,1); }
    .fish::before { content: ""; position: absolute; inset: 17% 20%; border: 2px solid rgba(76, 30, 15, .22); border-radius: inherit; }
    .fish::after { content: ""; position: absolute; width: 20%; height: 11%; right: 4%; top: 45%; border-radius: 50%; background: #6c2e1a; box-shadow: inset 0 2px 5px rgba(30,8,4,.28); }
    button:active .fish, button.hit .fish { transform: scale(.94) rotate(-1deg); }
    .count { display: flex; align-items: baseline; gap: .8rem; font-variant-numeric: tabular-nums; }
    .count strong { font-size: 2.6rem; font-weight: 500; letter-spacing: -.06em; }
    .count span { color: #61726a; }
    .track { width: min(24rem, 68vw); height: 3px; overflow: hidden; background: rgba(31,67,50,.14); }
    .track i { display: block; width: 0; height: 100%; background: #b85c2e; transition: width .35s cubic-bezier(.2,.8,.2,1); }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; align-content: center; padding: 2rem; } .copy { align-self: auto; padding: 0; } h1 { font-size: clamp(3.8rem, 18vw, 6rem); } .instruction { margin-top: 1rem; } button { width: min(22rem, 75vw); } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: .01ms !important; } }
  </style>
</head>
<body>
  <main>
    <section class="copy">
      <p class="eyebrow">Attention ritual / 01</p>
      <h1>敲击，回到此刻。</h1>
      <p class="instruction">完成 ${requiredHits} 次清晰的点击。每一次动作都应当是有意识的选择。</p>
    </section>
    <section class="ritual" aria-live="polite">
      <button id="fishButton" type="button" aria-label="敲击木鱼"><span class="fish"></span></button>
      <div class="count"><strong id="count">0</strong><span>/ ${requiredHits}</span></div>
      <div class="track" aria-hidden="true"><i id="progress"></i></div>
    </section>
  </main>
  <script>
    const requiredHits = ${requiredHits};
    const button = document.getElementById('fishButton');
    const count = document.getElementById('count');
    const progress = document.getElementById('progress');
    let hits = 0;
    button.addEventListener('click', () => {
      if (hits >= requiredHits) return;
      hits += 1;
      count.textContent = String(hits);
      progress.style.width = ((hits / requiredHits) * 100) + '%';
      button.classList.remove('hit');
      requestAnimationFrame(() => button.classList.add('hit'));
      window.setTimeout(() => button.classList.remove('hit'), 180);
      if (hits === requiredHits) window.setTimeout(() => window.PilotGuardian.complete(), 320);
    });
  </script>
</body>
</html>`
}

function reactionTestDocument(
  minimumDelayMs: number,
  maximumDelayMs: number,
  successWindowMs: number,
): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #f3f5ef; color: #17231d; }
    button { width: 100%; min-height: 100vh; border: 0; padding: clamp(2rem, 7vw, 8rem); color: inherit; background: transparent; text-align: left; cursor: pointer; transition: background .22s ease, color .22s ease; }
    button::before { content: ""; position: fixed; inset: 0; pointer-events: none; background: linear-gradient(90deg, rgba(24,43,34,.08) 1px, transparent 1px), linear-gradient(rgba(24,43,34,.08) 1px, transparent 1px); background-size: 72px 72px; mask-image: linear-gradient(to bottom, black, transparent 80%); }
    button:focus-visible { outline: 4px solid #234f3b; outline-offset: -8px; }
    button[data-state="waiting"] { background: #e9eee7; cursor: crosshair; }
    button[data-state="ready"] { background: #d8ff45; color: #0d170f; }
    .layout { position: relative; min-height: calc(100vh - clamp(4rem, 14vw, 16rem)); display: flex; flex-direction: column; justify-content: space-between; }
    .topline { display: flex; justify-content: space-between; gap: 2rem; font-size: .72rem; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
    .index { color: #6a7971; }
    .signal { max-width: 12ch; margin: 10vh 0; font: 500 clamp(4rem, 12vw, 11rem)/.8 Georgia, serif; letter-spacing: -.075em; }
    .detail { display: flex; align-items: end; justify-content: space-between; gap: 2rem; }
    .detail p { max-width: 32rem; margin: 0; font-size: clamp(1rem, 1.7vw, 1.3rem); line-height: 1.6; }
    .timing { font: 500 clamp(2.2rem, 6vw, 5rem)/1 ui-monospace, monospace; letter-spacing: -.08em; font-variant-numeric: tabular-nums; }
    @media (max-width: 640px) { button { padding: 2rem; } .signal { margin: 12vh 0; } .detail { align-items: start; flex-direction: column; } }
    @media (prefers-reduced-motion: reduce) { button { transition: none; } }
  </style>
</head>
<body>
  <button id="surface" type="button" data-state="idle" aria-live="assertive">
    <span class="layout">
      <span class="topline"><span>Reaction field</span><span class="index">Window / ${successWindowMs}ms</span></span>
      <strong class="signal" id="signal">点击开始。</strong>
      <span class="detail"><p id="detail">开始后保持等待。颜色切换时，在 ${successWindowMs} 毫秒内点击画面。</p><span class="timing" id="timing">—</span></span>
    </span>
  </button>
  <script>
    const minimumDelay = ${minimumDelayMs};
    const maximumDelay = ${maximumDelayMs};
    const successWindow = ${successWindowMs};
    const surface = document.getElementById('surface');
    const signal = document.getElementById('signal');
    const detail = document.getElementById('detail');
    const timing = document.getElementById('timing');
    let state = 'idle';
    let readyAt = 0;
    let waitTimer = 0;
    let lateTimer = 0;

    function reset(message) {
      window.clearTimeout(waitTimer);
      window.clearTimeout(lateTimer);
      state = 'idle';
      surface.dataset.state = state;
      signal.textContent = message || '再次开始。';
      detail.textContent = '点击画面重新开始，等待信号后再作出反应。';
      timing.textContent = '—';
    }

    function start() {
      state = 'waiting';
      surface.dataset.state = state;
      signal.textContent = '保持等待。';
      detail.textContent = '提前点击会让测试重新开始。';
      timing.textContent = 'WAIT';
      const delay = minimumDelay + Math.random() * (maximumDelay - minimumDelay);
      waitTimer = window.setTimeout(() => {
        state = 'ready';
        surface.dataset.state = state;
        readyAt = performance.now();
        signal.textContent = '现在。';
        detail.textContent = '立即点击画面。';
        timing.textContent = 'GO';
        lateTimer = window.setTimeout(() => reset('太慢了。'), successWindow);
      }, delay);
    }

    surface.addEventListener('click', () => {
      if (state === 'idle') { start(); return; }
      if (state === 'waiting') { reset('提前了。'); return; }
      const elapsed = Math.round(performance.now() - readyAt);
      window.clearTimeout(lateTimer);
      if (elapsed > successWindow) { reset('太慢了。'); return; }
      state = 'complete';
      signal.textContent = '通过。';
      detail.textContent = '注意力链路已经建立。';
      timing.textContent = elapsed + 'ms';
      window.setTimeout(() => window.PilotGuardian.complete(), 420);
    });
  </script>
</body>
</html>`
}

export function renderOfficialTemplate(source: OfficialTemplateSource): string {
  if (source.templateId === 'wooden-fish') {
    return woodenFishDocument(source.parameters.requiredHits)
  }
  return reactionTestDocument(
    source.parameters.minimumDelayMs,
    source.parameters.maximumDelayMs,
    source.parameters.successWindowMs,
  )
}

export function challengeHtml(step: ChallengeStep | PublicGateChallengeStep): string | undefined {
  if (step.type === 'text') {
    return step.scene.kind === 'custom' ? step.scene.document.html : undefined
  }
  return step.source.kind === 'template'
    ? renderOfficialTemplate(step.source)
    : step.source.document.html
}
