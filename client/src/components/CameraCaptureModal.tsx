"use client";

import { useEffect, useRef, useState } from "react";

type CaptureMode = "image" | "video";

type CameraCaptureModalProps = {
  mode: CaptureMode;
  onClose: () => void;
  onCaptured: (file: File) => void;
};

function getSupportedVideoMimeType(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "video/webm";
}

export default function CameraCaptureModal({ mode, onClose, onCaptured }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: mode === "video",
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        setError("Camera could not be started. Please allow camera permission.");
      }
    }
    void start();
    return () => {
      mounted = false;
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [mode]);

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      onCaptured(file);
      onClose();
    }, "image/jpeg", 0.92);
  };

  const handleStartRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = getSupportedVideoMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const chunks = chunksRef.current;
      const type = chunks[0]?.type || "video/webm";
      const blob = new Blob(chunks, { type });
      const extension = type.includes("webm") ? "webm" : "mp4";
      const file = new File([blob], `video-${Date.now()}.${extension}`, { type });
      onCaptured(file);
      onClose();
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  };

  const handleStopRecording = () => {
    if (!recorderRef.current) return;
    recorderRef.current.stop();
    setRecording(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-2xl">
        <h3 className="mb-3 text-sm font-semibold text-gray-800">
          {mode === "image" ? "Take photo" : "Record video"}
        </h3>
        <div className="overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="h-64 w-full object-cover" autoPlay playsInline muted />
        </div>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          {mode === "image" ? (
            <button
              type="button"
              className="rounded bg-[#2B41B7] px-3 py-1.5 text-sm text-white hover:bg-[#2438A3] disabled:opacity-60"
              disabled={!ready}
              onClick={handleCapturePhoto}
            >
              Shutter
            </button>
          ) : recording ? (
            <button
              type="button"
              className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
              onClick={handleStopRecording}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="rounded bg-[#2B41B7] px-3 py-1.5 text-sm text-white hover:bg-[#2438A3] disabled:opacity-60"
              disabled={!ready}
              onClick={handleStartRecording}
            >
              Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
