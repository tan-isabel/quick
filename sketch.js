
// =====================================================
// MORPHSCAPE FINAL - WORKING VERSION RESTORED
// TWO HANDS = INDEX FINGERTIPS
// ONE FIST = PALM CENTRE
// ORIGINAL THREE-LAYER LUMINOUS TRAILS
// CAMERA PREVIEW ENABLED
// =====================================================

let handPose;
let video;
let hands = [];
let resetButton;
let trackingStatus;
let enableCameraButton;
let msCameraStarting = false;
let msCameraStarted = false;
let msHandPosePromise;

const MS_COUNT = 16;
const MS_NEUTRAL = 90;
const MS_MIN = 5;
const MS_MAX = 180;

const msChannelForServo = [
  0, 1, 8, 9,
  2, 3, 10, 11,
  4, 5, 12, 13,
  6, 7, 14, 15
];

const msMountainUp = [
  110, 130, 125, 105,
  130, 180, 180, 125,
  125, 180, 180, 120,
  105, 125, 120, 100
];

const msMountainDown = [
  70, 50, 55, 75,
  50, 5, 5, 55,
  55, 5, 5, 60,
  75, 55, 60, 80
];

const msCoordinates = Array.from(
  { length: 16 },
  (_, i) => ({
    x: (i % 4) +
      (Math.floor(i / 4) % 2 ? 0.42 : 0),
    y: Math.floor(i / 4) * 0.92
  })
);

let msTargets = Array(MS_COUNT).fill(MS_NEUTRAL);
let msCurrent = Array(MS_COUNT).fill(MS_NEUTRAL);

let msTrails = [[], []];
let msTrailModes = ["", ""];
let msTrailPositions = [null, null];

let msMode = "READY";
let msTwoPrevious = null;
let msWideReference = null;
let msMountainDirection = 1;
let msGrip = null;
let msGrips = [null, null];
let msHandSlots = [null, null];
let msPrevGestureTime = 0;
let msLargeActivated = false;
let msLastSend = 0;
// Keep fist selection during brief HandPose dropouts (milliseconds).
const MS_HAND_GRACE = 320;
let msFrameHands = [];
let msSlotLastSeen = [0, 0];
let msSlotFistLastSeen = [0, 0];

// =====================================================
// SETUP - EXPERIMENT 1E FOUNDATION
// =====================================================

async function setup() {

  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  bleSetup();

  resetButton = createButton("RESET");
  resetButton.id("resetButton");
  resetButton.mousePressed(msReset);

  trackingStatus = createDiv("Starting hand tracking...");
  trackingStatus.id("trackingStatus");

  // Preload the hand model. Camera access is requested ONLY by a tap.
  msHandPosePromise = ml5.handPose().then(model => {
    handPose = model;
    return model;
  }).catch(error => {
    console.error("Hand model error:", error);
    trackingStatus.html("Hand model error: " + String(error.message || error));
    return null;
  });

  enableCameraButton = createButton("ENABLE CAMERA");
  enableCameraButton.id("enableCameraButton");
  enableCameraButton.mousePressed(msEnableCamera);
  trackingStatus.html("Tap ENABLE CAMERA to start");
}

// Camera request starts directly inside the user's tap event.
// Keep the stream attached to the existing p5 video element.
function msEnableCamera() {
  if (msCameraStarting || msCameraStarted) return;
  msCameraStarting = true;
  trackingStatus.html("Requesting camera access...");

  try {
    video = createCapture({
      video: { facingMode: "user" },
      audio: false
    }, async () => {
      try {
        video.size(640, 480);
        video.hide();
        const model = await msHandPosePromise;
        if (!model) throw new Error("Hand model could not load");
        model.detectStart(video, gotHands);
        msCameraStarted = true;
        msCameraStarting = false;
        enableCameraButton.hide();
        trackingStatus.html("Hand tracking ready");
      } catch (error) {
        msCameraStarting = false;
        console.error("Hand tracking startup failed:", error);
        trackingStatus.html("Camera/tracking error: " + String(error.message || error));
      }
    });
    video.size(640, 480);
    video.hide();
  } catch (error) {
    msCameraStarting = false;
    console.error("Camera request failed:", error);
    trackingStatus.html("Camera error: " + String(error.message || error));
  }


// =====================================================
}
// HANDPOSE
// =====================================================

function gotHands(results) {
  hands = results;
}

function msClamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function msKey(hand, i) {
  return hand.keypoints && hand.keypoints[i];
}

function msScreen(hand, i) {

  const p = msKey(hand, i);

  return p ? {
    x: width - map(p.x, 0, 640, 0, width),
    y: map(p.y, 0, 480, 0, height)
  } : null;
}

// =====================================================
// INDEX FINGERTIP - TWO-HAND INTERACTION
// =====================================================

function msFingertip(hand) {
  return msScreen(hand, 8);
}

// =====================================================
// PALM CENTRE - LOCALISED FIST INTERACTION
// =====================================================

function msPalmCenter(hand) {

  const points = [0, 5, 9, 13, 17]
    .map(i => msScreen(hand, i))
    .filter(Boolean);

  if (!points.length) return null;

  return {
    x: points.reduce((s, p) => s + p.x, 0) /
      points.length,
    y: points.reduce((s, p) => s + p.y, 0) /
      points.length
  };
}

// =====================================================
// FIST DETECTION
// =====================================================

function msFistScore(hand) {

  const wrist = msKey(hand, 0);

  if (!wrist) return 0;

  let folded = 0;

  for (const [tip, base] of [
    [8, 5],
    [12, 9],
    [16, 13],
    [20, 17]
  ]) {

    const t = msKey(hand, tip);
    const b = msKey(hand, base);

    if (!t || !b) continue;

    if (
      Math.hypot(t.x - wrist.x, t.y - wrist.y) <
      1.45 * Math.hypot(
        b.x - wrist.x,
        b.y - wrist.y
      )
    ) {
      folded++;
    }
  }

  return folded / 4;
}

// =====================================================
// RESET
// =====================================================

function msReset() {

  msTargets.fill(90);
  msCurrent.fill(90);

  msMode = "READY";
  msTwoPrevious = null;
  msWideReference = null;
  msMountainDirection = 1;
  msGrip = null;
  msGrips = [null, null];
  msHandSlots = [null, null];
  msFrameHands = [];
  msSlotLastSeen = [0, 0];
  msSlotFistLastSeen = [0, 0];
  msPrevGestureTime = 0;
  msLargeActivated = false;

  msTrails = [[], []];
  msTrailModes = ["", ""];
  msTrailPositions = [null, null];

  sendResetCommand();
}

// =====================================================
// GESTURE INTERACTIONS
// =====================================================

// =====================================================
// STABLE HAND SLOTS (LEFT/RIGHT SCREEN POSITION)
// Keep existing hands assigned by proximity when possible.
// =====================================================
function msTrackedHands() {
  const now = millis();
  const candidates = hands.map(h => ({
    hand: h,
    fingertip: msFingertip(h),
    palm: msPalmCenter(h),
    fist: msFistScore(h)
  })).filter(h => h.palm && h.fingertip).slice(0, 2);

  // Match hands to persistent slots by proximity, not left/right order.
  // Do not swap identities when the two hands cross.
  let assigned = [];
  if (candidates.length === 2) {
    const [a,b] = candidates;
    const distance = (h,p) => p
      ? Math.hypot(h.palm.x-p.x, h.palm.y-p.y) : 0;
    let normal = distance(a,msHandSlots[0]) + distance(b,msHandSlots[1]);
    let swapped = distance(a,msHandSlots[1]) + distance(b,msHandSlots[0]);
    if (!msHandSlots[0] && !msHandSlots[1]) {
      assigned = candidates.slice().sort((x,y)=>x.palm.x-y.palm.x);
    } else {
      assigned = normal <= swapped ? [a,b] : [b,a];
    }
    assigned.forEach((h,i) => { h.slot=i; });
  } else if (candidates.length === 1) {
    const h = candidates[0];
    const d = msHandSlots.map(p => p
      ? Math.hypot(h.palm.x-p.x,h.palm.y-p.y) : Infinity);
    let slot;
    if (d[0] !== Infinity || d[1] !== Infinity) {
      slot = d[0] <= d[1] ? 0 : 1;
    } else {
      slot = h.palm.x < width/2 ? 0 : 1;
    }
    h.slot = slot;
    assigned = [h];
  }

  for (const h of assigned) {
    msHandSlots[h.slot] = {x:h.palm.x,y:h.palm.y};
    msSlotLastSeen[h.slot] = now;
    if (h.fist >= 0.63) msSlotFistLastSeen[h.slot] = now;
  }
  for (let i=0;i<2;i++) {
    if (now-msSlotLastSeen[i]>MS_HAND_GRACE) msHandSlots[i]=null;
  }
  msFrameHands = assigned;
  return assigned;
}

// A group consists of the selected servo and its immediate neighbours.
function msGroupFor(index) {
  const o=msCoordinates[index];
  return msCoordinates.map((p,i) => ({i,d:Math.hypot(p.x-o.x,p.y-o.y)}))
    .filter(v=>v.d<=1.16).map(v=>v.i);
}

// Find nearest servo whose entire group is free. No overlapping ownership.
function msChooseFreeGroup(p,occupied) {
  const px=msClamp(p.x/width,0,1)*3.42;
  const py=msClamp(p.y/height,0,1)*2.76;
  const options=msCoordinates.map((v,i)=>({
    index:i,
    distance:Math.hypot(v.x-px,v.y-py),
    group:msGroupFor(i)
  })).sort((a,b)=>a.distance-b.distance);
  return options.find(o=>o.group.every(i=>!occupied.has(i))) || null;
}

// =====================================================
// GESTURE INTERACTIONS
// Two OPEN hands converging = large mountain / valley
// One or two FISTS = independent localised pulls
// =====================================================
function msUpdateGesture() {
  const detected = msTrackedHands();
  const clenched = detected.filter(h => h.fist >= 0.63);

  // FIST MODE: each clenched hand keeps its selected group until release.
  // A brief tracking dropout holds the group rather than reselecting it.
  const now = millis();
  const fistBySlot = [null,null];
  for (const h of clenched) fistBySlot[h.slot]=h;
  const heldFist = [0,1].some(slot =>
    msGrips[slot] && now-msSlotFistLastSeen[slot] <= MS_HAND_GRACE);

  if (clenched.length > 0 || heldFist) {
    msTwoPrevious=null;
    msWideReference=null;
    msLargeActivated=false;
    msTargets.fill(MS_NEUTRAL);

    // Explicitly opened hand releases immediately. Missing hand gets grace.
    for (let slot=0;slot<2;slot++) {
      const seen = detected.find(h=>h.slot===slot);
      if (seen && seen.fist < 0.63) msGrips[slot]=null;
      else if (!seen && now-msSlotFistLastSeen[slot]>MS_HAND_GRACE)
        msGrips[slot]=null;
    }

    // Existing selections take priority over newly clenched hands.
    const occupied = new Set();
    for (const grip of msGrips) {
      if (grip) for (const i of grip.group) occupied.add(i);
    }
    for (let slot=0;slot<2;slot++) {
      const h=fistBySlot[slot];
      if (!h || msGrips[slot]) continue;
      const chosen=msChooseFreeGroup(h.palm,occupied);
      if (!chosen) continue; // No non-overlapping group available.
      msGrips[slot]={
        index:chosen.index,
        group:chosen.group,
        referenceY:h.palm.y,
        target:MS_NEUTRAL
      };
      chosen.group.forEach(i=>occupied.add(i));
    }

    for (let slot=0;slot<2;slot++) {
      const grip=msGrips[slot];
      if (!grip) continue;
      const h=fistBySlot[slot];
      if (h) {
        const deltaY=grip.referenceY-h.palm.y;
        const trigger=height*0.012;
        if (deltaY>=trigger) {
          grip.target=MS_MAX;
          grip.referenceY=h.palm.y;
        } else if (deltaY<=-trigger) {
          grip.target=MS_MIN;
          grip.referenceY=h.palm.y;
        }
      }
      for (const i of grip.group) {
        const weight=i===grip.index ? 1 : 0.5;
        msTargets[i]=MS_NEUTRAL+(grip.target-MS_NEUTRAL)*weight;
      }
    }
    const activeCount=msGrips.filter(Boolean).length;
    msMode=activeCount===2 ? 'DUAL SCULPT' :
      activeCount===1 ? 'SINGLE SCULPT' : 'READY';
    return;
  }

  // Neither hand is clenched.
  msGrips=[null,null];

  if(detected.length===2) {
    // Use both hands' actual inward and vertical travel from a stable
    // reference, not tiny changes between individual video frames.
    const left = detected[0].palm.x <= detected[1].palm.x ? detected[0] : detected[1];
    const right = left === detected[0] ? detected[1] : detected[0];
    const a = left.fingertip;
    const b = right.fingertip;

    if (!msTwoPrevious) {
      msTwoPrevious = { leftX:a.x, rightX:b.x, leftY:a.y, rightY:b.y };
      msLargeActivated = false;
      msTargets.fill(MS_NEUTRAL);
      msMode = "READY";
      return;
    }

    const leftIn = (a.x - msTwoPrevious.leftX) / width;
    const rightIn = (msTwoPrevious.rightX - b.x) / width;
    const leftVertical = (a.y - msTwoPrevious.leftY) / height;
    const rightVertical = (b.y - msTwoPrevious.rightY) / height;

    // BOTH open hands moving apart: release the large-scale shape.
    // Return all 16 active servos to neutral and show READY.
    // Reset the movement reference so a new inward gesture can start.
    if (leftIn < -0.012 && rightIn < -0.012) {
      msLargeActivated = false;
      msTwoPrevious = { leftX:a.x, rightX:b.x, leftY:a.y, rightY:b.y };
      msTargets.fill(MS_NEUTRAL);
      msMode = "READY";
      return;
    }

    // Require BOTH open hands to move inward and BOTH to move vertically
    // in the same direction. The thresholds reject normal tracking jitter.
    const inwardEnough = leftIn > 0.012 && rightIn > 0.012;
    const mountainGesture = inwardEnough &&
      leftVertical < -0.012 && rightVertical < -0.012;
    const valleyGesture = inwardEnough &&
      leftVertical > 0.012 && rightVertical > 0.012;

    if (mountainGesture || valleyGesture) {
      msMountainDirection = mountainGesture ? 1 : -1;
      msLargeActivated = true;
      // Start a new reference so a deliberate opposite gesture can
      // switch the shape without single-frame noise changing direction.
      msTwoPrevious = { leftX:a.x, rightX:b.x, leftY:a.y, rightY:b.y };
    } else {
      // If hands move outward, or a substantial vertical motion occurs
      // without the matching inward gesture, reset the reference for
      // the next intentional gesture. Do not change an active shape.
      const outward = leftIn < -0.015 || rightIn < -0.015;
      const verticalMismatch =
        (leftVertical < -0.018 && rightVertical > 0.018) ||
        (leftVertical > 0.018 && rightVertical < -0.018);
      if (outward || verticalMismatch) {
        msTwoPrevious = { leftX:a.x, rightX:b.x, leftY:a.y, rightY:b.y };
      }
    }

    const shape = msMountainDirection === 1 ? msMountainUp : msMountainDown;
    for (let i=0; i<MS_COUNT; i++) {
      msTargets[i] = msLargeActivated ? shape[i] : MS_NEUTRAL;
    }
    msMode = msLargeActivated
      ? (msMountainDirection === 1 ? "MOUNTAIN" : "VALLEY")
      : "READY";
    return;
  }

  msTwoPrevious=null;
  msWideReference=null;
  msLargeActivated=false;
  msTargets.fill(MS_NEUTRAL);
  msMode="NEUTRAL";
}

// =====================================================
// ORIGINAL WORKING LUMINOUS TRAILS
// =====================================================

function msDrawTrails() {

  const now = millis();

  const detected = msFrameHands;
  const positions = [null,null];
  const modes = ['', ''];
  for (const h of detected) {
    const slot=h.slot;
    const isFist=h.fist>=0.63;
    positions[slot]=isFist ? h.palm : h.fingertip;
    modes[slot]=isFist ? 'PALM' : 'FINGERTIP';
  }

  for (let i = 0; i < 2; i++) {

    const p = positions[i] || null;
    const mode = modes[i] || "";

    if (mode !== msTrailModes[i]) {
      msTrails[i] = [];
      msTrailPositions[i] = null;
      msTrailModes[i] = mode;
    }

    if (p) {

      const old = msTrailPositions[i];

      const jump = old
        ? Math.hypot(p.x - old.x, p.y - old.y)
        : 0;

      if (
        !old ||
        jump < Math.max(width, height) * 0.22
      ) {

        const down = old && p.y - old.y > 1.5;

        // In sculpt mode each trail follows its OWN locked fist direction.
        const sculpting = msMode === "SINGLE SCULPT" ||
          msMode === "DUAL SCULPT";
        const grip = msGrips[i];
        const cool = sculpting
          ? (grip ? grip.target < MS_NEUTRAL : false)
          : (msMode === "VALLEY" || down);

        msTrails[i].push({
          x: p.x,
          y: p.y,
          time: now,
          cool: !!cool
        });

        msTrailPositions[i] = p;
      }
    }

    msTrails[i] = msTrails[i].filter(
      pt => now - pt.time < 900
    );

    const trail = msTrails[i];

    for (let j = 1; j < trail.length; j++) {

      const a = trail[j - 1];
      const b = trail[j];

      const fade = msClamp(
        1 - (now - b.time) / 900,
        0,
        1
      );

      const palette = b.cool
        ? [
            [69, 107, 255],
            [0, 169, 255],
            [56, 228, 245],
            [140, 255, 226]
          ]
        : [
            [255, 55, 95],
            [255, 102, 184],
            [255, 153, 77],
            [255, 230, 109]
          ];

      const rgb = palette[
        Math.floor(j / 5) % 4
      ];

      // OUTER GLOW
      stroke(rgb[0], rgb[1], rgb[2], fade * 40);
      strokeWeight(24);
      line(a.x, a.y, b.x, b.y);

      // COLOURED TRAIL
      stroke(rgb[0], rgb[1], rgb[2], fade * 110);
      strokeWeight(9);
      line(a.x, a.y, b.x, b.y);

      // BRIGHT CENTRE
      stroke(255, 245, 240, fade * 220);
      strokeWeight(2);
      line(a.x, a.y, b.x, b.y);
    }

    if (p) {
      noStroke();
      fill(255, 255, 255, 160);
      circle(p.x, p.y, 9);
    }
  }
}

// =====================================================
// DRAW
// =====================================================

function draw() {

  background(0);

  // MIRRORED CAMERA PREVIEW
  if (
    video &&
    video.elt &&
    video.elt.readyState >= 2
  ) {

    push();
    translate(width, 0);
    scale(-1, 1);

    image(video, 0, 0, width, height);

    pop();
  }

  msUpdateGesture();

  // Direct servo targets: no software smoothing.
  for (let i = 0; i < MS_COUNT; i++) {
    msCurrent[i] = msTargets[i];
  }

  msDrawTrails();
  // Grid display hidden; full-screen localised mapping remains unchanged.

  noStroke();
  fill(245);

  textAlign(CENTER, CENTER);
  textSize(15);

  text(msMode, width / 2, 45);

  // BLE SERVO ANGLE UPDATES
  const now = millis();

  if (
    bleConnected &&
    now - msLastSend >= 100
  ) {

    const channels = Array(16).fill(MS_NEUTRAL);

    for (let i = 0; i < MS_COUNT; i++) {

      channels[msChannelForServo[i]] =
        Math.round(msCurrent[i]);
    }

    sendAngles(channels);
    msLastSend = now;
  }
}

// =====================================================
// WINDOW RESIZE
// =====================================================

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}