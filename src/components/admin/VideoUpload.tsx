import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Film } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadToR2 } from "@/lib/r2Upload";
import { resolveImageSrc } from "@/lib/cdnImage";

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB safety cap (edge function base64 payload)
const SUPPORTED = new Set(["video/mp4", "video/webm", "video/quicktime"]);

interface VideoUploadProps {
  value: string | null | undefined;
  onChange: (ref: string | null) => void;
  label?: string;
  hint?: string;
  prefix?: string;
}

const VideoUpload = ({ value, onChange, label = "Video", hint, prefix = "hero-videos" }: VideoUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    if (!SUPPORTED.has(file.type)) {
      toast({ title: "Unsupported format", description: "Please upload an MP4, WebM or MOV file.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Video too large", description: `Maximum size is ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`, variant: "destructive" });
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const ref = await uploadToR2(file, { prefix, mime: file.type, onProgress: (p) => setProgress(Math.round(p * 100)) });
      onChange(ref);
      toast({ title: "Video uploaded" });
    } catch (err) {
      const msg = (err as Error)?.message || "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const src = value ? resolveImageSrc(value, 1600) : "";

  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}

      {value ? (
        <div className="relative rounded-md overflow-hidden border border-border bg-black/5 aspect-video max-w-md">
          <video src={src} controls muted playsInline className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80"
            aria-label="Remove video"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full max-w-md aspect-video rounded-md border border-dashed border-border bg-secondary/40 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span className="text-xs">Uploading… {progress}%</span>
            </>
          ) : (
            <>
              <Film size={22} />
              <span className="text-xs">Click to upload video</span>
            </>
          )}
        </button>
      )}

      <div className="flex items-center gap-2">
        {value && (
          <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload size={13} className="mr-1.5" /> Replace
          </Button>
        )}
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
};

export default VideoUpload;
