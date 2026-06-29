"use client";

import { useTransition } from "react";
import { pauseBroadcastJob, resumeBroadcastJob, cancelBroadcastJob } from "../actions";

type Recipient = {
  id: string;
  status: string;
  contact: { displayName: string };
};

type QueueJob = {
  id: string;
  title: string;
  body: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  delaySeconds: number;
  recipients: Recipient[];
};

type QueuePanelProps = {
  jobs: QueueJob[];
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    QUEUED: { label: "Queued", className: "bg-blue-100 text-blue-700" },
    RUNNING: { label: "Running", className: "bg-yellow-100 text-yellow-700" },
    PAUSED: { label: "Paused", className: "bg-gray-100 text-gray-600" },
    COMPLETED: { label: "Done", className: "bg-green-100 text-green-700" },
    FAILED: { label: "Failed", className: "bg-red-100 text-red-600" },
    CANCELLED: { label: "Cancelled", className: "bg-gray-100 text-gray-500" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-500" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.className}`}>
      {s.label}
    </span>
  );
}

function recipientStatusColor(status: string) {
  switch (status) {
    case "SENT": return "bg-[#24d366]";
    case "SENDING": return "bg-yellow-400 animate-pulse";
    case "FAILED": return "bg-red-400";
    case "SKIPPED": return "bg-gray-300";
    default: return "bg-gray-200";
  }
}

function JobCard({ job }: { job: QueueJob }) {
  const [isPending, startTransition] = useTransition();
  const total = job.recipients.length;
  const sent = job.recipients.filter((r) => r.status === "SENT").length;
  const failed = job.recipients.filter((r) => r.status === "FAILED").length;
  const progress = total > 0 ? Math.round((sent / total) * 100) : 0;
  const isActive = job.status === "QUEUED" || job.status === "RUNNING";

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#15201c]">{job.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-[#667871]">{job.body}</p>
        </div>
        {statusBadge(job.status)}
      </div>

      {/* Progress bar */}
      <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-[#24d366] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mb-3 flex items-center justify-between text-[10px] text-[#667871]">
        <span>{sent} / {total} sent{failed > 0 ? ` · ${failed} failed` : ""}</span>
        <span>{job.delaySeconds}s delay</span>
      </div>

      {/* Recipient dots */}
      <div className="mb-3 flex flex-wrap gap-1">
        {job.recipients.map((r) => (
          <div
            key={r.id}
            title={`${r.contact.displayName} — ${r.status}`}
            className={`size-2 rounded-full ${recipientStatusColor(r.status)}`}
          />
        ))}
      </div>

      {/* Controls */}
      {isActive && (
        <div className="flex gap-2">
          {job.status === "RUNNING" || job.status === "QUEUED" ? (
            <button
              disabled={isPending}
              onClick={() => startTransition(async () => { await pauseBroadcastJob(job.id); })}
              className="rounded-lg border border-black/10 bg-[#f7faf8] px-3 py-1.5 text-xs font-medium text-[#15201c] hover:bg-black/5 disabled:opacity-50"
            >
              ⏸ Pause
            </button>
          ) : (
            <button
              disabled={isPending}
              onClick={() => startTransition(async () => { await resumeBroadcastJob(job.id); })}
              className="rounded-lg border border-black/10 bg-[#f7faf8] px-3 py-1.5 text-xs font-medium text-[#15201c] hover:bg-black/5 disabled:opacity-50"
            >
              ▶ Resume
            </button>
          )}
          <button
            disabled={isPending}
            onClick={() => startTransition(async () => { await cancelBroadcastJob(job.id); })}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
          >
            ✕ Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function QueuePanel({ jobs }: QueuePanelProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <div className="text-2xl">📭</div>
        <p className="text-xs text-[#667871]">No broadcasts yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
