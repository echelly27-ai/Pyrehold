// Meshes for placeable structures. Styles keep tiers visually distinct
// without a unique model for every id.
import * as THREE from "three";
import { TIER_PALETTE } from "../config/buildings.js";

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extra.roughness ?? 0.86,
    metalness: extra.metalness ?? 0.06,
    emissive: extra.emissive ?? 0x000000,
    emissiveIntensity: extra.emissiveIntensity ?? 0,
    flatShading: true,
  });
}

function add(group, geo, material, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function makeBuildingMesh(def) {
  const pal = TIER_PALETTE[def.tier] || TIER_PALETTE[0];
  const main = mat(pal.main);
  const trim = mat(pal.trim);
  const roof = mat(pal.roof);
  const metal = mat(pal.metal, { metalness: 0.45, roughness: 0.4 });
  const g = new THREE.Group();
  const tall = def.turret ? 2.4 : 2.2;

  switch (def.style) {
    case "wall": {
      add(g, boxG(1.9, tall, 0.35), main, 0, tall / 2, 0);
      add(g, boxG(0.18, tall + 0.1, 0.42), trim, -0.85, tall / 2, 0);
      add(g, boxG(0.18, tall + 0.1, 0.42), trim, 0.85, tall / 2, 0);
      add(g, boxG(1.95, 0.16, 0.48), def.tier >= 4 ? metal : trim, 0, tall - 0.02, 0);
      if (def.tier >= 3) add(g, boxG(1.5, 0.08, 0.08), metal, 0, 1.1, -0.2);
      break;
    }
    case "gate": {
      add(g, boxG(0.28, tall, 0.4), trim, -0.75, tall / 2, 0);
      add(g, boxG(0.28, tall, 0.4), trim, 0.75, tall / 2, 0);
      const leaf = add(g, boxG(1.15, tall * 0.86, 0.16), main, 0, tall * 0.45, 0);
      leaf.name = "gateLeaf";
      add(g, boxG(1.7, 0.18, 0.46), metal, 0, tall - 0.05, 0);
      break;
    }
    case "floor": {
      const p = add(g, boxG(1.9, 0.08, 1.9), main, 0, 0.04, 0);
      p.castShadow = false;
      add(g, boxG(1.9, 0.04, 0.08), trim, 0, 0.08, 0.9);
      break;
    }
    case "barricade": {
      add(g, boxG(1.7, 0.16, 0.16), main, 0, 0.55, 0);
      add(g, boxG(1.5, 0.14, 0.14), main, 0, 0.9, 0.05);
      add(g, boxG(0.12, 1.1, 0.12), trim, -0.7, 0.55, 0);
      add(g, boxG(0.12, 1.1, 0.12), trim, 0.7, 0.55, 0);
      const a = add(g, boxG(1.5, 0.1, 0.1), trim, 0, 0.7, 0);
      a.rotation.z = 0.5;
      break;
    }
    case "storage": {
      add(g, boxG(1.5, 1.1, 1.2), main, 0, 0.6, 0);
      add(g, boxG(1.7, 0.12, 1.4), roof, 0, 1.2, 0);
      add(g, boxG(0.5, 0.7, 0.08), trim, 0, 0.55, -0.62);
      break;
    }
    case "campfire": {
      add(g, boxG(0.9, 0.15, 0.2), trim, 0, 0.15, 0);
      const b = add(g, boxG(0.9, 0.15, 0.2), trim, 0, 0.15, 0);
      b.rotation.y = Math.PI / 2;
      const flame = add(
        g,
        new THREE.ConeGeometry(0.22, 0.55, 6),
        mat(0xff7a32, { emissive: 0xff5a18, emissiveIntensity: 0.9 }),
        0,
        0.5,
        0
      );
      flame.name = "flame";
      break;
    }
    case "tower": {
      add(g, boxG(1.3, 0.3, 1.3), trim, 0, 0.15, 0);
      add(g, boxG(0.7, 2.6, 0.7), main, 0, 1.5, 0);
      add(g, boxG(1.35, 0.18, 1.35), roof, 0, 2.9, 0);
      add(g, boxG(0.12, 0.5, 0.7), metal, 0.2, 2.7, -0.2);
      break;
    }
    case "turret": {
      add(g, new THREE.CylinderGeometry(0.7, 0.85, 0.4, 8), trim, 0, 0.2, 0);
      add(g, new THREE.CylinderGeometry(0.28, 0.32, 1.1, 8), main, 0, 0.9, 0);
      const barrel = add(g, boxG(0.16, 0.16, 0.9), metal, 0, 1.35, -0.4);
      barrel.name = "barrel";
      break;
    }
    case "laser": {
      add(g, new THREE.CylinderGeometry(0.55, 0.7, 0.35, 8), trim, 0, 0.2, 0);
      add(g, boxG(0.45, 0.9, 0.45), main, 0, 0.8, 0);
      const lens = add(
        g,
        new THREE.CylinderGeometry(0.16, 0.16, 0.5, 8),
        mat(0xff7a32, { emissive: 0xff5a18, emissiveIntensity: 1 }),
        0,
        1.25,
        -0.3
      );
      lens.rotation.x = Math.PI / 2;
      lens.name = "barrel";
      break;
    }
    case "workshop":
    case "hall": {
      add(g, boxG(3.4, 1.6, 3.2), main, 0, 0.85, 0);
      add(g, boxG(3.7, 0.2, 3.5), roof, 0, 1.75, 0);
      add(g, boxG(0.8, 1.1, 0.1), trim, 0, 0.7, -1.62);
      add(g, boxG(0.7, 0.5, 0.08), metal, -1.1, 1.05, -1.62);
      break;
    }
    case "gen": {
      add(g, boxG(3.2, 0.9, 1.4), main, 0, 0.5, 0);
      add(g, boxG(0.8, 0.7, 0.8), trim, -0.9, 1.15, 0);
      add(g, new THREE.CylinderGeometry(0.18, 0.18, 0.7, 6), metal, 0.8, 1.15, 0);
      break;
    }
    case "generator": {
      add(g, boxG(3.1, 1.15, 1.5), main, 0, 0.6, 0);
      add(g, new THREE.CylinderGeometry(0.35, 0.35, 0.8, 8), metal, 0.7, 1.4, 0);
      const glow = add(
        g,
        new THREE.BoxGeometry(0.3, 0.2, 0.08),
        mat(0x7dffa8, { emissive: 0x33ff88, emissiveIntensity: 0.8 }),
        -0.8,
        0.7,
        -0.76
      );
      glow.name = "flame";
      break;
    }
    case "medical": {
      add(g, boxG(1.5, 1.3, 1.3), main, 0, 0.7, 0);
      add(g, boxG(0.5, 0.12, 0.12), mat(0xf4efe6), 0, 1.55, 0);
      add(g, boxG(0.12, 0.5, 0.12), mat(0xf4efe6), 0, 1.55, 0);
      add(g, boxG(0.7, 0.5, 0.08), mat(0xdfe7ea), 0, 0.9, -0.66);
      break;
    }
    case "command": {
      add(g, boxG(3.3, 1.8, 3.1), main, 0, 0.95, 0);
      add(g, boxG(1.2, 0.9, 1.2), trim, 0, 2.2, 0);
      add(g, new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), metal, 1.2, 2.4, 0);
      break;
    }
    case "missile": {
      add(g, boxG(2.6, 0.5, 2.6), trim, 0, 0.25, 0);
      add(g, boxG(0.28, 1.3, 0.28), metal, -0.4, 1.1, 0);
      add(g, boxG(0.28, 1.3, 0.28), metal, 0.4, 1.1, 0);
      add(g, boxG(1.4, 0.2, 0.5), main, 0, 1.8, 0);
      break;
    }
    case "fence": {
      add(g, boxG(0.08, 1.5, 0.08), metal, -0.8, 0.75, 0);
      add(g, boxG(0.08, 1.5, 0.08), metal, 0.8, 0.75, 0);
      add(g, boxG(1.7, 0.05, 0.05), metal, 0, 0.45, 0);
      add(g, boxG(1.7, 0.05, 0.05), metal, 0, 0.9, 0);
      add(g, boxG(1.7, 0.05, 0.05), metal, 0, 1.3, 0);
      const spark = add(
        g,
        boxG(1.5, 0.02, 0.02),
        mat(0x9fdfff, { emissive: 0x66ccff, emissiveIntensity: 0.9 }),
        0,
        1.05,
        0
      );
      spark.name = "flame";
      break;
    }
    case "bunker": {
      add(g, boxG(3.4, 0.45, 3.2), trim, 0, 0.2, 0);
      add(g, boxG(2.2, 0.9, 1.6), main, 0, 0.75, 0);
      add(g, boxG(0.8, 0.15, 1.2), metal, 0, 0.35, -1.2);
      break;
    }
    case "lab": {
      add(g, boxG(3.2, 1.5, 3), main, 0, 0.8, 0);
      const dome = add(
        g,
        new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(0xd5fff2, { emissive: 0x226655, emissiveIntensity: 0.25, roughness: 0.2, metalness: 0.2 }),
        0,
        1.55,
        0
      );
      dome.name = "flame";
      break;
    }
    case "pyre": {
      add(g, new THREE.CylinderGeometry(1.5, 1.7, 0.45, 8), trim, 0, 0.22, 0);
      add(g, boxG(0.3, 0.9, 0.3), main, 0, 0.7, 0);
      const flame = add(
        g,
        new THREE.ConeGeometry(0.45, 1.3, 7),
        mat(0xff7a32, { emissive: 0xff4a10, emissiveIntensity: 1 }),
        0,
        1.45,
        0
      );
      flame.name = "flame";
      const flame2 = add(
        g,
        new THREE.ConeGeometry(0.25, 0.8, 6),
        mat(0xffe08a, { emissive: 0xffc14a, emissiveIntensity: 0.9 }),
        0,
        1.7,
        0
      );
      flame2.name = "flame2";
      break;
    }
    default: {
      add(g, boxG(1.4, 1.2, 1.4), main, 0, 0.6, 0);
      break;
    }
  }

  const bar = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.1),
    mat(0x67c46a, { emissive: 0x226622, emissiveIntensity: 0.3, roughness: 1 })
  );
  bar.position.set(0, (def.style === "wall" || def.style === "gate" ? tall : 2.2) + 0.35, 0);
  bar.name = "hpbar";
  bar.visible = false;
  g.add(bar);
  return g;
}

export function tintGhost(group, ok) {
  const color = new THREE.Color(ok ? 0x3ddc7a : 0xe23b3b);
  group.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (!o.userData.ghostMat) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.depthWrite = false;
      o.userData.ghostMat = true;
    }
    o.material.opacity = 0.45;
    o.material.color.copy(color);
    o.material.emissive = color;
    o.material.emissiveIntensity = 0.25;
  });
}
