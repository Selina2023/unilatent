// UniLatent page enhancements. The clip tabs are pure CSS (radio inputs) and work without this script.
// It adds lazy video loading, play/pause by visibility, the method walkthrough, the results chart,
// copy-to-clipboard and count-up numbers.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window)) {
    document.documentElement.classList.remove('js');
    document.querySelectorAll('video[data-src]').forEach(v => { v.src = v.dataset.src; v.autoplay = true; });
    return;
  }

  // Videos load when they near the viewport. Clips in hidden tab panels are display:none, so they only load
  // once their tab is opened. Autoplaying clips pause when they leave the screen.
  const io = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting) {
      if (!v.getAttribute('src') && v.dataset.src) v.src = v.dataset.src;
      if (!v.controls) v.play?.().catch(() => {});
    } else if (!v.controls) v.pause?.();
  }), { rootMargin: '250px 0px' });
  document.querySelectorAll('video:not(.clip)').forEach(v => io.observe(v));

  document.querySelectorAll('.btn.soon').forEach(a => a.addEventListener('click', e => e.preventDefault()));

  document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
    const text = document.querySelector(btn.dataset.copy).textContent; let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const t = Object.assign(document.createElement('textarea'), { value: text }); t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch {} t.remove();
    }
    btn.textContent = ok ? 'Copied' : 'Select and copy';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  }));

  // ---------------------------------------------------------------- how it works: method walkthrough
  const hw = document.getElementById('howit');
  if (hw) {
    const stage = hw.querySelector('.hw-stage'), steps = [...hw.querySelectorAll('.hw-steps button')];
    const play = hw.querySelector('.hw-play'), svgNS = 'http://www.w3.org/2000/svg';
    const clips = [...hw.querySelectorAll('video.clip')];
    let step = 0, playing = false, t0 = 0, raf = 0, poseTimer = 0;
    const DUR = [9000, 7000, 6500, 6500];

    // step 1: pose and target pickers swap the paired renderings
    const src = document.getElementById('hwSrc'), tgt = document.getElementById('hwTgt'), tgtLab = document.getElementById('hwTgtLabel');
    let pose = 3, robot = 'sawyer';
    const showPair = () => {
      src.src = `assets/method/pair_franka_${pose}.jpg`; tgt.src = `assets/method/pair_${robot}_${pose}.jpg`;
      const rName = robot === 'xarm7' ? 'xArm7' : 'Sawyer';
      tgtLab.textContent = `target · ${rName}`;
      hw.querySelectorAll('.tgt-name').forEach(el => { el.textContent = rName; });
      const dep = document.getElementById('hwDeploy'), clip = `ours_stack_bowl_cup_${robot}`;
      if (!dep.dataset.src.includes(clip)) {
        dep.poster = `assets/poster/${clip}.jpg`; dep.dataset.src = `assets/vid/${clip}.mp4`; dep.setAttribute('aria-label', `UniLatent on ${rName}`);
        if (dep.getAttribute('src')) dep.src = dep.dataset.src;
      }
      hw.querySelectorAll('.poses button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.pose === pose));
      hw.querySelectorAll('[data-tgt]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tgt === robot));
    };
    hw.querySelectorAll('.poses button').forEach(b => b.addEventListener('click', () => { stop(); pose = +b.dataset.pose; showPair(); }));
    hw.querySelectorAll('[data-tgt]').forEach(b => b.addEventListener('click', () => { stop(); robot = b.dataset.tgt; showPair(); }));

    // step 2: t-SNE at epochs 0..4 and cross-decoded frames d0..d3 follow one training-progress value
    const thumbs = document.getElementById('hwThumbs'), hi = [];
    for (let k = 0; k < 4; k++) {
      const x = 562 + k * 96, im = document.createElementNS(svgNS, 'image');
      im.setAttribute('href', `assets/method/decode_${k}.png`); Object.entries({ x, y: 332, width: 86, height: 68, preserveAspectRatio: 'xMidYMid slice' }).forEach(([a, v]) => im.setAttribute(a, v));
      const r = document.createElementNS(svgNS, 'rect'); Object.entries({ x: x - 3, y: 329, width: 92, height: 74, rx: 8, class: 'thumb-hi' }).forEach(([a, v]) => r.setAttribute(a, v));
      const tl = document.createElementNS(svgNS, 'text'); tl.setAttribute('x', x + 43); tl.setAttribute('y', 426); tl.setAttribute('class', 'dlab'); tl.innerHTML = `d<tspan class="sub" dy="4">${k}</tspan>`;
      thumbs.append(im, r, tl); hi.push(r);
    }
    const decs = [...hw.querySelectorAll('.decode img')], tsne = [...hw.querySelectorAll('.tsne img')];
    const prog = document.getElementById('hwProg'), out = document.getElementById('hwProgOut'), epochLab = document.getElementById('hwEpoch');
    const setProgress = p => {
      const st = p * 3, se = p * (tsne.length - 1);
      decs.forEach((im, k) => { im.style.opacity = Math.max(0, 1 - Math.abs(st - k)); });
      tsne.forEach((im, k) => { im.style.opacity = Math.max(0, 1 - Math.abs(se - k)); });
      const k = Math.round(se);   // t-SNE snapshots over training (epochs 0-12), named by what they show
      epochLab.textContent = k <= 1 ? 'separate' : k <= 4 ? 'merging' : k < tsne.length - 1 ? 'overlapping' : 'aligned';
      hi.forEach((r, k) => { r.style.opacity = Math.max(0, 1 - Math.abs(st - k)); });
      const near = Math.round(st); out.innerHTML = `d<sub>${near}</sub>`;
    };
    prog.addEventListener('input', () => { stop(); setProgress(prog.value / 100); });
    setProgress(1);

    const setStep = s => {
      step = s; stage.dataset.step = s; hw.dataset.step = s;
      steps.forEach((b, k) => { b.setAttribute('aria-selected', k === s); b.style.setProperty('--p', '0%'); });
      clips.forEach(v => { const on = v.classList.contains('s' + s); if (on) { if (!v.getAttribute('src')) v.src = v.dataset.src; v.currentTime = 0; v.play?.().catch(() => {}); } else v.pause?.(); });
    };
    steps.forEach((b, k) => b.addEventListener('click', () => { stop(); setStep(k); }));

    const tick = now => {
      const el = now - t0, d = DUR[step], f = Math.min(1, el / d);
      steps[step].style.setProperty('--p', (f * 100).toFixed(1) + '%');
      if (step === 1) { const p = Math.min(1, el / (d * .75)); prog.value = Math.round(p * 100); setProgress(p); }
      if (f >= 1) { setStep((step + 1) % 4); t0 = now; if (step === 1) setProgress(0); }
      raf = requestAnimationFrame(tick);
    };
    const cyclePoses = () => { if (playing && step === 0) { pose = (pose + 1) % 6; showPair(); } };
    function start() {
      if (playing) return; playing = true; play.setAttribute('aria-pressed', 'true'); play.querySelector('.lbl').textContent = 'Pause';
      t0 = performance.now(); if (step === 1) setProgress(0); raf = requestAnimationFrame(tick); poseTimer = setInterval(cyclePoses, 2200);
    }
    function stop() {
      if (!playing) return; playing = false; play.setAttribute('aria-pressed', 'false'); play.querySelector('.lbl').textContent = 'Play';
      cancelAnimationFrame(raf); clearInterval(poseTimer); steps.forEach(b => b.style.setProperty('--p', '0%'));
    }
    play.addEventListener('click', () => playing ? stop() : start());
    if (reduced) hw.querySelector('svg').pauseAnimations?.();
    // autoplay once, the first time the walkthrough scrolls into view
    let auto = !reduced;
    new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && auto) { auto = false; start(); } if (!e.isIntersecting) stop(); }), { threshold: .45 }).observe(hw);
  }

  // ---------------------------------------------------------------- sim chart (Table 1)
  const chart = document.getElementById('simChart');
  if (chart) {
    // [Direct, DINOv2 w/o align, RoVi-Aug*, UniLatent] per task and robot; mean = average of the six target cells
    const T = { box: { F: [97, 97, 97, 97], X: [2, 40, 93, 93], S: [5, 16, 54, 81] },
                cup: { F: [80, 89, 89, 89], X: [0, 3, 15, 65], S: [0, 0, 5, 51] },
                ball: { F: [90, 93, 93, 93], X: [1, 11, 60, 89], S: [1, 1, 40, 77] } };
    const NAMES = { box: 'Close Box Lid', cup: 'Stack Cup', ball: 'Kick Football', X: 'xArm7', S: 'Sawyer', F: 'Franka (source, in-domain)' };
    let task = 'cup', robot = 'S';
    const rows = [...chart.querySelectorAll('.brow')], note = document.getElementById('simNote');
    const robotBtns = [...chart.querySelectorAll('[data-robot]')];
    const draw = () => {
      let v;
      if (task === 'mean') {
        const cells = robot === 'F' ? ['F'] : [robot];
        v = [0, 1, 2, 3].map(m => ['box', 'cup', 'ball'].reduce((a, t) => a + cells.reduce((b, r) => b + T[t][r][m], 0), 0) / 3);
      } else v = T[task][robot];
      rows.forEach((r, m) => { r.querySelector('i').style.width = v[m] + '%'; r.querySelector('.val').textContent = (Number.isInteger(v[m]) ? v[m] : v[m].toFixed(1)) + '%';
        r.title = `${r.querySelector('.lab').textContent}: ${r.querySelector('.val').textContent}`; });
      chart.querySelectorAll('[data-task]').forEach(b => b.setAttribute('aria-pressed', b.dataset.task === task));
      robotBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.robot === robot));
      const where = `${task === 'mean' ? 'Averaged over the three tasks' : 'On ' + NAMES[task]}, ${robot === 'F' ? 'on the source Franka' : 'transferring to ' + NAMES[robot]}`;
      const best = Math.max(v[0], v[1], v[2]), fmt = x => (Number.isInteger(x) ? x : x.toFixed(1)) + '%';
      note.textContent = robot === 'F'
        ? `${where}, all methods are in-domain and perform alike (${fmt(Math.min(...v))}–${fmt(Math.max(...v))}).`
        : `${where}, the best baseline reaches ${fmt(best)} and UniLatent ${fmt(v[3])}.`;
    };
    chart.querySelectorAll('[data-task]').forEach(b => b.addEventListener('click', () => { task = b.dataset.task; draw(); }));
    robotBtns.forEach(b => b.addEventListener('click', () => { robot = b.dataset.robot; draw(); }));
    const bars = chart.querySelector('.bars-chart'); bars.style.setProperty('--h', (bars.offsetHeight - 22) + 'px');
    draw();
  }

  // count-up: <b data-count="76" data-suffix="%">76%</b> (the final value is already in the markup)
  const cio = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; cio.unobserve(e.target);
    const el = e.target, end = parseFloat(el.dataset.count), suf = el.dataset.suffix || '';
    if (reduced || !end) return;
    const t0 = performance.now(), dur = 1300;
    const tick = t => { const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))) + suf; if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), { threshold: .6 });
  document.querySelectorAll('[data-count]').forEach(el => cio.observe(el));
})();
