import { describe, expect, it } from "vitest";
import {
  backToShared, copyForClient, createSubmission, followTemplate, makeOwn, markSubmitted, missingAnswers,
  questionsFor, readyMadeForm, setAnswer, updateQuestion,
} from "./Checkin";

describe("shared forms and clients' copies (canvas F1, K11)", () => {
  it("a copy follows its shared form until it's the client's own", () => {
    const shared = readyMadeForm("weekly");
    const copy = copyForClient(shared, "weekly", 1000);
    expect(copy.id).not.toBe(shared.id);
    expect(copy.sourceId).toBe(shared.id);
    expect(copy.anchorMs).toBe(1000);

    const edited = updateQuestion(shared, shared.questions[0]!.id, { prompt: "How was the week?" });
    expect(followTemplate(copy, edited).questions[0]!.prompt).toBe("How was the week?");
    expect(followTemplate(copy, edited).anchorMs).toBe(1000); // its own schedule stays

    const hers = makeOwn(copy);
    expect(followTemplate(hers, edited).questions[0]!.prompt).toBe(shared.questions[0]!.prompt);
    const back = backToShared(hers, edited);
    expect(back.own).toBe(false);
    expect(back.questions[0]!.prompt).toBe("How was the week?");
  });

  it("a start-up form is filled in once", () => {
    const startup = readyMadeForm("startup");
    expect(startup.kind).toBe("startup");
    expect(copyForClient(startup, "weekly", 0).cadence).toBe("manual");
  });
});

describe("answers keep the questions as they were asked (canvas F2)", () => {
  it("snapshots the questions, without headings", () => {
    const form = readyMadeForm("monthly");
    form.questions.push({ id: "h", prompt: "About your food", type: "heading" });
    const sent = markSubmitted(createSubmission(form, 0), form);
    expect(sent.asked?.map((q) => q.id)).toEqual(form.questions.filter((q) => q.type !== "heading").map((q) => q.id));
    const changed = updateQuestion(form, form.questions[0]!.id, { prompt: "Something else" });
    expect(questionsFor(sent, changed)[0]!.prompt).toBe("How did this month go?");
  });

  it("knows what's still missing, including several photos and several choices", () => {
    const form = readyMadeForm("startup");
    form.questions = form.questions.map((q) => ({ ...q, required: q.type === "photo" || q.type === "choice" ? true : q.required }));
    let sub = createSubmission(form, 0);
    const photo = form.questions.find((q) => q.type === "photo")!;
    const foods = form.questions.find((q) => q.type === "choice" && q.multi)!;
    expect(missingAnswers(form, sub).map((q) => q.id)).toContain(photo.id);
    sub = setAnswer(sub, photo.id, { photoDataUrls: ["data:front", "", ""] });
    sub = setAnswer(sub, foods.id, { choices: ["Vegan"] });
    const missing = missingAnswers(form, sub).map((q) => q.id);
    expect(missing).not.toContain(photo.id);
    expect(missing).not.toContain(foods.id);
  });
});
