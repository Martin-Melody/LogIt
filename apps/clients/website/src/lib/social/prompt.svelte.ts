// The sign-in prompt on the public Social pages (design canvas S5): anything that needs an account
// (like, upvote, reply, follow, post, join) opens it, saying what you were trying to do.
import { DASHBOARD_URL } from "$lib/site";

export type Ask = "like" | "upvote" | "reply" | "follow" | "post" | "join";

export const PROMPTS: Record<Ask, { title: string; text: string }> = {
  like: { title: "Like a post to show some love", text: "Join LogIt to like, comment and follow people who train like you." },
  upvote: { title: "Upvote to help the best answers rise", text: "Join LogIt to upvote, reply and ask your own questions." },
  reply: { title: "Join the conversation", text: "Join LogIt to reply, comment and ask your own questions." },
  follow: { title: "Follow people to see their training", text: "Join LogIt to follow people and see their workouts and records in your feed." },
  post: { title: "Ask the Forum", text: "Join LogIt to post questions and threads, here on the web or in the app." },
  join: { title: "Join the group", text: "Join LogIt to join groups, chat with members and go to their sessions." },
};

export const prompt = $state<{ ask: Ask | null; name?: string }>({ ask: null });
export const ask = (a: Ask, name?: string) => Object.assign(prompt, { ask: a, name });

/** The web app, signed in, at the same thing (Log in brings you back to it). */
export const logIn = (appPath: string) => `${DASHBOARD_URL}/login?next=${encodeURIComponent(appPath)}`;
export const signUp = (appPath: string) => `${DASHBOARD_URL}/login?mode=register&next=${encodeURIComponent(appPath)}`;
