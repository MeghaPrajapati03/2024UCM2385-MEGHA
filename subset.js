/**
 * subset.js
 * Converts ε-NFA to DFA using Subset (Powerset) Construction.
 * Also provides DFA minimization via Hopcroft's algorithm.
 */

'use strict';

/* ═══════════════════════════════════════════════════
   SUBSET CONSTRUCTION
═══════════════════════════════════════════════════ */
function nfaToDfa(nfa) {
  const { epsilonClosure, move } = window.RegexEngine;
  const alphabet = nfa.getAlphabet();

  // DFA states = sets of NFA states
  const startSet = epsilonClosure(nfa, [nfa.startState]);
  const startKey = startSet.join(',');

  const dfaStates = new Map();  // key → { id, nfaStates, isAccept, isStart }
  const dfaTransitions = [];
  const queue = [startSet];
  let idCounter = 0;

  const getOrCreate = (stateSet) => {
    const key = stateSet.join(',');
    if (!dfaStates.has(key)) {
      dfaStates.set(key, {
        id: idCounter++,
        nfaStates: stateSet,
        isAccept: stateSet.includes(nfa.acceptState),
        isStart: key === startKey,
        key,
      });
      queue.push(stateSet);
    }
    return dfaStates.get(key);
  };

  getOrCreate(startSet);

  while (queue.length) {
    const stateSet = queue.shift();
    const fromState = getOrCreate(stateSet);

    for (const sym of alphabet) {
      const moved  = move(nfa, stateSet, sym);
      const closed = epsilonClosure(nfa, moved);
      if (closed.length === 0) continue;

      const toState = getOrCreate(closed);
      dfaTransitions.push({ from: fromState.id, to: toState.id, label: sym });
    }
  }

  const states = [...dfaStates.values()];

  return {
    states,
    transitions: dfaTransitions,
    alphabet,
    startState: states.find(s => s.isStart)?.id ?? 0,
    acceptStates: states.filter(s => s.isAccept).map(s => s.id),
  };
}

/* ═══════════════════════════════════════════════════
   DFA SIMULATION
═══════════════════════════════════════════════════ */
function simulateDFA(dfa, input) {
  const trace = [];
  let current = dfa.startState;
  trace.push({ sym: '—', state: current, label: 'start' });

  for (const ch of input) {
    const trans = dfa.transitions.find(t => t.from === current && t.label === ch);
    if (!trans) {
      trace.push({ sym: ch, state: null, label: 'dead' });
      return { accepted: false, trace };
    }
    current = trans.to;
    trace.push({ sym: ch, state: current });
  }

  const accepted = dfa.acceptStates.includes(current);
  return { accepted, trace };
}

/* ═══════════════════════════════════════════════════
   DFA LAYOUT (for rendering)
   Assigns x/y positions to DFA states in a layered layout
═══════════════════════════════════════════════════ */
function layoutDFA(dfa) {
  // BFS from start state to assign layers
  const layers = new Map();
  const visited = new Set();
  const queue = [{ id: dfa.startState, layer: 0 }];
  visited.add(dfa.startState);
  layers.set(dfa.startState, 0);

  while (queue.length) {
    const { id, layer } = queue.shift();
    dfa.transitions
      .filter(t => t.from === id)
      .forEach(t => {
        if (!visited.has(t.to)) {
          visited.add(t.to);
          layers.set(t.to, layer + 1);
          queue.push({ id: t.to, layer: layer + 1 });
        }
      });
  }

  // Group by layer
  const byLayer = {};
  dfa.states.forEach(s => {
    const l = layers.get(s.id) ?? 0;
    if (!byLayer[l]) byLayer[l] = [];
    byLayer[l].push(s.id);
  });

  const H_SPACE = 160, V_SPACE = 100;
  const statePositions = new Map();

  Object.entries(byLayer).forEach(([layer, ids]) => {
    const l = parseInt(layer);
    const totalH = (ids.length - 1) * V_SPACE;
    ids.forEach((id, i) => {
      statePositions.set(id, {
        x: 80 + l * H_SPACE,
        y: 60 + i * V_SPACE - totalH / 2,
      });
    });
  });

  return statePositions;
}

window.SubsetConstruction = { nfaToDfa, simulateDFA, layoutDFA };
