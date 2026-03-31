'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateSalesCall, useCreateSalesCallFromTranscript } from '@/lib/queries/sales-calls';

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ALLOWED_EXTENSIONS = '.mp4,.mp3,.wav,.m4a,.webm';
const MAX_SIZE_MB = 25;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export function UploadModal({ open, onOpenChange }: UploadModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState('upload');
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState('');
  const [title, setTitle] = useState('');
  const [callDate, setCallDate] = useState('');
  const [notes, setNotes] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState('');

  const uploadMutation = useCreateSalesCall();
  const transcriptMutation = useCreateSalesCallFromTranscript();

  const isSubmitting = uploadMutation.isPending || transcriptMutation.isPending;

  const resetForm = () => {
    setFile(null);
    setTranscript('');
    setTitle('');
    setCallDate('');
    setNotes('');
    setFileError('');
    setActiveTab('upload');
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onOpenChange(false);
    }
  };

  const validateFile = (f: File): boolean => {
    setFileError('');
    if (f.size > MAX_SIZE_BYTES) {
      setFileError(`File must be under ${MAX_SIZE_MB}MB`);
      return false;
    }
    return true;
  };

  const handleFileSelect = (f: File) => {
    if (validateFile(f)) {
      setFile(f);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleSubmitUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    if (callDate) formData.append('call_date', new Date(callDate).toISOString());
    if (notes) formData.append('notes', notes);

    try {
      const result = await uploadMutation.mutateAsync(formData);
      resetForm();
      onOpenChange(false);
      router.push(`/sales-calls/${result.id}`);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleSubmitTranscript = async () => {
    if (transcript.length < 50) return;

    try {
      const result = await transcriptMutation.mutateAsync({
        transcript_text: transcript,
        title: title || undefined,
        call_date: callDate ? new Date(callDate).toISOString() : undefined,
        notes: notes || undefined,
      });
      resetForm();
      onOpenChange(false);
      router.push(`/sales-calls/${result.id}`);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Analyze Sales Call</DialogTitle>
          <DialogDescription>
            Upload a recording or paste a transcript to get AI coaching feedback.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as string)}>
          <TabsList>
            <TabsTrigger value="upload">
              <Upload className="h-3.5 w-3.5" />
              Upload Recording
            </TabsTrigger>
            <TabsTrigger value="transcript">
              <FileText className="h-3.5 w-3.5" />
              Paste Transcript
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <div className="space-y-4 pt-2">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors
                  ${dragOver
                    ? 'border-gold bg-[rgba(212,175,55,0.05)]'
                    : file
                      ? 'border-green-500/30 bg-green-500/5'
                      : 'border-border-default hover:border-border bg-bg-card'
                  }
                `}
              >
                {file ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                      <Upload className="h-5 w-5 text-green-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-text-dim">
                        {(file.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="ml-2 p-1 rounded hover:bg-secondary"
                    >
                      <X className="h-4 w-4 text-text-dim" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-text-dimmer mb-3" />
                    <p className="text-sm text-text-dim mb-1">
                      Drag & drop or click to upload
                    </p>
                    <p className="text-xs text-text-dimmer">
                      MP4, MP3, WAV, M4A, WebM (max {MAX_SIZE_MB}MB)
                    </p>
                  </>
                )}
              </div>
              {fileError && <p className="text-xs text-red-400">{fileError}</p>}

              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_EXTENSIONS}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />

              {/* Shared fields */}
              <SharedFields
                title={title}
                setTitle={setTitle}
                callDate={callDate}
                setCallDate={setCallDate}
                notes={notes}
                setNotes={setNotes}
              />

              {uploadMutation.isError && (
                <p className="text-xs text-red-400">{uploadMutation.error.message}</p>
              )}

              <Button
                onClick={handleSubmitUpload}
                disabled={!file || isSubmitting}
                className="w-full bg-gold text-primary-foreground hover:bg-[rgba(212,175,55,0.9)]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Analyze Call'
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="transcript">
            <div className="space-y-4 pt-2">
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste your sales call transcript here..."
                className="w-full h-48 rounded-lg border border-border-default bg-bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-text-dimmer focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold resize-none"
              />
              {transcript.length > 0 && transcript.length < 50 && (
                <p className="text-xs text-yellow-400">
                  Transcript must be at least 50 characters ({50 - transcript.length} more needed)
                </p>
              )}

              <SharedFields
                title={title}
                setTitle={setTitle}
                callDate={callDate}
                setCallDate={setCallDate}
                notes={notes}
                setNotes={setNotes}
              />

              {transcriptMutation.isError && (
                <p className="text-xs text-red-400">{transcriptMutation.error.message}</p>
              )}

              <Button
                onClick={handleSubmitTranscript}
                disabled={transcript.length < 50 || isSubmitting}
                className="w-full bg-gold text-primary-foreground hover:bg-[rgba(212,175,55,0.9)]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Analyzing...
                  </>
                ) : (
                  'Analyze Transcript'
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SharedFields({
  title,
  setTitle,
  callDate,
  setCallDate,
  notes,
  setNotes,
}: {
  title: string;
  setTitle: (v: string) => void;
  callDate: string;
  setCallDate: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-text-dim mb-1 block">
          Title (optional)
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Meeting with John Smith"
          className="bg-bg-card border-border-default"
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs font-medium text-text-dim mb-1 block">
            Call Date (optional)
          </label>
          <Input
            type="date"
            value={callDate}
            onChange={(e) => setCallDate(e.target.value)}
            className="bg-bg-card border-border-default"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-text-dim mb-1 block">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any context about this call..."
          rows={2}
          className="w-full rounded-lg border border-border-default bg-bg-card px-3 py-2 text-sm text-foreground placeholder:text-text-dimmer focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold resize-none"
        />
      </div>
    </div>
  );
}
