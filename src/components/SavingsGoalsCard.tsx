import React, { useState } from 'react';
import { CalendarDays, CheckCircle2, PiggyBank, Plus, Target, Trash2 } from 'lucide-react';
import { SavingsGoal } from '../types/finance';
import { newId } from '../utils/ids';
import { isValidDate, savingsGoalProgress } from '../utils/savingsGoals';
import { todayLocalISO } from '../utils/dates';
import { useMoneyFormatter } from '../hooks/useMoneyFormatter';

interface SavingsGoalsCardProps {
  goals: SavingsGoal[];
  onChange: (goals: SavingsGoal[]) => void;
  currencySymbol: string;
}

function daysUntil(targetDate: string): number {
  const [year, month, day] = targetDate.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayLocalISO().split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const today = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.ceil((target - today) / 86_400_000);
}

function displayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const SavingsGoalsCard: React.FC<SavingsGoalsCardProps> = ({ goals, onChange, currencySymbol }) => {
  const formatAmount = useMoneyFormatter();
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [savedAmount, setSavedAmount] = useState('0');
  const [targetDate, setTargetDate] = useState('');
  const [formError, setFormError] = useState('');
  const [contributingGoalId, setContributingGoalId] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState('');
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);

  const handleAddGoal = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedTarget = Number(targetAmount);
    const parsedSaved = Number(savedAmount);
    if (!title.trim()) {
      setFormError('Enter a name for this goal.');
      return;
    }
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setFormError('Target amount must be greater than zero.');
      return;
    }
    if (!Number.isFinite(parsedSaved) || parsedSaved < 0) {
      setFormError('Saved amount must be zero or more.');
      return;
    }
    if (targetDate && (!isValidDate(targetDate) || targetDate < todayLocalISO())) {
      setFormError('Choose a valid target date today or later.');
      return;
    }

    onChange([
      {
        id: newId('savings_goal'),
        title: title.trim(),
        targetAmount: parsedTarget,
        savedAmount: parsedSaved,
        ...(targetDate ? { targetDate } : {}),
        createdAt: new Date().toISOString(),
      },
      ...goals,
    ]);
    setTitle('');
    setTargetAmount('');
    setSavedAmount('0');
    setTargetDate('');
    setFormError('');
    setIsAddingGoal(false);
  };

  const handleContribution = (goalId: string) => {
    const contribution = Number(contributionAmount);
    if (!Number.isFinite(contribution) || contribution <= 0) {
      setFormError('Contribution must be greater than zero.');
      return;
    }
    onChange(goals.map((goal) => (
      goal.id === goalId ? { ...goal, savedAmount: goal.savedAmount + contribution } : goal
    )));
    setContributionAmount('');
    setContributingGoalId(null);
    setFormError('');
  };

  return (
    <section aria-labelledby="savings-goals-title" className="bg-obsidian border border-nothing rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <h2 id="savings-goals-title" className="text-sm sm:text-base font-bold text-white">Savings goals</h2>
          </div>
          <p className="text-[10px] sm:text-xs text-[#888] mt-1">
            Track funds you set aside for a goal. Updates are manual; goals stay on this device and are included in JSON backups.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsAddingGoal((isOpen) => !isOpen);
            setFormError('');
          }}
          aria-expanded={isAddingGoal}
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-950/60"
        >
          <Plus className="w-3 h-3" aria-hidden="true" />
          Add goal
        </button>
      </div>

      {isAddingGoal && (
        <form onSubmit={handleAddGoal} className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-xl border border-[#26262a] bg-[#111113] p-3">
          <label className="text-[10px] text-[#aaa]">
            Goal name
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={60}
              required
              className="mt-1 w-full rounded-lg border border-[#333] bg-black px-2.5 py-2 text-xs text-white"
              placeholder="Emergency fund"
            />
          </label>
          <label className="text-[10px] text-[#aaa]">
            Target amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={targetAmount}
              onChange={(event) => setTargetAmount(event.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-[#333] bg-black px-2.5 py-2 text-xs text-white"
            />
          </label>
          <label className="text-[10px] text-[#aaa]">
            Already saved
            <input
              type="number"
              min="0"
              step="0.01"
              value={savedAmount}
              onChange={(event) => setSavedAmount(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[#333] bg-black px-2.5 py-2 text-xs text-white"
            />
          </label>
          <label className="text-[10px] text-[#aaa]">
            Target date (optional)
            <input
              type="date"
              min={todayLocalISO()}
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[#333] bg-black px-2.5 py-2 text-xs text-white"
            />
          </label>
          {formError && <p role="alert" className="sm:col-span-2 text-[10px] text-red-400">{formError}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => { setIsAddingGoal(false); setFormError(''); }} className="rounded-lg border border-[#333] px-3 py-1.5 text-[10px] text-[#aaa]">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-600">
              Save goal
            </button>
          </div>
        </form>
      )}

      {goals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#333] p-5 text-center">
          <PiggyBank className="mx-auto h-6 w-6 text-[#666]" aria-hidden="true" />
          <p className="mt-2 text-xs font-bold text-white">No savings goals yet</p>
          <p className="mt-1 text-[10px] text-[#888]">Create a goal or sinking fund and record contributions as you save.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {goals.map((goal) => {
            const progress = savingsGoalProgress(goal);
            const completed = progress >= 100;
            const daysRemaining = goal.targetDate ? daysUntil(goal.targetDate) : null;
            return (
              <article key={goal.id} className="rounded-xl border border-[#26262a] bg-[#111113] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-bold text-white">{goal.title}</h3>
                    <p className="mt-1 text-[10px] text-[#999]">
                      {currencySymbol}{formatAmount(goal.savedAmount)} saved of {currencySymbol}{formatAmount(goal.targetAmount)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {completed && (
                      <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Complete
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteGoalId(goal.id)}
                      aria-label={`Delete ${goal.title} goal`}
                      className="rounded p-1 text-[#777] hover:bg-red-950/40 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-[#29292d]"
                  role="progressbar"
                  aria-label={`${goal.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress)}
                >
                  <div className={`h-full rounded-full transition-[width] ${completed ? 'bg-emerald-500' : 'bg-emerald-700'}`} style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] text-[#888]">
                  <span>{Math.round(progress)}% complete</span>
                  {goal.targetDate && (
                    <span className={`flex items-center gap-1 ${daysRemaining !== null && daysRemaining < 0 && !completed ? 'text-amber-300' : ''}`}>
                      <CalendarDays className="h-3 w-3" aria-hidden="true" />
                      {completed ? 'Target reached' : daysRemaining !== null && daysRemaining < 0 ? `Past target date · ${displayDate(goal.targetDate)}` : `Target ${displayDate(goal.targetDate)}`}
                    </span>
                  )}
                </div>
                {deleteGoalId === goal.id ? (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-red-900/60 bg-red-950/20 p-2">
                    <span className="text-[10px] text-red-200">Delete this goal and its saved progress?</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setDeleteGoalId(null)} className="px-2 py-1 text-[9px] text-[#aaa]">Cancel</button>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(goals.filter((item) => item.id !== goal.id));
                          setDeleteGoalId(null);
                        }}
                        className="rounded bg-red-700 px-2 py-1 text-[9px] font-bold text-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : contributingGoalId === goal.id ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="min-w-0 flex-1 text-[9px] text-[#aaa]">
                      Contribution amount
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={contributionAmount}
                        onChange={(event) => setContributionAmount(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#333] bg-black px-2.5 py-2 text-xs text-white"
                      />
                    </label>
                    <button type="button" onClick={() => handleContribution(goal.id)} className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white">
                      Add
                    </button>
                    <button type="button" onClick={() => { setContributingGoalId(null); setFormError(''); }} className="px-2 py-2 text-[10px] text-[#888]">
                      Cancel
                    </button>
                  </div>
                ) : !completed ? (
                  <button
                    type="button"
                    onClick={() => { setContributingGoalId(goal.id); setFormError(''); }}
                    className="mt-2 rounded-lg border border-emerald-800/60 px-2.5 py-1.5 text-[9px] font-bold text-emerald-300 hover:bg-emerald-950/30"
                  >
                    Add contribution
                  </button>
                ) : null}
                {contributingGoalId === goal.id && formError && <p role="alert" className="mt-2 text-[10px] text-red-400">{formError}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
