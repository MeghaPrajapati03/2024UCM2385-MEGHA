/**
 * renderer.js
 * Canvas-based automaton renderer with:
 * - Force-directed layout
 * - Pan & zoom
 * - State highlighting
 * - Self-loops & curved multi-edges
 * - Animated epsilon transitions
 */

'use strict';

class AutomataRenderer {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.nfa    = null;
    this.dfa    = null;
    this.mode   = 'nfa'; // 'nfa' | 'dfa'

    // Pan/zoom state
    this.scale  = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dragging = false;
    this.lastMx = 0; this.lastMy = 0;

    // Node positions (id → {x,y})
    this.positions = new Map();

    // Highlight sets
    this.highlightedStates = new Set();
    this.activeTransitions = new Set();

    // Animation
    this.animFrame = null;
    this.tick = 0;

    // Theme colors
    this.colors = {
      bg:         '#0f0f18',
      grid:       'rgba(42,42,64,0.4)',
      state:      '#00e5ff',
      stateFill:  'rgba(0,229,255,0.07)',
      start:      '#ffb800',
      startFill:  'rgba(255,184,0,0.12)',
      accept:     '#39ff85',
      acceptFill: 'rgba(57,255,133,0.12)',
      edge:       '#3a3a55',
      edgeEps:    '#a855f7',
      edgeLit:    '#00b8cc',
      label:      '#e8e8f0',
      highlight:  '#ffb800',
      hStroke:    '#ffb800',
      hFill:      'rgba(255,184,0,0.25)',
      text:       '#8888aa',
    };

    this._bindEvents();
    this._startLoop();
  }

  /* ── RESIZE ───────────────────────────────────── */
  resize() {
    const container = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width  = container.clientWidth  * dpr;
    this.canvas.height = container.clientHeight * dpr;
    this.canvas.style.width  = container.clientWidth  + 'px';
    this.canvas.style.height = container.clientHeight + 'px';
    this.ctx.scale(dpr, dpr);
    this.W = container.clientWidth;
    this.H = container.clientHeight;
  }

  /* ── PAN / ZOOM ───────────────────────────────── */
  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => {
      this.dragging = true;
      this.lastMx = e.clientX; this.lastMy = e.clientY;
    });
    c.addEventListener('mousemove', e => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastMx;
      const dy = e.clientY - this.lastMy;
      this.offsetX += dx; this.offsetY += dy;
      this.lastMx = e.clientX; this.lastMy = e.clientY;
    });
    c.addEventListener('mouseup', () => this.dragging = false);
    c.addEventListener('mouseleave', () => this.dragging = false);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      // Zoom towards mouse pointer
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.offsetX = mx - factor * (mx - this.offsetX);
      this.offsetY = my - factor * (my - this.offsetY);
      this.scale  *= factor;
      this.scale   = Math.min(Math.max(this.scale, 0.2), 5);
    }, { passive: false });

    // Touch support
    let lastDist = null;
    c.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        this.dragging = true;
        this.lastMx = e.touches[0].clientX;
        this.lastMy = e.touches[0].clientY;
      }
    });
    c.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1 && this.dragging) {
        const dx = e.touches[0].clientX - this.lastMx;
        const dy = e.touches[0].clientY - this.lastMy;
        this.offsetX += dx; this.offsetY += dy;
        this.lastMx = e.touches[0].clientX;
        this.lastMy = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (lastDist) { this.scale = Math.min(Math.max(this.scale * d / lastDist, 0.2), 5); }
        lastDist = d;
      }
    }, { passive: false });
    c.addEventListener('touchend', () => { this.dragging = false; lastDist = null; });
  }

  zoomIn()  { this.scale = Math.min(this.scale * 1.2, 5); }
  zoomOut() { this.scale = Math.max(this.scale * 0.8, 0.2); }
  fitView()  {
    if (!this.positions.size) return;
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    this.positions.forEach(p => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    const pw = maxX - minX + 160, ph = maxY - minY + 120;
    const scaleX = this.W / pw, scaleY = this.H / ph;
    this.scale = Math.min(scaleX, scaleY, 1.5);
    this.offsetX = (this.W - pw * this.scale) / 2 - minX * this.scale + 80 * this.scale;
    this.offsetY = (this.H - ph * this.scale) / 2 - minY * this.scale + 60 * this.scale;
  }

  /* ── LAYOUT ───────────────────────────────────── */
  layoutNFA(nfa) {
    this.positions.clear();
    const n = nfa.states.length;
    if (n === 0) return;

    // Force-directed layout with multiple iterations
    // Initial: random positions
    nfa.states.forEach(s => {
      this.positions.set(s.id, {
        x: Math.random() * 600 + 50,
        y: Math.random() * 400 + 50,
      });
    });

    // Find topological-ish order using BFS from start
    const order = [];
    const visited = new Set();
    const queue = [nfa.startState];
    visited.add(nfa.startState);
    while (queue.length) {
      const sid = queue.shift();
      order.push(sid);
      nfa.transitions
        .filter(t => t.from === sid && !visited.has(t.to))
        .forEach(t => { visited.add(t.to); queue.push(t.to); });
    }
    // Any unvisited
    nfa.states.forEach(s => { if (!visited.has(s.id)) order.push(s.id); });

    // Layered initial placement
    const layers = new Map();
    order.forEach((id, i) => layers.set(id, i));

    // Group by layers via BFS distance
    const dist = new Map();
    dist.set(nfa.startState, 0);
    const q2 = [nfa.startState];
    while (q2.length) {
      const sid = q2.shift();
      nfa.transitions
        .filter(t => t.from === sid)
        .forEach(t => {
          if (!dist.has(t.to)) {
            dist.set(t.to, dist.get(sid) + 1);
            q2.push(t.to);
          }
        });
    }
    nfa.states.forEach(s => { if (!dist.has(s.id)) dist.set(s.id, 0); });

    const byLayer = {};
    nfa.states.forEach(s => {
      const l = dist.get(s.id) ?? 0;
      if (!byLayer[l]) byLayer[l] = [];
      byLayer[l].push(s.id);
    });

    const H_SPACE = 130, V_SPACE = 90;
    Object.entries(byLayer).forEach(([layer, ids]) => {
      const l = parseInt(layer);
      const totalH = (ids.length - 1) * V_SPACE;
      ids.forEach((id, i) => {
        this.positions.set(id, {
          x: 80 + l * H_SPACE,
          y: 80 + i * V_SPACE - totalH / 2 + 200,
        });
      });
    });

    // Run force simulation
    this._runForce(nfa, 60);
  }

  _runForce(nfa, iterations) {
    const REPEL = 3000, ATTRACT = 0.03, EDGE = 110, DAMPING = 0.85;
    const vel = new Map();
    nfa.states.forEach(s => vel.set(s.id, { vx: 0, vy: 0 }));

    for (let it = 0; it < iterations; it++) {
      // Repulsion
      const ids = nfa.states.map(s => s.id);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i+1; j < ids.length; j++) {
          const pi = this.positions.get(ids[i]);
          const pj = this.positions.get(ids[j]);
          const dx = pi.x - pj.x, dy = pi.y - pj.y;
          const d  = Math.sqrt(dx*dx + dy*dy) || 0.01;
          const f  = REPEL / (d * d);
          const veli = vel.get(ids[i]);
          const velj = vel.get(ids[j]);
          veli.vx += f * dx / d; veli.vy += f * dy / d;
          velj.vx -= f * dx / d; velj.vy -= f * dy / d;
        }
      }
      // Attraction along edges
      nfa.transitions.forEach(t => {
        if (t.from === t.to) return;
        const pi = this.positions.get(t.from);
        const pj = this.positions.get(t.to);
        if (!pi || !pj) return;
        const dx = pj.x - pi.x, dy = pj.y - pi.y;
        const d  = Math.sqrt(dx*dx + dy*dy) || 0.01;
        const f  = ATTRACT * (d - EDGE);
        vel.get(t.from).vx += f * dx / d;
        vel.get(t.from).vy += f * dy / d;
        vel.get(t.to).vx   -= f * dx / d;
        vel.get(t.to).vy   -= f * dy / d;
      });
      // Apply velocity
      nfa.states.forEach(s => {
        const v = vel.get(s.id);
        v.vx *= DAMPING; v.vy *= DAMPING;
        const p = this.positions.get(s.id);
        p.x += v.vx; p.y += v.vy;
      });
    }
  }

  /* ── LOAD DATA ────────────────────────────────── */
  loadNFA(nfa) {
    this.nfa  = nfa;
    this.mode = 'nfa';
    this.highlightedStates.clear();
    this.activeTransitions.clear();
    this.layoutNFA(nfa);
    this.fitView();
  }

  loadDFA(dfa, posMap) {
    this.dfa  = dfa;
    this.mode = 'dfa';
    this.highlightedStates.clear();
    this.activeTransitions.clear();

    // Convert posMap or use provided layout
    if (posMap) {
      this.positions.clear();
      posMap.forEach((pos, id) => this.positions.set(id, { x: pos.x, y: pos.y }));
    } else {
      // Generate positions
      this.positions.clear();
      dfa.states.forEach((s, i) => {
        const angle = (2 * Math.PI * i) / dfa.states.length - Math.PI / 2;
        const r = Math.max(120, dfa.states.length * 25);
        this.positions.set(s.id, {
          x: r * Math.cos(angle) + r + 100,
          y: r * Math.sin(angle) + r + 100,
        });
      });
    }
    this.fitView();
  }

  /* ── HIGHLIGHT ────────────────────────────────── */
  setHighlight(stateIds) {
    this.highlightedStates = new Set(stateIds);
  }
  clearHighlight() { this.highlightedStates.clear(); }

  /* ── RENDER LOOP ──────────────────────────────── */
  _startLoop() {
    const loop = () => {
      this.tick++;
      this._render();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  _render() {
    const { ctx, W, H } = this;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    const graph = this.mode === 'nfa' ? this._getNFAGraph() : this._getDFAGraph();
    if (!graph) { ctx.restore(); return; }

    this._drawEdges(ctx, graph);
    this._drawStates(ctx, graph);

    ctx.restore();
  }

  _getNFAGraph() {
    if (!this.nfa) return null;
    const states = this.nfa.states.map(s => ({
      id: s.id,
      isStart: s.start,
      isAccept: s.accept,
      label: 'q' + s.id,
    }));
    return { states, transitions: this.nfa.transitions };
  }

  _getDFAGraph() {
    if (!this.dfa) return null;
    const states = this.dfa.states.map(s => ({
      id: s.id,
      isStart: s.isStart,
      isAccept: s.isAccept,
      label: 'D' + s.id,
    }));
    return { states, transitions: this.dfa.transitions };
  }

  /* ── DRAW EDGES ───────────────────────────────── */
  _drawEdges(ctx, graph) {
    // Group transitions between same pairs
    const edgeMap = new Map();
    graph.transitions.forEach(t => {
      const key = t.from < t.to ? `${t.from}-${t.to}` : `${t.to}-${t.from}`;
      const dir  = t.from <= t.to ? 1 : -1;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key).push({ ...t, dir });
    });

    graph.transitions.forEach(t => {
      this._drawEdge(ctx, t, graph.transitions);
    });
  }

  _drawEdge(ctx, t, allTrans) {
    const pf = this.positions.get(t.from);
    const pt = this.positions.get(t.to);
    if (!pf || !pt) return;

    const R = 28;
    const isEps = t.label === 'ε';
    const isSelf = t.from === t.to;

    // Check if reverse edge exists (for curved offset)
    const hasReverse = allTrans.some(x => x.from === t.to && x.to === t.from);

    // Color
    const col = isEps ? this.colors.edgeEps : this.colors.edgeLit;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;

    if (isSelf) {
      // Self-loop
      const lx = pf.x, ly = pf.y - R;
      const loopR = 22;
      ctx.beginPath();
      ctx.arc(lx, ly - loopR, loopR, 0.4, Math.PI * 2 - 0.4);
      ctx.stroke();
      this._drawArrowhead(ctx, lx + loopR * 0.35, ly - loopR * 0.1, Math.PI * 0.85, col);
      // Label
      this._drawEdgeLabel(ctx, lx, ly - loopR * 2 - 8, t.label, isEps);
      return;
    }

    const dx = pt.x - pf.x, dy = pt.y - pf.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = -dy / dist, ny = dx / dist; // normal

    // Curve offset for parallel/reverse edges
    const offset = hasReverse ? 22 : 0;
    const cx = (pf.x + pt.x) / 2 + nx * offset;
    const cy = (pf.y + pt.y) / 2 + ny * offset;

    // Start/end points on circle edges
    const sx = pf.x + (dx / dist) * R;
    const sy = pf.y + (dy / dist) * R;
    const ex = pt.x - (dx / dist) * R;
    const ey = pt.y - (dy / dist) * R;

    // Animated dash for epsilon
    if (isEps) {
      const dashOffset = (this.tick * 0.5) % 16;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -dashOffset;
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    if (offset !== 0) {
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
    } else {
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead direction
    let ax, ay;
    if (offset !== 0) {
      ax = ex - (cx - ex) * 0.15;
      ay = ey - (cy - ey) * 0.15;
    } else {
      ax = ex; ay = ey;
    }
    const angle = Math.atan2(ey - (offset !== 0 ? cy : sy), ex - (offset !== 0 ? cx : sx));
    this._drawArrowhead(ctx, ax, ay, angle, col);

    // Label
    const lx = offset !== 0 ? (sx + ex) / 2 + nx * (offset + 8) : (sx + ex) / 2 + nx * 12;
    const ly = offset !== 0 ? (sy + ey) / 2 + ny * (offset + 8) : (sy + ey) / 2 + ny * 12;
    this._drawEdgeLabel(ctx, lx, ly, t.label, isEps);
  }

  _drawArrowhead(ctx, x, y, angle, color) {
    const size = 8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.45);
    ctx.lineTo(-size, size * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawEdgeLabel(ctx, x, y, label, isEps) {
  ctx.save();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const baseFont = '11px JetBrains Mono, monospace';
  const superFont = '8px JetBrains Mono, monospace';

  const color = isEps ? '#c084fc' : '#94e4f0';

  // Split on * to handle superscript
  const parts = label.split('*');

  let currentX = x;

  // Measure full text width for centering
  ctx.font = baseFont;
  let totalWidth = 0;

  parts.forEach((part, i) => {
    totalWidth += ctx.measureText(part).width;
    if (i < parts.length - 1) totalWidth += ctx.measureText('*').width;
  });

  currentX = x - totalWidth / 2;

  // Draw each part
  parts.forEach((part, i) => {
    // Draw normal text
    ctx.font = baseFont;
    ctx.fillStyle = color;
    ctx.fillText(part, currentX, y);

    let w = ctx.measureText(part).width;
    currentX += w;

    // Draw superscript *
    if (i < parts.length - 1) {
      ctx.font = superFont;
      ctx.fillText('*', currentX, y - 6); // shift upward

      currentX += ctx.measureText('*').width;
    }
  });

  ctx.restore();
}

  /* ── DRAW STATES ──────────────────────────────── */
  _drawStates(ctx, graph) {
    graph.states.forEach(s => {
      const pos = this.positions.get(s.id);
      if (!pos) return;

      const isHL = this.highlightedStates.has(s.id);
      const R = 28;

      // Outer glow for highlighted
      if (isHL) {
        const grd = ctx.createRadialGradient(pos.x, pos.y, R, pos.x, pos.y, R + 14);
        grd.addColorStop(0, 'rgba(255,184,0,0.4)');
        grd.addColorStop(1, 'rgba(255,184,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R + 14, 0, Math.PI * 2);
        ctx.fill();
      }

      // Accept state: double circle
      if (s.isAccept) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R + 5, 0, Math.PI * 2);
        ctx.strokeStyle = isHL ? this.colors.hStroke : this.colors.accept;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Fill
      let fillColor;
      if (isHL) fillColor = this.colors.hFill;
      else if (s.isStart) fillColor = this.colors.startFill;
      else if (s.isAccept) fillColor = this.colors.acceptFill;
      else fillColor = this.colors.stateFill;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Stroke
      let strokeColor;
      if (isHL) strokeColor = this.colors.hStroke;
      else if (s.isStart) strokeColor = this.colors.start;
      else if (s.isAccept) strokeColor = this.colors.accept;
      else strokeColor = this.colors.state;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isHL ? 2.5 : 1.5;
      ctx.stroke();

      // Start arrow
      if (s.isStart) {
        ctx.beginPath();
        ctx.moveTo(pos.x - R - 30, pos.y);
        ctx.lineTo(pos.x - R - 2, pos.y);
        ctx.strokeStyle = this.colors.start;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        this._drawArrowhead(ctx, pos.x - R - 2, pos.y, 0, this.colors.start);
      }

      // Label
      ctx.save();
      ctx.font = '600 11px JetBrains Mono, monospace';
      ctx.fillStyle = isHL ? this.colors.hStroke : strokeColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, pos.x, pos.y);
      ctx.restore();
    });
  }
}

window.AutomataRenderer = AutomataRenderer;
