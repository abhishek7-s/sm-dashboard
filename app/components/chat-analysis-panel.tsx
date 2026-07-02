"use client";

import { useState, useTransition } from "react";
import { analyzeOpenChat } from "../actions";
import type { ChatAnalysisResult } from "@/lib/ai/chat-analysis";

type ChatAnalysisPanelProps = {
  conversationId?: string;
};

function scoreColor(score: number) {
  if (score >= 35) {
    return "text-emerald-700 bg-emerald-50 border-emerald-200";
  }

  if (score <= -35) {
    return "text-rose-700 bg-rose-50 border-rose-200";
  }

  return "text-amber-700 bg-amber-50 border-amber-200";
}

export function ChatAnalysisPanel({ conversationId }: ChatAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<ChatAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runAnalysis = () => {
    if (!conversationId) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await analyzeOpenChat(conversationId);

      if ("analysis" in result) {
        setAnalysis(result.analysis);
        return;
      }

      setError(result.error ?? "Unable to analyze this chat.");
    });
  };

  return (
    <section className="border-b border-black/10 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#10241d]">Mood Analysis</p>
          <p className="mt-1 text-xs text-[#667871]">
            Checks the currently opened chat.
          </p>
        </div>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={!conversationId || isPending}
          className="rounded-lg bg-[#10241d] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#1f3a31] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Analyzing" : "Analyze"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {analysis ? (
        <div className="mt-4 space-y-4">
          <div className={`rounded-lg border p-3 ${scoreColor(analysis.moodScore)}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-75">
                  Person mood
                </p>
                <p className="mt-1 text-lg font-bold capitalize">
                  {analysis.personMood}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{analysis.moodScore}</p>
                <p className="text-[11px] font-semibold opacity-75">score</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-black/10 bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#667871]">
                Going
              </p>
              <p className="mt-1 text-sm font-semibold text-[#10241d]">
                {analysis.conversationDirection}
              </p>
            </div>
            <div className="rounded-lg border border-black/10 bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#667871]">
                Confidence
              </p>
              <p className="mt-1 text-sm font-semibold text-[#10241d]">
                {analysis.confidence}%
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-black/10 bg-white p-3">
            <p className="text-sm font-semibold text-[#10241d]">Summary</p>
            <p className="mt-2 text-sm leading-relaxed text-[#52665f]">
              {analysis.summary}
            </p>
          </div>

          <div className="rounded-lg border border-black/10 bg-white p-3">
            <p className="text-sm font-semibold text-[#10241d]">
              Decided On
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#52665f]">
              {analysis.decidedOn}
            </p>
            <div className="mt-3 space-y-2">
              {analysis.evidence.map((item, index) => (
                <p
                  key={`${item}-${index}`}
                  className="rounded-md bg-[#f3f7f5] px-3 py-2 text-xs leading-relaxed text-[#52665f]"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-black/10 bg-white p-3">
            <p className="text-sm font-semibold text-[#10241d]">Reply Tone</p>
            <p className="mt-2 text-sm leading-relaxed text-[#52665f]">
              {analysis.recommendedReplyTone}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#667871]">
              Next action
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#52665f]">
              {analysis.nextBestAction}
            </p>
          </div>

          <p className="text-[11px] text-[#667871]">
            Provider: {analysis.provider} · {analysis.model}
          </p>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-black/10 bg-white p-3 text-sm text-[#667871]">
          Run analysis to see mood, direction, decision basis, and next action.
        </p>
      )}
    </section>
  );
}
