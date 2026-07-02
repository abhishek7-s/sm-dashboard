"use client";

import { publishInstagramPost, type PublishMediaType } from "../actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const MEDIA_TYPES: { value: PublishMediaType; label: string; icon: string; desc: string }[] = [
  { value: "IMAGE", label: "Photo", icon: "🖼️", desc: "Single image post" },
  { value: "REEL", label: "Reel", icon: "🎞️", desc: "Short video reel" },
  { value: "STORY_IMAGE", label: "Story (Image)", icon: "⭕", desc: "24-hour image story" },
  { value: "STORY_VIDEO", label: "Story (Video)", icon: "📹", desc: "24-hour video story" },
];

export function IgCompose() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mediaType, setMediaType] = useState<PublishMediaType>("IMAGE");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [result, setResult] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const isVideo = mediaType === "REEL" || mediaType === "STORY_VIDEO";
  const charLimit = 2200;
  const captionRequired = mediaType === "IMAGE" || mediaType === "REEL";
  const hashtags = caption.match(/#[A-Za-z0-9_]+/g) ?? [];
  const mentions = caption.match(/@[A-Za-z0-9_.]+/g) ?? [];
  const isHttpsUrl = /^https:\/\/\S+\.\S+/i.test(mediaUrl.trim());
  const canPublish = isHttpsUrl && (!captionRequired || caption.trim().length > 0);

  function handlePublish() {
    if (!mediaUrl.trim()) {
      setResult({ type: "err", text: "Media URL is required." });
      return;
    }
    if (!isHttpsUrl) {
      setResult({ type: "err", text: "Use a public HTTPS media URL before publishing." });
      return;
    }
    if (captionRequired && !caption.trim()) {
      setResult({ type: "err", text: "Add a caption for feed posts and reels." });
      return;
    }

    startTransition(async () => {
      setResult(null);
      const res = await publishInstagramPost({
        imageUrl: isVideo ? undefined : mediaUrl.trim(),
        videoUrl: isVideo ? mediaUrl.trim() : undefined,
        caption: caption.trim() || undefined,
        mediaType,
      });

      if ("error" in res) {
        setResult({ type: "err", text: res.error! });
      } else {
        setResult({ type: "ok", text: `Published! Media ID: ${res.mediaId}` });
        setMediaUrl("");
        setCaption("");
        router.refresh();
      }
    });
  }

  return (
    <div className="ig-compose-root">
      <div className="ig-compose-header">
        <h2 className="ig-section-title">Create New Post</h2>
        <p className="ig-section-sub">
          Publish a photo, reel, or story directly to Instagram.
        </p>
      </div>

      <div className="ig-compose-form">
        {/* Media type selector */}
        <div className="ig-compose-group">
          <label className="ig-compose-label">Post Type</label>
          <div className="ig-compose-type-grid">
            {MEDIA_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setMediaType(t.value)}
                className={`ig-type-option ${mediaType === t.value ? "ig-type-active" : ""}`}
              >
                <span className="ig-type-icon">{t.icon}</span>
                <span className="ig-type-label">{t.label}</span>
                <span className="ig-type-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Media URL */}
        <div className="ig-compose-group">
          <label className="ig-compose-label" htmlFor="ig-media-url">
            {isVideo ? "Video URL" : "Image URL"}
            <span className="ig-compose-hint">Must be a publicly accessible HTTPS URL</span>
          </label>
          <input
            id="ig-media-url"
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder={`https://example.com/your-${isVideo ? "video.mp4" : "photo.jpg"}`}
            className="ig-compose-input"
          />
          {mediaUrl.trim() && !isHttpsUrl && (
            <p className="ig-field-warning">Instagram requires a public HTTPS URL.</p>
          )}
        </div>

        {/* Caption */}
        {mediaType !== "STORY_IMAGE" && mediaType !== "STORY_VIDEO" && (
          <div className="ig-compose-group">
            <label className="ig-compose-label" htmlFor="ig-caption">
              Caption
              <span className="ig-compose-hint">{caption.length}/{charLimit}</span>
            </label>
            <textarea
              id="ig-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, charLimit))}
              placeholder="Write a caption… #hashtags @mentions"
              rows={5}
              className="ig-compose-textarea"
            />
            <div className="ig-compose-caption-tools">
              <button
                type="button"
                onClick={() => setCaption((current) => `${current.trim()}\n\nWhat do you think?`.trim())}
                className="ig-chip-btn"
              >
                Add CTA
              </button>
              <button
                type="button"
                onClick={() => setCaption((current) => `${current.trim()} #new #instagram #updates`.trim())}
                className="ig-chip-btn"
              >
                Add starter tags
              </button>
              <span>{hashtags.length} hashtags</span>
              <span>{mentions.length} mentions</span>
            </div>
          </div>
        )}

        {/* Preview */}
        {mediaUrl && (
          <div className="ig-compose-group">
            <label className="ig-compose-label">Preview</label>
            <div className="ig-compose-preview">
              {isVideo ? (
                <video src={mediaUrl} className="ig-compose-preview-img" controls muted />
              ) : (
                <img
                  src={mediaUrl}
                  alt="Preview"
                  className="ig-compose-preview-img"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Result message */}
        {result && (
          <div className={`ig-compose-result ${result.type === "err" ? "ig-compose-err" : "ig-compose-ok"}`}>
            {result.text}
          </div>
        )}

        {/* Info note */}
        <div className="ig-compose-note">
          <span>
            The Instagram Graph API requires media to be hosted at a public HTTPS URL
            before publishing. For video/reels, processing may take a few minutes after
            the container is created.
          </span>
        </div>

        {/* Submit */}
        <button
          onClick={handlePublish}
          disabled={isPending || !canPublish}
          className="ig-btn ig-btn-primary ig-btn-publish"
        >
          {isPending ? "Publishing…" : `Publish ${MEDIA_TYPES.find((t) => t.value === mediaType)?.label}`}
        </button>
      </div>
    </div>
  );
}
