import type { ProgressionAlgorithm, ProgressionGoalInput, ProgressionInput, ProgressionOutput, PrecedingExercise, ExerciseHistoryEntry } from "../../domain/progression";
import { liftGoalPace, sameExercise, type Goal } from "../../domain/goals";
import { getExerciseProgressionSettings, getMuscleSetTargets, resolveAlgorithmId } from "./exerciseProgressionSettings";
import { strengthEstimate } from "../../progression/algorithms/adaptiveProgression";
import { setTargetFor, SECONDARY_SET_WEIGHT } from "../../domain/weeklySets";
import { weekBucket } from "../../domain/time";
import type { Machine, MuscleGroup } from "../../domain/exercise";
import { exerciseKey, resolveExerciseIncrement, resolveExerciseMachine } from "../../domain/progression";
import { rebaseForMachine, snapToMachine } from "../../domain/machine";
import { getExercises, isUnloggedPlannedSet } from "../../domain/workout";
import type { WorkoutSession } from "../../domain/workout";
import { nowMs } from "../../domain/time";
import type { PlannedTargets } from "../../domain/WorkoutSplit";
import { getExerciseHistory } from "./getExerciseHistory";
import type { ProgressionDeps } from "./deps";
import { startingLiftEntry, startingLiftLine, type StartingLift } from "../../domain/startingLift";
import { estimated1RM } from "../../domain/oneRepMax";
import { knownLifts, minRelatedE1rm, relatedEstimate, solidLifts, type RelatedEstimate } from "../../domain/relatedLifts";

// How many of *this exercise's own* most recent sessions the algorithm sees —
// not a global cap across every exercise (that was the bug: fetching "the last
// 20 sessions total, then filtering" silently starved anyone who trains several
// different exercises regularly, diluting a single exercise's own history below
// what calibration/trial thresholds need long before 20 of ITS sessions existed).
const HISTORY_WINDOW = 20;

export async function getSuggestion(
  exercise: { id?: string; name: string },
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "algorithmRegistry" | "exerciseRepo" | "loadBodyweight" | "loadGoals" | "loadFood">,
  plannedTargets?: PlannedTargets,
  currentSession?: WorkoutSession,
  liveInput?: { rpe?: number; readiness?: number },
  /** Run this algorithm instead of the one set for the exercise (the builder's preview). */
  algorithmOverride?: ProgressionAlgorithm,
  /** The machine this is done on today (from the place you're at), when known. Weights are
   * rounded to its settings and start from the last time on it (rebaseForMachine). */
  options?: { machine?: Machine; week?: ProgressionInput["week"] },
): Promise<ProgressionOutput | null> {
  const { progressionRepo, workoutRepo, exerciseRepo, algorithmRegistry: registry } = deps;

  // This exercise's own algorithm if it has one, else the general one. An override
  // whose plugin has since been removed falls back to the general one too.
  const exerciseSettings = await getExerciseProgressionSettings(exercise, deps);
  let algorithmId = algorithmOverride?.id ?? (await resolveAlgorithmId(exercise, deps, exerciseSettings));
  if (!algorithmId) return null;
  let algorithm = algorithmOverride ?? (await registry.get(algorithmId));
  if (!algorithm && exerciseSettings?.algorithmId) {
    algorithmId = (await progressionRepo.getConfig())?.algorithmId ?? null;
    algorithm = algorithmId ? await registry.get(algorithmId) : null;
  }
  if (!algorithm || !algorithmId) return null;
  const config = { algorithmId };

  const key = exerciseKey(exercise);
  let saved = await progressionRepo.getExerciseState(key);
  // Fall back to name-based key for state saved before the exercise had an ID
  // (e.g. from split blocks that stored no exerciseId, or older sessions).
  if (!saved && exercise.id) {
    const nameKey = exercise.name.toLowerCase().trim();
    if (nameKey !== key) saved = await progressionRepo.getExerciseState(nameKey);
  }

  const state =
    saved?.algorithmId === config.algorithmId
      ? saved.state
      : algorithm.defaultState;

  // Same fetch/match logic getExerciseHistory already uses (uncapped, oldest
  // first) — reused rather than re-implemented, then capped to this exercise's
  // own most recent HISTORY_WINDOW and reversed to the newest-first order this
  // usecase has always returned.
  const { history: fullHistory, exerciseData } = await getExerciseHistory(
    exercise,
    { workoutRepo, exerciseRepo },
    { excludeSessionId: currentSession?.id },
  );
  // The lifter's bodyweight around each session, so a bodyweight lead-in set
  // (12 × BW before 6 × BW+5) can be converted. Plain numbers, like analytics.
  const bodyweightAt = await (deps.loadBodyweight?.().catch(() => null) ?? null);
  // Never logged: a best lift typed in at onboarding stands in for the history.
  const typedLift: StartingLift | null = fullHistory.length === 0 && exerciseSettings?.startingLift
    ? { ...exerciseSettings.startingLift, exerciseId: exercise.id, exerciseName: exercise.name }
    : null;
  // Never logged and nothing typed: worked out from their other lifts (Phase 6.2), at the low end,
  // as a 5-rep set it stands for. "From your deadlift 200 × 5 · a guess".
  let related: RelatedEstimate | null = null;
  if (fullHistory.length === 0 && !typedLift) {
    // Best lifts typed in at setup count too: a deliberate heavy set, as solid as two workouts.
    const typed = ((await deps.progressionRepo.listExerciseSettings?.().catch(() => [])) ?? [])
      .filter((r) => !r.deletedAtMs && r.startingLift && r.startingLift.weightKg > 0)
      .map((r) => ({ name: r.exerciseName, e1rm: estimated1RM(r.startingLift!.weightKg, r.startingLift!.reps), weight: r.startingLift!.weightKg, reps: r.startingLift!.reps, atMs: r.startingLift!.enteredAtMs, sessions: 2 }));
    const logged = solidLifts(knownLifts(await workoutRepo.listAllSessions().catch(() => []), nowMs()));
    related = relatedEstimate(exercise.name, [...logged, ...typed.filter((t) => !logged.some((l) => l.name.toLowerCase() === t.name.toLowerCase()))]);
    if (related && related.e1rmKg < minRelatedE1rm(exercise.name)) related = null;
  }
  const startingLift: StartingLift | null = typedLift
    ?? (related ? { exerciseId: exercise.id, exerciseName: exercise.name, weightKg: Math.max(2.5, Math.floor(related.e1rmKg / (1 + 5 / 30) / 2.5) * 2.5), reps: 5, enteredAtMs: nowMs() } : null);
  const history = (startingLift
    ? [startingLiftEntry(startingLift, algorithmId === "linear-progression" ? { workingReps: exerciseSettings?.repRange?.[0] ?? plannedTargets?.reps ?? 5 } : {})]
    : fullHistory)
    .slice(-HISTORY_WINDOW)
    .reverse()
    .map((h) => {
      const kg = bodyweightAt?.(h.performedAtMs);
      return kg != null && h.bodyweightKg === undefined ? { ...h, bodyweightKg: kg } : h;
    });

  const exerciseWithMuscles = {
    ...exercise,
    primaryMuscles: exerciseData?.primaryMuscles ?? [],
    secondaryMuscles: exerciseData?.secondaryMuscles ?? [],
    exerciseType: exerciseData?.exerciseType,
  };

  const incrementOverride = resolveExerciseIncrement(exerciseData ?? {}, history);

  let sessionContext: { precedingExercises: PrecedingExercise[] } | undefined;

  if (currentSession) {
    const allBlocks = getExercises(currentSession).sort((a, b) => a.orderIndex - b.orderIndex);
    const targetIndex = allBlocks.findIndex((e) =>
      exercise.id ? e.exerciseId === exercise.id : e.exerciseName.toLowerCase() === exercise.name.toLowerCase(),
    );

    if (targetIndex > 0) {
      const precedingEntries = allBlocks.slice(0, targetIndex);
      const precedingExercises: PrecedingExercise[] = await Promise.all(
        precedingEntries.map(async (entry) => {
          const data = entry.exerciseId
            ? await exerciseRepo.getById(entry.exerciseId)
            : await exerciseRepo.getByName(entry.exerciseName);

          // Sets still planned count as work about to happen, so a plan made at the
          // start of the session already allows for exercise order, and stays the
          // same as the earlier exercises get ticked off.
          const counts = (s: (typeof entry.sets)[number]) => s.completed || isUnloggedPlannedSet(s);
          const completedSets = entry.sets.filter(
            (s) => counts(s) && (s.setType === "normal" || !s.setType),
          ).length;

          const normalSets = completedSets;
          const highEffortSets = entry.sets.filter((s) => counts(s) && (s.setType === "failure" || s.setType === "amrap")).length;
          const warmupSets = entry.sets.filter((s) => counts(s) && s.setType === "warmup").length;
          const effortFactor = Math.min(1, (normalSets + highEffortSets * 1.5 + warmupSets * 0.25) / 3);

          return {
            name: entry.exerciseName,
            id: entry.exerciseId,
            primaryMuscles: data?.primaryMuscles ?? [],
            secondaryMuscles: data?.secondaryMuscles ?? [],
            completedSets,
            effortFactor,
          } satisfies PrecedingExercise;
        }),
      );

      sessionContext = { precedingExercises };
    }
  }

  const storedPrefs = await progressionRepo.getAlgorithmPreferences(config.algorithmId);
  const userPreferences = storedPrefs ?? algorithm.defaultPreferences ?? {};

  // Bespoke to the rep-range-experimentation feature (§10, ladder §10.3.1) — a
  // warm-start value for the next untried rung, informed by what's already
  // worked for other exercises sharing this one's primary muscle, plus every
  // range a sibling's ladder has already ruled out (so this exercise's own
  // ladder climbs past a range cross-exercise data already says isn't worth
  // it, rather than re-testing it blind). Only linear-progression's state
  // shape is understood here; this whole computation is a known v1
  // compromise, tracked to generalize once the feature proves out beyond one
  // built-in algorithm.
  let suggestedTrialRepRange: [number, number] | undefined;
  const siblingRuledOutRepRanges: [number, number][] = [];
  let allStates: Awaited<ReturnType<typeof progressionRepo.listExerciseStates>> | undefined;
  if (config.algorithmId === "linear-progression" && exerciseWithMuscles.primaryMuscles.length > 0) {
    allStates = await progressionRepo.listExerciseStates();
    for (const other of allStates) {
      if (other.key === key || other.algorithmId !== "linear-progression") continue;
      const otherState = other.state as {
        repRangeLadder?: { trialRepRange: [number, number]; result?: { switched?: boolean } }[];
      } | null;
      const ladder = otherState?.repRangeLadder;
      if (!ladder || ladder.length === 0) continue;

      const otherExercise = other.exerciseId
        ? await exerciseRepo.getById(other.exerciseId)
        : await exerciseRepo.getByName(other.exerciseName);
      const sharesMuscle = otherExercise?.primaryMuscles?.some((m) =>
        exerciseWithMuscles.primaryMuscles.includes(m),
      );
      if (!sharesMuscle) continue;

      for (const rung of ladder) {
        if (rung.result?.switched) {
          suggestedTrialRepRange ??= rung.trialRepRange;
        } else if (rung.result?.switched === false) {
          siblingRuledOutRepRanges.push(rung.trialRepRange);
        }
      }
    }
  }

  const goal = await goalFor(exercise, fullHistory, exerciseSettings?.behindPace ?? "show", deps);
  const estimate = strengthEstimate(history, nowMs());
  const [muscleWeek, food] = await Promise.all([
    muscleWeekFor(exerciseWithMuscles.primaryMuscles[0], deps),
    deps.loadFood?.().catch(() => null) ?? Promise.resolve(null),
  ]);

  let output = await algorithm.suggest({
    exercise: exerciseWithMuscles,
    history,
    state,
    userPreferences,
    plannedTargets: plannedTargets ?? (currentSession ? undefined : lastTimeSets(history)),
    incrementOverride,
    sessionContext,
    suggestedTrialRepRange,
    siblingRuledOutRepRanges: siblingRuledOutRepRanges.length > 0 ? siblingRuledOutRepRanges : undefined,
    liveInput,
    stateSavedAtMs: saved?.algorithmId === config.algorithmId ? saved.updatedAtMs : undefined,
    repRange: exerciseSettings?.repRange,
    goal,
    strengthEstimate: estimate
      ? { kg: Math.round(estimate.kg * 10) / 10, fromWeightKg: estimate.from.weight, fromReps: estimate.from.reps, performedAtMs: estimate.from.performedAtMs }
      : undefined,
    estimate: related
      ? { kg: related.e1rmKg, source: "related", confidence: related.confidence, basis: `${related.basis.name} ${related.basis.weight} × ${related.basis.reps}` }
      : typedLift
        ? { kg: estimate ? Math.round(estimate.kg * 10) / 10 : null, source: "typed", confidence: "rough" }
        : estimate
          ? { kg: Math.round(estimate.kg * 10) / 10, source: "logged", confidence: "sure" }
          : { kg: null, source: "none", confidence: "guess" },
    muscleWeek,
    food: food ?? undefined,
    ...(options?.week ? { week: options.week } : {}),
  });

  if (related) {
    // A guess from another lift: say which, and that the first set checks it.
    const from = `${related.basis.name.toLowerCase()} ${related.basis.weight} × ${related.basis.reps}`;
    output = { ...output, change: { kind: "first", text: `From your ${from}`, detail: "A guess from another lift: your first set checks it." } };
    if (output.reasoning) output = { ...output, reasoning: { ...output.reasoning, inputs: { ...output.reasoning.inputs, relatedTo: from }, summary: [
      `Not logged yet, so this starts from your ${from}, on the light side${related.confidence === "guess" ? " (a different movement or a machine, so lighter still)" : ""}.`,
      ...(output.reasoning.summary ?? []).map((l) => l.replace(/( × \d+) (today|on [^.,]+)/, "$1")),
    ] } };
  } else if (startingLift) {
    // Not "−17.5 kg" or "+1 rep" against a set nobody logged.
    output = { ...output, change: { kind: "first", text: "From your best lift", detail: startingLiftLine(startingLift) } };
  }
  if (startingLift && !related && output.reasoning) {
    output = { ...output, reasoning: { ...output.reasoning, inputs: { ...output.reasoning.inputs, startingLift: `${startingLift.weightKg} × ${startingLift.reps}` }, summary: [
      startingLiftLine(startingLift),
      // "from 150 × 5 today" would read as a logged set: it was typed in.
      ...(output.reasoning.summary ?? []).map((l) => l.replace(/( × \d+) (today|on [^.,]+)/, "$1")),
    ] } };
  }

  // Every algorithm's "Why?" says how a goal on this exercise is going.
  if (goal && output.reasoning) {
    output = { ...output, reasoning: { ...output.reasoning, summary: [...(output.reasoning.summary ?? []), goalLine(goal)] } };
  }

  // An algorithm decides *whether* to ask for help generating signal; whether the
  // user has already seen and dismissed that specific ask is a generic concern the
  // algorithm shouldn't need to implement itself — so it's filtered here, once, for
  // every algorithm (built-in or plugin).
  if (output.nudge && saved?.dismissedNudges?.includes(output.nudge.id)) {
    output = { ...output, nudge: undefined };
  }

  // A nudge marked `exclusive` (e.g. "start a new experiment") only makes sense if
  // no OTHER exercise already has one running — checked generically here via
  // `activeExperiment`, without needing to know what kind of experiment it is.
  if (output.nudge?.exclusive) {
    allStates ??= await progressionRepo.listExerciseStates();
    const anotherActive = allStates.some((s) => s.key !== key && s.activeExperiment);
    if (anotherActive) output = { ...output, nudge: undefined };
  }

  // If the exercise is done on a machine with a known set of achievable weights,
  // round the suggested weights to what the machine can actually be set to.
  const machine = options?.machine ?? resolveExerciseMachine(exerciseData ?? {}, history);
  // Scaled for this machine (rebaseForMachine), a weight is rarely one you can load: it's
  // rounded below even on a machine with no stack list (a plate-loaded one), to its increment.
  let rebased = false;
  if (options?.machine && output.sets.length > 0) {
    const { factor, firstTime } = rebaseForMachine(history, options.machine.id);
    if (factor !== 1) {
      output = { ...output, sets: output.sets.map((s) => ({ ...s, weight: s.weight * factor })) };
      rebased = true;
    }
    if (firstTime) {
      const note = `First time on ${options.machine.name}: machines differ, so check the first set feels right.`;
      output = { ...output, notes: output.notes ? `${output.notes} ${note}` : note };
    }
  }
  if (machine && (machine.weights || rebased) && output.sets.length > 0) {
    return {
      ...output,
      sets: output.sets.map((s) => ({ ...s, weight: snapToMachine(machine, s.weight).kg })),
    };
  }

  return output;
}

export async function refreshProgressionState(
  exercise: { id?: string; name: string },
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "algorithmRegistry" | "exerciseRepo" | "loadBodyweight" | "loadGoals" | "loadFood">,
): Promise<ProgressionOutput | null> {
  const output = await getSuggestion(exercise, deps);
  if (!output) return null;
  await applySessionProgression(exercise, output, deps);
  // The plan for next time; its `change` says how it differs from the session just done.
  return output;
}

export async function applySessionProgression(
  exercise: { id?: string; name: string },
  output: ProgressionOutput,
  // The exercise library lets a name-only block find settings saved under its id, the same
  // way getSuggestion does, so the state is saved for the algorithm that made the plan.
  deps: Pick<ProgressionDeps, "progressionRepo"> & Partial<Pick<ProgressionDeps, "exerciseRepo">>,
): Promise<void> {
  const progressionRepo = deps.progressionRepo;
  const algorithmId = await resolveAlgorithmId(exercise, deps);
  if (!algorithmId) return;
  const config = { algorithmId };

  const key = exerciseKey(exercise);

  // dismissedNudges is app-managed, not something suggest() computes — must be
  // carried forward explicitly, or a completed session would silently wipe it
  // (saveExerciseState replaces the whole row, not a per-field merge).
  const existing = await progressionRepo.getExerciseState(key);

  // activeExperiment is a generic mirror of "does this algorithm's own opaque
  // state have an experiment running", re-derived on every save rather than
  // trusted from before — bespoke to linear-progression's repRangeLadder shape
  // for now (§10, ladder §10.3.1), same known v1 compromise as the warm-start
  // lookup above.
  let activeExperiment: { id: string; startedAtMs: number } | undefined;
  if (config.algorithmId === "linear-progression") {
    const ladder = (output.nextState as { repRangeLadder?: { status: string; startedAtMs: number }[] } | null)
      ?.repRangeLadder;
    const active = ladder?.find((r) => r.status === "active");
    if (active) {
      activeExperiment = { id: "rep-range-trial", startedAtMs: active.startedAtMs };
    }
  }

  await progressionRepo.saveExerciseState({
    key,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    algorithmId: config.algorithmId,
    state: output.nextState,
    updatedAtMs: nowMs(),
    dismissedNudges: existing?.dismissedNudges,
    activeExperiment,
  });
}

// ── Goals ────────────────────────────────────────────────────────────────────

/** The live lift goal on this exercise, if any, with how it's going. */
async function goalFor(
  exercise: { id?: string; name: string },
  historyOldestFirst: Parameters<typeof liftGoalPace>[0],
  behindPace: "show" | "push",
  deps: Pick<ProgressionDeps, "loadGoals">,
): Promise<ProgressionGoalInput | undefined> {
  const goals: Goal[] = (await deps.loadGoals?.().catch(() => [])) ?? [];
  const goal = goals.find(
    (g) => !g.deletedAtMs && g.target.type === "lift" && sameExercise(g.target, exercise),
  );
  if (!goal || goal.target.type !== "lift") return undefined;
  const target = goal.target;
  const pace = liftGoalPace(historyOldestFirst, { weightKg: target.weightKg, reps: target.reps, deadlineIso: goal.deadlineIso }, nowMs());
  return { weightKg: target.weightKg, reps: target.reps, deadlineIso: goal.deadlineIso ?? null, ...pace, behindPace };
}

function fmtKg(kg: number): string {
  return `${Math.round(kg * 10) / 10} kg`;
}

function goalLine(goal: ProgressionGoalInput): string {
  const name = `${fmtKg(goal.weightKg).replace(" kg", "")} × ${goal.reps}`;
  const by = goal.deadlineIso
    ? ` by ${new Date(`${goal.deadlineIso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "";
  if (goal.pace === "achieved") return `Goal ${name}${by}: done.`;
  if (goal.pace === "unknown" || goal.neededPerWeekKg == null || goal.ratePerWeekKg == null) {
    return goal.currentKg != null
      ? `Goal ${name}${by}: you're at about ${fmtKg(goal.currentKg)} for ${goal.reps}.`
      : `Goal ${name}${by}.`;
  }
  const rate = `${goal.ratePerWeekKg >= 0 ? "+" : "−"}${fmtKg(Math.abs(goal.ratePerWeekKg))} a week`;
  const need = `+${fmtKg(goal.neededPerWeekKg)}`;
  return goal.pace === "on_pace"
    ? `Goal ${name}${by}: on pace. Needs about ${need} a week; you're at ${rate}.`
    : `Goal ${name}${by}: behind. Needs about ${need} a week; you're at ${rate}.`;
}

// ── This week's sets for a muscle ────────────────────────────────────────────

/** Hard sets for `muscle` this calendar week (main muscle 1, also-worked 0.4), against its
 * default target. From the last 30 sessions, which always covers a week. */
async function muscleWeekFor(
  muscle: MuscleGroup | undefined,
  deps: Pick<ProgressionDeps, "workoutRepo" | "exerciseRepo" | "progressionRepo">,
): Promise<ProgressionInput["muscleWeek"]> {
  if (!muscle) return undefined;
  const sessions = await deps.workoutRepo.listRecentSessions({ limit: 30 }).catch(() => []);
  const week = weekBucket(nowMs());
  const tags = new Map<string, { primary: MuscleGroup[]; secondary: MuscleGroup[] } | null>();
  let done = 0;
  for (const s of sessions) {
    if (s.excludeFromProgression) continue;
    if (weekBucket(s.endedAtMs ?? s.startedAtMs) !== week) continue;
    for (const ex of getExercises(s)) {
      const n = ex.sets.filter((x) => (x.setType === "normal" || !x.setType) && x.completed !== false && x.reps > 0).length;
      if (n === 0) continue;
      const key = ex.exerciseId ?? ex.exerciseName.toLowerCase();
      if (!tags.has(key)) {
        const data = ex.exerciseId ? await deps.exerciseRepo.getById(ex.exerciseId) : await deps.exerciseRepo.getByName(ex.exerciseName);
        tags.set(key, data ? { primary: data.primaryMuscles ?? [], secondary: data.secondaryMuscles ?? [] } : null);
      }
      const t = tags.get(key);
      if (!t) continue;
      if (t.primary.includes(muscle)) done += n;
      else if (t.secondary.includes(muscle)) done += n * SECONDARY_SET_WEIGHT;
    }
  }
  const custom = (await getMuscleSetTargets(deps).catch(() => null))?.[muscle];
  const target = setTargetFor(muscle, undefined, custom);
  return { muscle, done: Math.round(done * 10) / 10, lo: target.lo, hi: target.hi };
}

/** Outside a workout (Home, the first-workout summary, progress pages) there's no split day to
 * say how many sets: plan as many working sets as last time, not the algorithm's default 3. */
function lastTimeSets(history: ExerciseHistoryEntry[]): PlannedTargets | undefined {
  const n = history[0]?.sets.filter((s) => (s.setType === "normal" || !s.setType) && s.reps > 0).length ?? 0;
  return n > 0 ? { sets: n } : undefined;
}
