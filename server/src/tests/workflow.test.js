import test from 'node:test';
import assert from 'node:assert/strict';

// Lightweight contract tests for workflow rules. API/database integration tests are a next step.
const transitions = {
  Open: ['In Progress', 'Blocked', 'Awaiting Approval'],
  'In Progress': ['Blocked', 'Awaiting Approval', 'Resolved', 'Open'],
  Blocked: ['In Progress', 'Open'],
  'Awaiting Approval': ['Resolved', 'In Progress'],
  Resolved: ['Open']
};
function canTransition(from, to, role) {
  if (!transitions[from]?.includes(to)) return false;
  if (to === 'Awaiting Approval' || (from === 'Awaiting Approval' && to === 'Resolved')) return ['lead', 'admin'].includes(role);
  return true;
}
test('member cannot submit work for approval', () => assert.equal(canTransition('In Progress', 'Awaiting Approval', 'member'), false));
test('team lead can submit work for approval', () => assert.equal(canTransition('In Progress', 'Awaiting Approval', 'lead'), true));
test('resolved work can be reopened deliberately', () => assert.equal(canTransition('Resolved', 'Open', 'member'), true));
test('unknown workflow transitions are rejected', () => assert.equal(canTransition('Open', 'Resolved', 'admin'), false));
