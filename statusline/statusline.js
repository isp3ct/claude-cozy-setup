#!/usr/bin/env node
// Cozy purple usage status line for Claude Code (5h + 7d rate limit windows)
const fs = require('fs');
const path = require('path');
const os = require('os');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let d = {};
  try { d = JSON.parse(raw || '{}'); } catch {}


  const ESC = '\x1b[';
  const rgb = (r, g, b) => `${ESC}38;2;${r};${g};${b}m`;
  const RESET = `${ESC}0m`;
  const BOLD = `${ESC}1m`;
  const DIM = rgb(46, 44, 72);      // empty cells
  const TEXT = rgb(203, 213, 225);   // soft lavender text
  const MUTED = rgb(100, 116, 139);  // labels / separators

  // gradient stops: deep violet -> violet -> indigo -> steel blue
  const stops = [
    [91, 33, 182],
    [109, 40, 217],
    [79, 70, 229],
    [59, 130, 246],
  ];
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const grad = (t) => {
    t = Math.min(1, Math.max(0, t));
    const seg = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(seg));
    const f = seg - i;
    const [a, b] = [stops[i], stops[i + 1]];
    return rgb(lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f));
  };

  const CELLS = 10;
  const bar = (pct) => {
    const filled = Math.round((pct / 100) * CELLS);
    let s = '';
    for (let i = 0; i < CELLS; i++) {
      s += i < filled ? grad(i / (CELLS - 1)) + '▰' : DIM + '▱';
    }
    return s + RESET;
  };

  const until = (resetsAt) => {
    if (!resetsAt) return '';
    let ms = (resetsAt > 1e12 ? resetsAt : resetsAt * 1000) - Date.now();
    if (isNaN(ms)) return '';
    if (ms <= 0) return 'agora';
    const m = Math.floor(ms / 60000);
    const dd = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    const mm = m % 60;
    if (dd > 0) return `${dd}d${h}h`;
    if (h > 0) return `${h}h${String(mm).padStart(2, '0')}m`;
    return `${mm}m`;
  };

  const seg = (label, w) => {
    if (!w || typeof w.used_percentage !== 'number') {
      return `${MUTED}${label} ${DIM}▱▱▱▱▱▱▱▱▱▱ ${MUTED}—${RESET}`;
    }
    const pct = Math.round(w.used_percentage);
    const reset = until(w.resets_at);
    return (
      `${MUTED}${label} ${RESET}${bar(pct)} ${grad(pct / 100)}${pct}%${RESET}` +
      (reset ? ` ${MUTED}↻ ${TEXT}${reset}${RESET}` : '')
    );
  };

  const kfmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
  const ctxSeg = (c) => {
    if (!c || typeof c.used_percentage !== 'number') return '';
    const pct = Math.round(c.used_percentage);
    const u = c.current_usage || {};
    const used = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    const tokens = used && c.context_window_size ? ` ${MUTED}${kfmt(used)}/${kfmt(c.context_window_size)}${RESET}` : '';
    return `${MUTED}ctx ${RESET}${bar(pct)} ${grad(pct / 100)}${pct}%${RESET}${tokens}`;
  };

  const rl = d.rate_limits || {};
  const model = (d.model && (d.model.display_name || d.model.id)) || '';
  const sep = ` ${MUTED}│${RESET} `;

  const parts = [];
  if (model) parts.push(`${rgb(109, 40, 217)}✦ ${TEXT}${model}${RESET}`);
  const ctx = ctxSeg(d.context_window);
  if (ctx) parts.push(ctx);
  parts.push(seg('5h', rl.five_hour));
  parts.push(seg('7d', rl.seven_day));

  process.stdout.write(parts.join(sep));
});
