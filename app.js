/**
 * app.js
 * Main application controller.
 * Wires together UI, Thompson's engine, Subset Construction, and Renderer.
 */

'use strict';

(function () {
  /* ── DOM ── */
  const regexInput    = document.getElementById('regexInput');
  const buildBtn      = document.getElementById('buildBtn');
  const errorMsg      = document.getElementById('errorMsg');
  const canvasEl      = document.getElementById('automataCanvas');
  const placeholder   = document.getElementById('canvasPlaceholder');
  const stateCount    = document.getElementById('stateCount');
  const transCount    = document.getElementById('transCount');
  const alphabetBadge = document.getElementById('alphabetBadge');
  const stepList      = document.getElementById('stepList');
  const enfaInfo      = document.getElementById('enfaInfo');
  const dfaInfo       = document.getElementById('dfaInfo');
  const simInput      = document.getElementById('simInput');
  const simBtn        = document.getElementById('simBtn');
  const simResult     = document.getElementById('simResult');
  const simSteps      = document.getElementById('simSteps');
  const batchInput    = document.getElementById('batchInput');
  const batchBtn      = document.getElementById('batchBtn');
  const batchResult   = document.getElementById('batchResult');
  const tableContent  = document.getElementById('tableContent');

  /* ── STATE ── */
  let currentNFA  = null;
  let currentDFA  = null;
  let currentMode = 'enfa';
  let renderer    = null;

  /* ── INIT ── */
  function init() {
    renderer = new AutomataRenderer(canvasEl);
    renderer.resize();

    // Auto-resize
    const ro = new ResizeObserver(() => { renderer.resize(); renderer.fitView(); });
    ro.observe(canvasEl.parentElement);

    // Canvas controls
    document.getElementById('zoomIn').addEventListener('click', () => renderer.zoomIn());
    document.getElementById('zoomOut').addEventListener('click', () => renderer.zoomOut());
    document.getElementById('fitBtn').addEventListener('click', () => renderer.fitView());
    document.getElementById('resetLayout').addEventListener('click', () => {
      if (currentNFA && currentMode === 'enfa') { renderer.loadNFA(currentNFA); renderer.fitView(); }
      if (currentDFA && currentMode === 'dfa')  { loadDFAView(); }
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentMode = tab.dataset.tab;
        switchTab(currentMode);
      });
    });

    // Build
    buildBtn.addEventListener('click', build);
    regexInput.addEventListener('keydown', e => { if (e.key === 'Enter') build(); });

    // Presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        regexInput.value = btn.dataset.regex;
        build();
      });
    });

    // Simulate
    simBtn.addEventListener('click', simulate);
    simInput.addEventListener('keydown', e => { if (e.key === 'Enter') simulate(); });
    batchBtn.addEventListener('click', batchTest);

    // Default example
    regexInput.value = '(a|b)*abb';
    regexInput.focus();
  }

  /* ── SWITCH TAB ── */
  function switchTab(tab) {
    ['enfa', 'dfa', 'simulate', 'table'].forEach(t => {
      document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
    });
    if (tab === 'dfa' && currentDFA) { loadDFAView(); }
    if (tab === 'enfa' && currentNFA) { renderer.loadNFA(currentNFA); renderer.fitView(); }
  }

  /* ── BUILD ── */
  function build() {
    const regex = regexInput.value.trim();
    hideError();
    if (!regex) { showError('Please enter a regular expression.'); return; }

    try {
      const result = window.RegexEngine.regexToNFA(regex);
      currentNFA = result.nfa;

      // Build DFA immediately
      currentDFA = window.SubsetConstruction.nfaToDfa(currentNFA);

      // Update canvas
      placeholder.classList.add('hidden');
      renderer.loadNFA(currentNFA);

      // Update UI
      updateBadges(currentNFA);
      renderSteps(result.steps);
      renderNFAInfo(currentNFA);
      renderDFAInfo(currentDFA);
      renderTables(currentNFA, currentDFA);

      // Switch to NFA tab
      currentMode = 'enfa';
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.tab[data-tab="enfa"]').classList.add('active');
      switchTab('enfa');

    } catch (e) {
      showError('Parse error: ' + e.message);
    }
  }

  /* ── BADGES ── */
  function updateBadges(nfa) {
    stateCount.textContent    = `States: ${nfa.states.length}`;
    transCount.textContent    = `Transitions: ${nfa.transitions.length}`;
    const alpha = nfa.getAlphabet();
    alphabetBadge.textContent = `Σ = {${alpha.join(', ') || 'ε'}}`;
  }

  /* ── NFA INFO ── */
  function renderNFAInfo(nfa) {
    const alpha = nfa.getAlphabet();
    enfaInfo.innerHTML = `
      <div class="info-block animate-in">
        <div class="info-row"><span class="label">States |Q|</span><span class="value">${nfa.states.length}</span></div>
        <div class="info-row"><span class="label">Start State</span><span class="value">q${nfa.startState}</span></div>
        <div class="info-row"><span class="label">Accept State</span><span class="value">q${nfa.acceptState}</span></div>
        <div class="info-row"><span class="label">Alphabet Σ</span><span class="value">{${alpha.join(', ') || 'ε'}}</span></div>
        <div class="info-row"><span class="label">Transitions |δ|</span><span class="value">${nfa.transitions.length}</span></div>
        <div class="info-row"><span class="label">ε-transitions</span><span class="value">${nfa.transitions.filter(t => t.label === 'ε').length}</span></div>
      </div>`;
  }

  /* ── DFA INFO ── */
  function renderDFAInfo(dfa) {
    const rows = dfa.states.map(s => `
      <div class="dfa-state-row">
        <span class="dfa-state-id">${s.isStart ? '→' : ''}${s.isAccept ? '*' : ''}D${s.id}</span>
        <span class="dfa-nfa-states">{${s.nfaStates.map(x => 'q' + x).join(',')}}</span>
      </div>`).join('');
    dfaInfo.innerHTML = `
      <div class="info-block animate-in">
        <div class="info-row"><span class="label">DFA States</span><span class="value">${dfa.states.length}</span></div>
        <div class="info-row"><span class="label">Accept States</span><span class="value">${dfa.acceptStates.length}</span></div>
        <div class="info-row"><span class="label">Transitions</span><span class="value">${dfa.transitions.length}</span></div>
      </div>
      <div class="dfa-state-list animate-in">${rows}</div>`;
  }

  /* ── STEPS ── */
  function renderSteps(steps) {
    stepList.innerHTML = steps.map((s, i) => `
      <div class="step-item ${s.type} animate-in" style="animation-delay:${i * 0.04}s">
        <span class="step-op">${stepTypeLabel(s.type)}</span>
        ${s.desc}
      </div>`).join('');
  }

  function stepTypeLabel(type) {
    return { union: '⊕ Union', concat: '· Concat', star: '★ Kleene', literal: '○ Literal' }[type] || type;
  }

  /* ── DFA VIEW ── */
  function loadDFAView() {
    if (!currentDFA) return;
    const posMap = window.SubsetConstruction.layoutDFA(currentDFA);
    renderer.loadDFA(currentDFA, posMap);
    renderer.fitView();
  }

  /* ── TABLES ── */
  function renderTables(nfa, dfa) {
    const alpha = nfa.getAlphabet();
    const epsAlpha = ['ε', ...alpha];

    // NFA table
    const nfaRows = nfa.states.map(s => {
      const cells = epsAlpha.map(sym => {
        const targets = nfa.transitions
          .filter(t => t.from === s.id && t.label === sym)
          .map(t => 'q' + t.to);
        return `<td>${targets.length ? '{' + targets.join(',') + '}' : '∅'}</td>`;
      }).join('');
      const cls = s.start ? 'start-state' : s.accept ? 'accept-state' : '';
      return `<tr><td class="state-cell ${cls}">${s.start ? '→' : ''}${s.accept ? '*' : ''}q${s.id}</td>${cells}</tr>`;
    }).join('');

    const nfaHead = epsAlpha.map(s => `<th>${s}</th>`).join('');

    // DFA table
    const dfaRows = dfa.states.map(s => {
      const cells = alpha.map(sym => {
        const t = dfa.transitions.find(t => t.from === s.id && t.label === sym);
        return `<td>${t ? 'D' + t.to : '∅'}</td>`;
      }).join('');
      const cls = s.isStart ? 'start-state' : s.isAccept ? 'accept-state' : '';
      return `<tr><td class="state-cell ${cls}">${s.isStart ? '→' : ''}${s.isAccept ? '*' : ''}D${s.id}</td>${cells}</tr>`;
    }).join('');

    const dfaHead = alpha.map(s => `<th>${s}</th>`).join('');

    tableContent.innerHTML = `
      <h4 style="color:var(--cyan);font-size:11px;letter-spacing:.1em;margin-bottom:8px">ε-NFA Transition Table</h4>
      <div class="table-wrap animate-in">
        <table class="trans-table">
          <thead><tr><th>State</th>${nfaHead}</tr></thead>
          <tbody>${nfaRows}</tbody>
        </table>
      </div>
      <h4 style="color:var(--green);font-size:11px;letter-spacing:.1em;margin:14px 0 8px">DFA Transition Table</h4>
      <div class="table-wrap animate-in">
        <table class="trans-table">
          <thead><tr><th>State</th>${dfaHead}</tr></thead>
          <tbody>${dfaRows}</tbody>
        </table>
      </div>`;
  }

  /* ── SIMULATE ── */
  function simulate() {
    if (!currentNFA) { showError('Build an automaton first.'); return; }
    const input = simInput.value;

    const { accepted, trace } = window.RegexEngine.simulateNFA(currentNFA, input);

    // Result
    simResult.style.display = 'block';
    simResult.className = 'sim-result ' + (accepted ? 'accept' : 'reject');
    simResult.innerHTML = accepted
      ? `✓ ACCEPTED — "${input || 'ε'}" is in the language`
      : `✗ REJECTED — "${input || 'ε'}" is NOT in the language`;

    // Steps
    simSteps.innerHTML = trace.map(step => `
      <div class="sim-step-row">
        <span class="sym">${step.sym}</span>
        <span>→</span>
        <span class="states">{${step.states.map(s => 'q' + s).join(', ') || '∅'}}</span>
      </div>`).join('');

    // Highlight final states
    renderer.setHighlight(new Set(trace[trace.length - 1]?.states ?? []));
  }

  /* ── BATCH ── */
  function batchTest() {
    if (!currentNFA) return;
    const lines = batchInput.value.split('\n').filter(l => l.trim() !== '');
    batchResult.innerHTML = lines.map(line => {
      const str = line.trim();
      const { accepted } = window.RegexEngine.simulateNFA(currentNFA, str);
      return `<div class="batch-row ${accepted ? 'accept' : 'reject'}">
        <span class="str">"${str || 'ε'}"</span>
        <span class="verdict">${accepted ? '✓ ACCEPT' : '✗ REJECT'}</span>
      </div>`;
    }).join('');
  }

  /* ── ERROR ── */
  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }
  function hideError() { errorMsg.classList.add('hidden'); }

  /* ── START ── */
  document.addEventListener('DOMContentLoaded', init);
})();
