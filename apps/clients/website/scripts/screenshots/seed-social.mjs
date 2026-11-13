// Seeds a THROWAWAY local API ($API_URL, default 127.0.0.1:5119; never the real one) with a few lifters, follows, posts, likes, comments.
const API = process.env.API_URL || "http://127.0.0.1:5119";
const PW = "screenshot-pass-123";
const users = [
  ["alex", "Alex"],
  ["niamh.lifts", "Niamh Byrne"],
  ["conor_trains", "Conor Walsh"],
  ["sarahkb", "Sarah Kelly"],
  ["coach.dara", "Dara Nolan"],
];
const tok = {};
async function call(user, method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(tok[user] ? { authorization: `Bearer ${tok[user]}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [u, name] of users) {
  let res;
  try { res = await call(u, "POST", "/auth/register", { username: u, email: `${u.replace(/[._]/g, "")}@example.com`, password: PW, displayName: name }); }
  catch { res = await call(u, "POST", "/auth/login", { usernameOrEmail: u, password: PW }); }
  tok[u] = res.accessToken;
}
for (const [u] of users.slice(1)) {
  await call("alex", "POST", `/users/${u}/follow`).catch((e) => console.warn(e.message));
  await call(u, "POST", `/users/alex/follow`).catch((e) => console.warn(e.message));
}

const posts = [];
async function post(u, type, body, payload) {
  const p = await call(u, "POST", "/posts/", { type, body, payloadJson: payload ? JSON.stringify(payload) : undefined });
  posts.push({ u, id: p.id, type });
  await wait(1200);
  return p.id;
}

const split = await post("sarahkb", "Split", "My 4-day upper/lower. Copy it if you're after something simple that works.", {
  name: "Simple Upper / Lower",
  days: [
    { name: "Upper 1", orderIndex: 0, blocks: [
      { type: "strength", orderIndex: 0, exerciseName: "Bench Press", exerciseId: "ex_core_bench", targets: { sets: 3, reps: 6 } },
      { type: "strength", orderIndex: 1, exerciseName: "Barbell Row", exerciseId: "ex_core_bb_row", targets: { sets: 3, reps: 8 } },
      { type: "strength", orderIndex: 2, exerciseName: "Lateral Raise", exerciseId: "ex_core_lat_raise", targets: { sets: 3, reps: 15 } } ] },
    { name: "Lower 1", orderIndex: 1, blocks: [
      { type: "strength", orderIndex: 0, exerciseName: "Squat", exerciseId: "ex_core_squat", targets: { sets: 3, reps: 5 } },
      { type: "strength", orderIndex: 1, exerciseName: "Romanian Deadlift", exerciseId: "ex_core_rdl", targets: { sets: 3, reps: 8 } } ] },
    { name: "Upper 2", orderIndex: 2, blocks: [
      { type: "strength", orderIndex: 0, exerciseName: "Overhead Press", exerciseId: "ex_core_ohp", targets: { sets: 3, reps: 8 } },
      { type: "strength", orderIndex: 1, exerciseName: "Pull-Up", exerciseId: "ex_core_pullup", targets: { sets: 3, reps: 8 } } ] },
    { name: "Lower 2", orderIndex: 3, blocks: [
      { type: "strength", orderIndex: 0, exerciseName: "Deadlift", exerciseId: "ex_core_deadlift", targets: { sets: 3, reps: 5 } },
      { type: "strength", orderIndex: 1, exerciseName: "Leg Press", exerciseId: "ex_core_leg_press", targets: { sets: 3, reps: 10 } } ] },
  ],
  schedule: "rotation",
  customExercises: [],
});
const algo = await post("coach.dara", "Algorithm", "Moving all my clients onto double progression this block. Fill the rep range, then add weight.", {
  id: "com.example.linear-plus", name: "Linear Plus", family: "progression-algorithm",
  description: "Double progression: fill your rep range before adding weight. Includes a warmup set suggestion.", author: "Community sample",
});
const habit = await post("niamh.lifts", "Habit", "30 days in a row. Knees have never felt better.", {
  name: "Mobility, 10 min", cadence: { kind: "daily" }, icon: "🧘", tone: "rose",
});
const workout = await post("niamh.lifts", "WorkoutSession", "Pull day after a deload week. Everything moved fast.", {
  duration: 62 * 60000,
  exercises: [{ name: "Deadlift", sets: 4 }, { name: "Pull-Up", sets: 4 }, { name: "Barbell Row", sets: 3 }, { name: "Face Pull", sets: 3 }, { name: "Hammer Curl", sets: 3 }],
});
const pr = await post("conor_trains", "PersonalRecord", "Three months chasing this. 200 finally moved.", {
  exerciseName: "Deadlift", weight: 200, unit: "kg", reps: 1,
});

const like = (u, id) => call(u, "POST", `/posts/${id}/like`).catch((e) => console.warn(e.message));
const comment = (u, id, body) => call(u, "POST", `/posts/${id}/comments`, { body }).catch((e) => console.warn(e.message));
for (const u of ["alex", "niamh.lifts", "sarahkb", "coach.dara"]) await like(u, pr);
await comment("niamh.lifts", pr, "Huge! Told you the paused pulls would pay off");
await wait(800);
await comment("coach.dara", pr, "Bar speed looked like there was more in it too");
await wait(800);
await comment("alex", pr, "Monster. 160 for 5 over here, coming for you");
for (const u of ["alex", "conor_trains", "sarahkb"]) await like(u, workout);
await comment("sarahkb", workout, "Deloads are underrated");
for (const u of ["alex", "niamh.lifts"]) await like(u, split);
await like("alex", habit);
await like("conor_trains", algo);
console.log(JSON.stringify({ pr, workout, split }));
