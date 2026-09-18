/*
 * Pulleys: the single fixed pulley, the single movable pulley and the
 * block and tackle. ICSE Class X, Chapter 3 "Machines", section B.
 *
 * The rope is the model. It is routed once as an ordered list of nodes,
 * and everything else is read off that list: which strands run to the
 * load, how many there are, and — because the rope has a fixed length —
 * how far the free end must travel to raise the load by a given amount.
 * Nothing in here asserts that the mechanical advantage is n. It falls
 * out of the routing, so the picture and the numbers cannot disagree.
 *
 * Every machine here is ideal, so the efficiency is 100% throughout.
 * The one-fixed-and-n-movable system (M.A. = 2^n) is out of syllabus and
 * is deliberately absent.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var COLOR = {
    ceil: "#334155",
    hatch: "#94a3b8",
    metal: "#7c8ea4",
    metalDark: "#475569",
    wheel: "#0f6f93",
    wheelFill: "#e0f2fe",
    support: "#0f766e",        // strands that carry the load
    effort: "#b45309",         // the strand the effort is applied to
    load: "#1e293b",
    mark: "#334155",
    guide: "#94a3b8",
    note: "#64748b",
    halo: "rgba(251,252,254,0.92)"
  };

  var UI_FONT =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  // Newtons per kgf. Exercise 3(B) says to take g = 10 m s^-2; the figures
  // on p.70 use 9.8, so the value in force here is stated on the diagram.
  var G = 10;

  // How far the load rises at a full pull. Fixed in metres rather than in
  // pixels so the readings do not change with the size of the window.
  var LIFT_M = 0.5;

  var HINTS = {
    fixed: "A single fixed pulley gives no gain in force — the effort equals the load. Its use is that you may pull down instead of lifting up, and so put your own weight behind the effort.",
    movable: "Two strands run to the movable pulley, so each carries half the load and the effort is halved. But the effort must be applied upwards, which is awkward.",
    redirect: "The fixed pulley turns the effort downward. Mechanical advantage and velocity ratio stay 2 — a fixed pulley changes the direction of the effort, nothing else.",
    tackle: "The load hangs from the movable lower block. Count the strands running down to it: that number is the mechanical advantage and the velocity ratio alike."
  };

  var TIMELINE = { pull: 2200 };

  var reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  var state = {
    mode: "fixed",
    n: 4,              // total pulleys, block and tackle only
    load: 50,          // kgf
    lift: 0,           // 0 to 1, how far through the pull we are
    playing: false,
    t0: 0,
    from: 0
  };

  /* ------------------------------------------------------------------
     The route
     ------------------------------------------------------------------ */

  function end(on) { return { kind: "end", on: on }; }
  function wheel(on) { return { kind: "pulley", on: on }; }
  function free() { return { kind: "free" }; }

  // True for anything that rides with the load: a movable pulley, the hook
  // of the movable block, or the rope end the load itself hangs from.
  function onLoadSide(node) {
    if (node.kind === "pulley") return node.on === "lower";
    if (node.kind === "end") return node.on === "lower" || node.on === "load";
    return false;
  }

  function route(mode, n) {
    if (mode === "fixed") return [end("load"), wheel("upper"), free()];
    if (mode === "movable") return [end("ceiling"), wheel("lower"), free()];
    if (mode === "redirect") {
      return [end("ceiling"), wheel("lower"), wheel("upper"), free()];
    }

    // Block and tackle. The chapter keeps the movable block either equal
    // to the fixed one or one pulley short of it (p.69), and ties the dead
    // end to whichever block makes the free end leave an upper pulley — so
    // the effort is pulled downward. Deriving both from n alone means that
    // arrangement is the only one reachable.
    var lower = Math.floor(n / 2);
    var odd = n % 2 === 1;
    var nodes = [end(odd ? "lower" : "upper")];
    var side = odd ? "upper" : "lower";
    for (var k = 0; k < n; k++) {
      nodes.push(wheel(side));
      side = side === "upper" ? "lower" : "upper";
    }
    nodes.push(free());
    return nodes;
  }

  // A strand supports the load when either of its ends rides with the
  // load. This is the whole of the physics: the count it returns is the
  // mechanical advantage, the velocity ratio, and the number the chapter
  // asks students to read off the diagram.
  function supportFlags(nodes) {
    var flags = [];
    for (var i = 0; i < nodes.length - 1; i++) {
      flags.push(onLoadSide(nodes[i]) || onLoadSide(nodes[i + 1]));
    }
    return flags;
  }

  function strandCount(flags) {
    var k = 0;
    for (var i = 0; i < flags.length; i++) if (flags[i]) k++;
    return k;
  }

  /* ------------------------------------------------------------------
     Canvas plumbing
     ------------------------------------------------------------------ */

  var canvas = $("canvas");
  var ctx = canvas.getContext("2d");
  var host = canvas.parentNode;

  function fit() {
    var dpr = window.devicePixelRatio || 1;
    var w = host.clientWidth;
    var h = host.clientHeight;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function needsFit() {
    var dpr = window.devicePixelRatio || 1;
    return canvas.width !== Math.round(host.clientWidth * dpr) ||
      canvas.height !== Math.round(host.clientHeight * dpr);
  }

  /* ------------------------------------------------------------------
     Drawing helpers
     ------------------------------------------------------------------ */

  function line(x1, y1, x2, y2, color, width, dashed) {
    ctx.beginPath();
    ctx.setLineDash(dashed ? [6, 4] : []);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Two strokes meeting at the tip rather than a filled triangle.
  function arrow(x1, y1, x2, y2, color, width) {
    line(x1, y1, x2, y2, color, width, false);
    var head = 11;
    var ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.moveTo(x2 - head * Math.cos(ang - Math.PI / 7),
      y2 - head * Math.sin(ang - Math.PI / 7));
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 7),
      y2 - head * Math.sin(ang + Math.PI / 7));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }

  function label(text, x, y, color, align, baseline, size) {
    ctx.font = "600 " + (size || 13) + "px " + UI_FONT;
    ctx.textAlign = align || "center";
    ctx.textBaseline = baseline || "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLOR.halo;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function dot(x, y, color, r) {
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(x, y, r || 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function roundRect(x, y, w, h, r, fill, stroke, lw) {
    ctx.beginPath();
    ctx.setLineDash([]);
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
  }

  // Set a label alongside a vertical line, on whichever side of it has
  // the room. On a narrow sheet the effort's readings are wider than the
  // margin they sit in, and would otherwise be cut off at the edge.
  function beside(W, text, x, y, color, size) {
    size = size || 12;
    ctx.font = "600 " + size + "px " + UI_FONT;
    var w = ctx.measureText(text).width;
    if (x + 9 + w <= W - 5) label(text, x + 9, y, color, "left", "middle", size);
    else label(text, x - 9, y, color, "right", "middle", size);
  }

  // A vertical measurement with its label set beside it, so nothing has
  // to be broken open to make room for the text.
  function vspan(W, x, y1, y2, text, color) {
    if (Math.abs(y2 - y1) < 1.5) return;
    line(x, y1, x, y2, color, 1.2, false);
    line(x - 5, y1, x + 5, y1, color, 1.2, false);
    line(x - 5, y2, x + 5, y2, color, 1.2, false);
    beside(W, text, x, (y1 + y2) / 2, color, 12);
  }

  /* ------------------------------------------------------------------
     Layout
     ------------------------------------------------------------------ */

  function layout(W, H) {
    var nodes = route(state.mode, state.n);
    var segs = nodes.length - 1;
    var flags = supportFlags(nodes);
    var S = strandCount(flags);

    var padL = 74, padR = 104;
    var gap = Math.max(22, Math.min(56, (W - padL - padR) / Math.max(1, segs - 1)));
    var r = gap / 2;
    var width = (segs - 1) * gap;
    var x0 = padL + Math.max(0, (W - padL - padR - width) / 2);

    var g = {
      W: W, H: H, nodes: nodes, segs: segs, flags: flags, S: S,
      gap: gap, r: r, x0: x0,
      ceilY: 32, plateH: 9, clear: 9, hang: 15, hook: 15, loadH: 34
    };

    // Where each strand runs, and where each wheel sits between two of them.
    g.strandX = [];
    for (var i = 0; i < segs; i++) g.strandX.push(x0 + i * gap);
    g.wheelX = [];
    for (var j = 1; j <= segs - 1; j++) g.wheelX.push(x0 + (j - 1) * gap + r);

    g.upperY = g.ceilY + g.hang + g.plateH + g.clear + r;

    g.hasUpper = false;
    g.hasLower = false;
    for (var k = 1; k < nodes.length - 1; k++) {
      if (nodes[k].on === "upper") g.hasUpper = true;
      else g.hasLower = true;
    }

    // The load hangs from the movable block where there is one, and
    // straight off the rope end where there is not.
    // Low enough to sit near the floor, but clear of the load's arrow and
    // its value, which are drawn below the box.
    var floorY = H - 66;
    g.carrierDrop = g.hasLower
      ? r + g.clear + g.plateH + g.hook + g.loadH
      : g.loadH;
    g.lowerY0 = floorY - g.carrierDrop;
    g.loadTopY0 = g.hasLower ? 0 : floorY - g.loadH;

    var lowest = g.hasUpper ? g.upperY + 2 * r + 36 : g.ceilY + 46;
    var headroom = Math.max(0, (g.hasLower ? g.lowerY0 : g.loadTopY0) - lowest);

    // The free end leaves the last wheel: downward off an upper one,
    // upward off a movable one.
    var last = nodes[nodes.length - 2];
    g.effortDown = last.on === "upper";
    g.tail0 = 64;

    // The hand carries its arrow and its reading past it, so the room it
    // needs runs well beyond the grip itself.
    var handReach = 48;
    var handRoom = g.effortDown
      ? (H - handReach) - (g.upperY + g.tail0)
      : (g.lowerY0 - g.tail0) - (g.ceilY + handReach);

    // Both ends of the motion have to stay on the sheet: the blocks must
    // not meet, and the hand — which travels S times as far — must not run
    // off the bottom.
    g.maxD = Math.max(0, Math.min(headroom, handRoom / S));
    g.d = state.lift * g.maxD;

    g.lowerY = g.lowerY0 - g.d;
    g.loadTopY = g.loadTopY0 - g.d;

    // The tail to the hand is whatever length of rope the rest of the
    // route has given up. This is the only place the effort's travel is
    // decided, and it is decided by the rope being inextensible.
    g.tail = g.tail0 + (ropeBody(g, 0) - ropeBody(g, g.d));
    g.handX = g.strandX[segs - 1];
    g.handY = g.effortDown
      ? g.upperY + g.tail
      : (g.lowerY0 - g.d) - g.tail;

    g.handY0 = g.effortDown ? g.upperY + g.tail0 : g.lowerY0 - g.tail0;
    return g;
  }

  function yAt(node, g, d) {
    if (node.kind === "pulley") return node.on === "upper" ? g.upperY : g.lowerY0 - d;
    if (node.kind === "end") {
      if (node.on === "ceiling") return g.ceilY;
      if (node.on === "upper") return g.upperY - g.r - g.clear;
      if (node.on === "lower") return (g.lowerY0 - d) + g.r + g.clear;
      return g.loadTopY0 - d;                     // the load hangs off this end
    }
    return 0;
  }

  // Every part of the rope except the free tail.
  function ropeBody(g, d) {
    var sum = 0;
    for (var i = 0; i < g.nodes.length - 2; i++) {
      sum += Math.abs(yAt(g.nodes[i + 1], g, d) - yAt(g.nodes[i], g, d));
    }
    return sum;
  }

  function nodeY(node, g) {
    return node.kind === "free" ? g.handY : yAt(node, g, g.d);
  }

  /* ------------------------------------------------------------------
     Drawing
     ------------------------------------------------------------------ */

  function drawCeiling(g) {
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(0, g.ceilY - 14, g.W, 14);
    line(0, g.ceilY, g.W, g.ceilY, COLOR.ceil, 2.5, false);
    ctx.beginPath();
    for (var x = -14; x < g.W; x += 13) {
      ctx.moveTo(x, g.ceilY - 14);
      ctx.lineTo(x + 14, g.ceilY);
    }
    ctx.strokeStyle = COLOR.hatch;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    label("RIGID SUPPORT", 12, g.ceilY - 24, COLOR.note, "left", "middle", 11);
  }

  function wheelXs(g, side) {
    var out = [];
    for (var j = 1; j < g.nodes.length - 1; j++) {
      if (g.nodes[j].on === side) out.push(g.wheelX[j - 1]);
    }
    return out;
  }

  // A block: the plate that carries the axles, with cheeks reaching past
  // the wheels. Both sit clear of the rope, which wraps the far side.
  function drawBlock(g, xs, cy, above, tieX) {
    if (!xs.length) return;
    var lo = Math.min.apply(null, xs) - g.r - 7;
    var hi = Math.max.apply(null, xs) + g.r + 7;
    // A dead end made off to this block may lie outside its wheels, and
    // the plate has to reach it or the knot hangs on nothing.
    if (tieX !== null) { lo = Math.min(lo, tieX - 8); hi = Math.max(hi, tieX + 8); }
    var py = above ? cy - g.r - g.clear - g.plateH : cy + g.r + g.clear;
    roundRect(lo, py, hi - lo, g.plateH, 3, COLOR.metal, COLOR.metalDark, 1.2);

    var reach = above ? cy + g.r * 0.5 : cy - g.r * 0.5;
    line(lo + 2.5, above ? py + g.plateH : py, lo + 2.5, reach, COLOR.metal, 3, false);
    line(hi - 2.5, above ? py + g.plateH : py, hi - 2.5, reach, COLOR.metal, 3, false);
    return { lo: lo, hi: hi, py: py, mid: (lo + hi) / 2 };
  }

  function drawWheel(g, cx, cy) {
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(cx, cy, g.r, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.wheelFill;
    ctx.fill();
    ctx.strokeStyle = COLOR.wheel;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, g.r * 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = COLOR.wheel;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    dot(cx, cy, COLOR.metalDark, 2.4);
  }

  // Half a wrap at a time, so a wheel that takes a load-bearing strand in
  // and lets the effort strand out is drawn as both.
  function drawWrap(g, cx, cy, above, colIn, colOut) {
    var mid = above ? -Math.PI / 2 : Math.PI / 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(cx, cy, g.r, Math.PI, mid, !above);
    ctx.strokeStyle = colIn;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, g.r, mid, 0, !above);
    ctx.strokeStyle = colOut;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  function drawRope(g) {
    var i;
    for (i = 0; i < g.segs; i++) {
      var x = g.strandX[i];
      var a = nodeY(g.nodes[i], g);
      var b = nodeY(g.nodes[i + 1], g);
      line(x, a, x, b, g.flags[i] ? COLOR.support : COLOR.effort, 2.6, false);
    }
    for (i = 1; i < g.nodes.length - 1; i++) {
      var node = g.nodes[i];
      drawWrap(g, g.wheelX[i - 1], nodeY(node, g), node.on === "upper",
        g.flags[i - 1] ? COLOR.support : COLOR.effort,
        g.flags[i] ? COLOR.support : COLOR.effort);
    }

    // Knot where a dead end is made off.
    var first = g.nodes[0];
    if (first.kind === "end" && first.on !== "load") {
      dot(g.strandX[0], nodeY(first, g), COLOR.support, 4);
    }
  }

  function drawLoad(g) {
    var cx, topY;
    if (g.hasLower) {
      var xs = wheelXs(g, "lower");
      cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
      topY = g.lowerY + g.r + g.clear + g.plateH;
      line(cx, topY, cx, topY + g.hook, COLOR.metalDark, 3, false);
      topY += g.hook;
    } else {
      cx = g.strandX[0];
      topY = g.loadTopY;
    }
    var w = 62;
    roundRect(cx - w / 2, topY, w, g.loadH, 4, COLOR.load, null, 0);
    label("L", cx, topY + g.loadH / 2, "#f8fafc", "center", "middle", 15);
    arrow(cx, topY + g.loadH + 6, cx, topY + g.loadH + 30, COLOR.load, 2);
    label(fmtNum(state.load) + " kgf = " + fmtNum(state.load * G) + " N",
      cx, topY + g.loadH + 42, COLOR.load, "center", "middle", 12);
    return { cx: cx, topY: topY };
  }

  function drawEffort(g) {
    var dir = g.effortDown ? 1 : -1;
    var x = g.handX, y = g.handY;

    // The grab handle, which is what the pointer takes hold of.
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(x, y, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.effort;
    ctx.fill();
    ctx.strokeStyle = COLOR.halo;
    ctx.lineWidth = 2;
    ctx.stroke();

    arrow(x, y + dir * 12, x, y + dir * 36, COLOR.effort, 2.2);
    var E = state.load / g.S;
    beside(g.W, "E = " + fmtNum(E) + " kgf = " + fmtNum(E * G) + " N",
      x + 4, y + dir * 26, COLOR.effort, 12);
  }

  function drawTensions(g) {
    var mid;
    if (g.hasLower && g.hasUpper) mid = (g.upperY + g.lowerY) / 2;
    else if (g.hasLower) mid = (g.ceilY + g.lowerY) / 2;
    else mid = (g.loadTopY + g.upperY) / 2;

    // Set beside each strand, not on it: the halo that keeps the letter
    // legible would otherwise cut a white gap through the rope.
    for (var i = 0; i < g.segs; i++) {
      if (!g.flags[i]) continue;
      label("T", g.strandX[i] + 7, mid, COLOR.support, "left", "middle", 13);
    }
    label(g.S + (g.S === 1 ? " strand supports the load" : " strands support the load"),
      12, g.ceilY + 24, COLOR.support, "left", "middle", 13);
  }

  function drawDistances(g) {
    if (g.d < 1) return;
    var carrierY = g.hasLower ? g.lowerY : g.loadTopY;
    vspan(g.W, Math.max(14, g.x0 - 42), carrierY, carrierY + g.d,
      "d" + String.fromCharCode(0x2097) + " = " + metres(g.d) + " m", COLOR.mark);

    var hx = Math.min(g.W - 26, g.handX + 44);
    vspan(g.W, hx, g.handY0, g.handY,
      "d" + String.fromCharCode(0x2091) + " = " + metres(g.d * g.S) + " m", COLOR.effort);
  }

  function metres(px) {
    var g = lastG;
    if (!g || !g.maxD) return "0";
    return fmtNum((px / g.maxD) * LIFT_M);
  }

  var lastG = null;

  function draw() {
    if (needsFit()) fit();
    var W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;

    ctx.clearRect(0, 0, W, H);
    var g = layout(W, H);
    lastG = g;

    drawCeiling(g);

    var upper = wheelXs(g, "upper");
    var lowerXs = wheelXs(g, "lower");

    // Where the rope's dead end is made off, if it is made off to a block.
    var first = g.nodes[0];
    var tiedTo = first.kind === "end" ? first.on : null;
    var tieX = g.strandX[0];

    if (upper.length) {
      var ub = drawBlock(g, upper, g.upperY, true, tiedTo === "upper" ? tieX : null);
      line(ub.mid, g.ceilY, ub.mid, ub.py, COLOR.metalDark, 3, false);
    }
    if (lowerXs.length) {
      drawBlock(g, lowerXs, g.lowerY, false, tiedTo === "lower" ? tieX : null);
    }

    var i;
    for (i = 0; i < upper.length; i++) drawWheel(g, upper[i], g.upperY);
    for (i = 0; i < lowerXs.length; i++) drawWheel(g, lowerXs[i], g.lowerY);

    drawRope(g);
    drawLoad(g);
    drawEffort(g);
    drawTensions(g);
    drawDistances(g);

    label("g = 10 N kg" + String.fromCharCode(0x207B, 0x00B9),
      W - 12, H - 16, COLOR.note, "right", "middle", 11);
  }

  /* ------------------------------------------------------------------
     Numbers
     ------------------------------------------------------------------ */

  function fmtNum(x) {
    return String(Math.round(x * 100) / 100);
  }

  function sub(ch) { return "<sub>" + ch + "</sub>"; }

  var workRows = null;

  function buildWork(S) {
    var L = state.load, E = L / S;
    var html = "";
    function row(name, value, klass, id) {
      html += '<div class="line ' + (klass || "") + '"><span class="name">' +
        name + '</span><span class="value" ' +
        (id ? 'id="' + id + '"' : "") + ">" + value + "</span></div>";
    }
    row("Strands supporting the load", S, "key");
    row("Effort  E = L / " + S, fmtNum(E) + " kgf");
    row("M.A. = L / E", fmtNum(L) + " / " + fmtNum(E) + " = " + S, "key");
    row("V.R. = d" + sub("E") + " / d" + sub("L"), S, "key");
    row("Efficiency  &eta; = M.A. / V.R.", "100 %");
    row("d" + sub("L") + "  (load rises)", "0 m", "", "wDL");
    row("d" + sub("E") + "  (effort moves)", "0 m", "", "wDE");
    row("Work in  = E &times; d" + sub("E"), "0 J", "energy", "wIn");
    row("Work out = L &times; d" + sub("L"), "0 J", "energy", "wOut");
    $("work").innerHTML = html;
    workRows = { dL: $("wDL"), dE: $("wDE"), win: $("wIn"), wout: $("wOut") };
  }

  function updateWork(S) {
    if (!workRows) return;
    var dL = state.lift * LIFT_M;
    var dE = dL * S;
    var LN = state.load * G;
    workRows.dL.textContent = fmtNum(dL) + " m";
    workRows.dE.textContent = fmtNum(dE) + " m";
    workRows.win.textContent = fmtNum((LN / S) * dE) + " J";
    workRows.wout.textContent = fmtNum(LN * dL) + " J";
  }

  /* ------------------------------------------------------------------
     Panel
     ------------------------------------------------------------------ */

  var MODE_IDS = { fixed: "mFixed", movable: "mMovable", redirect: "mRedirect", tackle: "mTackle" };

  function currentS() {
    return strandCount(supportFlags(route(state.mode, state.n)));
  }

  function syncPanel() {
    for (var key in MODE_IDS) {
      $(MODE_IDS[key]).setAttribute("aria-pressed", String(key === state.mode));
    }
    $("countBox").hidden = state.mode !== "tackle";

    var lower = Math.floor(state.n / 2);
    $("split").textContent = (state.n - lower) + " in the fixed block above, " +
      lower + " in the movable block below" +
      (state.n % 2 ? " — the rope is tied to the movable block" :
        " — the rope is tied to the fixed block");

    $("hint").textContent = HINTS[state.mode];
    buildWork(currentS());
    updateWork(currentS());
  }

  function render() {
    updateWork(currentS());
    draw();
  }

  /* ------------------------------------------------------------------
     Controls
     ------------------------------------------------------------------ */

  function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    state.lift = 0;
    stop();
    syncPanel();
    draw();
  }

  for (var key in MODE_IDS) {
    (function (k) {
      $(MODE_IDS[k]).addEventListener("click", function () { setMode(k); });
    })(key);
  }

  // A slider and its box are two views of one number, and either may
  // drive it.
  function bind(sliderId, boxId, apply) {
    var sl = $(sliderId), bx = $(boxId);
    var lo = parseFloat(sl.min), hi = parseFloat(sl.max);
    function set(v, from) {
      if (isNaN(v)) return;
      v = Math.min(hi, Math.max(lo, v));
      if (from !== "slider") sl.value = v;
      if (from !== "box") bx.value = v;
      apply(v);
    }
    sl.addEventListener("input", function () { set(parseFloat(sl.value), "slider"); });
    bx.addEventListener("input", function () { set(parseFloat(bx.value), "box"); });
    bx.addEventListener("blur", function () { set(parseFloat(bx.value), null); });
  }

  bind("count", "countNum", function (v) {
    state.n = Math.round(v);
    state.lift = 0;
    stop();
    syncPanel();
    draw();
  });

  bind("load", "loadNum", function (v) {
    state.load = v;
    syncPanel();
    draw();
  });

  /* ------------------------------------------------------------------
     Pulling
     ------------------------------------------------------------------ */

  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

  function stop() {
    state.playing = false;
    $("pull").disabled = false;
  }

  function play() {
    if (state.lift >= 1) { state.lift = 0; render(); }
    if (reduceMotion && reduceMotion.matches) {
      state.lift = 1;
      render();
      return;
    }
    state.from = state.lift;
    state.playing = true;
    state.t0 = performance.now();
    $("pull").disabled = true;
    requestAnimationFrame(function step() {
      if (!state.playing) return;
      var t = (performance.now() - state.t0) / TIMELINE.pull;
      if (t >= 1) {
        state.lift = 1;
        stop();
        render();
        return;
      }
      state.lift = state.from + (1 - state.from) * easeOut(t);
      render();
      requestAnimationFrame(step);
    });
  }

  $("pull").addEventListener("click", play);
  $("reset").addEventListener("click", function () {
    stop();
    state.lift = 0;
    render();
  });

  /* ------------------------------------------------------------------
     Dragging the effort end
     ------------------------------------------------------------------ */

  var dragging = false, hovering = false, grabLift = 0, grabY = 0;

  function localPoint(ev) {
    var box = canvas.getBoundingClientRect();
    return { x: ev.clientX - box.left, y: ev.clientY - box.top };
  }

  function overHand(pt) {
    if (!lastG) return false;
    return Math.abs(pt.x - lastG.handX) < 20 && Math.abs(pt.y - lastG.handY) < 20;
  }

  canvas.addEventListener("pointerdown", function (ev) {
    var pt = localPoint(ev);
    if (state.playing || !overHand(pt)) return;
    dragging = true;
    grabLift = state.lift;
    grabY = pt.y;
    canvas.setPointerCapture(ev.pointerId);
    canvas.style.cursor = "grabbing";
    ev.preventDefault();
  });

  canvas.addEventListener("pointermove", function (ev) {
    var pt = localPoint(ev);
    if (dragging) {
      var g = lastG;
      // The hand travels S times as far as the load, so that is the
      // factor between what the pointer moves and what is lifted.
      var travel = g.S * g.maxD;
      var moved = (g.effortDown ? 1 : -1) * (pt.y - grabY);
      state.lift = Math.min(1, Math.max(0, grabLift + (travel ? moved / travel : 0)));
      render();
      ev.preventDefault();
      return;
    }
    if (state.playing) return;
    var over = overHand(pt);
    if (over !== hovering) {
      hovering = over;
      canvas.style.cursor = over ? "grab" : "default";
    }
  });

  function endDrag(ev) {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = hovering ? "grab" : "default";
    if (ev && ev.pointerId !== undefined && canvas.hasPointerCapture(ev.pointerId)) {
      canvas.releasePointerCapture(ev.pointerId);
    }
  }

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  /* ------------------------------------------------------------------
     Sizing. Redraw on demand, never on a timer.
     ------------------------------------------------------------------ */

  function fitAll() { fit(); draw(); }

  window.addEventListener("resize", fitAll);
  window.addEventListener("pageshow", fitAll);
  document.addEventListener("visibilitychange", fitAll);

  // Held in a variable on purpose: an unreferenced ResizeObserver can be
  // garbage collected, after which it silently stops firing.
  var sizeObserver = null;
  if (window.ResizeObserver) {
    sizeObserver = new ResizeObserver(fitAll);
    sizeObserver.observe(host);
  }

  syncPanel();
  fitAll();

  // A page opened in a background tab gets no observer callbacks at all,
  // so keep checking until the canvas has a real size.
  var frames = 0;
  (function settle() {
    if (frames++ > 300) return;
    if (host.clientWidth > 0 && !needsFit()) return;
    fitAll();
    requestAnimationFrame(settle);
  })();
})();
