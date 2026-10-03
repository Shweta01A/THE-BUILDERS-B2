/* =========================================================
   HAZARD ZERO - 2D WALKER
   One straight warehouse corridor. The employee walks LEFT and
   RIGHT only. The background is built from your realistic
   warehouse photos, joined one after another in a fixed order,
   so there is one entry and one direction of travel.

   It exposes the same interface the old 3D engine had
   (window.HazardZero3D), so script.js (login, score, risk,
   timer, questions) needs almost no changes.
   ========================================================= */
(function () {
    'use strict';

    /* ---------------------------------------------------
       ZONES: the order the employee meets them, left to right.
       hx = where the hazard is inside its photo (0 = left edge,
       1 = right edge). hw = half-width of the "inspect" area.
       --------------------------------------------------- */
    // hy = the y of the hazard on the floor (0 top .. 1 bottom of the photo)
    // sy = the y where the worker stands to inspect it (a bit in front of it)
    const ZONES = [
        { type: 'oil',        img: 'assests/assests.png',        hx: 0.76, hw: 0.11, hy: 0.64, sy: 0.72, name: 'RECEIVING' },
        { type: 'box',        img: 'assests/assests2.png',       hx: 0.84, hw: 0.10, hy: 0.68, sy: 0.76, name: 'CONVEYOR' },
        { type: 'electrical', img: 'assests/assests3.png',       hx: 0.80, hw: 0.10, hy: 0.66, sy: 0.74, name: 'ELECTRICAL' },
        { type: 'cable',      img: 'assests/cable.png',          hx: 0.50, hw: 0.16, hy: 0.74, sy: 0.81, name: 'CABLE ZONE' },
        { type: 'chemical',   img: 'assests/chemical.png',       hx: 0.75, hw: 0.12, hy: 0.74, sy: 0.81, name: 'CHEMICALS' },
        { type: 'emergency',  img: 'assests/emergencyexit.png',  hx: 0.62, hw: 0.10, hy: 0.70, sy: 0.78, name: 'EMERGENCY EXIT' },
        { type: 'fire',       img: 'assests/fire.png',           hx: 0.75, hw: 0.09, hy: 0.80, sy: 0.87, name: 'FLAMMABLES' },
        { type: 'shelf',      img: 'assests/shelf.png',          hx: 0.46, hw: 0.11, hy: 0.70, sy: 0.78, name: 'AISLE 15' }
    ];
    const STAND_BACK = 0.07;   // he stops this far (fraction of the photo width) LEFT of the hazard, facing it

    const SPRITES = {
        male:   { src: 'assests/worker-male.png',   w: 1797, h: 3930, hip: 0.649, cut: 0.537 },
        female: { src: 'assests/worker-female.png', w: 1879, h: 3955, hip: 0.720, cut: 0.474 }
    };
    // crop box of the visible pixels inside each PNG (it has transparent margins)
    const CROP = {
        male:   { x: 123, y: 125 },
        female: { x: 126, y: 125 }
    };

    const OVERLAP = 0.16;      // photos blend into each other over 16% of their width
    const CHAR_H = 0.42;       // character height, as a fraction of the screen height
    const FEET_Y = 0.88;       // where the feet stand, as a fraction of the screen height
    const WALK = 0.30;         // walking speed, screen heights per second
    const RUN = 0.55;

    let root, viewport, world, charCv, charCtx, toast, hint, loadingEl, touchPad;
    let imgs = [];             // <img> elements for each zone
    let zoneLeft = [];         // world x of each zone's left edge
    let zoneW = [];            // width of each zone
    let worldW = 0, H = 600, VW = 800;
    let built = false, running = false, panelOpen = false;
    let py = 0.88, goal = null, autoInspect = false, promptEl = null;
    let px = 0, vx = 0, camX = 0, facing = 1, faceAnim = 1, phase = 0, idleT = 0;
    let hazards = [];
    let keys = {};
    let gender = 'male';
    let sprite = null;         // pre-cut pieces of the character
    let spriteImgs = {};
    let last = 0, raf = 0, firstMove = false, toastTimer = 0, currentZone = -1;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    // things further up the floor are smaller (perspective)
    const scaleAt = (y) => clamp(0.22 + 0.78 * ((y - 0.5) / (0.88 - 0.5)), 0.4, 1.05);

    function loadImage(src) {
        return new Promise(function (resolve) {
            const im = new Image();
            im.onload = function () { resolve(im); };
            im.onerror = function () { console.warn('Could not load', src); resolve(null); };
            im.src = src;
        });
    }

    /* ---------------------------------------------------
       BUILD THE SCENE (once)
       --------------------------------------------------- */
    function build() {
        root = document.getElementById('panorama');
        if (!root) return false;
        root.innerHTML = '';

        viewport = document.createElement('div');
        viewport.className = 'hz2d-viewport';
        world = document.createElement('div');
        world.className = 'hz2d-world';
        viewport.appendChild(world);

        charCv = document.createElement('canvas');
        charCv.className = 'hz2d-char';
        charCtx = charCv.getContext('2d');

        toast = document.createElement('div');
        toast.className = 'hz2d-toast';
        hint = document.createElement('div');
        hint.className = 'hz2d-hint';
        hint.innerHTML = '<b>◀ ▶</b> or <b>A / D</b> walk &nbsp;·&nbsp; <b>Shift</b> run &nbsp;·&nbsp; <b>E</b> inspect a hazard';
        loadingEl = document.createElement('div');
        loadingEl.className = 'hz2d-loading';
        loadingEl.textContent = 'LOADING WAREHOUSE…';

        touchPad = document.createElement('div');
        touchPad.className = 'hz2d-touch';
        touchPad.innerHTML =
            '<button data-k="left" aria-label="Walk left">◀</button>' +
            '<button data-k="right" aria-label="Walk right">▶</button>' +
            '';
        touchPad.querySelectorAll('button').forEach(function (b) {
            const k = b.getAttribute('data-k');
            const down = function (ev) { ev.preventDefault(); press(k, true); };
            const up = function (ev) { ev.preventDefault(); press(k, false); };
            b.addEventListener('pointerdown', down);
            b.addEventListener('pointerup', up);
            b.addEventListener('pointercancel', up);
            b.addEventListener('pointerleave', up);
        });

        // click / tap the floor to walk there.
        viewport.addEventListener('pointerdown', function (ev) {
            if (!running || panelOpen) return;
            const x = ev.clientX - viewport.getBoundingClientRect().left + camX;
            goal = x; autoInspect = false;
        });

        root.appendChild(viewport);
        root.appendChild(toast);
        root.appendChild(touchPad);
        root.appendChild(loadingEl);

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', function () { keys = {}; });
        window.addEventListener('resize', layout);
        document.addEventListener('fullscreenchange', function () { setTimeout(layout, 120); });
        return true;
    }

    /* ---------------------------------------------------
       LAYOUT: sizes depend on the screen height
       --------------------------------------------------- */
    function layout() {
        if (!built || !viewport) return;
        const r = root.getBoundingClientRect();
        H = Math.max(300, r.height || window.innerHeight);
        VW = Math.max(300, r.width || window.innerWidth);

        let x = 0;
        zoneLeft = []; zoneW = [];
        imgs.forEach(function (im, i) {
            const el = im.el;
            const ratio = im.img ? (im.img.naturalWidth / im.img.naturalHeight) : 2;
            const w = H * ratio;
            const ov = i > 0 ? Math.round(w * OVERLAP) : 0;     // this photo fades in over the previous one
            if (i > 0) x -= ov;
            zoneW[i] = w;
            zoneLeft[i] = x;
            el.style.left = x + 'px';
            el.style.width = w + 'px';
            el.style.height = H + 'px';
            if (i > 0) {
                const m = 'linear-gradient(to right, transparent 0, #000 ' + ov + 'px)';
                el.style.webkitMaskImage = m;
                el.style.maskImage = m;
            }
            x += w;
        });
        worldW = x;
        world.style.width = worldW + 'px';
        world.style.height = H + 'px';

        const ch = H * CHAR_H;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cwid = ch * 0.95, chei = ch * 1.22;
        charCv.width = Math.round(cwid * dpr);
        charCv.height = Math.round(chei * dpr);
        charCv.style.width = cwid + 'px';
        charCv.style.height = chei + 'px';
        charCv.dataset.cw = cwid; charCv.dataset.ch = ch; charCv.dataset.dpr = dpr;
        charCv.dataset.cwid = cwid; charCv.dataset.chei = chei;
        charCv.style.transformOrigin = (cwid / 2) + 'px ' + (chei - ch * 0.07) + 'px';

        hazards.forEach(function (h) { positionHazard(h); });
    }

    function hazardX(z) { return zoneLeft[z] + ZONES[z].hx * zoneW[z]; }

    function positionHazard(h) {
        const z = ZONES[h.zone];
        h.x = hazardX(h.zone);
        h.sx = h.x - STAND_BACK * zoneW[h.zone];       // where the worker stands to inspect it
        if (h.coneEl) {
            h.coneEl.style.left = h.x + 'px';
            h.coneEl.style.top = (z.hy * H) + 'px';
            h.coneEl.style.height = (H * 0.17 * scaleAt(z.hy)) + 'px';
        }
    }

    /* ---------------------------------------------------
       CHARACTER SPRITE: cut into upper body + two legs so the
       legs can swing when walking.
       --------------------------------------------------- */
    function prepareSprite(img, key) {
        const s = SPRITES[key], c = CROP[key];
        const TH = 700;                       // working height in pixels
        const k = TH / s.h;
        const TW = Math.round(s.w * k);
        const base = document.createElement('canvas');
        base.width = TW; base.height = TH;
        base.getContext('2d').drawImage(img, c.x, c.y, s.w, s.h, 0, 0, TW, TH);

        const hipY = Math.round(TH * s.hip);
        const cutX = Math.round(TW * s.cut);
        const fade = Math.round(TH * 0.035);

        // upper body, with a soft lower edge so the legs blend in
        const up = document.createElement('canvas');
        up.width = TW; up.height = hipY + fade;
        const uc = up.getContext('2d');
        uc.drawImage(base, 0, 0, TW, hipY + fade, 0, 0, TW, hipY + fade);
        const g = uc.createLinearGradient(0, hipY, 0, hipY + fade);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,1)');
        uc.globalCompositeOperation = 'destination-out';
        uc.fillStyle = g;
        uc.fillRect(0, hipY, TW, fade);

        function leg(x0, x1) {
            const cv = document.createElement('canvas');
            cv.width = x1 - x0; cv.height = TH - hipY + fade;
            cv.getContext('2d').drawImage(base, x0, hipY - fade, x1 - x0, TH - hipY + fade, 0, 0, x1 - x0, TH - hipY + fade);
            return cv;
        }
        return {
            full: base,
            TW: TW, TH: TH, hipY: hipY, cutX: cutX, fade: fade,
            up: up, legL: leg(0, cutX), legR: leg(cutX, TW)
        };
    }

    // A side-view worker drawn with real limbs: hips, knees, shoulders and elbows,
    // so the legs and arms swing properly and the feet stay planted on the floor.
    // He always faces the way he is walking (towards the hazard).
    function rr(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
        c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
        c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
    }
    function limb(c, x0, y0, x1, y1, w, fill, edge) {
        c.lineCap = 'round';
        c.strokeStyle = edge; c.lineWidth = w + 0.014;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
        c.strokeStyle = fill; c.lineWidth = w;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    const PAL = {
        near: { pants: '#464a53', pantsHi: '#5a5f6a', cuff: '#a9adb4', boot: '#8d5a33', sole: '#262626', sleeve: '#f7922a', skin: '#f2b48e', glove: '#8a5a38' },
        far:  { pants: '#2e3138', pantsHi: '#3a3e46', cuff: '#7c7f85', boot: '#5e3c22', sole: '#1a1a1a', sleeve: '#c26f1c', skin: '#c68e6d', glove: '#5e3d26' }
    };
    const EDGE = '#1f1a17';

    function legPose(ph, A, flexK, moving) {
        const L1 = 0.195, L2 = 0.195;
        const a1 = moving ? A * Math.sin(ph) : 0.0;
        const flex = moving ? Math.max(0, Math.cos(ph)) * flexK + 0.06 : 0.0;
        const a2 = a1 - flex;
        const kx = L1 * Math.sin(a1), ky = L1 * Math.cos(a1);
        return { a1: a1, a2: a2, kx: kx, ky: ky, ax: kx + L2 * Math.sin(a2), ay: ky + L2 * Math.cos(a2) };
    }

    function drawLeg(c, hx, hy, p, pal) {
        limb(c, hx, hy, hx + p.kx, hy + p.ky, 0.115, pal.pants, EDGE);
        limb(c, hx + p.kx, hy + p.ky, hx + p.ax, hy + p.ay, 0.098, pal.pants, EDGE);
        // turned-up cuff
        const cx0 = hx + p.ax - Math.sin(p.a2) * 0.045, cy0 = hy + p.ay - Math.cos(p.a2) * 0.045;
        limb(c, cx0, cy0, hx + p.ax, hy + p.ay, 0.108, pal.cuff, EDGE);
        // boot, kept flat on the floor while planted and toe-down when pushing off
        c.save();
        c.translate(hx + p.ax, hy + p.ay);
        c.rotate(clamp(-p.a2 * 0.55, -0.35, 0.7));
        c.fillStyle = pal.boot; c.strokeStyle = EDGE; c.lineWidth = 0.012;
        rr(c, -0.06, -0.02, 0.22, 0.07, 0.03); c.fill(); c.stroke();
        c.fillStyle = pal.sole; rr(c, -0.062, 0.044, 0.225, 0.02, 0.01); c.fill();
        c.restore();
    }

    function drawArm(c, sx, sy, ang, flex, pal) {
        const U = 0.15, F = 0.14;
        const b2 = ang + flex;
        const ex = sx + U * Math.sin(ang), ey = sy + U * Math.cos(ang);
        const wx = ex + F * Math.sin(b2), wy = ey + F * Math.cos(b2);
        limb(c, ex, ey, wx, wy, 0.07, pal.skin, EDGE);
        limb(c, sx, sy, ex, ey, 0.1, pal.sleeve, EDGE);
        limb(c, wx - Math.sin(b2) * 0.01, wy - Math.cos(b2) * 0.01, wx + Math.sin(b2) * 0.035, wy + Math.cos(b2) * 0.035, 0.085, pal.glove, EDGE);
    }

    function drawCharacter(t) {
        const dpr = parseFloat(charCv.dataset.dpr) || 1;
        const ch = parseFloat(charCv.dataset.ch);
        const W = charCv.width, Hh = charCv.height;
        charCtx.setTransform(1, 0, 0, 1, 0, 0);
        charCtx.clearRect(0, 0, W, Hh);

        const u = ch * dpr;                     // canvas pixels for 1.0 = full body height
        const gx = W / 2, gy = Hh - 0.07 * u;   // ground point under the worker
        const moving = Math.abs(vx) > 8;
        const speedK = clamp(Math.abs(vx) / (H * RUN), 0, 1);
        const female = gender === 'female';

        // ---- ground shadow
        charCtx.save();
        charCtx.translate(gx, gy);
        charCtx.scale(1, 0.2);
        const sr = u * 0.30;
        const rg = charCtx.createRadialGradient(0, 0, 0, 0, 0, sr);
        rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        charCtx.fillStyle = rg; charCtx.beginPath(); charCtx.arc(0, 0, sr, 0, Math.PI * 2); charCtx.fill();
        charCtx.restore();

        // ---- pose
        const A = moving ? 0.40 + 0.22 * speedK : 0;
        const flexK = 0.80 + 0.50 * speedK;
        const nearP = legPose(phase, A, flexK, moving);
        const farP = legPose(phase + Math.PI, A, flexK, moving);
        const FOOT = 0.064;
        const hipY = -(Math.max(nearP.ay, farP.ay) + FOOT);          // lowest foot touches the floor
        const breathe = moving ? 0 : Math.sin(idleT * 2.2) * 0.003;
        const lean = moving ? 0.07 + 0.07 * speedK : 0.0;
        const armA = moving ? 0.50 + 0.25 * speedK : 0.04;

        charCtx.save();
        charCtx.translate(gx, gy);
        const fs = Math.abs(faceAnim) < 0.08 ? 0.08 * (faceAnim < 0 ? -1 : 1) : faceAnim;
        charCtx.scale(u * fs, u);
        charCtx.lineJoin = 'round';

        const hx = 0.0, hy = hipY;
        const shX = 0.0, shY = hy - 0.26 + breathe;          // shoulder, in the (leaning) torso frame
        const nearArmAng = moving ? -armA * Math.sin(phase) : armA;
        const farArmAng = moving ? armA * Math.sin(phase) : armA * 0.6;
        const armFlex = function (ang) { return moving ? 0.22 + Math.max(0, ang) * 0.9 : 0.12; };

        // far arm + far leg
        charCtx.save(); charCtx.translate(hx, hy); charCtx.rotate(lean); charCtx.translate(-hx, -hy);
        drawArm(charCtx, shX - 0.01, shY, farArmAng, armFlex(farArmAng), PAL.far);
        charCtx.restore();
        drawLeg(charCtx, hx, hy, farP, PAL.far);

        // ---- torso + head (leans forward from the hips)
        charCtx.save();
        charCtx.translate(hx, hy); charCtx.rotate(lean); charCtx.translate(-hx, -hy);

        // hi-vis vest / jacket
        const gv = charCtx.createLinearGradient(-0.12, 0, 0.12, 0);
        gv.addColorStop(0, '#e2761a'); gv.addColorStop(0.55, '#fb9a30'); gv.addColorStop(1, '#ffae4a');
        charCtx.fillStyle = gv; charCtx.strokeStyle = EDGE; charCtx.lineWidth = 0.014;
        rr(charCtx, -0.118, hy - 0.31 + breathe, female ? 0.22 : 0.24, 0.34, 0.06); charCtx.fill(); charCtx.stroke();
        // reflective bands
        charCtx.fillStyle = '#d3d6db';
        charCtx.fillRect(-0.117, hy - 0.115, 0.238, 0.034);
        charCtx.fillRect(-0.117, hy - 0.215, 0.238, 0.026);
        // zip
        charCtx.strokeStyle = '#ffd24d'; charCtx.lineWidth = 0.012;
        charCtx.beginPath(); charCtx.moveTo(0.095, hy - 0.30); charCtx.lineTo(0.095, hy - 0.03); charCtx.stroke();
        // belt + tool pouch
        charCtx.fillStyle = '#6d4426';
        charCtx.fillRect(-0.12, hy - 0.025, 0.242, 0.045);
        charCtx.fillStyle = '#8c5a30'; charCtx.strokeStyle = EDGE; charCtx.lineWidth = 0.01;
        rr(charCtx, -0.04, hy - 0.01, 0.09, 0.10, 0.02); charCtx.fill(); charCtx.stroke();
        // backpack strap
        charCtx.strokeStyle = '#3d2c26'; charCtx.lineWidth = 0.02;
        charCtx.beginPath(); charCtx.moveTo(-0.05, hy - 0.30); charCtx.lineTo(-0.07, hy - 0.04); charCtx.stroke();
        // collar
        charCtx.fillStyle = '#4a4a50';
        rr(charCtx, -0.04, hy - 0.335 + breathe, 0.12, 0.045, 0.018); charCtx.fill();
        // neck
        charCtx.fillStyle = PAL.near.skin;
        charCtx.fillRect(-0.01, hy - 0.37 + breathe, 0.07, 0.06);

        // head (stays level while the body leans), looking ahead
        charCtx.save();
        charCtx.translate(0.03, hy - 0.45 + breathe);
        charCtx.rotate(-lean * 0.75 + (moving ? Math.sin(phase * 2) * 0.012 : 0));
        charCtx.scale(1.3, 1.3);
        if (female) {   // ponytail swings behind the head
            charCtx.save();
            charCtx.translate(-0.075, 0.0);
            charCtx.rotate(0.35 + (moving ? Math.sin(phase + 0.8) * 0.28 : Math.sin(idleT * 1.5) * 0.04));
            charCtx.fillStyle = '#7a4326'; charCtx.strokeStyle = EDGE; charCtx.lineWidth = 0.01;
            charCtx.beginPath(); charCtx.ellipse(-0.012, 0.075, 0.032, 0.095, 0, 0, Math.PI * 2); charCtx.fill(); charCtx.stroke();
            charCtx.restore();
        }
        // head shape
        charCtx.fillStyle = PAL.near.skin; charCtx.strokeStyle = EDGE; charCtx.lineWidth = 0.012;
        charCtx.beginPath(); charCtx.arc(0, 0, 0.082, 0, Math.PI * 2); charCtx.fill(); charCtx.stroke();
        // nose + ear
        charCtx.beginPath(); charCtx.arc(0.083, 0.008, 0.019, 0, Math.PI * 2); charCtx.fill(); charCtx.stroke();
        charCtx.fillStyle = '#e29a74';
        charCtx.beginPath(); charCtx.arc(-0.025, 0.012, 0.02, 0, Math.PI * 2); charCtx.fill();
        // hair at the back
        charCtx.fillStyle = female ? '#7a4326' : '#4a2c1c';
        charCtx.beginPath(); charCtx.arc(0, 0, 0.082, Math.PI * 0.55, Math.PI * 1.05); charCtx.lineTo(-0.02, 0.0); charCtx.closePath(); charCtx.fill();
        // eye + brow + smile
        charCtx.fillStyle = '#fff'; charCtx.beginPath(); charCtx.ellipse(0.045, -0.006, 0.017, 0.022, 0, 0, Math.PI * 2); charCtx.fill();
        charCtx.fillStyle = '#2b2018'; charCtx.beginPath(); charCtx.arc(0.052, -0.004, 0.011, 0, Math.PI * 2); charCtx.fill();
        charCtx.strokeStyle = '#3a2418'; charCtx.lineWidth = 0.011;
        charCtx.beginPath(); charCtx.moveTo(0.028, -0.036); charCtx.lineTo(0.068, -0.03); charCtx.stroke();
        charCtx.lineWidth = 0.009;
        charCtx.beginPath(); charCtx.arc(0.05, 0.03, 0.022, 0.2, 1.2); charCtx.stroke();
        // hard hat
        const gh = charCtx.createLinearGradient(0, -0.12, 0, -0.02);
        gh.addColorStop(0, '#ffd83a'); gh.addColorStop(1, '#f0b400');
        charCtx.fillStyle = gh; charCtx.strokeStyle = EDGE; charCtx.lineWidth = 0.014;
        charCtx.beginPath(); charCtx.arc(0.0, -0.02, 0.098, Math.PI, Math.PI * 2); charCtx.closePath(); charCtx.fill(); charCtx.stroke();
        rr(charCtx, -0.1, -0.03, 0.26, 0.026, 0.012); charCtx.fill(); charCtx.stroke();   // brim points forward
        charCtx.strokeStyle = 'rgba(255,255,255,.55)'; charCtx.lineWidth = 0.012;
        charCtx.beginPath(); charCtx.arc(0.0, -0.02, 0.07, Math.PI * 1.15, Math.PI * 1.55); charCtx.stroke();
        charCtx.restore();   // head

        charCtx.restore();   // torso

        // near leg and near arm in front of the body
        drawLeg(charCtx, hx, hy, nearP, PAL.near);
        charCtx.save(); charCtx.translate(hx, hy); charCtx.rotate(lean); charCtx.translate(-hx, -hy);
        drawArm(charCtx, shX + 0.01, shY, nearArmAng, armFlex(nearArmAng), PAL.near);
        charCtx.restore();

        charCtx.restore();
    }

    /* ---------------------------------------------------
       INPUT
       --------------------------------------------------- */
    function press(k, down) {
        if (k === 'e') {
            if (down && running && !panelOpen) inspect();
            return;
        }
        keys[k] = down;
    }

    function onKeyDown(ev) {
        if (!running) return;
        const tag = (ev.target && ev.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') { keys.left = true; ev.preventDefault(); }
        else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') { keys.right = true; ev.preventDefault(); }
        else if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') keys.shift = true;
        else if (ev.code === 'KeyE' && !ev.repeat) { if (!panelOpen) inspect(); }
        else if (ev.code === 'KeyV' && !ev.repeat) { if (!panelOpen && api.onView360) api.onView360(); }
    }
    function onKeyUp(ev) {
        if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') keys.left = false;
        else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') keys.right = false;
        else if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') keys.shift = false;
    }

    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove('visible'); }, 1800);
    }

    function nearestHazard() {
        let best = null, bd = 1e9;
        hazards.forEach(function (h) {
            const z = ZONES[h.zone];
            const reach = z.hw * zoneW[h.zone] + H * 0.05;
            const d = Math.abs(px - h.x);
            if (d <= reach && d < bd) { best = h; bd = d; }
        });
        return best;
    }

    // E key: inspect. Hazards are never highlighted: you have to find them.
    function inspect() {
        const h = nearestHazard();
        if (!h) { showToast('Nothing unusual here.'); return; }
        if (h.done) { showToast('You already dealt with this one.'); return; }
        panelOpen = true;
        keys = {};
        if (typeof api.onInspect === 'function') api.onInspect(h.type);
        else panelOpen = false;
    }

    /* ---------------------------------------------------
       GAME LOOP
       --------------------------------------------------- */
    function tick(now) {
        if (!running) return;
        raf = requestAnimationFrame(tick);
        const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
        last = now;
        idleT += dt;

        const keyDir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        let dir = keyDir, ease = 1;
        if (keyDir) { goal = null; autoInspect = false; }
        else if (goal !== null && !panelOpen) {
            const d = goal - px;
            if (Math.abs(d) < H * 0.012) {
                goal = null;
                if (autoInspect) { autoInspect = false; inspect(); }
            } else { dir = d > 0 ? 1 : -1; ease = clamp(Math.abs(d) / (H * 0.12) + 0.2, 0.2, 1); }
        }
        const sc = scaleAt(py);
        const target = (!panelOpen && dir) ? dir * H * (keys.shift ? RUN : WALK) * (0.55 + 0.45 * sc) * ease : 0;
        vx += (target - vx) * Math.min(1, dt * 10);
        if (Math.abs(vx) < 1) vx = 0;
        if (vx !== 0) {
            facing = vx > 0 ? 1 : -1;
            px += vx * dt;
            // one step = the distance a leg really covers, so the feet never slide
            const Aeff = 0.40 + 0.22 * clamp(Math.abs(vx) / (H * RUN), 0, 1);
            const halfStride = 2 * 0.47 * Math.sin(Aeff) * H * CHAR_H * sc;
            phase += Math.abs(vx) * dt * Math.PI / halfStride;
            if (!firstMove) { firstMove = true; hint.classList.add('fade'); }
        } else if (!panelOpen) {
            // standing still: look at the nearest hazard that is still open
            let near = null, nd = 1e9;
            hazards.forEach(function (h) {
                if (h.done) return;
                const d = Math.abs(h.x - px);
                if (d < nd && d < H * 1.3) { nd = d; near = h; }
            });
            if (near && Math.abs(near.x - px) > H * 0.02) facing = near.x > px ? 1 : -1;
        }
        faceAnim += (facing - faceAnim) * Math.min(1, dt * 9);
        if (Math.abs(facing - faceAnim) < 0.01) faceAnim = facing;

        const margin = H * CHAR_H * 0.25;
        px = clamp(px, margin, worldW - margin);

        // walk INTO the picture: as he nears an open hazard he steps up the floor
        // towards it (and gets smaller with distance), then stops in front of it
        let gy = FEET_Y, bd = 1e9, bz = null;
        hazards.forEach(function (h) { if (h.done) return; const d = Math.abs(px - h.sx); if (d < bd) { bd = d; bz = h; } });
        if (bz) {
            const w = clamp(1 - bd / (H * 1.1), 0, 1), sm = w * w * (3 - 2 * w);
            gy = FEET_Y + (ZONES[bz.zone].sy - FEET_Y) * sm;
        }
        py += (gy - py) * Math.min(1, dt * 4);

        // camera: keep the hazard AHEAD of him in view
        const want = px - VW * (0.5 - 0.15 * faceAnim);
        camX += (clamp(want, 0, Math.max(0, worldW - VW)) - camX) * Math.min(1, dt * 6);
        world.style.transform = 'translate3d(' + (-camX).toFixed(1) + 'px,0,0)';

        const cwid = parseFloat(charCv.dataset.cwid), chei = parseFloat(charCv.dataset.chei), chb = parseFloat(charCv.dataset.ch);
        const sc2 = scaleAt(py);
        charCv.style.transform = 'translate3d(' + (px - cwid / 2).toFixed(1) + 'px,' + (py * H - (chei - chb * 0.07)).toFixed(1) + 'px,0) scale(' + sc2.toFixed(3) + ')';
        drawCharacter(now / 1000);

        // which zone are we in (for the LOCATION box)
        let zi = 0;
        for (let i = 0; i < ZONES.length; i++) { if (px >= zoneLeft[i] + zoneW[i] * OVERLAP * 0.5) zi = i; }
        if (zi !== currentZone) {
            currentZone = zi;
            const el = document.getElementById('scene-display');
            if (el) el.textContent = 'ZONE ' + (zi + 1) + ' · ' + ZONES[zi].name;
        }
    }

    /* ---------------------------------------------------
       CONES AND TAPE when the employee secures an area
       --------------------------------------------------- */
    function addCones(h) {
        const el = document.createElement('div');
        el.className = 'hz2d-cones';
        el.innerHTML =
            '<svg viewBox="0 0 260 100" preserveAspectRatio="xMidYMax meet">' +
            '<defs><linearGradient id="hzc" x1="0" x2="1"><stop offset="0" stop-color="#ff9a2e"/><stop offset="1" stop-color="#e86a00"/></linearGradient></defs>' +
            '<g>' +
            '<line x1="40" y1="62" x2="220" y2="62" stroke="#f5c400" stroke-width="7"/>' +
            '<line x1="40" y1="62" x2="220" y2="62" stroke="#111" stroke-width="7" stroke-dasharray="12 12"/>' +
            '<ellipse cx="40" cy="96" rx="22" ry="5" fill="rgba(0,0,0,.4)"/>' +
            '<polygon points="40,30 28,92 52,92" fill="url(#hzc)"/><rect x="22" y="90" width="36" height="7" rx="2" fill="#222"/>' +
            '<rect x="33" y="52" width="14" height="7" fill="#fff"/>' +
            '<ellipse cx="220" cy="96" rx="22" ry="5" fill="rgba(0,0,0,.4)"/>' +
            '<polygon points="220,30 208,92 232,92" fill="url(#hzc)"/><rect x="202" y="90" width="36" height="7" rx="2" fill="#222"/>' +
            '<rect x="213" y="52" width="14" height="7" fill="#fff"/>' +
            '</g></svg>';
        world.appendChild(el);
        h.coneEl = el;
        positionHazard(h);
    }

    /* ---------------------------------------------------
       PUBLIC INTERFACE (same names the old 3D engine used)
       --------------------------------------------------- */
    const api = {
        onInspect: null,
        onView360: null,
        panoYaw: 0,

        async start(opts) {
            try {
                opts = opts || {};
                gender = opts.gender === 'female' ? 'female' : 'male';
                if (!built) built = build();
                if (!built) return false;
                loadingEl.classList.add('visible');

                // load photos once
                if (!imgs.length) {
                    const loaded = await Promise.all(ZONES.map(function (z) { return loadImage(z.img); }));
                    world.innerHTML = '';
                    loaded.forEach(function (im, i) {
                        const el = document.createElement('img');
                        el.className = 'hz2d-bg' + (i > 0 ? ' blend' : '');
                        el.draggable = false;
                        el.alt = '';
                        if (im) el.src = im.src;
                        world.appendChild(el);
                        imgs.push({ el: el, img: im });
                    });
                    world.appendChild(charCv);
                }

                // reset
                hazards.forEach(function (h) { if (h.coneEl) h.coneEl.remove(); });
                hazards = ZONES.map(function (z, i) { return { type: z.type, zone: i, done: false, x: 0, sx: 0, coneEl: null }; });
                py = FEET_Y; goal = null; autoInspect = false; if (promptEl) promptEl.classList.remove('visible');
                keys = {}; vx = 0; phase = 0; facing = 1; faceAnim = 1; firstMove = false; panelOpen = false; currentZone = -1;
                hint.classList.remove('fade');
                const instruction = document.getElementById('instruction');
                if (instruction) instruction.textContent = '← → or A / D to walk · Shift to run · E to inspect';

                layout();
                px = zoneLeft[0] + zoneW[0] * 0.06;
                camX = 0;
                loadingEl.classList.remove('visible');

                running = true;
                last = performance.now();
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(tick);
                return true;
            } catch (err) {
                console.error('2D warehouse failed to start:', err);
                if (loadingEl) loadingEl.classList.remove('visible');
                return false;
            }
        },

        // Gives the 360 viewer the photo of the zone the employee is standing in.
        // Every zone photo is a full 360 x 180 degree panorama, so it is shown as-is
        // (no stretching). The view opens already turned towards the hazard.
        capture360() {
            panelOpen = true;
            keys = {}; goal = null;
            const z = clamp(currentZone, 0, ZONES.length - 1);
            api.panoYaw = Math.round((ZONES[z].hx - 0.5) * 360);
            return ZONES[z].img;
        },

        resume() {
            if (!running) return;
            panelOpen = false;
        },

        resolveHazard(type, decision) {
            const h = hazards.find(function (x) { return x.type === type; });
            if (!h) return;
            h.done = true;
            if (decision === 'safe') addCones(h);
        },

        remaining() { return hazards.filter(function (h) { return !h.done; }).length; },
        total() { return ZONES.length; },

        debug() {
            return { px: px, worldW: worldW, hazards: hazards.map(function (h) { return { type: h.type, x: h.x, done: h.done }; }) };
        },
        _teleport(x) { px = x; camX = clamp(x - VW * 0.45, 0, Math.max(0, worldW - VW)); },

        stop() {
            running = false;
            if (promptEl) promptEl.classList.remove('visible');
            panelOpen = false;
            cancelAnimationFrame(raf);
            keys = {};
            if (loadingEl) loadingEl.classList.remove('visible');
        }
    };

    window.HazardZero3D = api;
    window.HazardZero2D = api;
    window.dispatchEvent(new Event('hazardzero3d-ready'));
})();
