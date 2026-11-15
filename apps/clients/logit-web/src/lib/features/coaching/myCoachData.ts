import { checkinApi } from "@logit/core/api/checkinApi";
import { coachProgramApi } from "@logit/core/api/coachProgramApi";
import { syncApi } from "@logit/core/api/syncApi";
import type { CheckinSchedule, CheckinSubmission } from "@logit/core/domain/Checkin";
import type { CoachProgram } from "@logit/core/domain/CoachProgram";

// The client side of coaching on the web: what your coach assigned you, and your answers.

function parseRows<T>(rows: { dataJson: string | null; deletedAtMs?: number | null }[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    if (r.deletedAtMs || !r.dataJson) continue;
    try {
      out.push(JSON.parse(r.dataJson) as T);
    } catch {
      /* skip unreadable rows */
    }
  }
  return out;
}

export async function loadAssignedForms(): Promise<CheckinSchedule[]> {
  return parseRows<CheckinSchedule>(await checkinApi.pullAssigned(0)).filter((s) => !s.archived);
}

export async function loadMySubmissions(): Promise<CheckinSubmission[]> {
  const { submissions } = await syncApi.pullCheckinSubmissions(0);
  return parseRows<CheckinSubmission>(submissions);
}

export async function saveMySubmission(s: CheckinSubmission): Promise<void> {
  await syncApi.pushCheckinSubmissions([
    { id: s.id, createdAtMs: s.createdAtMs, updatedAtMs: s.updatedAtMs, dataJson: JSON.stringify(s) },
  ]);
}

export async function loadAssignedPrograms(): Promise<CoachProgram[]> {
  const rows = await coachProgramApi.pullAssigned(0);
  const out: CoachProgram[] = [];
  for (const r of rows) {
    if (r.deletedAtMs || !r.dataJson) continue;
    try {
      const p = JSON.parse(r.dataJson) as CoachProgram;
      if (!p.archived) out.push(r.startedAtMs ? { ...p, clientStartedAtMs: r.startedAtMs } : p);
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Shrinks a photo to at most `max` px on its long side, as JPEG, so a check-in doesn't
 * carry a 10 MB camera original. */
export function shrinkPhoto(file: File, max = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't a picture we can read."));
    };
    img.src = url;
  });
}
