'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, FileText } from 'lucide-react';
import type { NoteEntry } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface NotesPanelProps {
  listingId: number;
}

export function NotesPanel({ listingId }: NotesPanelProps) {
  const queryClient = useQueryClient();
  const [addingNote, setAddingNote] = useState(false);
  const [addingCall, setAddingCall] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [callText, setCallText] = useState('');

  const { data: notes = [], isLoading } = useQuery<NoteEntry[]>({
    queryKey: ['notes', listingId],
    queryFn: () => fetch(`/api/listings/${listingId}/notes`).then((r) => r.json()),
  });

  const { mutate: addNote, isPending } = useMutation({
    mutationFn: ({ type, content }: { type: 'note' | 'call'; content: string }) =>
      fetch(`/api/listings/${listingId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', listingId] });
      queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
      setNoteText('');
      setCallText('');
      setAddingNote(false);
      setAddingCall(false);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setAddingNote(!addingNote); setAddingCall(false); }}
          className="gap-1.5"
        >
          <FileText className="size-3.5" />
          Add Note
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setAddingCall(!addingCall); setAddingNote(false); }}
          className="gap-1.5"
        >
          <Phone className="size-3.5" />
          Log Call
        </Button>
      </div>

      {/* Inline note form */}
      {addingNote && (
        <div className="flex flex-col gap-2 p-3 bg-muted/40 rounded-lg border">
          <textarea
            className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Write a note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setAddingNote(false); setNoteText(''); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!noteText.trim() || isPending}
              onClick={() => addNote({ type: 'note', content: noteText.trim() })}
            >
              Save Note
            </Button>
          </div>
        </div>
      )}

      {/* Inline call form */}
      {addingCall && (
        <div className="flex flex-col gap-2 p-3 bg-muted/40 rounded-lg border">
          <textarea
            className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Log call notes..."
            value={callText}
            onChange={(e) => setCallText(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setAddingCall(false); setCallText(''); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!callText.trim() || isPending}
              onClick={() => addNote({ type: 'call', content: callText.trim() })}
            >
              Log Call
            </Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No notes yet</p>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((note) => (
            <div key={note.id} className="flex gap-3 p-3 bg-muted/30 rounded-lg border">
              <div className="shrink-0 mt-0.5">
                {note.type === 'call' ? (
                  <Phone className="size-3.5 text-blue-500" />
                ) : (
                  <FileText className="size-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant={note.type === 'call' ? 'default' : 'secondary'}
                    className="text-xs capitalize"
                  >
                    {note.type ?? 'note'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{relativeTime(note.createdAt)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
