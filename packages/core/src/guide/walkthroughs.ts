import type { Chapter } from "./types";

// The walkthroughs, step by step. Each step points at a data-guide="…" mark on a page and,
// for "do" steps, waits for a guideSignal("…") the page sends when you've done it. The web
// steps also become the numbered how-to on each docs page, so write them as instructions a
// person can follow without the app open. consistency.test.ts checks every mark and signal.

export const PRO_CHAPTERS: Chapter[] = [
  {
    id: "pro.dashboard",
    walkthrough: "pro",
    title: "Your dashboard",
    blurb: "Widgets, arranging them, and finding this guide again",
    minutes: 2,
    feature: "web-dashboard",
    steps: [
      {
        id: "widgets", on: "web", route: "/", target: "overview-widgets", kind: "look",
        title: "Your week at a glance",
        body: "Overview shows this week's workouts against your target, your streak, goals and recent sessions. It's worked out from what your phone syncs, so it's always up to date.",
      },
      {
        id: "edit", on: "web", route: "/", target: "overview-edit", kind: "do", signal: "overview.edit-opened",
        title: "Make it yours",
        body: "Choose Edit layout to rearrange the widgets.",
      },
      {
        id: "add", on: "web", route: "/", target: "overview-add", kind: "look",
        title: "Move, resize, add",
        body: "Drag a widget or use its arrows to move it, pick a size, or add one from here. Charts you build in Insights and widget plugins show up here too. Choose Done when you're happy.",
      },
      {
        id: "guide", on: "web", route: "/", target: "sidebar-guide", kind: "look", notInDocs: true,
        title: "Come back any time",
        body: "Guide keeps your place in every chapter. Help and docs, just below it, has the full instructions for everything.",
      },
    ],
  },
  {
    id: "pro.sessions",
    walkthrough: "pro",
    title: "Sessions and progress",
    blurb: "Find a workout, read a lift's chart",
    minutes: 2,
    feature: "workouts",
    steps: [
      {
        id: "list", on: "web", route: "/sessions", target: "sessions-list", kind: "look",
        title: "Every workout you've logged",
        body: "Open Training › Sessions. Workouts you finish on your phone show up here within a minute, newest first, with PRs marked. Search by name to find one.",
        empty: "Nothing has synced from your phone yet. When you finish a workout in the app, signed in to this account, it shows up here within a minute, set by set.",
      },
      {
        id: "detail", on: "web", route: "/sessions", target: "session-detail", kind: "look",
        title: "Set by set",
        body: "Pick a session to see every set, the plan it came from and any note you wrote.",
      },
      {
        id: "lifts", on: "web", route: "/progress", target: "progress-lifts", kind: "look",
        title: "Each lift's trend",
        body: "Open Training › Progress. Every lift you've done twice or more is listed with how it's going. Choose Compare to put up to a few lifts on one chart.",
        empty: "Lifts appear here once you've done the same exercise in two workouts.",
      },
      {
        id: "chart", on: "web", route: "/progress", target: "progress-chart", kind: "look",
        title: "Estimated 1RM over time",
        body: "The chart shows your estimated one-rep max session by session, worked out from your heaviest sets, so you can see progress even when reps and weights change.",
      },
    ],
  },
  {
    id: "pro.plan",
    walkthrough: "pro",
    title: "Edit your plan on the web",
    blurb: "Change a split and see it reach your phone",
    minutes: 3,
    feature: "splits",
    steps: [
      {
        id: "splits", on: "web", route: "/plan", target: "plan-splits", kind: "look",
        title: "Your splits",
        body: "Open Training › Plan. These are the splits from your phone. The one marked Active is what Quick start trains from.",
      },
      {
        id: "editor", on: "web", route: "/plan", target: "plan-editor", kind: "look",
        title: "Change anything",
        body: "Pick a split to edit its days, exercises and sets with a keyboard. Try a small change, like adding a set.",
        empty: "No split here yet. Make one with + New split, or copy a ready-made one from Programs.",
      },
      {
        id: "save", on: "web", route: "/plan", target: "plan-save", kind: "do", signal: "plan.saved",
        title: "Save it to your phone",
        body: "Choose Save. Your phone gets the change the next time it syncs. If you changed the same split on the phone meanwhile, you're asked which one to keep.",
        arrives: "Change something in the split first: the Save bar appears at the bottom.",
      },
    ],
  },
  {
    id: "pro.habits",
    walkthrough: "pro",
    title: "Habits and goals",
    blurb: "Set a goal and see when you'll reach it",
    minutes: 2,
    feature: "habits-goals",
    steps: [
      {
        id: "week", on: "web", route: "/habits", target: "habits-week", kind: "look",
        title: "Workouts a week",
        body: "Open Body › Habits & goals. Set how many workouts a week you're aiming for; your streak counts the weeks you hit it.",
      },
      {
        id: "new-goal", on: "web", route: "/habits", target: "habits-new-goal", kind: "do", signal: "goal.saved",
        title: "Set a goal",
        body: "Choose + New goal, pick a lift, a rep count or a number of workouts, and a target. Before you save, it shows how far off you are and when you'd get there at your current rate. (Goals are kept with your phone's profile, so open the app on your phone once first.)",
      },
      {
        id: "goals", on: "web", route: "/habits", target: "habits-goals", kind: "look",
        title: "Your goals, projected",
        body: "Each goal shows a line to its target date. Goals sync, so your phone shows them too.",
      },
      {
        id: "habits", on: "web", route: "/habits", target: "habits-list", kind: "look",
        title: "Habits",
        body: "Daily habits are ticked off on the phone. Here you see the last four weeks at a glance, and you can fix a day you forgot to tick.",
      },
    ],
  },
  {
    id: "pro.insights",
    walkthrough: "pro",
    title: "Insights",
    blurb: "Ask a question, make a chart, put it on your phone",
    minutes: 3,
    feature: "insight-charts",
    steps: [
      {
        id: "questions", on: "web", route: "/insights", target: "insights-questions", kind: "look",
        title: "Questions, answered",
        body: "Open Extras › Insights. Each card is a question about your training or eating, with the answer showing. Open one to see how it was worked out.",
      },
      {
        id: "new", on: "web", route: "/insights", target: "insights-new-chart", kind: "do", signal: "chart.builder-opened",
        title: "Build your own chart",
        body: "Choose New chart.",
      },
      {
        id: "for", on: "web", route: "/insights/charts/[id]", target: "chart-for", kind: "do", signal: "chart.lift-added",
        title: "Pick what to chart",
        body: "Under For, add a lift. The preview fills in as you go. You can add a few lines, or compare against something else on the right-hand axis.",
      },
      {
        id: "show-on", on: "web", route: "/insights/charts/[id]", target: "chart-show-on", kind: "look",
        title: "Choose where it shows",
        body: "Tick where you want it: your Overview here, your phone's home screen, or your coach's view of you. Your phone draws it from its own data after the next sync.",
      },
      {
        id: "save", on: "web", route: "/insights/charts/[id]", target: "chart-save", kind: "do", signal: "chart.saved",
        title: "Save it",
        body: "Choose Save chart. It's listed under Your charts on Insights, on the web and the phone.",
      },
    ],
  },
  {
    id: "pro.social",
    walkthrough: "pro",
    title: "Social",
    blurb: "Feed, Discover, and who sees your posts",
    minutes: 2,
    feature: "social",
    steps: [
      {
        id: "tabs", on: "web", route: "/social", target: "social-tabs", kind: "look",
        title: "Following and Discover",
        body: "Open People › Social. Following is people you follow, newest first. Discover suggests posts from people you don't follow yet. Forum has questions and threads from anyone, with #tags. Notifications has likes, comments, replies and follow requests.",
      },
      {
        id: "discover", on: "web", route: "/social", target: "social-tabs", kind: "do", signal: "social.discover-opened",
        title: "Discover",
        body: "Choose Discover.",
      },
      {
        id: "privacy", on: "web", route: "/social", target: "social-privacy", kind: "look",
        title: "Who sees your posts",
        body: "Make your account private so only people you accept see your posts, and choose whether your posts can appear in other people's Discover.",
      },
    ],
  },
  {
    id: "pro.plugins",
    walkthrough: "pro",
    title: "Plugins",
    blurb: "Install one, and what the builder is for",
    minutes: 2,
    feature: "plugins",
    steps: [
      {
        id: "tabs", on: "web", route: "/plugins", target: "plugins-tabs", kind: "look",
        title: "Add to LogIt",
        body: "Open Extras › Plugins. Browse has widgets, progression rules, exercise packs and more. What you install here is installed on your phone too.",
      },
      {
        id: "mine", on: "web", route: "/plugins", target: "plugins-tabs", kind: "do", signal: "plugins.mine-opened",
        title: "Make your own",
        body: "Choose the My plugins tab.",
      },
      {
        id: "builder", on: "web", route: "/plugins", target: "plugins-mine", kind: "look",
        title: "The plugin builder",
        body: "New plugin opens an editor with a live preview. Try a draft on your phone before you share it, by link or in Browse after LogIt checks it.",
      },
    ],
  },
  {
    id: "pro.coach",
    walkthrough: "pro",
    title: "Having a coach",
    blurb: "Joining with a link, and what you share",
    minutes: 1,
    feature: "my-coach",
    steps: [
      {
        id: "page", on: "web", route: "/my-coach", target: "my-coach-page", kind: "look",
        title: "Your coach, your choice",
        body: "Open Coach › My coach. When a coach sends you their link, open it to ask them to coach you. You choose what they see: workouts, food, bodyweight, habits and check-ins. Change it here any time, or stop being coached.",
      },
    ],
  },
];

export const STUDIO_CHAPTERS: Chapter[] = [
  {
    id: "studio.invite",
    walkthrough: "studio",
    title: "Get asked to coach",
    blurb: "Your profile, an invite link, and answering a request",
    minutes: 4,
    feature: "invite-links",
    usesSamples: true,
    steps: [
      {
        id: "profile", on: "web", route: "/coaching/profile", target: "profile-coaching", kind: "look",
        title: "Your coaching profile",
        body: "Your coaching › Profile is what people see before they ask: what you coach, who it suits, your packages and your questions for them. Their answers come with the request. Your coaching agreement lives here too.",
      },
      {
        id: "new", on: "web", route: "/coaching/links", target: "links-new", kind: "do", signal: "link.created",
        title: "Make an invite link",
        body: "Open Your coaching › Invite links and choose New link. Give it a name only you see, like \"Instagram bio\", so you know where people came from. It opens your profile with Ask to be coached; pick a package if you like, or let people pay and start straight away. Copy it or show its QR code.",
      },
      {
        id: "request", on: "web", route: "/clients?tab=requests", target: "requests-pane", kind: "do", signal: "request.offered",
        title: "Someone asks to be coached",
        body: "People who ask answer your questions and wait in Clients › Requests. You see their answers and nothing else. Talk it over in the conversation, then Offer a spot: pick a package, or no payment through LogIt, and how long you hold it. Full? Put them on your waiting list instead. Niamh takes the spot within a few seconds.",
        arrives: "Waiting for Niamh, a sample client, to use your link. It takes a few seconds.",
      },
      {
        id: "links", on: "web", route: "/coaching/links", target: "links-table", kind: "look",
        title: "Your links",
        body: "Each link shows how many people asked through it and how many became clients. LogIt doesn't count clicks. Copy it, show its QR code for a poster, edit it, or switch it off: people who asked through it stay.",
      },
    ],
  },
  {
    id: "studio.clients",
    walkthrough: "studio",
    title: "Your clients and sharing",
    blurb: "Every client at a glance, and what they share",
    minutes: 2,
    feature: "coach-clients",
    steps: [
      {
        id: "list", on: "web", route: "/clients", target: "clients-list", kind: "look",
        title: "Every client at a glance",
        body: "Open Coaching › Clients. Each row shows the last 7 days, their last workout, check-ins, program and messages. In Practice view the list shows only your sample clients; outside it, only real ones.",
      },
      {
        id: "sandbox", on: "web", route: "/clients", target: "clients-sandbox", kind: "look",
        title: "Your sample clients",
        body: "In Practice view, reset the samples to their starting four weeks or remove them; you can add them back any time. On a sample's page, Answer as Niamh lets you write what she says, to try a conversation.",
      },
      {
        id: "open", on: "web", route: "/clients", target: "clients-list", kind: "do", signal: "client.opened",
        title: "Open a client",
        body: "Open a client's name. With the sample clients, open Dara: she shares her training only.",
        notInDocs: true,
      },
      {
        id: "tabs", on: "web", route: "/clients/[id]", target: "client-tabs", kind: "look",
        title: "Only what they share",
        body: "Overview, Training (with their programs and insights), Nutrition, Habits and Check-ins each have a tab. A lock means the client hasn't shared it, and you see nothing there. Clients change this themselves, any time.",
      },
      {
        id: "cards", on: "web", route: "/clients/[id]", target: "client-cards", kind: "look",
        title: "Their week, month or block",
        body: "Overview is a set of cards: latest check-in, training, body, food, habits. Switch between this week, this month and the current block. + Card chooses the cards and their order, for this client, everyone on a package, or all clients.",
      },
      {
        id: "actions", on: "web", route: "/clients/[id]", target: "client-actions", kind: "look",
        title: "Message, give a program, or pause",
        body: "Message them or give them a program from the top of their page. ⋯ has Change package, Send a form, their answers from when they asked, and Pause or End coaching: away, ill or injured, or ending with a refund and another coach to suggest.",
      },
    ],
  },
  {
    id: "studio.program",
    walkthrough: "studio",
    title: "Build a program",
    blurb: "One week of days, a progression, and the weeks as stretches",
    minutes: 4,
    feature: "coach-programs",
    steps: [
      {
        id: "new", on: "web", route: "/coaching/programs", target: "programs-new", kind: "do", signal: "program.created",
        title: "Start a program",
        body: "Open Coaching › Programs and choose New program, or Start from a program to copy one of LogIt's (or a community pack's) and change it. A new one asks how many weeks and what they do first (weeks 1 to 3 finding their weights, then a progression, a deload), or Skip for every week the same.",
      },
      {
        id: "editor", on: "web", route: "/coaching/programs", target: "program-editor", kind: "look",
        title: "One week of days",
        body: "You build one week and it applies to every week. Pick a day and use + Add to search exercises, cardio and drills; pick several to add them as a superset or circuit. Click an exercise to open it in place: what it measures, sets, reps (8 or 8-10), load (kg, or 75% of their best), rest, tempo, swaps and a note. Drag the grip to reorder. Above the days: the progression that moves the numbers, the length, and the weeks as stretches (Find your weights in weeks 1–3, Hypertrophy in 4–7, a Deload); click one to change it or drag its edge. See every week shows it with an example lifter's numbers.",
      },
      {
        id: "save", on: "web", route: "/coaching/programs", target: "program-save", kind: "do", signal: "program.saved",
        title: "It saves as you go",
        body: "There's no Save button: every change is saved, and Ctrl Z undoes. Nothing reaches a client until you assign it; later, Update their copies sends your changes to the clients you tick.",
        arrives: "Change something in the program, like its name.",
      },
    ],
  },
  {
    id: "studio.assign",
    walkthrough: "studio",
    title: "Give it to a client",
    blurb: "Assign a program and watch it start",
    minutes: 2,
    feature: "coach-programs",
    usesSamples: true,
    steps: [
      {
        id: "assign", on: "web", route: "/coaching/programs", target: "programs-assign", kind: "do", signal: "program.assigned",
        title: "Assign to a client",
        body: "Open the program and choose Assign…. Pick who gets it (Niamh, if you're using the sample clients; you can pick several) and when it starts: when they tap Start, or a date you choose. Someone already on a program can switch now or start this one when theirs ends. For one client, Next: check it fits shows where each weight starts from, lets you swap in their copy, and offers a Find your weights week first. Each gets their own copy.",
      },
      {
        // The tab in the route takes them back to the list from the program they just assigned.
        id: "library", on: "web", route: "/coaching/programs?tab=programs", target: "programs-library", kind: "look",
        title: "Who uses what",
        body: "Back in Programs, each of yours shows how many clients have it. Edit the original and Save offers to update their copies too. LogIt's and the community's programs are read-only until you copy one.",
      },
      {
        id: "started", on: "web", route: "/clients", target: "clients-list", kind: "look",
        title: "They start it",
        body: "When the client taps Start on their phone and logs a workout, the Program column shows how far in they are. Sample clients do it by themselves within a few seconds.",
      },
    ],
  },
  {
    id: "studio.checkins",
    walkthrough: "studio",
    title: "Check-ins",
    blurb: "Make a form, read the answers, reply",
    minutes: 4,
    feature: "coach-checkins",
    usesSamples: true,
    steps: [
      {
        id: "tabs", on: "web", route: "/coaching/checkins", target: "checkins-tabs", kind: "look",
        title: "All check-ins in one place",
        body: "Open Coaching › Check-ins: answers waiting for you, missed check-ins, ones you've reviewed, and every client's forms.",
      },
      {
        id: "open", on: "web", route: "/clients", target: "clients-list", kind: "do", signal: "client.opened",
        title: "Forms belong to each client",
        body: "Open a client from Coaching › Clients. With the sample clients, open Conor.",
      },
      {
        id: "tab", on: "web", route: "/clients/[id]", target: "client-tabs", kind: "do", signal: "client.tab-checkins",
        title: "Their check-ins",
        body: "Choose the Check-ins tab.",
      },
      {
        id: "add", on: "web", route: "/clients/[id]", target: "client-forms", kind: "do", signal: "checkin-form.added",
        title: "Send a form",
        body: "Choose Send a form, pick one of your forms and how often. The first time, send LogIt's weekly check-in: it becomes a shared form you can change for everyone at once.",
      },
      {
        id: "edit", on: "web", route: "/coaching/checkins/forms/[id]", target: "checkin-form-editor", kind: "look",
        title: "Your questions",
        body: "One editor for every form: written answers, numbers, scales, yes or no, choices, body weight, measurements and progress photos, with what the client sees beside it. Changes save as you go and reach everyone on the shared form; \"Change for … only\" makes one client's own version.",
      },
      {
        id: "review", on: "web", route: "/coaching/checkins", target: "checkin-review", kind: "do", signal: "checkin.reviewed",
        title: "Read and reply",
        body: "Open the check-in. Their answers sit next to their week's sessions, bodyweight and food. Write a reply and choose Send and mark reviewed: the reply goes to your messages with them, and they see it with the check-in.",
        arrives: "Waiting for Conor to fill in your form. When he does, pick his check-in in the list.",
      },
    ],
  },
  {
    id: "studio.messages",
    walkthrough: "studio",
    title: "Messages",
    blurb: "Talk to clients, and see replies arrive",
    minutes: 2,
    feature: "messages",
    usesSamples: true,
    steps: [
      {
        id: "list", on: "web", route: "/messages", target: "messages-list", kind: "look",
        title: "Every conversation",
        body: "Open Coaching › Messages. Conversations with unread messages are marked.",
      },
      {
        id: "send", on: "web", route: "/messages", target: "message-compose", kind: "do", signal: "message.sent",
        title: "Send a message",
        body: "Open a client and send them something. With the sample clients, ask Conor how his knee is.",
        arrives: "Pick a conversation to open it.",
      },
      {
        id: "reply", on: "web", route: "/messages", target: "messages-thread", kind: "look",
        title: "Replies show up here",
        body: "Their reply arrives here and on your Today page. A sample client answers within a few seconds; a real one from their phone.",
      },
    ],
  },
  {
    id: "studio.habits",
    walkthrough: "studio",
    title: "Habits and macro targets",
    blurb: "Daily habits and nutrition targets for a client",
    minutes: 2,
    feature: "coach-habits-nutrition",
    steps: [
      {
        id: "open", on: "web", route: "/clients", target: "clients-list", kind: "do", signal: "client.opened",
        title: "Open a client",
        body: "Open a client from Coaching › Clients.",
        notInDocs: true,
      },
      {
        id: "tabs", on: "web", route: "/clients/[id]", target: "client-tabs", kind: "look",
        title: "Habits and Nutrition",
        body: "On the Habits tab, Add a habit gives them something to tick off, like 8,000 steps or 3 litres of water, every day, a few times a week or on set days, to one client or several at once. You see this week as the same day squares their app shows. On the Nutrition tab, set calorie and macro targets that show in their food diary.",
      },
    ],
  },
  {
    id: "studio.swaps",
    walkthrough: "studio",
    title: "Exercise swaps",
    blurb: "Which swaps clients may make, and each exercise's list",
    minutes: 2,
    feature: "coach-swaps",
    steps: [
      {
        id: "default", on: "web", route: "/coaching/programs?tab=swaps", target: "swap-default", kind: "look",
        title: "Your swap rule",
        body: "Programs › Swaps: choose what clients may swap in your programs: any exercise, the same muscles only, or only the swaps you list for each exercise. Set it for everyone here and change it for one client on their page. A swap that isn't allowed becomes a message asking you.",
      },
      {
        id: "list", on: "web", route: "/coaching/programs?tab=swaps", target: "swap-lists", kind: "do", signal: "swap.added",
        title: "Each exercise's swap list",
        body: "Every exercise in your programs, with its swaps. + Swap adds one to that exercise in every program it's in (the builder shows the same list under the exercise). With \"Only my list\" these are the only swaps a client sees; with \"Same muscles only\" they come first.",
      },
    ],
  },
  {
    id: "studio.today",
    walkthrough: "studio",
    title: "Your Today page",
    blurb: "Everything that needs you, in one list",
    minutes: 1,
    feature: "coach-today",
    steps: [
      {
        id: "needs", on: "web", route: "/coaching", target: "today-needs-you", kind: "look",
        title: "What needs you",
        body: "Coaching › Today lists what needs you, grouped by what you'll do: check-ins to review (a batch is one Start reviewing button), messages to reply to and missed check-ins to nudge, then things to decide: requests, programs about to end, changed exercises and payment problems. Start your day here.",
      },
      {
        id: "ahead", on: "web", route: "/coaching", target: "today-ahead", kind: "look",
        title: "The week ahead",
        body: "What's coming in the next 7 days: programs ending, check-ins due, paid-until dates and payment rules about to act.",
      },
      {
        id: "week", on: "web", route: "/coaching", target: "today-week", kind: "look",
        title: "This week, or last week on a Monday",
        body: "How your clients' training is going this week, from what they've logged. On Mondays: last week in numbers, sessions done against planned, check-ins in, who logged food on 5 or more days, and who's gone quiet.",
      },
    ],
  },
  {
    id: "studio.payments",
    walkthrough: "studio",
    title: "Getting paid",
    blurb: "A look at taking payments through Stripe",
    minutes: 1,
    feature: "coach-payments",
    steps: [
      {
        id: "tabs", on: "web", route: "/coaching/payments", target: "payments-tabs", kind: "look",
        title: "Paid through your own Stripe",
        body: "Coaching › Payments is optional: connect your own Stripe account, make packages (monthly, or a block of weeks), and offer one when someone asks to be coached. LogIt takes no cut. Clients tab: who pays what, with Manage to change a package, refund, or mark someone paid elsewhere.",
      },
    ],
  },
];


// ── Phone ───────────────────────────────────────────────────────────────────
// Short tours on the phone (Settings › Walkthroughs). The "app" ones start by themselves the
// first time you open each screen; the Pro and Studio ones are the phone side of the web
// walkthroughs. Phone steps are all "look" steps.

const ph = (id: string, route: string, target: string, title: string, body: string): Chapter["steps"][number] =>
  ({ id, on: "phone", route, target, title, body, kind: "look" });

export const PHONE_CHAPTERS: Chapter[] = [
  {
    id: "app.home", walkthrough: "app", title: "Home", blurb: "Today's workout and where things are", minutes: 1, feature: "settings",
    // Four steps, no jargon (decision D3, bug hunt 3.11): it was seven, and said "split".
    steps: [
      ph("quick-start", "/", "quick-start", "Today", "Your next workout and the weights to lift. Tap Start when you're ready."),
      ph("sessions", "/", "nav-sessions", "Your workouts", "Every workout you finish is kept here."),
      ph("customize", "/", "home-customize", "Make Home yours", "Show, hide and move the cards on this page."),
      ph("more", "/", "nav-more", "Everything else", "Your plan, progress, exercises and settings are under More."),
    ],
  },
  {
    id: "app.session", walkthrough: "app", title: "Workout", blurb: "Logging sets and finishing", minutes: 1, feature: "workouts",
    // Three steps (decision D3, bug hunt 3.11), the first-time hint stays readable above them.
    steps: [
      ph("complete", "/session/current", "session-set-complete", "Tick a set when it's done", "It logs what's in the boxes, and your rest timer starts."),
      ph("card", "/session/current", "session-exercise-header", "How to", "Tap an exercise's name to see how it's done, your progress and its settings."),
      ph("finish", "/session/current", "session-finish", "Finish", "Tap Finish when you're done. Skipped sets are fine; your next weights are worked out from what you did."),
    ],
  },
  {
    id: "app.splits", walkthrough: "app", title: "Splits", blurb: "Your plans, and which one is active", minutes: 1, feature: "splits",
    steps: [
      ph("new", "/splits", "splits-new", "Make a split", "Tap New to build a training split. Add days (like Push, Pull, Legs) and fill each day with exercises."),
      ph("active", "/splits", "splits-set-active", "Set active", "Only one split is active at a time. Home's Today card offers its next workout."),
    ],
  },
  {
    id: "app.split-detail", walkthrough: "app", title: "A split", blurb: "Days and setting it active", minutes: 1, feature: "splits",
    steps: [
      ph("name", "/splits/[id]", "split-detail-name", "Rename it", "Tap the name to rename the split, like \"Push / Pull / Legs\"."),
      ph("active", "/splits/[id]", "split-detail-set-active", "Make it active", "Make this your current split. Home's Today card offers its next workout."),
      ph("days", "/splits/[id]", "split-detail-days", "Training days", "Each day is its own workout. Drag to reorder them."),
      ph("add-day", "/splits/[id]", "split-detail-add-day", "Add a day", "Add a day, then tap it to add exercises."),
    ],
  },
  {
    id: "app.split-day", walkthrough: "app", title: "A training day", blurb: "Naming it and adding exercises", minutes: 1, feature: "splits",
    steps: [
      ph("name", "/splits/[id]/days/[dayId]", "split-day-name", "Day name", "Tap to rename this day, like \"Push\" or \"Monday\". The name shows up on Home."),
      ph("add", "/splits/[id]/days/[dayId]", "split-day-add-block", "Add an exercise", "Tap + to add an exercise, cardio or mobility to this day. Search your library or type a new name to make one."),
    ],
  },
  {
    id: "app.exercises", walkthrough: "app", title: "Library", blurb: "Finding and adding exercises", minutes: 1, feature: "exercises",
    steps: [
      ph("search", "/exercises", "exercises-search", "Strength, cardio, mobility", "Pick a kind at the top, then type to search. LogIt's items, your own and your coach's are all here."),
      ph("filter", "/exercises", "exercises-filter", "Where it's from", "Show everything, only LogIt's, only yours, or only what your coach shares with you."),
      ph("list", "/exercises", "exercises-list", "Your library", "Tap anything to see its cues. Your own items can be edited; LogIt's and your coach's have \"Make my own copy\"."),
      ph("add", "/exercises", "exercises-add", "Add your own", "Tap + to add an exercise, cardio activity or drill. It shows up in every picker from then on."),
    ],
  },
  {
    id: "app.profile", walkthrough: "app", title: "Profile", blurb: "Your profile, its training cards and settings", minutes: 1, feature: "settings",
    steps: [
      ph("avatar", "/profile", "profile-avatar", "Your profile", "This page is exactly what others see. Tap your picture to add to your story."),
      ph("edit", "/profile", "profile-edit", "Edit profile", "Your photo, name and bio, which training cards show, and your height and bodyweight."),
      ph("widgets", "/profile", "profile-training", "Training", "Your split, records and the other cards you picked, as others see them."),
      ph("settings", "/profile", "profile-settings", "Settings", "Progression, rest timers, backups, walkthroughs and more."),
    ],
  },
  {
    id: "phone.sync", walkthrough: "pro", title: "Sync and your devices", blurb: "How your phone and the web stay the same", minutes: 1, feature: "sync",
    steps: [
      ph("sync", "/settings/account", "settings-sync", "Synced", "With Pro your workouts, splits, habits, goals and food lists sync by themselves whenever you're online. Sync now does it straight away. Everything is also on the web dashboard at app.getlogit.app."),
    ],
  },
  {
    id: "phone.insights", walkthrough: "pro", title: "Insights on your phone", blurb: "Questions and the charts you made on the web", minutes: 1, feature: "insight-charts",
    steps: [
      ph("questions", "/insights", "phone-insights-questions", "Questions, answered", "Each one is answered from your own data. Tap one to see how."),
      ph("charts", "/insights", "phone-insights-charts", "Your charts", "Charts you build on the web dashboard show here, and on Home if you chose that. Your phone draws them from its own data."),
    ],
  },
  {
    id: "phone.clients", walkthrough: "studio", title: "Your clients", blurb: "Coaching from your phone", minutes: 1, feature: "coach-clients",
    steps: [
      ph("needs", "/clients", "phone-needs-you", "What needs you", "At the top of Coaching: messages to reply to, check-ins to look at (reply and mark them reviewed right there), and requests to answer. In a client's conversation, type / for a saved reply, or swap an exercise in their program."),
      ph("list", "/clients", "phone-clients-list", "The same clients as on the web", "Tap one to see their training, check-ins and programs. Programs and check-in forms are built on the web dashboard; here you follow along."),
    ],
  },
  {
    id: "phone.messages", walkthrough: "studio", title: "Messages", blurb: "Talking to clients on the go", minutes: 1, feature: "messages",
    steps: [
      ph("list", "/messages", "phone-messages-list", "Every conversation", "Messages with your clients and your own coach. Replies to check-ins you review show up here too."),
    ],
  },
];

export const CHAPTERS: Chapter[] = [...PRO_CHAPTERS, ...STUDIO_CHAPTERS, ...PHONE_CHAPTERS];
