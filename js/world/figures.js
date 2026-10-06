// Blocky people with separate arms and legs. Joints hang from the hip and
// shoulder so a walk cycle is obvious from behind the camera.
import * as THREE from "three";

const mats = new Map();

function mat(color, extra = {}) {
  const key = [
    color,
    extra.roughness ?? 0.78,
    extra.metalness ?? 0.04,
    extra.emissive ?? 0,
    extra.emissiveIntensity ?? 0,
  ].join(":");
  let material = mats.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: extra.roughness ?? 0.78,
      metalness: extra.metalness ?? 0.04,
      emissive: extra.emissive ?? 0x000000,
      emissiveIntensity: extra.emissiveIntensity ?? 0,
      flatShading: true,
    });
    mats.set(key, material);
  }
  return material;
}

function uniqueMat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extra.roughness ?? 0.78,
    metalness: extra.metalness ?? 0.04,
    emissive: extra.emissive ?? 0x000000,
    emissiveIntensity: extra.emissiveIntensity ?? 0,
    flatShading: true,
  });
}

const boxes = new Map();
function geo(w, h, d) {
  const key = w + "x" + h + "x" + d;
  let g = boxes.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxes.set(key, g);
  }
  return g;
}

function box(parent, w, h, d, x, y, z, material, cast = true) {
  const m = new THREE.Mesh(geo(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// A box whose pivot is the top, so rotation.x swings it like a limb.
function hang(parent, w, h, d, material, cast = true) {
  const m = new THREE.Mesh(geo(w, h, d), material);
  m.position.set(0, -h / 2, 0);
  m.castShadow = cast;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function makeLeg(parent, x, hipY, spec) {
  const hip = joint(parent, x, hipY, 0);
  hang(hip, spec.thighW, spec.thighH, spec.thighD, spec.thighMat, true);
  const knee = joint(hip, 0, -spec.thighH, 0);
  hang(knee, spec.shinW, spec.shinH, spec.shinD, spec.shinMat, false);
  const foot = new THREE.Mesh(geo(spec.footW, spec.footH, spec.footD), spec.footMat);
  foot.position.set(0, -spec.shinH - spec.footH * 0.5, -spec.footD * 0.22);
  foot.castShadow = false;
  foot.receiveShadow = false;
  knee.add(foot);
  return { hip, knee };
}

function makeArm(parent, x, shoulderY, spec) {
  const shoulder = joint(parent, x, shoulderY, 0);
  hang(shoulder, spec.armW, spec.upperH, spec.armD, spec.armMat, true);
  const elbow = joint(shoulder, 0, -spec.upperH, 0);
  hang(elbow, spec.armW * 0.92, spec.foreH, spec.armD * 0.92, spec.handMat, false);
  return { shoulder, elbow };
}

// Positive rotation.x swings a hanging limb toward local -Z (forward).
// rotation.z opens the limb away from the chest so the step still reads
// when the camera sits behind the body.
export function stepLimbs(mesh, phase, amount, attack) {
  const limbs = mesh.userData.limbs;
  if (!limbs) return;
  const crawl = !!mesh.userData.crawl;
  const s = Math.sin(phase);
  const leg = (crawl ? 0.38 : 1.05) * amount;
  const arm = (crawl ? 0.4 : 0.95) * amount;
  const legOut = (crawl ? 0.06 : 0.14) + (crawl ? 0.1 : 0.38) * amount * Math.abs(s);
  const armOut = (crawl ? 0.2 : 0.22) + (crawl ? 0.08 : 0.28) * amount * Math.abs(s);
  limbs.legL.rotation.x = s * leg;
  limbs.legR.rotation.x = -s * leg;
  limbs.legL.rotation.z = -legOut;
  limbs.legR.rotation.z = legOut;
  limbs.kneeL.rotation.x = amount * 1.05 * Math.max(0, -s);
  limbs.kneeR.rotation.x = amount * 1.05 * Math.max(0, s);
  const rest = crawl ? -0.95 : -0.18;
  limbs.armL.rotation.x = rest - s * arm;
  limbs.armL.rotation.z = -armOut;
  if (attack > 0.01 && !crawl) {
    limbs.armR.rotation.x = -1.35 * Math.sin(Math.min(1, attack) * Math.PI);
    limbs.armR.rotation.z = -0.15;
  } else {
    limbs.armR.rotation.x = rest + s * arm;
    limbs.armR.rotation.z = armOut;
  }
  if (limbs.extra) {
    limbs.extra.rotation.x = rest + Math.cos(phase) * arm * 0.8;
    limbs.extra.rotation.z = armOut * 0.45;
  }
}

export function buildWarden() {
  const g = new THREE.Group();
  const cloth = mat(0x6e3b2e);
  const clothDark = mat(0x4a261c);
  const skin = mat(0xd7b294);
  const scarf = mat(0xe07030);
  const boot = mat(0x2a211c);

  const legSpec = {
    thighW: 0.26,
    thighH: 0.44,
    thighD: 0.26,
    shinW: 0.22,
    shinH: 0.38,
    shinD: 0.22,
    footW: 0.22,
    footH: 0.1,
    footD: 0.36,
    thighMat: clothDark,
    shinMat: clothDark,
    footMat: boot,
  };
  const armSpec = {
    armW: 0.2,
    armD: 0.18,
    upperH: 0.36,
    foreH: 0.32,
    armMat: cloth,
    handMat: skin,
  };
  const hipY = 0.92;
  const left = makeLeg(g, -0.16, hipY, legSpec);
  const right = makeLeg(g, 0.16, hipY, legSpec);
  const torso = box(g, 0.64, 0.66, 0.38, 0, 1.22, 0, cloth);
  torso.name = "torso";
  box(g, 0.68, 0.16, 0.42, 0, 1.46, 0, scarf);
  box(g, 0.14, 0.36, 0.14, 0.16, 1.22, 0.16, scarf);
  const head = box(g, 0.38, 0.38, 0.38, 0, 1.78, 0, skin);
  head.name = "head";
  box(g, 0.42, 0.12, 0.44, 0, 2.0, 0, clothDark);
  box(g, 0.12, 0.08, 0.08, 0, 1.76, -0.2, mat(0x2a211c));

  const armL = makeArm(g, -0.48, 1.46, armSpec);
  const armR = makeArm(g, 0.48, 1.46, armSpec);
  const weapon = new THREE.Group();
  weapon.name = "weapon";
  weapon.position.set(0.02, -0.34, -0.12);
  armR.elbow.add(weapon);

  g.userData.weaponMount = weapon;
  g.userData.armR = armR.shoulder;
  g.userData.limbs = {
    legL: left.hip,
    legR: right.hip,
    kneeL: left.knee,
    kneeR: right.knee,
    armL: armL.shoulder,
    armR: armR.shoulder,
  };
  return g;
}

export function setWeaponVisual(mount, weaponId) {
  while (mount.children.length) mount.remove(mount.children[0]);
  const wood = mat(0x8a5a32);
  const iron = mat(0xd0d4d8, { metalness: 0.65, roughness: 0.35 });
  const dark = mat(0x2c3034, { metalness: 0.3, roughness: 0.5 });
  const glow = mat(0xff7a32, { emissive: 0xff5a1a, emissiveIntensity: 0.8 });
  const add = (w, h, d, x, y, z, m) => box(mount, w, h, d, x, y, z, m);
  switch (weaponId) {
    case "pistol":
      add(0.08, 0.14, 0.28, 0, 0, -0.1, dark);
      add(0.07, 0.16, 0.08, 0, -0.1, 0.02, dark);
      break;
    case "shotgun":
      add(0.08, 0.08, 0.7, 0, 0, -0.25, dark);
      add(0.09, 0.1, 0.22, 0, -0.02, 0.08, wood);
      break;
    case "sniper":
      add(0.06, 0.06, 0.95, 0, 0.04, -0.35, dark);
      add(0.08, 0.1, 0.2, 0, -0.04, 0.02, wood);
      add(0.08, 0.08, 0.16, 0, 0.1, -0.05, dark);
      break;
    case "lmg":
      add(0.1, 0.12, 0.72, 0, 0, -0.22, dark);
      add(0.16, 0.18, 0.16, 0, -0.12, 0.02, dark);
      break;
    case "rocket":
      add(0.16, 0.16, 0.7, 0, 0, -0.2, mat(0x6a7048));
      add(0.1, 0.1, 0.2, 0, 0, -0.55, iron);
      break;
    case "energy":
    case "plasma":
      add(0.1, 0.1, 0.62, 0, 0, -0.2, dark);
      add(0.06, 0.06, 0.12, 0, 0, -0.52, glow);
      break;
    case "rifle":
    case "advrifle":
    case "smg":
      add(0.07, 0.08, weaponId === "smg" ? 0.42 : 0.62, 0, 0, -0.2, dark);
      add(0.08, 0.14, 0.1, 0, -0.1, 0.02, dark);
      break;
    default:
      add(0.1, 0.1, 0.72, 0, 0, -0.2, wood);
      add(0.14, 0.14, 0.16, 0, 0, -0.52, wood);
      break;
  }
}

export function buildZombie(def) {
  const g = new THREE.Group();
  const skin = mat(def.skin);
  const cloth = mat(def.cloth);
  const bodyMat = uniqueMat(def.armored ? 0x8a9298 : def.cloth);
  if (def.armored) {
    bodyMat.metalness = 0.55;
    bodyMat.roughness = 0.4;
  }
  const eyeMat = mat(def.eye, { emissive: def.eye, emissiveIntensity: 0.9, roughness: 0.4 });
  const armorMat = mat(0x8a9298, { metalness: 0.55, roughness: 0.4 });
  const h = def.height || 1.7;
  const bulk = def.bulk || 1;
  const thin = def.thin ? 0.75 : 1;
  const crawler = !!def.crawler;
  const bodyW = 0.46 * bulk * thin;
  const bodyH = crawler ? 0.3 : h * 0.34;
  const bodyY = crawler ? 0.32 : h * 0.58;
  const headY = crawler ? 0.5 : h * 0.82;

  const legSpec = {
    thighW: 0.18 * bulk,
    thighH: crawler ? 0.14 : h * 0.22,
    thighD: 0.18 * bulk,
    shinW: 0.16 * bulk,
    shinH: crawler ? 0.12 : h * 0.2,
    shinD: 0.16 * bulk,
    footW: 0.16 * bulk,
    footH: 0.08,
    footD: crawler ? 0.2 : 0.28 * bulk,
    thighMat: def.armored ? armorMat : cloth,
    shinMat: cloth,
    footMat: mat(0x2a2418),
  };
  const armSpec = {
    armW: 0.16 * Math.min(bulk, 1.35),
    armD: 0.15 * Math.min(bulk, 1.35),
    upperH: crawler ? 0.28 : h * 0.2,
    foreH: crawler ? 0.26 : h * 0.18,
    armMat: skin,
    handMat: skin,
  };
  const hipY = crawler ? 0.26 : h * 0.46;
  const shoulderY = crawler ? 0.4 : h * 0.72;
  const spread = bodyW * 0.42;
  const left = makeLeg(g, -spread, hipY, legSpec);
  const right = makeLeg(g, spread, hipY, legSpec);
  const body = box(g, bodyW, bodyH, 0.3 * bulk, 0, bodyY, 0, bodyMat);
  body.name = "body";
  const head = box(g, 0.32 * (def.mouth ? 1.2 : 1), 0.32, 0.32, 0, headY, crawler ? 0.12 : 0, skin);
  head.name = "head";
  box(g, 0.07, 0.07, 0.06, -0.08, headY + 0.04, -0.18, eyeMat, false);
  box(g, 0.07, 0.07, 0.06, 0.08, headY + 0.04, -0.18, eyeMat, false);

  const armL = makeArm(g, -bodyW * 0.62, shoulderY, armSpec);
  const armR = makeArm(g, bodyW * 0.62, shoulderY, armSpec);
  let extra = null;
  if (def.extraArm) {
    const third = makeArm(g, bodyW * 0.2, shoulderY + 0.08, armSpec);
    extra = third.shoulder;
  }

  if (def.sac || def.core) {
    const sac = new THREE.Mesh(
      new THREE.SphereGeometry(def.core ? 0.28 : 0.34, 8, 6),
      mat(def.core ? 0xff5a2a : 0xc6e06a, {
        emissive: def.core ? 0xff3a10 : 0x668820,
        emissiveIntensity: 0.7,
      })
    );
    sac.position.set(0, bodyY + 0.05, 0.22);
    sac.castShadow = true;
    sac.name = "sac";
    g.add(sac);
  }
  if (def.armored) {
    box(g, bodyW * 1.05, 0.12, 0.34 * bulk, 0, bodyY + bodyH * 0.28, 0, armorMat);
    box(g, 0.36, 0.08, 0.36, 0, headY + 0.18, 0, armorMat);
  }
  if (def.staff) {
    box(armR.elbow, 0.06, h * 0.7, 0.06, 0.08, -h * 0.15, -0.08, mat(0x22262c));
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12),
      mat(0x9ad7ff, { emissive: 0x66bbff, emissiveIntensity: 1 })
    );
    gem.position.set(0.08, h * 0.22, -0.08);
    armR.elbow.add(gem);
  }
  if (def.mouth) {
    box(g, 0.22, 0.08, 0.06, 0, headY - 0.08, -0.18, mat(0x4a2030));
  }

  g.userData.eyeMat = eyeMat;
  g.userData.crawl = crawler;
  g.userData.limbs = {
    legL: left.hip,
    legR: right.hip,
    kneeL: left.knee,
    kneeR: right.knee,
    armL: armL.shoulder,
    armR: armR.shoulder,
    extra,
  };
  const s = def.scale || 1;
  if (s !== 1) g.scale.set(s, s, s);
  return g;
}

export { mat };
