import assert from 'node:assert/strict';
import test from 'node:test';
import { isSavingsGoal, isSavingsGoalArray, savingsGoalProgress } from './savingsGoals';

const goal = {
  id: 'goal-1',
  title: 'Emergency fund',
  targetAmount: 100_000,
  savedAmount: 25_000,
  targetDate: '2027-10-28',
  createdAt: '2026-10-28T10:00:00.000Z',
};

test('validates savings goals and goal collections', () => {
  assert.equal(isSavingsGoal(goal), true);
  assert.equal(isSavingsGoalArray([goal]), true);
  assert.equal(isSavingsGoalArray([goal, { ...goal, savedAmount: -1 }]), false);
  assert.equal(isSavingsGoal({ ...goal, targetDate: '2026-02-30' }), false);
  assert.equal(isSavingsGoal({ ...goal, targetAmount: Number.POSITIVE_INFINITY }), false);
});

test('calculates clamped goal progress', () => {
  assert.equal(savingsGoalProgress(goal), 25);
  assert.equal(savingsGoalProgress({ ...goal, savedAmount: 120_000 }), 100);
  assert.equal(savingsGoalProgress({ ...goal, savedAmount: -10 }), 0);
});
