/* =========================================================
   HAZARD ZERO — 3D WAREHOUSE ENGINE (warehouse3d.js)
   =========================================================
   This file replaces the old 360° panorama viewer with a real
   3D warehouse built in Three.js. It only handles the 3D world
   (scene, player, camera, hazards, interaction). Login, score,
   risk, timer and the admin dashboard are still handled by
   script.js, and the two files talk to each other through
   window.HazardZero3D (see the bottom of this file).
   ========================================================= */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';


/* =========================================================
   TUNING VALUES
   Everything that affects the "feel" lives here, so the look
   of the game can be adjusted without hunting through the code.
   ========================================================= */
const TUNING = {
    exposure: 1.1,        // overall brightness of the final image
    hemiLight: 0.95,      // soft fill light from ceiling/floor bounce
    envLight: 0.6,       // strength of reflections/ambient from the environment map
    skyLight: 2.4,        // directional light coming through the roof skylights
    lampPower: 260,       // brightness of each overhead LED light
    walkSpeed: 2.3,       // metres per second when walking
    runSpeed: 4.4,        // metres per second when holding Shift
    camDistance: 3.6,     // default distance of the camera behind the employee
    camMin: 2.0,          // closest zoom
    camMax: 6.0,          // furthest zoom
    mouseSensitivity: 0.0022,
    inspectRadius: 3.6    // how close the player must be to inspect a hazard
};

// Size of the building (metres). The floor is centred on 0,0.
const HALF_W = 17;          // half of the building width  (34 m wide)
const HALF_L = 22;          // half of the building length (44 m long)
const WALL_H = 9;


/* =========================================================
   SMALL HELPERS
   ========================================================= */

// A seeded random generator, so the warehouse looks the same every time
// it is built (clutter does not jump around between attempts).
let seed = 20240611;
function rand() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + rand() * (b - a);       // random number in a range
const pick = (list) => list[Math.floor(rand() * list.length)];

// Draws onto a canvas and turns the result into a repeating texture.
// All surface textures in this project are generated like this, so the
// project does not need any large image files.
function canvasTex(w, h, draw, repX = 1, repY = 1, srgb = true) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repX, repY);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// Adds a plain box mesh to a parent. Used for most man-made objects.
function box(parent, w, h, d, mat, x, y, z, cast = false) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

// Adds a cylinder mesh (drums, pipes, extinguishers, wheels).
function cyl(parent, rTop, rBot, h, mat, x, y, z, seg = 24, cast = false) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}


/* =========================================================
   PROCEDURAL TEXTURES
   ========================================================= */

// Worn concrete floor: blotches, speckle, cracks and expansion joints.
function concreteTexture() {
    return canvasTex(1024, 1024, (g, w, h) => {
        g.fillStyle = '#9a9c9e';
        g.fillRect(0, 0, w, h);

        // large soft light/dark patches, like uneven curing and wear
        for (let i = 0; i < 80; i++) {
            const x = rand() * w, y = rand() * h, r = 40 + rand() * 170;
            const gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, rand() < 0.5 ? 'rgba(35,35,38,0.17)' : 'rgba(180,180,182,0.14)');
            gr.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = gr;
            g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // fine grain
        for (let i = 0; i < 70000; i++) {
            const v = 85 + rand() * 80 | 0;
            g.fillStyle = `rgba(${v},${v},${v + 3},0.28)`;
            g.fillRect(rand() * w, rand() * h, 1 + rand() * 1.6, 1 + rand() * 1.6);
        }
        // hairline cracks
        g.strokeStyle = 'rgba(28,28,30,0.55)';
        g.lineWidth = 1.2;
        for (let c = 0; c < 8; c++) {
            let x = rand() * w, y = rand() * h;
            g.beginPath();
            g.moveTo(x, y);
            for (let s = 0; s < 45; s++) {
                x += (rand() - 0.5) * 22;
                y += rand() * 14 - 3;
                g.lineTo(x, y);
            }
            g.stroke();
        }
        // joints between the large floor slabs (one slab = one repeat of this texture)
        g.strokeStyle = 'rgba(40,40,44,0.55)';
        g.lineWidth = 3;
        g.strokeRect(0, 0, w, h);
    }, HALF_W * 2 / 4, HALF_L * 2 / 4);
}

// Roughness map for the floor: shiny tyre-polished lanes, dull elsewhere.
function floorRoughnessTexture() {
    return canvasTex(512, 512, (g, w, h) => {
        g.fillStyle = 'rgb(205,205,205)';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 50; i++) {
            const x = rand() * w;
            g.fillStyle = `rgba(${110 + rand() * 40 | 0},0,0,0)`;
            const grey = 120 + rand() * 60 | 0;
            g.fillStyle = `rgba(${grey},${grey},${grey},0.35)`;
            g.fillRect(x, 0, 8 + rand() * 22, h);
        }
        for (let i = 0; i < 4000; i++) {
            const v = 150 + rand() * 90 | 0;
            g.fillStyle = `rgba(${v},${v},${v},0.3)`;
            g.fillRect(rand() * w, rand() * h, 2, 2);
        }
    }, HALF_W * 2 / 8, HALF_L * 2 / 8, false);
}

// Corrugated metal cladding: vertical ribs, grime at the bottom, rust streaks.
function corrugatedTexture() {
    return canvasTex(512, 512, (g, w, h) => {
        g.fillStyle = '#8d9397';
        g.fillRect(0, 0, w, h);
        const ribs = 16;
        for (let i = 0; i < ribs; i++) {
            const x0 = (i / ribs) * w, rw = w / ribs;
            const gr = g.createLinearGradient(x0, 0, x0 + rw, 0);
            gr.addColorStop(0, 'rgba(0,0,0,0.30)');
            gr.addColorStop(0.5, 'rgba(255,255,255,0.20)');
            gr.addColorStop(1, 'rgba(0,0,0,0.30)');
            g.fillStyle = gr;
            g.fillRect(x0, 0, rw, h);
        }
        // dirt gathering toward the bottom
        const dirt = g.createLinearGradient(0, h * 0.55, 0, h);
        dirt.addColorStop(0, 'rgba(40,36,30,0)');
        dirt.addColorStop(1, 'rgba(40,36,30,0.45)');
        g.fillStyle = dirt;
        g.fillRect(0, 0, w, h);
        // rust streaks running down from fixings
        for (let i = 0; i < 22; i++) {
            const x = rand() * w, y = rand() * h * 0.7, len = 40 + rand() * 160;
            const gr = g.createLinearGradient(0, y, 0, y + len);
            gr.addColorStop(0, 'rgba(120,64,30,0.30)');
            gr.addColorStop(1, 'rgba(120,64,30,0)');
            g.fillStyle = gr;
            g.fillRect(x, y, 2 + rand() * 4, len);
        }
        for (let i = 0; i < 9000; i++) {
            const v = 100 + rand() * 90 | 0;
            g.fillStyle = `rgba(${v},${v},${v},0.12)`;
            g.fillRect(rand() * w, rand() * h, 1.5, 1.5);
        }
    }, 12, 1);
}

// Grey concrete block wall used for the lower part of the walls.
function blockWallTexture() {
    return canvasTex(512, 256, (g, w, h) => {
        g.fillStyle = '#5d5f60';
        g.fillRect(0, 0, w, h);
        const bw = 128, bh = 64;
        for (let row = 0; row < h / bh; row++) {
            for (let col = -1; col < w / bw + 1; col++) {
                const off = (row % 2) * bw / 2;
                const v = 105 + rand() * 45 | 0;
                g.fillStyle = `rgb(${v},${v + 2},${v + 3})`;
                g.fillRect(col * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
            }
        }
        for (let i = 0; i < 12000; i++) {
            const v = 70 + rand() * 100 | 0;
            g.fillStyle = `rgba(${v},${v},${v},0.25)`;
            g.fillRect(rand() * w, rand() * h, 1.5, 1.5);
        }
    }, 40, 3);
}

// Cardboard carton face with tape strip, shipping label and arrows.
function cartonTexture() {
    return canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#c48f68';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 5000; i++) {
            const v = rand() < 0.5 ? 0 : 255;
            g.fillStyle = `rgba(${v},${v},${v},0.05)`;
            g.fillRect(rand() * w, rand() * h, 2, 1);
        }
        g.fillStyle = 'rgba(150,110,60,0.55)';       // packing tape
        g.fillRect(w * 0.44, 0, w * 0.12, h);
        g.fillStyle = '#f2f0ea';                       // shipping label
        g.fillRect(w * 0.12, h * 0.58, w * 0.3, h * 0.24);
        g.fillStyle = '#222';
        for (let i = 0; i < 5; i++) g.fillRect(w * 0.15, h * (0.61 + i * 0.035), w * (0.12 + rand() * 0.13), 3);
        g.fillStyle = '#5a4630';
        g.font = 'bold 22px Arial';
        g.fillText('\u2191\u2191', w * 0.68, h * 0.88);
        g.strokeStyle = 'rgba(60,40,20,0.6)';
        g.lineWidth = 3;
        g.strokeRect(1.5, 1.5, w - 3, h - 3);
    });
}

// Wooden pallet boards with grain.
function woodTexture() {
    return canvasTex(256, 128, (g, w, h) => {
        g.fillStyle = '#a9865a';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 90; i++) {
            const y = rand() * h;
            g.strokeStyle = `rgba(${70 + rand() * 40 | 0},${45 + rand() * 30 | 0},20,0.35)`;
            g.lineWidth = 0.6 + rand() * 1.4;
            g.beginPath();
            g.moveTo(0, y);
            g.bezierCurveTo(w * 0.3, y + rr(-4, 4), w * 0.6, y + rr(-4, 4), w, y + rr(-3, 3));
            g.stroke();
        }
    });
}

// Fabric noise, used as a bump map so clothes are not perfectly smooth.
function fabricBump() {
    return canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#808080';
        g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 2) {
            for (let x = 0; x < w; x += 2) {
                const v = 100 + rand() * 60 | 0;
                g.fillStyle = `rgb(${v},${v},${v})`;
                g.fillRect(x, y, 2, 2);
            }
        }
    }, 6, 6, false);
}

// Faded, chipped paint for floor markings.
function wornPaintTexture(hex) {
    return canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = hex;
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 1400; i++) {
            g.fillStyle = `rgba(0,0,0,${rand() * 0.6})`;
            g.fillRect(rand() * w, rand() * h, 1 + rand() * 5, 1 + rand() * 3);
        }
        g.globalCompositeOperation = 'source-over';
    });
}

// Safety sign texture (exit, fire, PPE, warnings...).
function signTexture(text, bg, fg, symbol) {
    return canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = fg;
        g.lineWidth = 8;
        g.strokeRect(10, 10, w - 20, h - 20);
        g.fillStyle = fg;
        g.textAlign = 'center';
        g.font = 'bold 110px Arial';
        g.fillText(symbol, w / 2, 130);
        g.font = 'bold 30px Arial';
        const words = text.split(' ');
        words.forEach((wd, i) => g.fillText(wd, w / 2, 178 + i * 34));
    });
}

// Hazard-diamond / label for drums.
function drumLabelTexture(title, colour) {
    return canvasTex(256, 128, (g, w, h) => {
        g.fillStyle = '#efece4';
        g.fillRect(0, 0, w, h);
        g.fillStyle = colour;
        g.save();
        g.translate(64, 64);
        g.rotate(Math.PI / 4);
        g.fillRect(-36, -36, 72, 72);
        g.restore();
        g.fillStyle = '#fff';
        g.font = 'bold 44px Arial';
        g.textAlign = 'center';
        g.fillText('!', 64, 80);
        g.fillStyle = '#111';
        g.font = 'bold 26px Arial';
        g.textAlign = 'left';
        g.fillText(title, 118, 52);
        g.font = '15px Arial';
        g.fillText('Keep away from heat', 118, 78);
        g.fillText('Handle with care', 118, 98);
    });
}


/* =========================================================
   MATERIALS
   Physically based materials shared by the whole scene.
   ========================================================= */
let M = null;          // filled in by createMaterials()
function createMaterials() {
    const conc = concreteTexture();
    const cart = cartonTexture();
    const wood = woodTexture();
    const corr = corrugatedTexture();
    const bump = fabricBump();

    M = {
        floor: new THREE.MeshStandardMaterial({
            map: conc, bumpMap: conc, bumpScale: 1.4,
            roughnessMap: floorRoughnessTexture(), roughness: 1, metalness: 0
        }),
        corrugated: new THREE.MeshStandardMaterial({
            map: corr, bumpMap: corr, bumpScale: 2.5, roughness: 0.55, metalness: 0.65
        }),
        block: new THREE.MeshStandardMaterial({ map: blockWallTexture(), roughness: 0.95 }),
        carton: new THREE.MeshStandardMaterial({ map: cart, roughness: 0.92 }),
        wrap: new THREE.MeshStandardMaterial({
            color: 0xffffff, transparent: true, opacity: 0.28, roughness: 0.18, metalness: 0
        }),
        wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.88 }),
        rackBlue: new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.6 }),   // dark steel frames
        rackOrange: new THREE.MeshStandardMaterial({ color: 0xe5871c, roughness: 0.45, metalness: 0.4 }),
        steel: new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.5, metalness: 0.85 }),
        darkSteel: new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.55, metalness: 0.8 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x7d6852, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide }),
        rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }),
        yellowPaint: new THREE.MeshStandardMaterial({ color: 0xd8a800, roughness: 0.5, metalness: 0.25 }),
        redPaint: new THREE.MeshStandardMaterial({ color: 0xa3140f, roughness: 0.4, metalness: 0.3 }),
        white: new THREE.MeshStandardMaterial({ color: 0xdedbd2, roughness: 0.6 }),
        ledOn: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dc, emissiveIntensity: 2.2 }),
        skylight: new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: 0xcfe2ff, emissiveIntensity: 1.5, transparent: true, opacity: 0.9
        }),
        cabinet: new THREE.MeshStandardMaterial({ color: 0x8b9094, roughness: 0.45, metalness: 0.6 }),
        // clothing and skin for the people
        skin: new THREE.MeshStandardMaterial({ color: 0xc99a7a, roughness: 0.62 }),
        skinFemale: new THREE.MeshStandardMaterial({ color: 0xd4a888, roughness: 0.6 }),
        fabricBump: bump
    };
}


/* =========================================================
   INSTANCED BATCHES
   Racks contain thousands of boxes and pallets. Drawing each
   as its own mesh would be slow, so identical objects share
   one geometry and are drawn with a single instanced call.
   ========================================================= */
class Batch {
    constructor(geo, mat, cap, cast = false) {
        this.mesh = new THREE.InstancedMesh(geo, mat, cap);
        this.mesh.castShadow = cast;
        this.mesh.receiveShadow = true;
        this.mesh.frustumCulled = false;
        this.n = 0;
        this.cap = cap;
        this.c = new THREE.Color();
        this.m = new THREE.Matrix4();
        this.q = new THREE.Quaternion();
        this.e = new THREE.Euler();
        this.p = new THREE.Vector3();
        this.s = new THREE.Vector3();
    }
    // x,y,z = centre; sx,sy,sz = size; ry = rotation about the vertical axis
    add(x, y, z, sx, sy, sz, ry = 0, color = 0xffffff, rz = 0, rx = 0) {
        if (this.n >= this.cap) return;
        this.e.set(rx, ry, rz);
        this.q.setFromEuler(this.e);
        this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz));
        this.mesh.setMatrixAt(this.n, this.m);
        this.mesh.setColorAt(this.n, this.c.set(color));
        this.n++;
    }
    done() {
        this.mesh.count = this.n;
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
}


/* =========================================================
   ENGINE STATE
   ========================================================= */
let renderer, scene, camera, container, clock;
let built = false;          // the world is only built once, then reused
let running = false;        // is the render loop active?
let paused = true;          // true while a panel is open or ESC was pressed

// 2D blocking boxes used for player collision (top-down view).
const colliders = [];
function addCollider(cx, cz, w, d, h = 2.5) {
    colliders.push({
        minX: cx - w / 2, maxX: cx + w / 2,
        minZ: cz - d / 2, maxZ: cz + d / 2, h
    });
}

// Every hazard in the warehouse lives in this list.
const hazards = [];
// Moving effects (sparks, smoke, flickering lights) are updated every frame.
const fx = { sparks: null, sparkLight: null, smoke: [], flicker: [], flames: null, fireBase: null, fireLight: null, embers: null };

// A diagonal yellow/black hazard stripe texture (columns, floor edges).
function hatchTexture() {
    return canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#d4a300';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#1b1b1b';
        for (let i = -h; i < w + h; i += 32) {
            g.beginPath();
            g.moveTo(i, h);
            g.lineTo(i + 16, h);
            g.lineTo(i + h + 16, 0);
            g.lineTo(i + h, 0);
            g.closePath();
            g.fill();
        }
    }, 1, 1);
}

// Amber chevron markings painted on the floor in front of the loading doors.
function chevronTexture() {
    return canvasTex(128, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#d9a550';
        for (let i = 0; i < 5; i++) {
            const y = 20 + i * 46;
            g.beginPath();
            g.moveTo(8, y + 30); g.lineTo(w / 2, y); g.lineTo(w - 8, y + 30);
            g.lineTo(w - 8, y + 48); g.lineTo(w / 2, y + 18); g.lineTo(8, y + 48);
            g.closePath(); g.fill();
        }
        g.globalCompositeOperation = 'destination-out';          // worn paint
        for (let i = 0; i < 900; i++) {
            g.fillStyle = `rgba(0,0,0,${rand() * 0.5})`;
            g.fillRect(rand() * w, rand() * h, 1 + rand() * 4, 1 + rand() * 3);
        }
        g.globalCompositeOperation = 'source-over';
    });
}

// Roller-shutter door with a number plate on the back wall.
function makeBackDoor(x, num) {
    const tex = canvasTex(64, 256, (g, w, h) => {
        g.fillStyle = '#b9bec3'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, y + 2, w, 2); }
    }, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.7 });
    const z = -HALF_L + 0.08;
    box(scene, 3.4, 3.8, 0.08, mat, x, 1.9, z);
    box(scene, 3.7, 0.25, 0.2, M.darkSteel, x, 3.9, z + 0.05);
    for (const sx of [-1.75, 1.75]) box(scene, 0.2, 3.9, 0.2, M.darkSteel, x + sx, 1.95, z + 0.05);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36), new THREE.MeshStandardMaterial({
        map: canvasTex(128, 64, (g, w, h) => {
            g.fillStyle = '#eceae4'; g.fillRect(0, 0, w, h);
            g.fillStyle = '#222'; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.fillText(num, w / 2, 48);
        }), roughness: 0.6 }));
    plate.position.set(x, 4.5, z + 0.08);
    scene.add(plate);
    for (const sx of [-2.2, 2.2]) {                              // yellow bollards beside the door
        cyl(scene, 0.11, 0.11, 1.1, M.yellowPaint, x + sx, 0.55, z + 1.2, 16, true);
        addCollider(x + sx, z + 1.2, 0.25, 0.25, 1.1);
    }
}

// A beam/strut between two points in the X-Y plane (used for the roof trusses).
function strut(parent, x1, y1, x2, y2, z, thick, mat) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, thick, thick), mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, z);
    m.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    parent.add(m);
    return m;
}

// Flat decal on the floor: painted lines, hatch zones, etc.
function floorDecal(x, z, w, d, mat, ry = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = ry;
    m.position.set(x, 0.006, z);
    m.receiveShadow = true;
    scene.add(m);
}


/* =========================================================
   BUILDING SHELL: FLOOR, WALLS, ROOF, LIGHTING
   ========================================================= */
function buildShell() {
    // ---- floor ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2), M.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // ---- walls: concrete block at the bottom, corrugated metal above ----
    const LOW = 2.6, T = 0.3;
    const wallDefs = [
        { x: 0, z: -HALF_L - T / 2, w: HALF_W * 2 + 2 * T, d: T },
        { x: 0, z: HALF_L + T / 2, w: HALF_W * 2 + 2 * T, d: T },
        { x: -HALF_W - T / 2, z: 0, w: T, d: HALF_L * 2 },
        { x: HALF_W + T / 2, z: 0, w: T, d: HALF_L * 2 }
    ];
    wallDefs.forEach(wd => {
        box(scene, wd.w, LOW, wd.d, M.block, wd.x, LOW / 2, wd.z);
        box(scene, wd.w, WALL_H - LOW, wd.d, M.corrugated, wd.x, LOW + (WALL_H - LOW) / 2, wd.z);
    });

    // ---- steel columns along both side walls, with hazard-striped bases ----
    const hatch = new THREE.MeshStandardMaterial({ map: hatchTexture(), roughness: 0.6 });
    for (const sx of [-1, 1]) {
        for (let z = -18; z <= 18; z += 12) {
            const cx = sx * (HALF_W - 0.25);
            box(scene, 0.45, WALL_H, 0.45, M.steel, cx, WALL_H / 2, z, false);
            box(scene, 0.48, 1.1, 0.48, hatch, cx, 0.55, z);
            addCollider(cx, z, 0.5, 0.5, WALL_H);
        }
    }

    // ---- roof: two sloped panels meeting at a ridge ----
    const rise = 2.2, run = HALF_W;
    const slope = Math.atan2(rise, run);
    const panelLen = Math.hypot(run, rise);
    const roofY = (x) => WALL_H + rise * (1 - Math.abs(x) / run);   // roof height at x
    for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(panelLen, 0.12, HALF_L * 2 + 1), M.roof);
        p.position.set(s * run / 2, WALL_H + rise / 2 + 0.05, 0);
        p.rotation.z = -s * slope;
        scene.add(p);
        // a wide glazed skylight on each roof slope (as in the reference photo),
        // divided into panes by a grid of thin dark frames
        const glass = new THREE.Group();
        glass.position.set(s * 5.6, roofY(5.6) - 0.13, 0);
        glass.rotation.z = -s * slope;
        const gl = 9.6, gz = HALF_L * 2 - 6;
        glass.add(new THREE.Mesh(new THREE.BoxGeometry(gl, 0.04, gz), M.skylight));
        for (let a = -gl / 2; a <= gl / 2 + 0.01; a += gl / 8) box(glass, 0.07, 0.07, gz, M.darkSteel, a, -0.03, 0);
        for (let z = -gz / 2; z <= gz / 2 + 0.01; z += 2) box(glass, gl, 0.07, 0.06, M.darkSteel, 0, -0.03, z);
        scene.add(glass);
    }

    // ---- roof trusses and purlins ----
    for (let z = -20; z <= 20; z += 8) {
        const chordY = WALL_H - 0.6;
        box(scene, HALF_W * 2, 0.25, 0.18, M.darkSteel, 0, chordY, z);
        strut(scene, -HALF_W, WALL_H - 0.3, 0, roofY(0) - 0.2, z, 0.2, M.darkSteel);
        strut(scene, HALF_W, WALL_H - 0.3, 0, roofY(0) - 0.2, z, 0.2, M.darkSteel);
        for (const x of [-12, -6, 6, 12]) {
            strut(scene, x, chordY, x, roofY(x) - 0.25, z, 0.12, M.steel);
        }
        for (const sgn of [-1, 1]) {
            strut(scene, sgn * 12, chordY, sgn * 6, roofY(6) - 0.25, z, 0.1, M.steel);
            strut(scene, sgn * 6, chordY, 0, roofY(0) - 0.25, z, 0.1, M.steel);
        }
    }
    for (let x = -16; x <= 16; x += 4) {
        box(scene, 0.12, 0.2, HALF_L * 2, M.steel, x, roofY(x) - 0.3, 0);
    }

    // ---- pipes and conduits running along the walls ----
    const pipeGrey = new THREE.MeshStandardMaterial({ color: 0x7c8388, roughness: 0.5, metalness: 0.7 });
    const pipeRed = new THREE.MeshStandardMaterial({ color: 0xa01c14, roughness: 0.45, metalness: 0.5 });
    const pipeBlue = new THREE.MeshStandardMaterial({ color: 0x2d5f9a, roughness: 0.45, metalness: 0.5 });
    for (const sx of [-1, 1]) {
        const x = sx * (HALF_W - 0.4);
        [[5.8, 0.06, pipeGrey], [6.3, 0.09, pipeRed], [7.0, 0.05, pipeBlue]].forEach(([y, r, mat]) => {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, HALF_L * 2 - 1, 12), mat);
            p.rotation.x = Math.PI / 2;
            p.position.set(x - sx * 0.05, y, 0);
            scene.add(p);
            for (let z = -20; z <= 20; z += 5) {           // pipe clamps
                box(scene, 0.06, r * 2 + 0.06, 0.08, M.darkSteel, x - sx * 0.05, y, z);
            }
        });
    }
    // cable tray on the back wall
    box(scene, HALF_W * 2 - 2, 0.25, 0.4, M.darkSteel, 0, 6.2, -HALF_L + 0.3);

    // ---- overhead LED high-bay lights ----
    // Each fixture is an emissive mesh; only some also carry a real light,
    // because too many dynamic lights would slow the game down.
    let lampCount = 0;
    for (const x of [-12, -6, 0, 6, 12]) {
        for (const z of [-16, -8, 0, 8, 16]) {
            const g = new THREE.Group();
            g.position.set(x, WALL_H - 1.5, z);
            cyl(g, 0.1, 0.5, 0.36, M.darkSteel, 0, 0, 0, 24);          // dome shade
            cyl(g, 0.42, 0.42, 0.02, M.ledOn, 0, -0.17, 0, 24);        // glowing underside
            box(g, 0.03, 1.1, 0.03, M.steel, 0, 0.7, 0);               // hanging rod
            scene.add(g);
            lampCount++;
            if (Math.abs(x) === 6 || (x === 0 && Math.abs(z) !== 8)) {
                const pl = new THREE.PointLight(0xfff0d8, TUNING.lampPower, 30, 1.6);
                pl.position.set(x, WALL_H - 2.0, z);
                scene.add(pl);
            }
        }
    }

    // ---- general lighting ----
    scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x4a4842, TUNING.hemiLight));

    // A single shadow-casting light acts as daylight through the skylights,
    // so racks and equipment throw believable shadows on the floor.
    const sun = new THREE.DirectionalLight(0xdbe6f5, TUNING.skyLight);
    sun.position.set(14, 36, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    scene.add(sun);
}


/* =========================================================
   PALLET RACKING
   ========================================================= */
const BAY = 2.7;                            // length of one rack bay (along Z)
const ROW_D = 1.0;                          // depth of a rack row (along X)
const LEVELS = [0.3, 2.2, 4.1, 6.0];        // heights of the beam levels
const UP_H = 7.5;                           // height of the upright frames
const CARTON_TINTS = [0xffffff, 0xf3dccb, 0xe6c6aa, 0xd9b494, 0xcfa684, 0xeed2bb];

// One EUR-style pallet (1.2 x 0.8 m) merged from boards and blocks into a
// single geometry, so a lot of pallets can be drawn with one instanced call.
function makePalletGeometry() {
    const parts = [];
    const add = (w, h, d, x, y, z) => {
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate(x, y, z);
        parts.push(g);
    };
    for (const z of [-0.327, -0.163, 0, 0.163, 0.327]) add(1.2, 0.022, 0.145, 0, 0.133, z);   // top deck
    for (const z of [-0.35, 0, 0.35]) add(1.2, 0.022, 0.1, 0, 0.011, z);                       // bottom boards
    for (const x of [-0.5, 0, 0.5]) for (const z of [-0.325, 0, 0.325]) add(0.145, 0.1, 0.145, x, 0.072, z); // blocks
    return mergeGeometries(parts);
}

let rackBatches = null;
function startRackBatches() {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    rackBatches = {
        uprights: new Batch(unit, M.rackBlue, 400, true),
        braces: new Batch(unit, M.rackBlue, 2200),
        beams: new Batch(unit, M.rackOrange, 1600, true),
        pallets: new Batch(makePalletGeometry(), M.wood, 1800, false),
        cartons: new Batch(unit, M.carton, 18000),
        wraps: new Batch(unit, M.wrap, 1800)
    };
    Object.values(rackBatches).forEach(b => scene.add(b.mesh));
}

// Fills one pallet position with cartons, shrink-wrapped goods or nothing.
function loadPallet(x, baseY, z, maxH) {
    const B = rackBatches;
    B.pallets.add(x, baseY, z, 1, 1, 1, Math.PI / 2 + rr(-0.02, 0.02), 0xffffff);
    const r = rand();
    const top = baseY + 0.144;
    if (r < 0.2) return;                                             // empty pallet
    if (r < 0.5) {                                                   // shrink-wrapped block
        const h = rr(0.7, maxH);
        B.cartons.add(x, top + h / 2, z, 0.78, h, 1.16, 0, pick(CARTON_TINTS));
        B.wraps.add(x, top + h / 2 + 0.01, z, 0.83, h + 0.03, 1.21, 0);
        return;
    }
    const layerH = rr(0.34, 0.46);                                   // stacked cartons
    const layers = Math.max(1, Math.min(Math.floor(maxH / layerH), 1 + Math.floor(rand() * 4)));
    for (let l = 0; l < layers; l++) {
        const tint = pick(CARTON_TINTS);
        for (const dx of [-0.19, 0.19]) {
            for (const dz of [-0.38, 0, 0.38]) {
                B.cartons.add(
                    x + dx + rr(-0.012, 0.012), top + layerH * (l + 0.5), z + dz + rr(-0.012, 0.012),
                    0.375, layerH - 0.01, 0.375, rr(-0.04, 0.04),
                    rand() < 0.7 ? tint : pick(CARTON_TINTS)
                );
            }
        }
    }
}

// Builds one straight row of racking, bay by bay.
// "skip" lets the hazard code replace a specific bay with a custom one.
function buildRackRow(rowX, z0, bays, skip) {
    const B = rackBatches;
    // frames (two uprights joined by diagonal bracing) at every bay boundary
    for (let i = 0; i <= bays; i++) {
        const z = z0 + i * BAY;
        for (const dx of [-ROW_D / 2, ROW_D / 2]) B.uprights.add(rowX + dx, UP_H / 2, z, 0.11, UP_H, 0.09);
        // criss-cross (X) bracing between the two uprights of each frame
        for (let k = 0; k < 6; k++) {
            const y1 = 0.4 + k * 1.2, y2 = y1 + 1.2;
            const len = Math.hypot(ROW_D, y2 - y1);
            const ang = Math.atan2(y2 - y1, ROW_D);
            B.braces.add(rowX, (y1 + y2) / 2, z, len, 0.05, 0.04, 0, 0xffffff, ang);
            B.braces.add(rowX, (y1 + y2) / 2, z, len, 0.05, 0.04, 0, 0xffffff, -ang);
        }
    }
    // beams and stored goods
    for (let i = 0; i < bays; i++) {
        const zc = z0 + i * BAY + BAY / 2;
        LEVELS.forEach((y, li) => {
            if (skip && skip(rowX, i, li)) return;
            for (const dx of [-ROW_D / 2, ROW_D / 2]) B.beams.add(rowX + dx, y, zc, 0.07, 0.14, BAY - 0.09);
            const maxH = li === 3 ? 1.1 : 1.4;
            if (rand() < (li === 0 ? 0.93 : 0.8)) {
                for (const dz of [-0.66, 0.66]) {
                    if (rand() < 0.9) loadPallet(rowX, y + 0.06, zc + dz, maxH);
                }
            }
        });
    }
    addCollider(rowX, z0 + (bays * BAY) / 2, ROW_D + 0.15, bays * BAY + 0.2, UP_H);
}

function buildRacks() {
    startRackBatches();
    // Two back-to-back double blocks on each side, leaving a wide central lane.
    // Two back-to-back double blocks on each side of a wide central aisle.
    const rows = [-12.075, -10.975, -6.2, -5.1, 5.1, 6.2, 10.975, 12.075];
    const z0 = -16.5, bays = 10;
    // the overloaded bay (hazard) is row x=6.2, bay 5, level 2
    const skip = (rowX, bay, level) => rowX === 6.2 && bay === 5 && level === 2;
    rows.forEach(x => buildRackRow(x, z0, bays, skip));
    Object.values(rackBatches).forEach(b => b.done());
}


/* =========================================================
   PROPS: SIGNS, EXTINGUISHERS, FORKLIFT, DRUMS, CONES...
   ========================================================= */

// A flat sign mounted on a wall or post.
function makeSign(text, bg, fg, symbol, size = 0.5) {
    const mat = new THREE.MeshStandardMaterial({ map: signTexture(text, bg, fg, symbol), roughness: 0.5 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    return m;
}

// Wall-mounted fire extinguisher with its sign.
function makeExtinguisher(x, z, facing) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = facing;
    cyl(g, 0.075, 0.075, 0.42, M.redPaint, 0, 1.0, 0.12, 20, true);
    cyl(g, 0.05, 0.075, 0.08, M.redPaint, 0, 1.25, 0.12, 20);
    cyl(g, 0.02, 0.02, 0.1, M.darkSteel, 0, 1.33, 0.12, 10);
    box(g, 0.09, 0.03, 0.1, M.darkSteel, 0, 1.36, 0.16);
    box(g, 0.02, 0.5, 0.02, M.rubber, 0.06, 1.05, 0.2);                     // hose
    box(g, 0.2, 0.05, 0.05, M.darkSteel, 0, 1.1, 0.03);                     // wall bracket
    const s = makeSign('FIRE EXTINGUISHER', '#b0140e', '#ffffff', '\uD83E\uDDEF', 0.32);
    s.position.set(0, 1.75, 0.02);
    g.add(s);
    scene.add(g);
    return g;
}

function makeCone(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const orange = new THREE.MeshStandardMaterial({ color: 0xe8500f, roughness: 0.55 });
    box(g, 0.34, 0.03, 0.34, M.rubber, 0, 0.015, 0);
    cyl(g, 0.03, 0.14, 0.68, orange, 0, 0.37, 0, 16, true);
    cyl(g, 0.078, 0.095, 0.11, M.white, 0, 0.38, 0, 16);
    scene.add(g);
    return g;
}

function makeDrum(x, z, colour, labelTitle, labelColour, tipped = false) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.4, metalness: 0.6 });
    const body = new THREE.Group();
    cyl(body, 0.29, 0.29, 0.88, mat, 0, 0.44, 0, 28, true);
    for (const y of [0.08, 0.44, 0.8]) cyl(body, 0.3, 0.3, 0.025, mat, 0, y, 0, 28);   // rolling hoops
    cyl(body, 0.06, 0.06, 0.03, M.darkSteel, 0.14, 0.89, 0.08, 12);                     // bung caps
    const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.2),
        new THREE.MeshStandardMaterial({ map: drumLabelTexture(labelTitle, labelColour), roughness: 0.6 })
    );
    label.position.set(0, 0.5, 0.296);
    body.add(label);
    g.add(body);
    if (tipped) {                                   // lying on its side
        body.rotation.z = Math.PI / 2;
        body.position.set(0, 0.29, 0);
        body.rotation.y = 0.5;
    }
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
}

// A counterbalance forklift built from simple parts, parked in the warehouse.
function makeForklift(x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const yellow = M.yellowPaint;
    box(g, 1.1, 0.55, 1.9, yellow, 0, 0.6, -0.1, true);            // chassis
    box(g, 1.12, 0.75, 0.6, yellow, 0, 0.75, -1.0, true);          // counterweight
    box(g, 0.98, 0.1, 0.8, M.rubber, 0, 0.96, -0.2);               // seat base
    box(g, 0.5, 0.5, 0.12, M.rubber, 0, 1.25, -0.6);               // seat back
    cyl(g, 0.15, 0.15, 0.03, M.rubber, 0, 1.35, 0.35, 16).rotation.x = 0.8;   // steering wheel
    // overhead guard
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.75, 0.5]) box(g, 0.05, 1.15, 0.05, M.darkSteel, sx, 1.65, sz);
    box(g, 1.12, 0.05, 1.35, M.darkSteel, 0, 2.2, -0.12);
    cyl(g, 0.06, 0.06, 0.1, new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0xff5a00, emissiveIntensity: 0.6 }), 0.4, 2.28, -0.7);
    // wheels
    for (const sx of [-0.55, 0.55]) {
        const wf = cyl(g, 0.33, 0.33, 0.22, M.rubber, sx, 0.33, 0.55, 24, true); wf.rotation.z = Math.PI / 2;
        const wr = cyl(g, 0.27, 0.27, 0.2, M.rubber, sx, 0.27, -0.85, 24, true); wr.rotation.z = Math.PI / 2;
    }
    // mast and forks
    for (const sx of [-0.28, 0.28]) box(g, 0.08, 2.2, 0.12, M.darkSteel, sx, 1.15, 1.02, true);
    box(g, 0.75, 0.1, 0.1, M.darkSteel, 0, 0.5, 1.1);
    box(g, 0.75, 0.6, 0.06, M.darkSteel, 0, 0.55, 1.12);
    for (const sx of [-0.28, 0.28]) box(g, 0.12, 0.05, 1.1, M.darkSteel, sx, 0.09, 1.7, true);
    scene.add(g);
    addCollider(x, z, 1.4, 3.0, 2.3);
    return g;
}

// A manual pallet truck (pump truck).
function makePalletTruck(x, z, ry, loaded = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    for (const sx of [-0.28, 0.28]) {
        box(g, 0.16, 0.06, 1.1, M.redPaint, sx, 0.09, 0.45, true);
        const w = cyl(g, 0.04, 0.04, 0.1, M.rubber, sx, 0.05, 0.95, 12); w.rotation.z = Math.PI / 2;
    }
    box(g, 0.6, 0.12, 0.2, M.redPaint, 0, 0.16, -0.12);
    box(g, 0.05, 0.9, 0.05, M.darkSteel, 0, 0.6, -0.15).rotation.x = -0.3;
    box(g, 0.28, 0.04, 0.05, M.rubber, 0, 1.05, -0.3);
    if (loaded) {
        const p = new THREE.Mesh(makePalletGeometry(), M.wood);
        p.rotation.y = Math.PI / 2; p.position.set(0, 0.16, 0.45); g.add(p);
    }
    scene.add(g);
    return g;
}

// A pallet lying on the floor with a wrapped or carton load (staging area).
function floorPallet(x, z, ry, loadType = 'cartons', layers = 3) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const p = new THREE.Mesh(makePalletGeometry(), M.wood);
    p.castShadow = true; p.receiveShadow = true;
    g.add(p);
    if (loadType === 'cartons') {
        for (let l = 0; l < layers; l++) {
            const layerMat = M.carton.clone();
            layerMat.color.set(pick(CARTON_TINTS));
            for (const dx of [-0.4, 0, 0.4]) {
                for (const dz of [-0.2, 0.2]) {
                    const c = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.38, 0.38), layerMat);
                    c.position.set(dx, 0.144 + 0.2 + l * 0.39, dz);
                    c.rotation.y = rr(-0.03, 0.03);
                    c.castShadow = true; c.receiveShadow = true;
                    g.add(c);
                }
            }
        }
    } else if (loadType === 'wrapped') {
        const core = new THREE.Mesh(new THREE.BoxGeometry(1.15, layers * 0.4, 0.78), M.carton);
        core.position.y = 0.144 + layers * 0.2;
        core.castShadow = true;
        g.add(core);
        const wrap = new THREE.Mesh(new THREE.BoxGeometry(1.2, layers * 0.4 + 0.03, 0.82), M.wrap);
        wrap.position.y = 0.144 + layers * 0.2;
        g.add(wrap);
    }
    scene.add(g);
    return g;
}

// Emergency exit door with its running-man sign.
function makeExitDoor(x, z, facing) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = facing;                      // 0 = door faces +Z
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a6b46, roughness: 0.5, metalness: 0.5 });
    box(g, 2.2, 2.35, 0.12, M.darkSteel, 0, 1.175, 0);                 // frame
    box(g, 0.97, 2.2, 0.08, doorMat, -0.5, 1.1, 0.05);                 // left leaf
    box(g, 0.97, 2.2, 0.08, doorMat, 0.5, 1.1, 0.05);                  // right leaf
    box(g, 1.7, 0.05, 0.05, M.steel, 0, 1.0, 0.13);                    // push bar
    const exit = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.34),
        new THREE.MeshStandardMaterial({
            map: canvasTex(256, 96, (c, w, h) => {
                c.fillStyle = '#0d7a3c'; c.fillRect(0, 0, w, h);
                c.fillStyle = '#fff'; c.font = 'bold 54px Arial'; c.textAlign = 'center';
                c.fillText('EXIT', w * 0.62, 66);
                c.font = 'bold 60px Arial'; c.fillText('\uD83C\uDFC3', w * 0.2, 68);
            }),
            emissive: 0x0d7a3c, emissiveIntensity: 0.6, emissiveMap: null
        })
    );
    exit.position.set(0, 2.62, 0.08);
    g.add(exit);
    scene.add(g);
    return g;
}

// Roller shutter dock door on the front wall.
function makeDockDoor(x) {
    const tex = canvasTex(64, 256, (g, w, h) => {
        g.fillStyle = '#6a7075'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y + 2, w, 2); }
    }, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.7 });
    const z = HALF_L - 0.08;
    box(scene, 3.4, 3.8, 0.08, mat, x, 1.9, z);
    box(scene, 3.7, 0.25, 0.2, M.darkSteel, x, 3.9, z - 0.05);
    for (const sx of [-1.75, 1.75]) box(scene, 0.2, 3.9, 0.2, M.darkSteel, x + sx, 1.95, z - 0.05);
    for (const sx of [-2.2, 2.2]) {               // yellow bollards beside the door
        cyl(scene, 0.11, 0.11, 1.1, M.yellowPaint, x + sx, 0.55, z - 1.2, 16, true);
        addCollider(x + sx, z - 1.2, 0.25, 0.25, 1.1);
    }
}


/* =========================================================
   HUMAN CHARACTERS
   The employee is built from body parts joined at hip, knee,
   shoulder and elbow "pivots" so it can walk with a natural
   gait. The rear view gets the most detail (hair, collar,
   hi-vis vest with reflective strips) because the third-person
   camera looks at the employee's back.

   If a real rigged model exists in assests/models/ (for example
   worker-male.glb) the game uses that automatically instead.
   ========================================================= */

// Skin tone and hair colour palettes. One is picked from the
// employee's name so different employees look a little different.
const SKIN_TONES = [0xd9ad8c, 0xc4906f, 0xa87454, 0x7a5238];
const HAIR_TONES = [0x2b1d14, 0x4a2c1a, 0x171412, 0x8a6a3c];

function buildHuman(o) {
    const female = !!o.female;
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.scale.setScalar(female ? 0.94 : 1.0);
    root.add(body);

    // ---- materials ----
    const fabric = (color) => new THREE.MeshStandardMaterial({
        color, roughness: 0.95, bumpMap: M.fabricBump, bumpScale: 0.9, side: THREE.DoubleSide
    });
    const skin = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.58 });
    const hairMat = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 0.75 });
    const jacket = fabric(o.jacket || 0x34404e);
    const trousers = fabric(o.trousers || 0x3b3f44);
    const vest = new THREE.MeshStandardMaterial({
        color: 0xff6a12, roughness: 0.85, emissive: 0x401400, emissiveIntensity: 0.4,
        bumpMap: M.fabricBump, bumpScale: 0.7, side: THREE.DoubleSide
    });
    const reflect = new THREE.MeshStandardMaterial({
        color: 0xdadad2, roughness: 0.35, metalness: 0.55, emissive: 0x2e2e2e
    });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x2a241f, roughness: 0.65 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x3c3c3f, roughness: 0.8 });
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x17140f, roughness: 0.6 });
    const buckleMat = new THREE.MeshStandardMaterial({ color: 0x9a9a98, roughness: 0.3, metalness: 0.9 });

    const part = (geo, mat, x, y, z, parent, sx = 1, sy = 1, sz = 1) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.scale.set(sx, sy, sz);
        m.castShadow = true;
        m.receiveShadow = true;
        parent.add(m);
        return m;
    };
    const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 8, 16);

    // ---- pelvis and legs (tapered, with knee and ankle detail) ----
    const hips = new THREE.Group();
    hips.position.y = 0.98;
    body.add(hips);
    part(new THREE.SphereGeometry(1, 20, 14), trousers, 0, -0.03, 0, hips, female ? 0.185 : 0.165, 0.13, 0.115);

    const legs = [];
    for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * (female ? 0.1 : 0.092), 0, 0);
        hips.add(hip);
        part(new THREE.SphereGeometry(0.092, 16, 12), trousers, 0, -0.02, 0, hip);                          // hip joint
        part(new THREE.CylinderGeometry(0.092, 0.07, 0.47, 18), trousers, 0, -0.235, 0, hip, 1, 1, 1.06);  // thigh
        const knee = new THREE.Group();
        knee.position.y = -0.46;
        hip.add(knee);
        part(new THREE.SphereGeometry(0.07, 14, 10), trousers, 0, 0, 0.004, knee);                          // knee
        part(new THREE.CylinderGeometry(0.07, 0.054, 0.44, 18), trousers, 0, -0.22, 0, knee);               // shin
        part(new THREE.CylinderGeometry(0.058, 0.066, 0.12, 16), bootMat, 0, -0.42, 0, knee);              // boot shaft
        part(new THREE.TorusGeometry(0.06, 0.008, 6, 16), M.rubber, 0, -0.37, 0, knee).rotation.x = Math.PI / 2;  // boot top band
        part(new THREE.BoxGeometry(0.105, 0.085, 0.2), bootMat, 0, -0.475, 0.055, knee);                    // boot body
        part(new THREE.SphereGeometry(1, 14, 10), bootMat, 0, -0.468, 0.15, knee, 0.052, 0.045, 0.06);      // rounded toe cap
        part(new THREE.BoxGeometry(0.11, 0.028, 0.3), M.rubber, 0, -0.512, 0.075, knee);                    // sole
        part(new THREE.BoxGeometry(0.11, 0.035, 0.07), M.rubber, 0, -0.505, -0.035, knee);                  // heel block
        for (let l = 0; l < 3; l++) part(new THREE.BoxGeometry(0.07, 0.006, 0.012), M.white, 0, -0.445 + l * 0.0, 0.075 + l * 0.032, knee);  // laces
        legs.push({ hip, knee });
    }

    // ---- torso: shaped (lathe) body, jacket, hi-vis vest, belt ----
    const torso = new THREE.Group();
    torso.position.y = 0.02;
    hips.add(torso);
    // outline of the upper body: [height, half-width]
    const prof = female
        ? [[0, 0.118], [0.1, 0.122], [0.2, 0.138], [0.32, 0.158], [0.44, 0.17], [0.52, 0.168], [0.57, 0.135], [0.6, 0.062], [0.62, 0.052]]
        : [[0, 0.145], [0.1, 0.15], [0.2, 0.165], [0.32, 0.185], [0.44, 0.2], [0.52, 0.2], [0.57, 0.15], [0.6, 0.068], [0.62, 0.056]];
    const radiusAt = (y) => {
        for (let i = 0; i < prof.length - 1; i++) {
            if (y >= prof[i][0] && y <= prof[i + 1][0]) {
                const u = (y - prof[i][0]) / (prof[i + 1][0] - prof[i][0]);
                return prof[i][1] + (prof[i + 1][1] - prof[i][1]) * u;
            }
        }
        return prof[prof.length - 1][1];
    };
    const DEPTH = 0.62;                                                 // the chest is shallower than it is wide
    const lathe = (pts, mat, k = 1) => {
        const geo = new THREE.LatheGeometry(pts.map(([y, r]) => new THREE.Vector2(r * k, y)), 36);
        return part(geo, mat, 0, 0, 0, torso, 1, 1, DEPTH);
    };
    lathe(prof, jacket);                                                // jacket body
    lathe(prof.filter(([y]) => y >= 0.07 && y <= 0.5), vest, 1.07);    // hi-vis vest over the jacket
    // reflective bands around the vest
    for (const y of [0.17, 0.37]) {
        part(new THREE.CylinderGeometry(radiusAt(y) * 1.085, radiusAt(y) * 1.085, 0.05, 36, 1, true), reflect, 0, y, 0, torso, 1, 1, DEPTH);
    }
    // vertical reflective strips over the shoulders and down the back (the camera's view)
    const backZ = (y, x = 0) => -Math.sqrt(Math.max(0.0001, 1 - (x / (radiusAt(y) * 1.07)) ** 2)) * radiusAt(y) * 1.07 * DEPTH;
    for (const x of [-0.085, 0.085]) {
        for (let k = 0; k < 4; k++) {                                   // short pieces follow the curve of the back
            const y = 0.14 + k * 0.1;
            part(new THREE.BoxGeometry(0.036, 0.1, 0.012), reflect, x, y, backZ(y, x) - 0.004, torso);
        }
    }
    const logo = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, 0.07),
        new THREE.MeshStandardMaterial({
            map: canvasTex(256, 90, (g, w, h) => {
                g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, w, h);
                g.fillStyle = '#ffd400'; g.font = 'bold 44px Arial'; g.textAlign = 'center';
                g.fillText('SAFETY', w / 2, 62);
            }), roughness: 0.7
        })
    );
    logo.position.set(0, 0.46, backZ(0.46) - 0.008);
    logo.rotation.y = Math.PI;
    torso.add(logo);
    // belt with buckle, trouser waistband
    part(new THREE.CylinderGeometry(radiusAt(0.03) * 1.02, radiusAt(0.03) * 1.02, 0.045, 32), beltMat, 0, 0.035, 0, torso, 1, 1, DEPTH);
    part(new THREE.BoxGeometry(0.04, 0.034, 0.012), buckleMat, 0, 0.035, radiusAt(0.03) * DEPTH * 1.03, torso);
    // jacket hem peeking out below the vest
    part(new THREE.CylinderGeometry(radiusAt(0.08) * 1.03, radiusAt(0.04) * 1.04, 0.06, 32), jacket, 0, 0.075, 0, torso, 1, 1, DEPTH);

    part(new THREE.CylinderGeometry(0.05, 0.058, 0.12, 18), skin, 0, 0.64, 0, torso);                     // neck
    const collar = part(new THREE.TorusGeometry(0.068, 0.024, 10, 22), jacket, 0, 0.6, -0.008, torso);   // jacket collar
    collar.rotation.x = Math.PI / 2;
    collar.scale.set(1, 1.15, 1);
    part(new THREE.BoxGeometry(0.17, 0.045, 0.045), jacket, 0, 0.59, -0.05, torso);                      // collar at the back of the neck

    // ---- head, face and hair ----
    const head = new THREE.Group();
    head.position.y = 0.77;
    torso.add(head);
    part(new THREE.SphereGeometry(1, 32, 24), skin, 0, 0, 0, head, 0.088, 0.108, 0.098);                 // skull
    part(new THREE.SphereGeometry(1, 22, 16), skin, 0, -0.06, 0.02, head, 0.07, 0.072, 0.08);           // jaw and chin
    part(new THREE.SphereGeometry(1, 12, 10), skin, 0, -0.012, 0.098, head, 0.014, 0.022, 0.02);        // nose
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x120d0a, roughness: 0.35 });
    for (const sd of [-1, 1]) {
        part(new THREE.SphereGeometry(0.0125, 10, 8), eyeMat, sd * 0.034, 0.02, 0.087, head);
        part(new THREE.BoxGeometry(0.03, 0.006, 0.01), hairMat, sd * 0.034, 0.042, 0.092, head);          // eyebrows
        part(new THREE.SphereGeometry(1, 12, 10), skin, sd * 0.089, -0.005, 0, head, 0.012, 0.03, 0.02);  // ears
    }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 22, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    cap.scale.set(0.096, 0.116, 0.108);
    cap.position.set(0, 0.012, -0.004);
    cap.rotation.x = -0.3;                                     // leaves the forehead clear
    cap.castShadow = true;
    head.add(cap);
    // back and sides of the head: more hair volume, since the camera mostly sees the back of the head
    part(new THREE.SphereGeometry(1, 20, 14), hairMat, 0, -0.04, -0.045, head, 0.092, female ? 0.098 : 0.07, 0.066);
    part(new THREE.SphereGeometry(1, 12, 10), hairMat, -0.085, 0.0, -0.005, head, 0.014, 0.05, 0.05);
    part(new THREE.SphereGeometry(1, 12, 10), hairMat, 0.085, 0.0, -0.005, head, 0.014, 0.05, 0.05);
    if (female) {                                              // ponytail with a hair tie
        const tail = new THREE.Group();
        tail.position.set(0, 0.03, -0.1);
        tail.rotation.x = 0.28;
        head.add(tail);
        part(capsule(0.036, 0.2), hairMat, 0, -0.13, 0, tail, 1, 1, 0.9);
        part(new THREE.SphereGeometry(1, 12, 10), hairMat, 0, -0.27, 0.005, tail, 0.03, 0.04, 0.025);
        part(new THREE.TorusGeometry(0.033, 0.011, 6, 14), new THREE.MeshStandardMaterial({ color: 0x151515 }), 0, -0.01, 0, tail);
    }

    // ---- arms with gloved hands ----
    const arms = [];
    for (const side of [-1, 1]) {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * (female ? 0.205 : 0.232), 0.53, 0);
        torso.add(shoulder);
        part(new THREE.SphereGeometry(0.073, 18, 14), jacket, 0, 0, 0, shoulder);                         // shoulder cap
        part(new THREE.CylinderGeometry(0.056, 0.045, 0.32, 18), jacket, 0, -0.17, 0, shoulder);          // upper arm
        const elbow = new THREE.Group();
        elbow.position.y = -0.34;
        shoulder.add(elbow);
        part(new THREE.SphereGeometry(0.047, 14, 10), jacket, 0, 0, 0, elbow);                            // elbow
        part(new THREE.CylinderGeometry(0.046, 0.038, 0.26, 18), jacket, 0, -0.14, 0, elbow);             // forearm
        part(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 16), M.rubber, 0, -0.27, 0, elbow);           // cuff
        // hand: palm, four fingers and a thumb
        const hand = new THREE.Group();
        hand.position.set(0, -0.3, 0.005);
        elbow.add(hand);
        part(new THREE.BoxGeometry(0.075, 0.085, 0.036), gloveMat, 0, -0.04, 0, hand);
        for (let f = 0; f < 4; f++) part(capsule(0.0085, 0.05), gloveMat, -0.027 + f * 0.018, -0.108, 0.003, hand);
        const thumb = part(capsule(0.011, 0.04), gloveMat, side * -0.043, -0.05, 0.012, hand);
        thumb.rotation.z = side * 0.5;
        shoulder.rotation.z = side * 0.07;
        arms.push({ shoulder, elbow });
    }

    return {
        root, body, hips, torso, head, legs, arms,
        phase: 0, moving: 0, baseHipY: 0.98
    };
}

// Walk / idle animation. "speed" is the real movement speed in m/s.
function animateHuman(h, dt, speed, t) {
    const target = speed > 0.15 ? 1 : 0;
    h.moving += (target - h.moving) * Math.min(1, dt * 9);           // smooth idle <-> walk blending
    const mv = h.moving;
    const speed01 = Math.min(1, speed / TUNING.runSpeed);
    h.phase += dt * (3.0 + speed * 1.0) * mv;
    const p = h.phase;
    const A = (0.5 + 0.08 * speed) * mv;                              // thigh swing
    const [L, R] = h.legs;

    L.hip.rotation.x = -Math.sin(p) * A;
    R.hip.rotation.x = Math.sin(p) * A;
    L.knee.rotation.x = Math.max(0, Math.cos(p)) * (0.55 + 0.7 * speed01) * mv;
    R.knee.rotation.x = Math.max(0, -Math.cos(p)) * (0.55 + 0.7 * speed01) * mv;

    const swing = 0.5 * A;                                            // arms swing opposite to legs
    const flex = 0.18 + 0.75 * speed01;
    h.arms[0].shoulder.rotation.x = Math.sin(p) * swing + Math.sin(t * 1.3) * 0.015 * (1 - mv);
    h.arms[1].shoulder.rotation.x = -Math.sin(p) * swing + Math.sin(t * 1.3 + 1) * 0.015 * (1 - mv);
    h.arms[0].elbow.rotation.x = -(0.12 + flex * mv);
    h.arms[1].elbow.rotation.x = -(0.12 + flex * mv);

    h.hips.position.y = h.baseHipY + Math.cos(p * 2) * 0.018 * mv;    // small vertical bob
    h.hips.position.x = Math.sin(p) * 0.012 * mv;                      // weight shift
    h.hips.rotation.y = -Math.sin(p) * 0.09 * mv;
    h.torso.rotation.y = Math.sin(p) * 0.13 * mv;
    h.torso.rotation.x = 0.03 + 0.1 * speed01 * mv;
    h.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.006 * (1 - mv);       // breathing when standing
    h.head.rotation.y = -h.torso.rotation.y * 0.7 + Math.sin(t * 0.5) * 0.05 * (1 - mv);
}

// Picks skin/hair from the employee name so people are not identical clones.
function looksFor(name, female) {
    let hash = 0;
    for (const ch of String(name || 'employee')) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    hash = Math.abs(hash);
    return {
        female,
        skin: SKIN_TONES[hash % SKIN_TONES.length],
        hair: HAIR_TONES[(hash >> 3) % HAIR_TONES.length]
    };
}


/* =========================================================
   HAZARDS
   Each hazard is a physical object group in the warehouse.
   They are registered in the "hazards" list so the player code
   can detect when the employee is close enough to inspect.
   ========================================================= */
function registerHazard(type, x, z, group) {
    hazards.push({ type, anchor: new THREE.Vector3(x, 0, z), group, done: false });
}

// Irregular liquid puddle lying flat on the floor.
function makePuddle(x, z, radius, mat, stretch = 1.4) {
    const shape = new THREE.Shape();
    const n = 32;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = radius * (0.7 + rand() * 0.45) * (1 + 0.28 * Math.sin(a * 2 + 1));
        const px = Math.cos(a) * r * stretch, py = Math.sin(a) * r;
        i === 0 ? shape.moveTo(px, py) : shape.lineTo(px, py);
    }
    shape.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.008, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
}

// 1. OIL SPILL — dark glossy puddle under a leaking can, in the forklift lane.
function buildOilHazard() {
    const g = new THREE.Group();
    scene.add(g);
    const oil = new THREE.MeshPhysicalMaterial({
        color: 0x0b0806, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
        transparent: true, opacity: 0.94, polygonOffset: true, polygonOffsetFactor: -2,
        envMap: scene.environment, envMapIntensity: 1.6
    });
    makePuddle(1.8, -11, 0.85, oil, 1.35);
    makePuddle(3.1, -10.4, 0.28, oil, 1.2);
    makePuddle(0.7, -11.9, 0.2, oil, 1.0);
    // tyre smear leading out of the puddle
    const smear = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 3.0), oil);
    smear.rotation.x = -Math.PI / 2; smear.position.set(2.2, 0.007, -8.4);
    scene.add(smear);
    makeDrum(3.1, -11.9, 0x20242a, 'OIL', '#c47a00', true);       // leaking drum lying on its side
    makePalletTruck(0.3, -13.1, 0.6, false);
    // the employee must walk around the spill, never through it
    addCollider(1.8, -11, 2.7, 1.9, 0.05);
    addCollider(3.1, -10.4, 0.8, 0.7, 0.05);
    addCollider(0.7, -11.9, 0.6, 0.6, 0.05);
    addCollider(3.1, -11.9, 0.9, 0.9, 0.5);
    addCollider(0.3, -13.1, 0.9, 1.5, 0.4);    registerHazard('oil', 1.8, -11, g);
}

// 2. UNSTABLE BOXES — a leaning, badly stacked pile in the rack aisle.
function buildBoxHazard() {
    const g = new THREE.Group();
    g.position.set(-8.6, 0, -2.5);
    scene.add(g);
    const mkBox = (x, y, z, w, h, d, ry = 0, rz = 0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.carton);
        m.position.set(x, y, z);
        m.rotation.set(0, ry, rz);
        m.castShadow = true; m.receiveShadow = true;
        m.material = M.carton.clone();
        m.material.color.set(pick(CARTON_TINTS));
        g.add(m);
        return m;
    };
    // tall column that drifts sideways as it goes up
    let drift = 0;
    for (let i = 0; i < 6; i++) {
        drift += rr(0.02, 0.09);
        mkBox(drift, 0.2 + i * 0.41, 0, 0.6, 0.4, 0.5, rr(-0.1, 0.1) + i * 0.02, 0.02 * i);
    }
    // a second column leaning against the first
    const lean = new THREE.Group();
    lean.position.set(-0.75, 0, 0.1);
    lean.rotation.z = -0.14;
    g.add(lean);
    for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.5), M.carton);
        m.position.set(rr(-0.03, 0.03), 0.2 + i * 0.41, 0);
        m.castShadow = true; m.receiveShadow = true;
        lean.add(m);
    }
    // boxes that have already slipped onto the floor
    mkBox(0.9, 0.2, 0.6, 0.55, 0.4, 0.45, 0.6);
    mkBox(-1.0, 0.15, 0.8, 0.5, 0.3, 0.5, -0.4);
    mkBox(0.4, 0.17, 1.1, 0.45, 0.34, 0.4, 1.1, 0.0).rotation.x = 0.08;
    addCollider(-8.6, -2.5, 1.9, 1.2, 2.6);
    registerHazard('box', -8.6, -2.1, g);
}

// 3. ELECTRICAL FAULT — open cabinet, dangling wires, scorch mark, small sparks.
function buildElectricalHazard() {
    const g = new THREE.Group();
    g.position.set(-6, 0, -HALF_L + 0.15);
    scene.add(g);
    box(g, 0.95, 1.55, 0.28, M.cabinet, 0, 1.5, 0.14, true);                    // cabinet body
    box(g, 0.8, 1.4, 0.02, new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.8 }), 0, 1.5, 0.29);   // dark interior
    // rows of breakers, one of them burnt
    for (let r = 0; r < 8; r++) {
        for (const c of [-0.2, 0.2]) {
            const burnt = (r === 3 && c > 0);
            const b = box(g, 0.14, 0.09, 0.05, new THREE.MeshStandardMaterial({ color: burnt ? 0x0c0a08 : 0x3a3d40, roughness: 0.6 }), c, 2.05 - r * 0.13, 0.31);
            box(g, 0.03, 0.05, 0.04, burnt ? M.rubber : M.white, c, 2.05 - r * 0.13, 0.34);
        }
    }
    // door hanging open on its hinge
    const hinge = new THREE.Group();
    hinge.position.set(-0.47, 1.5, 0.29);
    hinge.rotation.y = -1.25;
    g.add(hinge);
    box(hinge, 0.9, 1.5, 0.03, M.cabinet, 0.45, 0, 0);
    // wires hanging out of the bottom, with bare copper ends
    const copper = new THREE.MeshStandardMaterial({ color: 0xb8733a, roughness: 0.35, metalness: 0.9 });
    [[0xb01010, -0.15, 0.3], [0x111111, 0.0, 0.5], [0x1a4fb0, 0.14, 0.2]].forEach(([col, x, reach]) => {
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(x, 0.8, 0.28), new THREE.Vector3(x + reach * 0.4, 0.55, 0.42),
            new THREE.Vector3(x + reach * 0.9, 0.28, 0.5), new THREE.Vector3(x + reach, 0.12, 0.68)
        ]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.014, 6),
            new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 }));
        tube.castShadow = true;
        g.add(tube);
        const end = curve.getPoint(1);
        cyl(g, 0.007, 0.007, 0.05, copper, end.x, end.y, end.z, 6);
    });
    // scorch mark above the cabinet
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({
        map: canvasTex(128, 128, (c, w, h) => {
            const gr = c.createRadialGradient(w / 2, h * 0.7, 4, w / 2, h * 0.6, w / 2);
            gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = gr; c.fillRect(0, 0, w, h);
        }), transparent: true, depthWrite: false
    }));
    scorch.position.set(0, 2.4, 0.01);
    g.add(scorch);
    const warn = makeSign('DANGER HIGH VOLTAGE', '#f2c200', '#111111', '\u26A1', 0.38);
    warn.position.set(1.0, 1.6, 0.02);
    g.add(warn);
    // sparks + a flickering light, updated in updateFX()
    const N = 26;
    const pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sparks = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xffc36b, size: 0.035, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    sparks.frustumCulled = false;
    sparks.position.set(0.1, 0.3, 0.6);
    sparks.userData.vel = Array.from({ length: N }, () => new THREE.Vector3());
    sparks.userData.life = new Float32Array(N);
    g.add(sparks);
    const light = new THREE.PointLight(0x9fc8ff, 0, 5, 2);
    light.position.set(0.1, 0.5, 0.8);
    g.add(light);
    fx.sparks = sparks; fx.sparkLight = light;
    addCollider(-6, -HALF_L + 0.6, 1.2, 0.9, 2.5);
    registerHazard('electrical', -6, -HALF_L + 2.6, g);
}

// 4. CABLE TRIP HAZARD — a thick extension lead snaking across the walkway.
function buildCableHazard() {
    const g = new THREE.Group();
    scene.add(g);
    const pts = [[-4.2, 6.0], [-3.1, 5.6], [-1.9, 6.7], [-0.5, 5.7], [0.7, 6.5], [1.8, 5.8], [2.3, 6.1]]
        .map(([x, z], i, all) => new THREE.Vector3(x, i === 0 || i === all.length - 1 ? 0.08 : 0.026, z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.65, bumpMap: M.fabricBump, bumpScale: 0.3 });
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.024, 8), cableMat);
    cable.castShadow = true; cable.receiveShadow = true;
    g.add(cable);
    box(g, 0.32, 0.16, 0.28, M.darkSteel, -4.22, 0.08, 6.0, true);         // floor power box
    box(g, 0.5, 0.9, 0.36, M.redPaint, 2.75, 0.45, 6.0, true);              // battery charger
    box(g, 0.1, 0.06, 0.16, M.yellowPaint, 2.3, 0.03, 6.1);               // plug head
    addCollider(2.75, 6.0, 0.6, 0.5, 1);
    // solid along the whole cable: the employee has to go around it, not over it
    for (let i = 0; i <= 28; i++) {
        const p = curve.getPoint(i / 28);
        addCollider(p.x, p.z, 0.45, 0.45, 0.05);
    }
    registerHazard('cable', -0.8, 6.1, g);
}

// 5. CHEMICAL SPILL — a tipped drum leaking across the concrete.
function buildChemicalHazard() {
    const g = new THREE.Group();
    scene.add(g);
    const liquid = new THREE.MeshPhysicalMaterial({
        color: 0x6e6a2a, roughness: 0.07, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
        transparent: true, opacity: 0.82, polygonOffset: true, polygonOffsetFactor: -2,
        envMap: scene.environment, envMapIntensity: 1.4
    });
    makePuddle(-12.6, 16.5, 0.85, liquid, 1.3);
    makePuddle(-11.5, 17.6, 0.25, liquid, 1.0);
    makeDrum(-14.3, 16.6, 0x1c4f9a, 'CORROSIVE', '#b0140e', true);               // leaking one
    makeDrum(-15.4, 18.3, 0x1c4f9a, 'CORROSIVE', '#b0140e');
    makeDrum(-14.4, 19.0, 0x1c4f9a, 'CORROSIVE', '#b0140e');
    makeDrum(-15.9, 17.2, 0xd4a300, 'TOXIC', '#111111');
    makeDrum(-15.9, 16.0, 0x2f6b3a, 'IRRITANT', '#d4a300');
    floorPallet(-14.6, 14.0, 0.15, 'wrapped', 2);
    addCollider(-12.6, 16.5, 2.4, 1.7, 0.05);       // the puddle itself
    addCollider(-11.5, 17.6, 0.7, 0.7, 0.05);
    const s = makeSign('CHEMICAL STORE', '#f2c200', '#111111', '\u2623', 0.6);
    s.position.set(-HALF_W + 0.05, 2.2, 17);
    s.rotation.y = Math.PI / 2;
    scene.add(s);
    addCollider(-15.0, 17.4, 2.6, 5.4, 1);
    registerHazard('chemical', -12.8, 16.8, g);
}

// 6. FIRE HAZARD — an employee smoking beside fuel drums. A dropped cigarette
// has already set a pile of cardboard alight, so there are real flames to see.
let smoker = null;

// Teardrop-shaped flame image: white-yellow core, orange body, red edge.
function flameTexture() {
    return canvasTex(128, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        const grd = g.createRadialGradient(w / 2, h * 0.74, 3, w / 2, h * 0.62, h * 0.55);
        grd.addColorStop(0, 'rgba(255,252,210,1)');
        grd.addColorStop(0.22, 'rgba(255,205,70,0.97)');
        grd.addColorStop(0.5, 'rgba(255,115,22,0.8)');
        grd.addColorStop(0.78, 'rgba(190,40,6,0.35)');
        grd.addColorStop(1, 'rgba(120,20,0,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(w / 2, 6);
        g.bezierCurveTo(w * 0.98, h * 0.42, w * 0.98, h * 0.96, w / 2, h * 0.99);
        g.bezierCurveTo(w * 0.02, h * 0.96, w * 0.02, h * 0.42, w / 2, 6);
        g.fill();
    });
}

function buildFireHazard() {
    const g = new THREE.Group();
    scene.add(g);
    const FX = 14.2, FZ = 17.6;                      // where the fire is burning

    // fuel drums and a pallet of red fuel cans, close to the fire
    makeDrum(15.6, 15.3, 0xa3140f, 'FLAMMABLE', '#b0140e');
    makeDrum(16.2, 16.2, 0xa3140f, 'FLAMMABLE', '#b0140e');
    makeDrum(15.3, 16.9, 0xa3140f, 'FLAMMABLE', '#b0140e');
    const pal = new THREE.Mesh(makePalletGeometry(), M.wood);
    pal.position.set(15.8, 0, 19.0); pal.rotation.y = 0.2; pal.castShadow = true; g.add(pal);
    for (let i = 0; i < 8; i++) {
        const can = box(g, 0.32, 0.4, 0.14, M.redPaint, 15.5 + (i % 4) * 0.2 - 0.1, 0.36, 18.8 + Math.floor(i / 4) * 0.35, true);
        box(g, 0.14, 0.05, 0.06, M.darkSteel, can.position.x, 0.6, can.position.z);
    }
    const sign = makeSign('NO SMOKING', '#ffffff', '#b0140e', '\uD83D\uDEAD', 0.6);
    sign.position.set(HALF_W - 0.05, 2.1, 17.5);
    sign.rotation.y = -Math.PI / 2;
    scene.add(sign);
    const flam = makeSign('FLAMMABLE', '#b0140e', '#ffffff', '\uD83D\uDD25', 0.5);
    flam.position.set(HALF_W - 0.05, 2.1, 15.8);
    flam.rotation.y = -Math.PI / 2;
    scene.add(flam);

    // ---- the burning pile: charred cartons and rags with glowing coals ----
    const char = new THREE.MeshStandardMaterial({ color: 0x1d1612, roughness: 1 });
    const coal = new THREE.MeshStandardMaterial({ color: 0x3a0e04, emissive: 0xff3a00, emissiveIntensity: 2.2, roughness: 0.9 });
    [[-0.3, 0.1, 0.5, 0.2, 0.45], [0.25, -0.2, 0.45, 0.17, -0.6], [0.0, 0.3, 0.4, 0.15, 1.1], [0.1, 0.0, 0.5, 0.22, 0.2]].forEach(([dx, dz, w, h, ry]) => {
        const c = box(g, w, h, w * 0.85, char, FX + dx, h / 2, FZ + dz, true);
        c.rotation.y = ry;
    });
    for (let i = 0; i < 7; i++) {                          // glowing coals on top
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), coal);
        m.scale.set(1.4, 0.6, 1.1);
        m.position.set(FX + rr(-0.35, 0.35), 0.2 + rr(0, 0.12), FZ + rr(-0.3, 0.3));
        g.add(m);
    }
    // scorch mark on the floor around the fire
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({
        map: canvasTex(128, 128, (c, w, h) => {
            const gr = c.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
            gr.addColorStop(0, 'rgba(0,0,0,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = gr; c.fillRect(0, 0, w, h);
        }), transparent: true, depthWrite: false
    }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.set(FX, 0.012, FZ);
    g.add(scorch);

    // ---- animated flames (updated every frame in updateFX) ----
    const flameMap = flameTexture();
    fx.flames = [];
    for (let i = 0; i < 18; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: flameMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        sp.userData = { ox: rr(-0.3, 0.3), oz: rr(-0.26, 0.26), t: rand(), spd: rr(0.85, 1.5), size: rr(0.6, 1.05), ph: rand() * 6.28 };
        scene.add(sp);
        fx.flames.push(sp);
    }
    fx.fireBase = new THREE.Vector3(FX, 0, FZ);
    // flickering orange light so the drums and floor nearby are lit by the fire
    fx.fireLight = new THREE.PointLight(0xff6a1a, 30, 9, 1.6);
    fx.fireLight.position.set(FX, 0.9, FZ);
    scene.add(fx.fireLight);
    // embers rising from the fire
    const EN = 24;
    const epos = new Float32Array(EN * 3);
    const egeo = new THREE.BufferGeometry();
    egeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    const embers = new THREE.Points(egeo, new THREE.PointsMaterial({
        color: 0xff9a3a, size: 0.05, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    embers.frustumCulled = false;
    embers.userData.life = new Float32Array(EN);
    embers.userData.vel = Array.from({ length: EN }, () => new THREE.Vector3());
    scene.add(embers);
    fx.embers = embers;
    // thick dark smoke climbing from the fire toward the roof
    const darkSmoke = canvasTex(64, 64, (c, w, h) => {
        const gr = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
        gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    for (let i = 0; i < 12; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: darkSmoke, color: 0x2e2c2b, transparent: true, depthWrite: false, opacity: 0 }));
        sp.userData = { origin: new THREE.Vector3(FX, 0.7, FZ), t: i / 12, rise: 3.4, size: 1.5, alpha: 0.5, speed: 0.15, drift: 0.5 };
        scene.add(sp);
        fx.smoke.push(sp);
    }

    // ---- the smoker: same body model, right hand raised to his mouth ----
    smoker = buildHuman({ female: false, skin: 0xb98463, hair: 0x241a12, jacket: 0x5a4a3a, trousers: 0x2d3a4a });
    smoker.root.position.set(12.9, 0, 16.4);
    smoker.root.rotation.y = Math.PI / 2 + 0.25;
    smoker.arms[1].shoulder.rotation.set(-1.15, 0, -0.1);
    smoker.arms[1].elbow.rotation.x = -1.7;
    smoker.arms[0].shoulder.rotation.x = 0.08;
    smoker.arms[0].elbow.rotation.x = -0.35;
    smoker.torso.rotation.x = 0.04;
    const cig = new THREE.Group();
    cyl(cig, 0.006, 0.006, 0.09, M.white, 0, -0.34, 0.06, 6).rotation.x = Math.PI / 2;
    cyl(cig, 0.0065, 0.0065, 0.012, new THREE.MeshStandardMaterial({ color: 0xff5a10, emissive: 0xff3a00, emissiveIntensity: 2 }), 0, -0.34, 0.11, 6).rotation.x = Math.PI / 2;
    smoker.arms[1].elbow.add(cig);
    scene.add(smoker.root);
    smoker.root.updateMatrixWorld(true);
    // thin wisps of smoke from the cigarette
    const tip = new THREE.Vector3();
    cig.getWorldPosition(tip);
    const smokeTex = canvasTex(64, 64, (c, w, h) => {
        const gr = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
        gr.addColorStop(0, 'rgba(210,210,210,0.55)'); gr.addColorStop(1, 'rgba(210,210,210,0)');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    for (let i = 0; i < 14; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
        sp.userData = { origin: tip.clone(), t: i / 14 };
        scene.add(sp);
        fx.smoke.push(sp);
    }
    // everything here is solid: the employee cannot walk into the fire, the drums or the smoker
    addCollider(12.9, 16.4, 0.6, 0.6, 1.8);
    addCollider(FX, FZ, 1.5, 1.5, 1.4);
    addCollider(15.7, 16.1, 2.1, 2.7, 1);
    addCollider(15.8, 19.0, 1.5, 1.1, 1);
    registerHazard('fire', 13.7, 17.0, g);
}

// 7. BLOCKED EMERGENCY EXIT — pallets and cartons stacked against the door.
function buildEmergencyHazard() {
    const g = new THREE.Group();
    scene.add(g);
    makeExitDoor(HALF_W - 0.08, -11.5, -Math.PI / 2);
    floorPallet(15.7, -12.7, 0.1, 'cartons', 4);
    floorPallet(15.8, -10.6, -0.05, 'wrapped', 4);
    floorPallet(14.5, -11.6, 0.5, 'cartons', 2);
    makePalletTruck(14.2, -9.8, 2.3, true);
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.45), M.carton);
    c.position.set(14.4, 0.2, -13.4); c.rotation.y = 0.5; c.castShadow = true; g.add(c);
    addCollider(15.2, -11.7, 2.6, 4.2, 2.2);
    // a clear exit on the opposite wall for contrast (hatched floor, sign)
    makeExitDoor(-HALF_W + 0.08, -11.5, Math.PI / 2);
    floorDecal(-15.0, -11.5, 3.2, 2.0, new THREE.MeshStandardMaterial({ map: hatchTexture(), transparent: true, opacity: 0.75, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }));
    const keep = makeSign('KEEP CLEAR', '#b0140e', '#ffffff', '\u26D4', 0.5);
    keep.position.set(-HALF_W + 0.05, 1.6, -14.8);
    keep.rotation.y = Math.PI / 2;
    scene.add(keep);
    registerHazard('emergency', 13.1, -11.6, g);
}

// 8. OVERLOADED SHELF — a sagging beam with too much stacked on it.
function buildShelfHazard() {
    const g = new THREE.Group();
    scene.add(g);
    const rowX = 6.2, y = LEVELS[2];
    const zc = -16.5 + 5 * BAY + BAY / 2;                          // bay 5 is skipped by buildRacks()
    // beams bowed downward in the middle
    for (const dx of [-ROW_D / 2, ROW_D / 2]) {
        const geo = new THREE.BoxGeometry(0.05, 0.12, BAY - 0.09, 1, 1, 24);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const t = p.getZ(i) / ((BAY - 0.09) / 2);
            p.setY(i, p.getY(i) - 0.12 * (1 - t * t));
        }
        geo.computeVertexNormals();
        const beam = new THREE.Mesh(geo, M.rackOrange);
        beam.position.set(rowX + dx, y, zc);
        beam.castShadow = true;
        g.add(beam);
    }
    // heavy pallets stacked well beyond the sensible height, some overhanging
    for (const dz of [-0.66, 0.66]) {
        const pal = new THREE.Mesh(makePalletGeometry(), M.wood);
        pal.position.set(rowX, y - 0.05, zc + dz);
        pal.rotation.y = Math.PI / 2;
        pal.rotation.x = dz * 0.03;
        pal.castShadow = true;
        g.add(pal);
        for (let l = 0; l < 4; l++) {
            for (const cx of [-0.19, 0.19]) for (const cz of [-0.38, 0, 0.38]) {
                const b = new THREE.Mesh(new THREE.BoxGeometry(0.375, 0.4, 0.375), M.carton);
                b.position.set(rowX + cx + (l === 3 ? 0.06 : 0), y + 0.14 + l * 0.41 - 0.07, zc + dz + cz);
                b.rotation.y = rr(-0.04, 0.04);
                b.castShadow = true; b.receiveShadow = true;
                g.add(b);
            }
        }
    }
    // one carton hanging off the aisle edge, ready to fall
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), M.carton);
    edge.position.set(rowX + 0.62, y + 1.72, zc + 0.5);
    edge.rotation.set(0.1, 0.4, -0.35);
    edge.castShadow = true;
    g.add(edge);
    const load = makeSign('MAX LOAD 500KG', '#f2c200', '#111111', '\u2696', 0.3);
    load.position.set(rowX + ROW_D / 2 + 0.06, 3.5, zc - BAY / 2);
    load.rotation.y = Math.PI / 2;
    g.add(load);
    registerHazard('shelf', 8.7, zc, g);
}

// After the employee decides, a "safe" answer secures the area with cones and tape.
function secureArea(h) {
    const stripe = canvasTex(128, 16, (c, w, hh) => {
        c.fillStyle = '#fff'; c.fillRect(0, 0, w, hh);
        c.fillStyle = '#c4160f';
        for (let x = -hh; x < w + hh; x += 24) {
            c.beginPath(); c.moveTo(x, hh); c.lineTo(x + 12, hh); c.lineTo(x + 12 + hh, 0); c.lineTo(x + hh, 0); c.fill();
        }
    }, 6, 1);
    const tapeMat = new THREE.MeshBasicMaterial({ map: stripe, side: THREE.DoubleSide });
    const r = 1.7, corners = [[-r, -r], [r, -r], [r, r], [-r, r]];
    const g = new THREE.Group();
    corners.forEach(([cx, cz], i) => {
        const [nx, nz] = corners[(i + 1) % 4];
        makeCone(h.anchor.x + cx, h.anchor.z + cz);
        const len = Math.hypot(nx - cx, nz - cz);
        const tape = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.07), tapeMat);
        tape.position.set(h.anchor.x + (cx + nx) / 2, 0.68, h.anchor.z + (cz + nz) / 2);
        tape.rotation.y = -Math.atan2(nz - cz, nx - cx);
        g.add(tape);
    });
    scene.add(g);
    h.secured = g;
}


/* =========================================================
   EVERYDAY WAREHOUSE DETAIL
   Floor markings, staging pallets, forklifts, extinguishers,
   signs and clutter, so the space feels used and not empty.
   ========================================================= */
function buildDetails() {
    const yellow = new THREE.MeshStandardMaterial({ map: wornPaintTexture('#dba54a'), transparent: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -1 });
    const green = new THREE.MeshStandardMaterial({ map: wornPaintTexture('#1f8a4c'), transparent: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -1 });
    const hatchMat = new THREE.MeshStandardMaterial({ map: hatchTexture(), transparent: true, opacity: 0.85, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 });

    // main forklift lane down the middle, marked with yellow lines
    for (const x of [-3.2, 3.2]) floorDecal(x, 0, 0.12, 40, yellow);
    // green pedestrian walkways along the aisles between racks
    for (const x of [-8.59, 8.59]) {
        floorDecal(x - 1.5, -3, 0.1, 27, green);
        floorDecal(x + 1.5, -3, 0.1, 27, green);
    }
    // hatched no-storage zones at the aisle mouths
    for (const x of [-8.59, 8.59]) floorDecal(x, 11.4, 3.2, 1.0, hatchMat);
    floorDecal(0, 11.6, 8.4, 0.5, hatchMat);
    // staging area outlines
    [[-6, 15.5], [6, 15.5]].forEach(([x, z]) => {
        floorDecal(x, z - 2.4, 5, 0.1, yellow); floorDecal(x, z + 2.4, 5, 0.1, yellow);
        floorDecal(x - 2.5, z, 0.1, 4.9, yellow); floorDecal(x + 2.5, z, 0.1, 4.9, yellow);
    });

    // dock doors along the front wall
    [-12, -5, 5, 12].forEach(makeDockDoor);

    // two numbered roller doors at the far end, with chevron markings in front,
    // so the long aisle ends the way it does in the reference photo
    makeBackDoor(-2.2, '01');
    makeBackDoor(2.2, '02');
    const chevron = new THREE.MeshStandardMaterial({ map: chevronTexture(), transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
    floorDecal(-2.2, -18.9, 2.8, 4.2, chevron);
    floorDecal(2.2, -18.9, 2.8, 4.2, chevron);
    for (const cx of [-2.2, 2.2]) {
        floorDecal(cx, -16.8, 3.2, 0.1, yellow); floorDecal(cx, -21.0, 3.2, 0.1, yellow);
        floorDecal(cx - 1.6, -18.9, 0.1, 4.3, yellow); floorDecal(cx + 1.6, -18.9, 0.1, 4.3, yellow);
    }

    // staging pallets and parked equipment in the front half
    floorPallet(-7.2, 15.0, 0.05, 'wrapped', 3);
    floorPallet(-5.0, 14.8, -0.04, 'cartons', 3);
    floorPallet(-6.1, 16.9, 0.1, 'cartons', 2);
    floorPallet(5.2, 14.3, 0.0, 'wrapped', 4);
    floorPallet(7.0, 15.7, 0.08, 'cartons', 3);
    addCollider(-6.2, 15.5, 4.6, 4.2, 2);
    addCollider(6.1, 15.1, 4.2, 3.4, 2.2);
    makeForklift(-9.5, 19.0, 0.3);
    makeForklift(10.8, 13.4, -1.4);
    makePalletTruck(2.6, 19.6, 1.2, true);
    makePalletTruck(-8.8, 12.6, 0.2, false);

    // stacks of empty pallets and general clutter near the walls
    for (let i = 0; i < 7; i++) {
        const p = new THREE.Mesh(makePalletGeometry(), M.wood);
        p.position.set(-16.1, 0.03 + i * 0.146, 2); p.rotation.y = rr(-0.05, 0.05); p.castShadow = true; scene.add(p);
    }
    addCollider(-16.1, 2, 1.4, 1.0, 1.1);
    for (let i = 0; i < 5; i++) {
        const p = new THREE.Mesh(makePalletGeometry(), M.wood);
        p.position.set(16.1, 0.03 + i * 0.146, -2); p.rotation.y = Math.PI / 2 + rr(-0.05, 0.05); p.castShadow = true; scene.add(p);
    }
    addCollider(16.1, -2, 1.0, 1.4, 0.8);
    makeDrum(-16.2, -8.0, 0x2a2e33, 'WASTE OIL', '#c47a00');
    makeDrum(-16.2, -8.8, 0x2a2e33, 'WASTE OIL', '#c47a00');
    addCollider(-16.2, -8.4, 0.8, 1.6, 1);

    // fire extinguishers on side-wall columns
    // (two are fixed to the face of a column, the rest straight onto the wall)
    makeExtinguisher(-HALF_W + 0.48, -6, Math.PI / 2);
    makeExtinguisher(HALF_W - 0.48, 6, -Math.PI / 2);
    makeExtinguisher(-HALF_W + 0.03, -13, Math.PI / 2);
    makeExtinguisher(HALF_W - 0.03, -14, -Math.PI / 2);
    makeExtinguisher(-HALF_W + 0.03, 10, Math.PI / 2);

    // safety notice boards on the walls
    const notice = (x, z, ry, text, bg, fg, sym, size = 0.7, y = 2.0) => {
        const s = makeSign(text, bg, fg, sym, size);
        s.position.set(x, y, z);
        s.rotation.y = ry;
        scene.add(s);
    };
    notice(-HALF_W + 0.05, 3.5, Math.PI / 2, 'WEAR PPE', '#0b4f9c', '#ffffff', '\uD83E\uDDBA');
    notice(-HALF_W + 0.05, -2, Math.PI / 2, 'FORKLIFTS OPERATING', '#f2c200', '#111111', '\u26A0');
    notice(HALF_W - 0.05, -4, -Math.PI / 2, 'WEAR PPE', '#0b4f9c', '#ffffff', '\uD83E\uDDBA');
    notice(HALF_W - 0.05, 10, -Math.PI / 2, 'KEEP AISLES CLEAR', '#0d7a3c', '#ffffff', '\u2714');
    notice(-1.4, HALF_L - 0.05, Math.PI, 'SAFETY FIRST', '#0d7a3c', '#ffffff', '\u271A', 0.9, 2.6);
    notice(1.4, HALF_L - 0.05, Math.PI, 'SPEED LIMIT 5', '#ffffff', '#b0140e', '5', 0.7, 2.4);
    notice(0, -HALF_L + 0.05, 0, 'FIRST AID', '#0d7a3c', '#ffffff', '\u271A', 0.6, 2.2);
}


/* =========================================================
   BUILD THE WHOLE WORLD (once)
   ========================================================= */
function buildWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14171a);
    scene.fog = new THREE.FogExp2(0x1b1e21, 0.008);        // a light haze gives the hall depth

    // Reflections/ambient light come from a generic room environment.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = TUNING.envLight;

    createMaterials();
    buildShell();
    buildRacks();
    buildDetails();

    // The eight hazards
    buildOilHazard();
    buildBoxHazard();
    buildElectricalHazard();
    buildCableHazard();
    buildChemicalHazard();
    buildFireHazard();
    buildEmergencyHazard();
    buildShelfHazard();
}


/* =========================================================
   PLAYER, CAMERA AND INPUT
   ========================================================= */
const player = {
    root: null, human: null, mixer: null, actions: null, currentAction: null,
    pos: new THREE.Vector3(0, 0, 19.5),
    heading: Math.PI,          // direction the employee is facing
    speed: 0                   // real speed after collisions (drives the walk animation)
};
const cam = { yaw: Math.PI, pitch: 0.28, dist: TUNING.camDistance, curDist: TUNING.camDistance, target: new THREE.Vector3() };
const keys = {};
let panelOpen = false;         // true while a hazard / result panel is on screen
let everLocked = false;        // did pointer lock ever work? (otherwise we fall back to drag-to-look)
let fallbackLook = false;
let dragging = false;
let nearHazard = null;
let nearDone = false;
let toastEl = null, toastTimer = null;
let promptEl = null, overlayEl = null, loadingEl = null, canvasEl = null;
const modelCache = {};

/* =========================================================
   360 DEGREE PHOTO (for the Pannellum viewer)
   The scene is rendered six times (front, back, left, right, up,
   down) from the employee's eye position. The six square views are
   then stitched into one equirectangular panorama, which is the
   image format Pannellum expects. The result is a real 360 degree
   picture of the 3D warehouse at the spot where the employee stands.
   ========================================================= */

// Direction of each cube face: "f" = where the camera looks, "u" = its up direction.
const CUBE_FACES = [
    { f: [0, 0, 1], u: [0, 1, 0] },  { f: [0, 0, -1], u: [0, 1, 0] },
    { f: [1, 0, 0], u: [0, 1, 0] },  { f: [-1, 0, 0], u: [0, 1, 0] },
    { f: [0, 1, 0], u: [0, 0, 1] },  { f: [0, -1, 0], u: [0, 0, -1] }
];

// Pure maths (no WebGL), so it can be tested on its own.
// faces[i] = RGBA pixel array (n x n) of CUBE_FACES[i]. Returns an RGBA array (w x h).
// "heading" is the world direction that ends up in the centre of the panorama.
function stitchEquirect(faces, n, w, h, heading) {
    const out = new Uint8ClampedArray(w * h * 4);
    // right vector of every face (same rule three.js uses for lookAt): r = f x u
    const basis = CUBE_FACES.map(({ f, u }) => ({
        f, u, r: [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]]
    }));
    for (let py = 0; py < h; py++) {
        const lat = Math.PI / 2 - ((py + 0.5) / h) * Math.PI;
        const cl = Math.cos(lat), sl = Math.sin(lat);
        for (let px = 0; px < w; px++) {
            const lon = ((px + 0.5) / w) * Math.PI * 2 - Math.PI;       // turning right is positive
            const dx = Math.sin(heading - lon) * cl, dy = sl, dz = Math.cos(heading - lon) * cl;
            // the face the ray points at most directly
            let best = 0, bestDot = -2;
            for (let i = 0; i < 6; i++) {
                const f = basis[i].f, dot = dx * f[0] + dy * f[1] + dz * f[2];
                if (dot > bestDot) { bestDot = dot; best = i; }
            }
            const b = basis[best];
            const x = (dx * b.r[0] + dy * b.r[1] + dz * b.r[2]) / bestDot;
            const y = (dx * b.u[0] + dy * b.u[1] + dz * b.u[2]) / bestDot;
            const col = Math.min(n - 1, Math.max(0, Math.floor((x * 0.5 + 0.5) * n)));
            const row = Math.min(n - 1, Math.max(0, Math.floor((0.5 - y * 0.5) * n)));
            const src = (row * n + col) * 4, dst = (py * w + px) * 4;
            const px4 = faces[best];
            out[dst] = px4[src]; out[dst + 1] = px4[src + 1]; out[dst + 2] = px4[src + 2]; out[dst + 3] = 255;
        }
    }
    return out;
}

// Takes the 360 degree picture and returns it as a JPEG data URL.
function capture360() {
    const N = 1024, W = 2048, H = 1024;
    const prevRatio = renderer.getPixelRatio();
    const prevSize = renderer.getSize(new THREE.Vector2());
    renderer.setPixelRatio(1);
    renderer.setSize(N, N, false);
    const eye = new THREE.Vector3(player.pos.x, 1.65, player.pos.z);
    const cubeCam = new THREE.PerspectiveCamera(90, 1, 0.05, 140);
    cubeCam.position.copy(eye);
    if (player.root) player.root.visible = false;            // the photo is taken from the employee's eyes
    const grab = document.createElement('canvas');
    grab.width = grab.height = N;
    const gctx = grab.getContext('2d', { willReadFrequently: true });
    const faces = [];
    for (const { f, u } of CUBE_FACES) {
        cubeCam.up.set(u[0], u[1], u[2]);
        cubeCam.lookAt(eye.x + f[0], eye.y + f[1], eye.z + f[2]);
        cubeCam.updateMatrixWorld(true);
        renderer.render(scene, cubeCam);
        gctx.drawImage(renderer.domElement, 0, 0, N, N);      // copy straight away, before the buffer is cleared
        faces.push(gctx.getImageData(0, 0, N, N).data);
    }
    if (player.root) player.root.visible = true;
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);
    const pixels = stitchEquirect(faces, N, W, H, cam.yaw);
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    out.getContext('2d').putImageData(new ImageData(pixels, W, H), 0, 0);
    return out.toDataURL('image/jpeg', 0.92);
}

// Optional: use a real rigged character if the file exists in assests/models/.
async function loadPlayerModel(female) {
    const key = female ? 'female' : 'male';
    if (key in modelCache) return modelCache[key];
    try {
        const gltf = await new GLTFLoader().loadAsync(`assests/models/worker-${key}.glb`);
        const model = gltf.scene;
        const bb = new THREE.Box3().setFromObject(model);
        model.scale.multiplyScalar((female ? 1.68 : 1.78) / (bb.max.y - bb.min.y));
        const bb2 = new THREE.Box3().setFromObject(model);
        model.position.y -= bb2.min.y;
        model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const mixer = new THREE.AnimationMixer(model);
        const clip = (re) => { const c = gltf.animations.find(a => re.test(a.name)); return c ? mixer.clipAction(c) : null; };
        modelCache[key] = { model, mixer, actions: { idle: clip(/idle/i), walk: clip(/walk/i), run: clip(/run/i) } };
    } catch (e) {
        modelCache[key] = null;             // no model file: the procedural worker is used
    }
    return modelCache[key];
}

async function createPlayer(gender, name) {
    if (player.root) scene.remove(player.root);
    const female = gender === 'female';
    player.human = null; player.mixer = null; player.actions = null; player.currentAction = null;
    const real = await loadPlayerModel(female);
    const root = new THREE.Group();
    if (real) {
        root.add(real.model);
        player.mixer = real.mixer;
        player.actions = real.actions;
    } else {
        // Same clothing for both genders so the choice feels like a real part of the training.
        const h = buildHuman({ ...looksFor(name, female), jacket: 0x34404e, trousers: 0x3b3f44 });
        root.add(h.root);
        player.human = h;
    }
    scene.add(root);
    player.root = root;
}

// Circle-versus-box collision so the employee cannot walk through racks or walls.
const PLAYER_R = 0.36;
function resolveCollisions(p) {
    const lx = HALF_W - 0.7, lz = HALF_L - 0.7;
    p.x = Math.max(-lx, Math.min(lx, p.x));
    p.z = Math.max(-lz, Math.min(lz, p.z));
    for (let pass = 0; pass < 2; pass++) {
        for (const c of colliders) {
            const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
            const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
            const dx = p.x - cx, dz = p.z - cz;
            const d2 = dx * dx + dz * dz;
            if (d2 >= PLAYER_R * PLAYER_R) continue;
            if (d2 > 1e-8) {                                   // push out along the contact normal
                const d = Math.sqrt(d2), push = PLAYER_R - d;
                p.x += (dx / d) * push;
                p.z += (dz / d) * push;
            } else {                                           // centre is inside the box: leave by the shortest side
                const l = p.x - c.minX, r = c.maxX - p.x, t = p.z - c.minZ, b = c.maxZ - p.z;
                const m = Math.min(l, r, t, b);
                if (m === l) p.x = c.minX - PLAYER_R;
                else if (m === r) p.x = c.maxX + PLAYER_R;
                else if (m === t) p.z = c.minZ - PLAYER_R;
                else p.z = c.maxZ + PLAYER_R;
            }
        }
    }
}

// WASD moves the employee relative to where the camera is looking.
function updatePlayer(dt, active) {
    let moved = 0;
    if (active) {
        const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
        const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
        if (f || s) {
            const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
            let dx = sy * f - cy * s, dz = cy * f + sy * s;     // forward = (sinY, cosY), right = (-cosY, sinY)
            const len = Math.hypot(dx, dz);
            dx /= len; dz /= len;
            const running = keys.ShiftLeft || keys.ShiftRight;
            const v = (running ? TUNING.runSpeed : TUNING.walkSpeed) * (f < 0 && !s ? 0.75 : 1);
            const before = player.pos.clone();
            player.pos.x += dx * v * dt;
            player.pos.z += dz * v * dt;
            resolveCollisions(player.pos);
            moved = player.pos.distanceTo(before) / dt;
            // turn the body smoothly toward the direction of travel
            let diff = Math.atan2(dx, dz) - player.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            player.heading += diff * Math.min(1, dt * 10);
        }
    }
    player.speed += (moved - player.speed) * Math.min(1, dt * 12);
    player.root.position.copy(player.pos);
    player.root.rotation.y = player.heading;
}

function animatePlayer(dt, t) {
    if (player.human) {
        animateHuman(player.human, dt, player.speed, t);
    } else if (player.mixer) {
        const a = player.actions;
        const want = player.speed > TUNING.walkSpeed + 0.9 && a.run ? a.run : player.speed > 0.2 ? (a.walk || a.run) : a.idle;
        if (want && want !== player.currentAction) {
            want.reset().fadeIn(0.2).play();
            if (player.currentAction) player.currentAction.fadeOut(0.2);
            player.currentAction = want;
        }
        player.mixer.update(dt);
    }
}

// True if a camera position would end up inside a rack, box, wall or the floor.
function cameraBlocked(x, y, z) {
    if (y < 0.3) return true;
    if (Math.abs(x) > HALF_W - 0.35 || Math.abs(z) > HALF_L - 0.35) return true;
    for (const c of colliders) {
        if (y < c.h + 0.2 && x > c.minX - 0.25 && x < c.maxX + 0.25 && z > c.minZ - 0.25 && z < c.maxZ + 0.25) return true;
    }
    return false;
}

// Third-person camera: behind and slightly above the employee, orbiting with the mouse.
const camGoal = new THREE.Vector3();
function updateCamera(dt, snap = false) {
    camGoal.set(player.pos.x, 1.75, player.pos.z);
    cam.target.lerp(camGoal, snap ? 1 : 1 - Math.exp(-dt * 14));
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const dx = -Math.sin(cam.yaw) * cp, dz = -Math.cos(cam.yaw) * cp, dy = sp;
    // shorten the boom arm until the camera is no longer inside geometry
    let d = cam.dist;
    while (d > 0.8 && cameraBlocked(cam.target.x + dx * d, cam.target.y + dy * d, cam.target.z + dz * d)) d -= 0.15;
    cam.curDist = d < cam.curDist || snap ? d : cam.curDist + (d - cam.curDist) * Math.min(1, dt * 3);
    camera.position.set(cam.target.x + dx * cam.curDist, cam.target.y + dy * cam.curDist, cam.target.z + dz * cam.curDist);
    // look slightly above the head so the employee sits in the lower-middle of the screen
    camera.lookAt(cam.target.x, cam.target.y + 0.25, cam.target.z);
}

// Sparks, smoke and the smoker's idle movement.
function updateFX(t, dt) {
    if (fx.sparks) {
        const pos = fx.sparks.geometry.attributes.position;
        const vel = fx.sparks.userData.vel, life = fx.sparks.userData.life;
        const burst = Math.sin(t * 2.3) + Math.sin(t * 5.7) > 0.9;      // sparks come in short bursts
        for (let i = 0; i < life.length; i++) {
            if (life[i] <= 0) {
                if (burst && rand() < 0.35) {
                    pos.setXYZ(i, rr(-0.05, 0.15), rr(0.05, 0.2), rr(0, 0.15));
                    vel[i].set(rr(-0.6, 0.6), rr(0.6, 1.7), rr(-0.3, 0.7));
                    life[i] = rr(0.15, 0.5);
                } else pos.setXYZ(i, 0, -10, 0);
            } else {
                life[i] -= dt;
                vel[i].y -= 4.2 * dt;
                pos.setXYZ(i, pos.getX(i) + vel[i].x * dt, Math.max(0.02, pos.getY(i) + vel[i].y * dt), pos.getZ(i) + vel[i].z * dt);
            }
        }
        pos.needsUpdate = true;
        fx.sparkLight.intensity = burst ? 10 + rand() * 25 : 0;
    }
    // smoke: thin wisps from the cigarette, thick dark plume from the fire
    for (const sp of fx.smoke) {
        const u = sp.userData;
        u.t = (u.t + dt * (u.speed || 0.2)) % 1;
        const rise = u.rise || 1.4, drift = u.drift || 0.12;
        sp.position.set(u.origin.x + Math.sin(t * 0.7 + u.t * 6) * drift * u.t, u.origin.y + u.t * rise, u.origin.z + Math.cos(t * 0.5 + u.t * 5) * drift * u.t);
        sp.scale.setScalar(0.05 + u.t * (u.size || 0.45));
        sp.material.opacity = Math.min(1, u.t * 8) * (1 - u.t) * (u.alpha || 0.4);
    }
    // flames: each sprite rises, shrinks and fades, then restarts at the base
    if (fx.flames) {
        for (const sp of fx.flames) {
            const u = sp.userData;
            u.t = (u.t + dt * u.spd) % 1;
            const w = u.size * (1 - u.t * 0.65) * 0.75;
            const hgt = u.size * (1.25 - u.t * 0.45);
            sp.scale.set(w, hgt, 1);
            sp.position.set(
                fx.fireBase.x + u.ox * (1 - u.t * 0.7) + Math.sin(t * 6 + u.ph) * 0.05 * u.t,
                0.12 + u.t * 0.55 + hgt * 0.45,
                fx.fireBase.z + u.oz * (1 - u.t * 0.7)
            );
            sp.material.opacity = Math.min(1, u.t * 9) * Math.pow(1 - u.t, 0.7);
        }
        fx.fireLight.intensity = 26 + Math.sin(t * 21) * 5 + Math.sin(t * 37) * 4 + rand() * 8;
    }
    // embers
    if (fx.embers) {
        const pos = fx.embers.geometry.attributes.position;
        const vel = fx.embers.userData.vel, life = fx.embers.userData.life;
        for (let i = 0; i < life.length; i++) {
            if (life[i] <= 0) {
                if (rand() < 0.12) {
                    pos.setXYZ(i, fx.fireBase.x + rr(-0.3, 0.3), 0.4, fx.fireBase.z + rr(-0.3, 0.3));
                    vel[i].set(rr(-0.15, 0.15), rr(0.5, 1.2), rr(-0.15, 0.15));
                    life[i] = rr(0.8, 1.8);
                } else pos.setXYZ(i, 0, -10, 0);
            } else {
                life[i] -= dt;
                pos.setXYZ(i, pos.getX(i) + vel[i].x * dt + Math.sin(t * 5 + i) * 0.004, pos.getY(i) + vel[i].y * dt, pos.getZ(i) + vel[i].z * dt);
            }
        }
        pos.needsUpdate = true;
    }
    if (smoker) {
        smoker.torso.scale.y = 1 + Math.sin(t * 1.5) * 0.007;
        smoker.head.rotation.y = Math.sin(t * 0.4) * 0.12;
    }
}

// Shows the "possible hazard" notice when the employee is close to something unsafe.
// There is deliberately NO on-screen hint here. The employee has to notice
// the hazard by looking, then press E close to it. Pressing E anywhere else
// just says nothing is wrong, so nothing is given away.
function updateInteraction() {
    nearHazard = null;
    nearDone = false;
    let best = Infinity;
    for (const h of hazards) {
        const d = Math.hypot(player.pos.x - h.anchor.x, player.pos.z - h.anchor.z);
        if (d >= TUNING.inspectRadius) continue;
        if (h.done) { nearDone = true; continue; }
        if (d < best) { best = d; nearHazard = h; }
    }
}

// Small message at the bottom of the screen (used when E finds nothing).
function showToast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 1600);
}

function overlayVisible() { return overlayEl && overlayEl.classList.contains('visible'); }
function showOverlay(title, sub) {
    overlayEl.querySelector('h2').textContent = title;
    overlayEl.querySelector('p').textContent = sub;
    overlayEl.classList.add('visible');
}
function hideOverlay() { overlayEl.classList.remove('visible'); }

// E was pressed next to a hazard: freeze the world and hand over to script.js (question panel).
function inspect(h) {
    panelOpen = true;
    promptEl.classList.remove('visible');
    if (document.pointerLockElement) document.exitPointerLock();
    if (typeof api.onInspect === 'function') api.onInspect(h.type);
}

// Tries to capture the mouse. Needs a user gesture, which the click on CONTINUE provides.
function requestLook() {
    try {
        const p = canvasEl.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => { showOverlay('PAUSED', 'Click to continue'); });
    } catch (e) {
        showOverlay('PAUSED', 'Click to continue');
    }
}

function bindInput() {
    window.addEventListener('keydown', (e) => {
        if (!running) return;
        keys[e.code] = true;
        if (e.code === 'KeyV' && !panelOpen && !overlayVisible() && typeof api.onView360 === 'function') {
            api.onView360();
        }
        if (e.code === 'KeyE' && !panelOpen && !overlayVisible()) {
            if (nearHazard) inspect(nearHazard);
            else showToast(nearDone ? 'You have already dealt with this area.' : 'Nothing unusual here.');
        }
        // ESC pauses when the browser is not doing it for us (drag-to-look fallback)
        if (e.code === 'Escape' && fallbackLook && !panelOpen) {
            overlayVisible() ? hideOverlay() : showOverlay('PAUSED', 'Click to continue');
        }
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    document.addEventListener('mousemove', (e) => {
        if (!running || panelOpen || overlayVisible()) return;
        if (document.pointerLockElement === canvasEl || dragging) {
            cam.yaw -= e.movementX * TUNING.mouseSensitivity;
            cam.pitch = Math.max(-0.2, Math.min(1.1, cam.pitch + e.movementY * TUNING.mouseSensitivity));
        }
    });
    canvasEl.addEventListener('mousedown', () => { if (fallbackLook) dragging = true; });
    window.addEventListener('mouseup', () => { dragging = false; });
    canvasEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        cam.dist = Math.max(TUNING.camMin, Math.min(TUNING.camMax, cam.dist + Math.sign(e.deltaY) * 0.3));
    }, { passive: false });

    overlayEl.addEventListener('click', () => {
        if (fallbackLook) { hideOverlay(); return; }
        try { canvasEl.requestPointerLock(); } catch (e) { fallbackLook = true; hideOverlay(); }
    });
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === canvasEl) {
            everLocked = true;
            hideOverlay();
        } else if (running && !panelOpen && !fallbackLook) {
            showOverlay('PAUSED', 'Click to continue');
        }
    });
    document.addEventListener('pointerlockerror', () => {
        // If the mouse could never be captured (some embedded browsers), drag-to-look is used instead.
        if (!everLocked) { fallbackLook = true; hideOverlay(); }
        else showOverlay('PAUSED', 'Click to continue');
    });
    const resize = () => {
        if (!renderer) return;
        const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', () => setTimeout(resize, 60));
    if (window.ResizeObserver) new ResizeObserver(resize).observe(container);
    resize();
}

// Creates the renderer, camera and the small on-screen notices.
function initEngine() {
    container = document.getElementById('panorama');
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = TUNING.exposure;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    canvasEl = renderer.domElement;
    canvasEl.style.display = 'block';
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 140);
    clock = new THREE.Clock();

    const host = document.getElementById('game-screen') || container.parentElement;
    promptEl = document.createElement('div');
    promptEl.id = 'hz-prompt';
    host.appendChild(promptEl);           // kept empty and hidden: hazards are never announced
    toastEl = document.createElement('div');
    toastEl.id = 'hz-toast';
    host.appendChild(toastEl);
    overlayEl = document.createElement('div');
    overlayEl.id = 'hz-overlay';
    overlayEl.innerHTML = '<div class="hz-overlay-box"><h2></h2><p></p>' +
        '<small>WASD move \u00B7 Mouse look \u00B7 Shift run \u00B7 E inspect \u00B7 Wheel zoom \u00B7 ESC pause</small></div>';
    host.appendChild(overlayEl);
    loadingEl = document.createElement('div');
    loadingEl.id = 'hz-loading';
    loadingEl.innerHTML = '<div class="hz-overlay-box"><h2>LOADING WAREHOUSE</h2><p>Preparing the training environment\u2026</p></div>';
    host.appendChild(loadingEl);
    bindInput();
}


/* =========================================================
   RENDER LOOP
   ========================================================= */
function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const active = !panelOpen && !overlayVisible();
    updatePlayer(dt, active);
    animatePlayer(dt, t);
    updateCamera(dt);
    updateFX(t, dt);
    updateInteraction();
    renderer.render(scene, camera);
}


/* =========================================================
   PUBLIC API — used by script.js
   ========================================================= */
const api = {
    // script.js sets this; it is called with the hazard type ("oil", "box"...)
    onInspect: null,
    onView360: null,          // script.js sets this; called when the employee presses V

    // Builds the world (first time only) and starts a training run.
    async start(opts = {}) {
        try {
            if (!renderer) initEngine();
            loadingEl.classList.add('visible');
            // give the browser a frame to paint the loading message before the heavy build
            await new Promise(r => setTimeout(r, 30));
            if (!built) { buildWorld(); built = true; }
            for (const h of hazards) {                          // fresh run: remove tape and cones
                h.done = false;
                if (h.secured) { scene.remove(h.secured); h.secured = null; }
            }
            await createPlayer(opts.gender, opts.name);
            player.pos.set(0, 0, 19.5);
            player.heading = Math.PI;
            player.speed = 0;
            cam.yaw = Math.PI; cam.pitch = 0.28; cam.dist = TUNING.camDistance;
            updatePlayer(0, false);
            updateCamera(0, true);
            for (const k in keys) keys[k] = false;
            panelOpen = false;
            loadingEl.classList.remove('visible');
            running = true;
            clock.getDelta();
            showOverlay('CLICK TO ENTER THE WAREHOUSE', 'Inspect the warehouse and identify unsafe conditions.');
            loop();
            return true;
        } catch (err) {
            console.error('3D warehouse failed to start:', err);
            if (loadingEl) loadingEl.classList.remove('visible');
            return false;
        }
    },

    // Freezes the world (used while the 360 degree viewer is open) and returns the photo.
    capture360() {
        panelOpen = true;
        promptEl.classList.remove('visible');
        if (document.pointerLockElement) document.exitPointerLock();
        for (const k in keys) keys[k] = false;
        return capture360();
    },
    _stitch: stitchEquirect,         // exposed only so the maths can be tested

    // Called when the result panel is closed: the employee continues exploring.
    resume() {
        if (!running) return;
        panelOpen = false;
        showOverlay('PAUSED', 'Click to continue');
        requestLook();
    },

    // Called after the employee answers. "safe" secures the area with cones and tape.
    resolveHazard(type, decision) {
        const h = hazards.find(x => x.type === type);
        if (!h) return;
        h.done = true;
        if (decision === 'safe') secureArea(h);
    },

    remaining() { return hazards.filter(h => !h.done).length; },

    // read-only info for automated tests (collision map and hazard positions)
    debug() {
        return {
            colliders, HALF_W, HALF_L, playerR: PLAYER_R, reach: TUNING.inspectRadius,
            start: [0, 19.5], anchors: hazards.map(h => ({ type: h.type, x: h.anchor.x, z: h.anchor.z }))
        };
    },
    total() { return hazards.length || 8; },

    // Stops rendering (training finished, exited or timed out).
    stop() {
        running = false;
        panelOpen = false;
        if (document.pointerLockElement) document.exitPointerLock();
        if (promptEl) promptEl.classList.remove('visible');
        if (overlayEl) overlayEl.classList.remove('visible');
        if (loadingEl) loadingEl.classList.remove('visible');
        for (const k in keys) keys[k] = false;
    }
};

window.HazardZero3D = api;
window.dispatchEvent(new Event('hazardzero3d-ready'));
console.log('Hazard Zero 3D engine ready.');
