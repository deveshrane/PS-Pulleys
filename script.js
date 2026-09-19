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
    groove: "#b9dcf0",       // the band the rope runs in
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
    eff: 100,          // efficiency, per cent
    lift: 0,           // 0 to 1, how far through the pull we are
    playing: false,
    t0: 0,
    from: 0
  };

  /* ------------------------------------------------------------------
     The route
     ------------------------------------------------------------------ */

  function end(on) { return { kind: "end", on: on }; }
  // i numbers the wheel down its own block, so its height is known
  // without having to walk the route again.
  function wheel(on, i) { return { kind: "pulley", on: on, i: i }; }
  function free() { return { kind: "free" }; }

  // True for anything that rides with the load: a movable pulley, the hook
  // of the movable block, or the rope end the load itself hangs from.
  function onLoadSide(node) {
    if (node.kind === "pulley") return node.on === "lower";
    if (node.kind === "end") return node.on === "lower" || node.on === "load";
    return false;
  }

  function route(mode, n) {
    if (mode === "fixed") return [end("load"), wheel("upper", 0), free()];
    if (mode === "movable") return [end("ceiling"), wheel("lower", 0), free()];
    if (mode === "redirect") {
      return [end("ceiling"), wheel("lower", 0), wheel("upper", 0), free()];
    }

    // Block and tackle. The chapter keeps the movable block either equal
    // to the fixed one or one pulley short of it (p.69), and ties the dead
    // end to whichever block makes the free end leave an upper pulley — so
    // the effort is pulled downward. Deriving both from n alone means that
    // arrangement is the only one reachable.
    // Read from the free end, the fall comes off the TOPMOST wheel of the
    // fixed block, drops to the BOTTOMMOST of the movable block, back up
    // to the second from the top, down to the second from the bottom, and
    // so on — finishing made off to the hook of the opposite block. Built
    // here from the dead end, so the fixed block is walked bottom to top
    // and the movable block top to bottom.
    var odd = n % 2 === 1;
    var upper = odd ? (n + 1) / 2 : n / 2;
    var nodes = [end(odd ? "lower" : "upper")];
    var side = odd ? "upper" : "lower";
    var iu = upper - 1, il = 0;
    for (var k = 0; k < n; k++) {
      nodes.push(wheel(side, side === "upper" ? iu-- : il++));
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

     A block carries its pulleys one above another on a central strap:
     the fixed block hangs from a crosshead at the support, the movable
     block runs down to a hook. The single movable pulley paired with a
     fixed one is the exception — those two sit side by side, as Fig 3.22
     draws them.

     Every strand is vertical. That is the idealisation the whole of
     section B rests on, and it is what makes each supporting strand
     shorten by exactly the height the load rises. Stacked wheels would
     put same-side strands on top of one another, so each strand is set a
     little further out than the last and each wheel is sized to the pair
     of strands it carries — which is why the wheels nearest the gap
     between the blocks are the smallest, and why no strand ever crosses
     a wheel it does not belong to.
     ------------------------------------------------------------------ */

  // Radii, and where each wheel sits down its own block, for a trial
  // wheel size. Returned separately from layout so the size can be
  // searched for: the column has to fit the sheet however many pulleys
  // are in it.
  // Every sheave in a block is the same, and its rope runs in a groove at
  // one radius the whole way round — so the rope never crosses the face of
  // a wheel, and the sheaves sit in a line on the block's centre.
  //
  // Same-side strands would then lie on top of one another, so between the
  // blocks each is eased out to a line of its own, far enough apart to be
  // counted, and eased back in as it reaches the next sheave. Both easings
  // are fixed shapes: only the straight middle changes length as the
  // blocks close up, which is what keeps the effort's travel an exact
  // multiple of the load's.
  function plan(g, rho) {
    var i, j;
    var maxRank = 1;
    for (i = 0; i < g.rank.length; i++) maxRank = Math.max(maxRank, g.rank[i]);

    var flange = rho + 3;
    var body = rho - 3;

    // How far the strands stand outside the flange, and how far apart.
    var stand = 9;
    var fan = Math.max(6, Math.min(rho * 0.3, 0.7 * rho / maxRank));

    var off = [];
    for (i = 0; i < g.segs; i++) off.push(flange + stand + g.rank[i] * fan);

    // All the sheaves are alike, so a block is a plain stack of them.
    var pitch = 2 * flange + 10;
    function stack(count) {
      var dy = [];
      for (var k = 0; k < count; k++) dy.push(k * pitch);
      return { dy: dy, span: count ? (count - 1) * pitch + 2 * flange : 0 };
    }
    var up = stack(g.upperCount), low = stack(g.lowerCount);

    // A sheave's neighbours in its own block are a pitch away, so a strand
    // has finished easing in long before it passes one of them.
    var lead = Math.min(30, pitch * 0.42);

    var R = { upper: [], lower: [] }, Rin = { upper: [], lower: [] };
    for (j = 1; j < g.nodes.length - 1; j++) {
      var node = g.nodes[j];
      R[node.on][node.i] = flange;
      Rin[node.on][node.i] = body;
    }

    return {
      rho: rho, flange: flange, body: body, fan: fan, off: off, lead: lead,
      R: R, Rin: Rin, pitch: pitch,
      upperDY: up.dy, lowerDY: low.dy,
      upperR0: flange, lowerR0: flange,
      upperLastR: flange, lowerLastR: flange,
      upperSpan: up.span, lowerSpan: low.span,
      widest: off.length ? Math.max.apply(null, off) : flange
    };
  }


  function layout(W, H) {
    var nodes = route(state.mode, state.n);
    var segs = nodes.length - 1;
    var flags = supportFlags(nodes);
    var S = strandCount(flags);
    var i, j;

    var g = {
      W: W, H: H, nodes: nodes, segs: segs, flags: flags, S: S,
      ceilY: 32, head: 13, clear: 17, tie: 31, hook: 34, loadH: 34,
      clearRope: 11,                // the rope wraps this far outside a rim
      strapW: 8, sideBySide: state.mode === "redirect"
    };

    g.upperCount = 0; g.lowerCount = 0;
    for (j = 1; j < nodes.length - 1; j++) {
      if (nodes[j].on === "upper") g.upperCount++; else g.lowerCount++;
    }
    g.hasUpper = g.upperCount > 0;
    g.hasLower = g.lowerCount > 0;

    // Which side of its block each strand runs down. Sides alternate,
    // because a wheel takes the rope in on one side and lets it out on
    // the other; the count starts so that the effort ends up on the right.
    var A = ((segs - 1) % 2 === 0) ? 1 : -1;
    var nR = 0, nL = 0;
    g.side = []; g.rank = [];
    for (i = 0; i < segs; i++) {
      var s = (i % 2 === 0) ? A : -A;
      g.side.push(s);
      g.rank.push(s > 0 ? nR++ : nL++);
    }
    if (g.sideBySide) { g.side = [-1, -1, 1]; g.rank = [0, 0, 0]; }

    // Take the biggest wheels the sheet will hold.
    var below = 34 + g.loadH + 52;                  // hook, load and its reading
    var room = H - g.ceilY - g.head - g.clear - below - 26;
    var p = null;
    for (var t = 34; t >= 8; t -= 0.5) {
      p = plan(g, t);
      var need = p.upperSpan + p.lowerSpan + (g.sideBySide ? 0 : 132);
      if (need <= room) break;
    }
    g.p = p;
    g.r0 = p.upperR0 || p.lowerR0;
    // A hook in proportion to the block it hangs under, not a fixed stub.
    g.hook = Math.max(20, Math.min(34, (p.lowerR0 || p.upperR0) * 0.62));

    // Where the wheels sit across the sheet, and where each strand runs.
    var padL = 118, padR = 124;
    g.strandX = [];
    if (g.sideBySide) {
      // Fig 3.22: the movable pulley, and a fixed one beside it that only
      // turns the effort downward.
      // Both wheels are the same size here and every strand lies on a
      // rim, so the two centres stand exactly a rim's width apart.
      var rL = p.off[0], rU = p.off[2];        // where the rope runs
      var cxL = Math.max(padL + rL, Math.min(W - padR - rU - (rL + rU),
        W / 2 - (rL + rU) / 2 - 20));
      var cxU = cxL + rL + rU;
      g.cxOf = { lower: [cxL], upper: [cxU] };
      g.strandX = [cxL - rL, cxL + rL, cxU + rU];
      g.cx = cxL;
    } else {
      g.cx = Math.max(padL + p.widest, Math.min(W - padR - p.widest, W / 2 - 24));
      g.cxOf = { lower: [], upper: [] };
      for (j = 1; j < nodes.length - 1; j++) g.cxOf[nodes[j].on][nodes[j].i] = g.cx;
      for (i = 0; i < segs; i++) g.strandX.push(g.cx + g.side[i] * p.off[i]);
    }

    // The fixed block, hung from the support. The crosshead stands clear
    // of the rope: the wrap goes over the top wheel, so the holder has to
    // sit above it, not in it.
    g.upperY0 = g.ceilY + g.head + g.clear + p.upperR0;
    g.upperLast = g.upperY0 + (p.upperDY[g.upperCount - 1] || 0);
    g.upperTieY = g.upperLast + p.upperLastR + g.tie;

    // The movable block, with the load below it.
    var floorY = H - 62;
    g.loadBaseY0 = floorY;
    g.loadTopY0 = floorY - g.loadH;
    // ... the block's ring, then the load's hanger running up through it.
    g.ringR = Math.max(7, g.hook * 0.3);
    g.hanger = 10;
    var lowerLast0 = g.loadTopY0 - g.hanger - g.hook
      - p.lowerLastR - g.clearRope;
    g.lowerY00 = lowerLast0 - (p.lowerDY[g.lowerCount - 1] || 0);

    // The blocks must stop with daylight between their rims.
    var stopAt = g.hasUpper
      ? g.upperTieY + p.lowerR0 + 26
      : g.ceilY + p.lowerR0 + 30;
    var carrier0 = g.hasLower ? g.lowerY00 : g.loadTopY0;
    var headroom = Math.max(0, carrier0 - stopAt);

    var last = nodes[nodes.length - 2];
    g.effortDown = last.on === "upper";
    g.tail0 = 62;

    // The hand carries its arrow and its reading past it, so the room it
    // needs runs well beyond the grip itself.
    var reach = 48;
    var lastWheelY0 = g.effortDown ? g.upperLast : lowerLast0;
    var handRoom = g.effortDown
      ? (H - reach) - (lastWheelY0 + g.tail0)
      : (lowerLast0 - g.tail0) - (g.ceilY + reach);

    // Both ends of the motion must stay on the sheet: the blocks must not
    // meet, and the hand — which travels S times as far — must not run off.
    g.maxD = Math.max(0, Math.min(headroom, handRoom / S));
    g.d = state.lift * g.maxD;

    g.lowerY0 = g.lowerY00 - g.d;
    g.lowerLast = lowerLast0 - g.d;
    // Everything below the sheaves rides with them: strap foot, ring, the
    // load's hanger and the load itself are one rigid group.
    g.hookTop = g.lowerLast + p.lowerLastR + g.clearRope;
    g.ringY = g.hookTop + g.hook - g.ringR;
    g.lowerTieY = g.lowerY0 - p.lowerR0 - g.tie;
    g.loadTopY = g.loadTopY0 - g.d;
    g.loadBaseY = g.loadBaseY0 - g.d;

    // The tail to the hand is whatever length of rope the rest of the
    // route has given up. This is the only place the effort's travel is
    // decided, and it is decided by the rope being inextensible.
    g.tail = g.tail0 + (ropeBody(g, 0) - ropeBody(g, g.d));
    g.handX = g.strandX[segs - 1];
    var lastWheelY = g.effortDown ? g.upperLast : g.lowerLast;
    g.handY = g.effortDown ? lastWheelY + g.tail : lastWheelY - g.tail;
    g.handY0 = g.effortDown ? lastWheelY0 + g.tail0 : lowerLast0 - g.tail0;

    g.loadCx = g.hasLower
      ? (g.sideBySide ? g.cxOf.lower[0] : g.cx)
      : g.strandX[0];
    return g;
  }

  function wheelX(g, node) { return g.cxOf[node.on][node.i]; }

  function yAt(node, g, d) {
    var p = g.p;
    if (node.kind === "pulley") {
      return node.on === "upper"
        ? g.upperY0 + p.upperDY[node.i]
        : (g.lowerY00 - d) + p.lowerDY[node.i];
    }
    if (node.kind === "end") {
      if (node.on === "ceiling") return g.ceilY;
      if (node.on === "upper") return g.upperTieY;
      if (node.on === "lower") return (g.lowerY00 - d) - p.lowerR0 - g.tie;
      return g.loadTopY0 - d;                   // the load hangs off this end
    }
    return 0;
  }

  // Every part of the rope except the free tail. The wraps are the same
  // length whatever the blocks do, so only the straight runs are counted.
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

  function drawStrap(g, cx, topY, botY) {
    roundRect(cx - g.strapW / 2, topY, g.strapW, botY - topY, 5,
      COLOR.metal, COLOR.metalDark, 1.3);
  }

  // A sheave seen from the side: the flange standing proud, and the
  // bottom of the groove inside it. The rope runs in the band between
  // them, which is why its distance from the axle changes round the wrap.
  function drawWheel(g, cx, cy, rIn, rOut) {
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(cx, cy, rOut, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.groove;
    ctx.fill();
    ctx.strokeStyle = COLOR.wheel;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, rIn, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.wheelFill;
    ctx.fill();
    ctx.strokeStyle = COLOR.wheel;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, rIn * 0.42), 0, Math.PI * 2);
    ctx.strokeStyle = COLOR.wheel;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  // A closed ring on the foot of the block, with the load's own hanger
  // running up through it. An open hook left a gap between the tackle and
  // the load, so nothing held it up.
  function drawHook(g, cx) {
    line(cx, g.hookTop, cx, g.ringY - g.ringR, COLOR.metalDark, 3.6, false);
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(cx, g.ringY, g.ringR, 0, Math.PI * 2);
    ctx.strokeStyle = COLOR.metalDark;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Half an ellipse from the strand coming in across to the one going
  // out, clearing the rim. Drawn in two halves so the wheel that takes a
  // load-bearing strand in and lets the effort out is shown as both.
  var smooth = function (t) { return t * t * (3 - 2 * t); };

  // Half a circle in the groove, at the one radius the rope runs at on
  // every sheave. Drawn in two quarters so a wheel that takes a
  // load-bearing strand in and lets the effort out is shown as both.
  function drawWrap(cx, cy, rho, above, sIn, colIn, colOut) {
    var steps = 36, k = above ? -1 : 1;
    ctx.lineCap = "round";
    for (var half = 0; half < 2; half++) {
      ctx.beginPath();
      ctx.setLineDash([]);
      for (var i = 0; i <= steps / 2; i++) {
        var a = Math.PI * (half * steps / 2 + i) / steps;
        var x = cx + sIn * rho * Math.cos(a);
        var y = cy + k * rho * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = half === 0 ? colIn : colOut;
      ctx.lineWidth = 2.6;
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  // Where strand i leaves whatever is at one of its ends: the lip of a
  // sheave's groove, the becket on a block's centreline, or simply the
  // point itself for the hand and for an end made off to the support.
  function anchorX(g, node, x) {
    if (node.kind === "pulley") {
      var cx = wheelX(g, node);
      return cx + (x < cx ? -1 : 1) * g.p.rho;
    }
    if (node.kind === "end" && (node.on === "upper" || node.on === "lower")) {
      return beckettX(g, node);
    }
    return x;
  }

  // The line a strand runs along: out of one groove, easing across to its
  // own line so it can be told from its neighbours, straight down the
  // middle, then easing back into the next groove. Both easings have zero
  // slope where they meet the straight, so there is no corner anywhere.
  function strandRun(g, i) {
    var x = g.strandX[i];
    var a = g.nodes[i], b = g.nodes[i + 1];
    var ya = nodeY(a, g), yb = nodeY(b, g);
    var top = ya <= yb ? a : b, bot = ya <= yb ? b : a;
    var yTop = Math.min(ya, yb), yBot = Math.max(ya, yb);
    var xTop = anchorX(g, top, x), xBot = anchorX(g, bot, x);
    var span = yBot - yTop;
    function leadFor(node, xe) {
      if (Math.abs(xe - x) < 0.01) return 0;
      // A dead end is made off on the centreline, a long way in from the
      // strand's line, so give it further to fair out.
      var want = node.kind === "end" ? 70 : g.p.lead;
      return Math.min(want, span * 0.42);
    }
    return { x: x, yTop: yTop, yBot: yBot, xTop: xTop, xBot: xBot,
      lTop: leadFor(top, xTop), lBot: leadFor(bot, xBot) };
  }

  function strandPoints(r) {
    var pts = [], k, t;
    if (r.lTop > 0) {
      for (k = 0; k <= 12; k++) {
        t = k / 12;
        pts.push([r.xTop + (r.x - r.xTop) * smooth(t), r.yTop + r.lTop * t]);
      }
    } else pts.push([r.x, r.yTop]);
    pts.push([r.x, r.yBot - r.lBot]);
    if (r.lBot > 0) {
      for (k = 1; k <= 12; k++) {
        t = k / 12;
        pts.push([r.x + (r.xBot - r.x) * smooth(t), (r.yBot - r.lBot) + r.lBot * t]);
      }
    }
    return pts;
  }

  function drawRope(g) {
    var i;
    // Straight runs, from one wheel's centre height to the next. The wrap
    // picks the rope up exactly on the strand's own line, so there is
    // nothing between the two.
    for (i = 0; i < g.segs; i++) {
      var pts = strandPoints(strandRun(g, i));
      ctx.beginPath();
      ctx.setLineDash([]);
      for (var k = 0; k < pts.length; k++) {
        if (k === 0) ctx.moveTo(pts[k][0], pts[k][1]);
        else ctx.lineTo(pts[k][0], pts[k][1]);
      }
      ctx.strokeStyle = g.flags[i] ? COLOR.support : COLOR.effort;
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    for (i = 1; i < g.nodes.length - 1; i++) {
      var node = g.nodes[i];
      var cx = wheelX(g, node);
      drawWrap(cx, nodeY(node, g), g.p.rho, node.on === "upper",
        g.strandX[i - 1] < cx ? -1 : 1,
        g.flags[i - 1] ? COLOR.support : COLOR.effort,
        g.flags[i] ? COLOR.support : COLOR.effort);
    }
  }

  // The becket the dead end is made off to: an eye on the head of the
  // block's own strap, on its centreline. Set off to one side the pull
  // would twist the block, and the plate it used to stand on was wider
  // than the rope bundle, so strands ran straight through it.
  function drawBecket(g) {
    var first = g.nodes[0];
    if (first.kind !== "end" || first.on === "load") return;
    var ky = nodeY(first, g);
    if (first.on === "ceiling") { dot(g.strandX[0], ky, COLOR.support, 3.6); return; }

    var cx = beckettX(g, first);
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(cx, ky, 6.5, 0, Math.PI * 2);
    ctx.strokeStyle = COLOR.metalDark;
    ctx.lineWidth = 3;
    ctx.stroke();
    dot(cx, ky, COLOR.support, 3.2);
  }

  function beckettX(g, node) {
    return g.sideBySide ? g.cxOf[node.on][0] : g.cx;
  }

  function drawLoad(g) {
    var cx = g.loadCx;
    var topY = g.loadTopY;
    var w = 62;
    // The load's hanger, run up through the block's ring. Drawn before the
    // ring so the ring closes over it and the two read as linked.
    if (g.hasLower) line(cx, g.ringY, cx, topY + 2, COLOR.metalDark, 3.6, false);
    roundRect(cx - w / 2, topY, w, g.loadH, 4, COLOR.load, null, 0);
    label("L", cx, topY + g.loadH / 2, "#f8fafc", "center", "middle", 15);
    arrow(cx, topY + g.loadH + 8, cx, topY + g.loadH + 30, COLOR.load, 2);
    label(fmtNum(state.load) + " kgf = " + fmtNum(state.load * G) + " N",
      cx, topY + g.loadH + 42, COLOR.load, "center", "middle", 12);
  }

  function drawEffort(g) {
    var dir = g.effortDown ? 1 : -1;
    var x = g.handX, y = g.handY;

    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(x, y, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.effort;
    ctx.fill();
    ctx.strokeStyle = COLOR.halo;
    ctx.lineWidth = 2;
    ctx.stroke();

    arrow(x, y + dir * 12, x, y + dir * 36, COLOR.effort, 2.2);
    var E = effortOf(g.S);
    beside(g.W, "E = " + fmtNum(E) + " kgf = " + fmtNum(E * G) + " N",
      x + 4, y + dir * 26, COLOR.effort, 12);
  }

  // Every strand that carries the load is marked with the tension in it,
  // pulling upwards — which is the whole reason the load is held up.
  // Every strand is marked with the tension in it, pulling upwards —
  // the effort's strand included, since the rope pulls up on the hand
  // just as it pulls up on the load. The letter stays beside its own
  // arrow, stepped down the page so no two land at the same height.
  function drawTensions(g) {
    var top = g.hasUpper ? g.upperTieY : g.ceilY;
    var bot = g.hasLower ? g.lowerTieY : g.loadTopY;
    var mid = (top + bot) / 2;
    var step = 20;
    var lo = mid - (g.segs - 1) * step / 2;

    for (var i = 0; i < g.segs; i++) {
      var x = g.strandX[i];
      var run = strandRun(g, i);
      var hi = run.yTop + run.lTop, low = run.yBot - run.lBot;
      if (low - hi < 28) continue;
      // Kept on its own strand: a short one — the free end of a movable
      // pulley at rest, say — has nowhere near the middle of the diagram.
      var y = Math.max(hi + 15, Math.min(low - 14, lo + i * step));
      var col = g.flags[i] ? COLOR.support : COLOR.effort;
      arrow(x, y + 11, x, y - 11, col, 1.8);
      label("T", x + g.side[i] * 9, y, col,
        g.side[i] > 0 ? "left" : "right", "middle", 13);
    }
    label(g.S + (g.S === 1 ? " strand supports the load" : " strands support the load"),
      12, g.ceilY + 24, COLOR.support, "left", "middle", 13);
  }

  function drawDistances(g) {
    // The load's base at rest is the datum every rise is read from.
    var dimX = Math.max(84, g.loadCx - 31 - 46);
    var reachTo = g.loadCx + 38;
    line(dimX - 7, g.loadBaseY0, reachTo, g.loadBaseY0, COLOR.guide, 1.1, true);

    if (g.d >= 1) {
      line(dimX - 7, g.loadBaseY, reachTo, g.loadBaseY, COLOR.guide, 1.1, true);
      line(dimX, g.loadBaseY, dimX, g.loadBaseY0, COLOR.mark, 1.2, false);
      line(dimX - 5, g.loadBaseY, dimX + 5, g.loadBaseY, COLOR.mark, 1.2, false);
      line(dimX - 5, g.loadBaseY0, dimX + 5, g.loadBaseY0, COLOR.mark, 1.2, false);
      label("d" + String.fromCharCode(0x2097) + " = " + metres(g.d) + " m",
        dimX - 9, (g.loadBaseY + g.loadBaseY0) / 2, COLOR.mark, "right", "middle", 12);

      var hx = Math.min(g.W - 26, g.handX + 46);
      vspan(g.W, hx, g.handY0, g.handY,
        "d" + String.fromCharCode(0x2091) + " = " + metres(g.d * g.S) + " m", COLOR.effort);
    }
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

    var p = g.p, i;
    var cxU = g.sideBySide ? g.cxOf.upper[0] : g.cx;
    var cxL = g.sideBySide ? g.cxOf.lower[0] : g.cx;

    // Sheaves, then the rope, then the block itself. The rope passes
    // behind the block, which is what a side view of a real one shows —
    // the strap and the crosshead stand between you and the groove.
    for (i = 0; i < g.upperCount; i++) {
      drawWheel(g, g.cxOf.upper[i], g.upperY0 + p.upperDY[i],
        p.Rin.upper[i], p.R.upper[i]);
    }
    for (i = 0; i < g.lowerCount; i++) {
      drawWheel(g, g.cxOf.lower[i], g.lowerY0 + p.lowerDY[i],
        p.Rin.lower[i], p.R.lower[i]);
    }

    drawRope(g);

    // The fixed block. Its strap runs from the crosshead down to the last
    // axle and stops there — it is a holder, not a spike through the wheel.
    if (g.hasUpper) {
      var tieUp = g.nodes[0].kind === "end" && g.nodes[0].on === "upper";
      roundRect(cxU - p.upperR0 - 8, g.ceilY, 2 * (p.upperR0 + 8), g.head, 4,
        COLOR.metalDark, null, 0);
      drawStrap(g, cxU, g.ceilY + g.head - 2,
        tieUp ? g.upperTieY : g.upperLast);
      for (i = 0; i < g.upperCount; i++) {
        dot(g.cxOf.upper[i], g.upperY0 + p.upperDY[i], COLOR.metalDark, 2.6);
      }
    }

    // The movable block, and the hook it carries the load on.
    if (g.hasLower) {
      var tieLow = g.nodes[0].kind === "end" && g.nodes[0].on === "lower";
      drawStrap(g, cxL, tieLow ? g.lowerTieY : g.lowerY0, g.hookTop);
      for (i = 0; i < g.lowerCount; i++) {
        dot(g.cxOf.lower[i], g.lowerY0 + p.lowerDY[i], COLOR.metalDark, 2.6);
      }
    }

    drawBecket(g);
    drawLoad(g);
    if (g.hasLower) drawHook(g, cxL);
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

  // The velocity ratio is fixed by the number of strands; the efficiency
  // is set; so the mechanical advantage follows from eta = M.A. / V.R.,
  // and the effort from it. An ideal machine gives back M.A. = V.R.
  function advantage(S) { return (state.eff / 100) * S; }
  function effortOf(S) { return state.load / advantage(S); }

  function sub(ch) { return "<sub>" + ch + "</sub>"; }

  var workRows = null;

  function buildWork(S) {
    var L = state.load, MA = advantage(S), E = effortOf(S);
    var ideal = state.eff >= 100;
    var html = "";
    function row(name, value, klass, id) {
      html += '<div class="line ' + (klass || "") + '"><span class="name">' +
        name + '</span><span class="value" ' +
        (id ? 'id="' + id + '"' : "") + ">" + value + "</span></div>";
    }
    row("Strands supporting the load", S, "key");
    row("V.R. = d" + sub("E") + " / d" + sub("L"), S, "key");
    row("Efficiency  &eta;", fmtNum(state.eff) + " %");
    row("M.A. = &eta; &times; V.R.", fmtNum(MA), "key");
    row("Effort  E = L / M.A.", fmtNum(E) + " kgf");
    row("d" + sub("L") + "  (load rises)", "0 m", "", "wDL");
    row("d" + sub("E") + "  (effort moves)", "0 m", "", "wDE");
    row("Work in  = E &times; d" + sub("E"), "0 J", "energy", "wIn");
    row("Work out = L &times; d" + sub("L"), "0 J", "energy", "wOut");
    if (!ideal) row("Lost to friction", "0 J", "", "wLost");
    $("work").innerHTML = html;
    workRows = { dL: $("wDL"), dE: $("wDE"), win: $("wIn"), wout: $("wOut"),
      lost: $("wLost") };
  }

  function updateWork(S) {
    if (!workRows) return;
    var dL = state.lift * LIFT_M;
    var dE = dL * S;
    var LN = state.load * G;
    var win = effortOf(S) * G * dE;
    var wout = LN * dL;
    workRows.dL.textContent = fmtNum(dL) + " m";
    workRows.dE.textContent = fmtNum(dE) + " m";
    workRows.win.textContent = fmtNum(win) + " J";
    workRows.wout.textContent = fmtNum(wout) + " J";
    if (workRows.lost) workRows.lost.textContent = fmtNum(win - wout) + " J";
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

  bind("eff", "effNum", function (v) {
    state.eff = v;
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
