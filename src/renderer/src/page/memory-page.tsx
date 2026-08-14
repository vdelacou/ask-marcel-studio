/*
 * Everything Marcel knows about the person it works for, in one place.
 *
 * Two kinds of thing live here, which is why the menu has two groups: what it noticed and
 * has not been told about yet, and what it has been told and reads before every message
 * (the three notes, who the user is, their signature, how they write). Settings is for
 * configuring the app; this is the app's picture of the user, and it is theirs to edit.
 *
 * Owns the state (rule 21 keeps it out of the design system) and hands plain props down.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FC } from 'react';
import { MemoryReviewPanel } from '../components/organisms/memory-review-panel/index.tsx';
import type { MemoryReviewItem } from '../components/organisms/memory-review-panel/index.tsx';
import { NotePanel } from '../components/organisms/note-panel/index.tsx';
import { AboutYouPanel } from '../components/organisms/about-you-panel/index.tsx';
import { SignaturePanel } from '../components/organisms/signature-panel/index.tsx';
import { VoicePanel } from '../components/organisms/voice-panel/index.tsx';
import { DocumentEditor } from '../components/organisms/document-editor/index.tsx';
import { SheetLayout } from '../components/organisms/sheet-layout/index.tsx';
import { SheetNav } from '../components/organisms/sheet-nav/index.tsx';
import type { SheetNavGroup } from '../components/organisms/sheet-nav/index.tsx';
import { MarkdownEditor } from '../render/markdown-editor.tsx';
import { answerFor, choicesFor, draftFor, emptyDrafts, forgetDraft, termFor, termTextFor, withChoice, withOwnWords, withTerm } from '../lib/memory-review.ts';
import type { MemoryDrafts } from '../lib/memory-review.ts';
import { useAgentFile } from '../hooks/use-agent-file.ts';
import type { MemoryController } from '../hooks/use-memory.ts';
import type { MemoryCandidate } from '../../../shared/memory-queue-doc.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';

// The three notes, and the words that explain each one. Kept here rather than in the panel
// so the menu row and the heading cannot drift apart.
const NOTES: Record<MemoryFileName, { readonly label: string; readonly title: string; readonly description: string; readonly emptyHint: string }> = {
  jargon: {
    label: 'Words we use',
    title: 'Words we use',
    description: 'The words your organisation uses that nobody outside it would know. Marcel reads these before every message.',
    emptyHint: 'Nothing yet. Marcel adds to this as it comes across words you use, and always asks first.',
  },
  team: {
    label: 'My team',
    title: 'My team',
    description: 'Who works with you, and what each of them does. Enough that Marcel knows who is meant when you use a first name.',
    emptyHint: 'Nothing yet. Marcel adds to this as it works out who is who, and always asks first.',
  },
  people: {
    label: 'People I work with',
    title: 'People I work with',
    description: 'People outside your team who come up often: their role, and where they fit.',
    emptyHint: 'Nothing yet. Marcel adds to this as names come up, and always asks first.',
  },
};

export type MemoryPageProps = {
  // Owned by the shell, so the count in the sidebar and this list are the same list.
  memory: MemoryController;
};

export const MemoryPage: FC<MemoryPageProps> = ({ memory }) => {
  const [section, setSection] = useState('waiting');
  const [drafts, setDrafts] = useState<MemoryDrafts>(emptyDrafts);
  const [noteText, setNoteText] = useState('');
  const [noteStored, setNoteStored] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const about = useAgentFile('global-context');
  const signature = useAgentFile('signature');
  const voice = useAgentFile('voice-profile');
  const [isEditingSignature, setIsEditingSignature] = useState(false);

  // Which note is on screen, when one is. The section id doubles as the file name for the
  // three notes, so nothing has to map between them.
  const note = section === 'jargon' || section === 'team' || section === 'people' ? section : undefined;

  useEffect(() => {
    if (note === undefined) return;
    void (async (): Promise<void> => {
      const read = await studio.memory.read(note);
      const text = read.ok ? read.value : '';
      setNoteStored(text);
      setNoteText(text);
    })();
  }, [note]);

  const saveNote = useCallback((): void => {
    if (note === undefined) return;
    setNoteSaving(true);
    void (async (): Promise<void> => {
      await studio.memory.write({ name: note, contents: noteText });
      setNoteSaving(false);
      setNoteStored(noteText);
    })();
  }, [note, noteText]);

  const navGroups: readonly SheetNavGroup[] = [
    { heading: 'Waiting for you', items: [{ id: 'waiting', label: 'What Marcel noticed', icon: 'memory', badge: memory.pending.length }] },
    {
      heading: 'What Marcel knows',
      items: [
        { id: 'jargon', label: NOTES.jargon.label, icon: 'memory' },
        { id: 'team', label: NOTES.team.label, icon: 'agents' },
        { id: 'people', label: NOTES.people.label, icon: 'agents' },
        { id: 'about', label: 'About you', icon: 'memory' },
        { id: 'signature', label: 'Email signature', icon: 'signature' },
        { id: 'voice', label: 'Writing voice', icon: 'voice' },
      ],
    },
  ];

  const candidateFor = (id: string): MemoryCandidate | undefined => memory.pending.find((waiting) => waiting.id === id);

  const items: readonly MemoryReviewItem[] = memory.pending.map((candidate) => {
    const draft = draftFor(drafts, candidate);
    return {
      id: candidate.id,
      term: termTextFor(drafts, candidate),
      kind: candidate.kind,
      quote: candidate.quote,
      ...(candidate.enrichment === undefined ? {} : { enrichment: candidate.enrichment }),
      choices: choicesFor(candidate),
      ...(draft.selected === undefined ? {} : { selected: draft.selected }),
      own: draft.own,
      canRemember: answerFor(draft) !== undefined && termFor(drafts, candidate) !== undefined,
      isSaving: memory.savingId === candidate.id,
    };
  });

  const choose = (id: string, choice: string): void => {
    const candidate = candidateFor(id);
    if (candidate === undefined) return;
    setDrafts((current) => withChoice(current, candidate, choice));
  };

  const changeTerm = (id: string, text: string): void => {
    const candidate = candidateFor(id);
    if (candidate === undefined) return;
    setDrafts((current) => withTerm(current, candidate, text));
  };

  const changeOwn = (id: string, text: string): void => {
    const candidate = candidateFor(id);
    if (candidate === undefined) return;
    setDrafts((current) => withOwnWords(current, candidate, text));
  };

  const remember = (id: string): void => {
    const candidate = candidateFor(id);
    if (candidate === undefined) return;
    const detail = answerFor(draftFor(drafts, candidate));
    const term = termFor(drafts, candidate);
    // The button is already disabled without both; this is the same rule stated where it is
    // enforced, so a keyboard or a stale render cannot store a blank definition or file one
    // under no word at all.
    if (detail === undefined || term === undefined) return;
    setDrafts((current) => forgetDraft(current, id));
    memory.remember(id, detail, term);
  };

  const skip = (id: string): void => {
    setDrafts((current) => forgetDraft(current, id));
    memory.skip(id);
  };

  return (
    <SheetLayout nav={<SheetNav groups={navGroups} activeId={section} onSelect={setSection} />}>
      {section === 'waiting' && (
        <MemoryReviewPanel
          items={items}
          {...(memory.error === undefined ? {} : { error: memory.error })}
          onChoose={choose}
          onChangeOwn={changeOwn}
          onChangeTerm={changeTerm}
          onRemember={remember}
          onSkip={skip}
        />
      )}

      {note !== undefined && (
        <NotePanel title={NOTES[note].title} description={NOTES[note].description}>
          <DocumentEditor
            mode="rich"
            // Keyed on the stored text so the editor reloads when the note is read back, and
            // on the note so switching sections does not carry the last one's contents over.
            richNode={<MarkdownEditor key={`${note}-${noteStored}`} defaultValue={noteText} onChange={setNoteText} />}
            markdownValue={noteText}
            emptyHint={NOTES[note].emptyHint}
            isSaving={noteSaving}
            isDirty={noteText !== noteStored}
            onChangeMarkdown={setNoteText}
            onSave={saveNote}
            onCancel={() => setNoteText(noteStored)}
          />
        </NotePanel>
      )}

      {section === 'about' && (
        <AboutYouPanel>
          <DocumentEditor
            mode="rich"
            richNode={<MarkdownEditor key={about.stored} defaultValue={about.draft} onChange={about.setDraft} />}
            markdownValue={about.draft}
            emptyHint="Nothing yet. Tell Marcel who you are, what you are responsible for, and anything it should always keep in mind."
            isSaving={about.isSaving}
            isDirty={about.isDirty}
            {...(about.notice === undefined ? {} : { notice: about.notice })}
            onChangeMarkdown={about.setDraft}
            onSave={about.save}
            onCancel={about.cancel}
          />
        </AboutYouPanel>
      )}

      {section === 'signature' && (
        <SignaturePanel
          html={signature.draft}
          isEditing={isEditingSignature}
          isSaving={signature.isSaving}
          isRegenerating={signature.isRegenerating}
          canRegenerate={signature.canRegenerate}
          {...(signature.notice === undefined ? {} : { notice: signature.notice })}
          onChangeHtml={signature.setDraft}
          onStartEdit={() => setIsEditingSignature(true)}
          onSave={() => {
            signature.save();
            setIsEditingSignature(false);
          }}
          onCancel={() => {
            signature.cancel();
            setIsEditingSignature(false);
          }}
          onRegenerate={signature.regenerate}
        />
      )}

      {section === 'voice' && (
        <VoicePanel isRegenerating={voice.isRegenerating} canRegenerate={voice.canRegenerate} onRegenerate={voice.regenerate}>
          <DocumentEditor
            mode="rich"
            richNode={<MarkdownEditor key={voice.stored} defaultValue={voice.draft} onChange={voice.setDraft} />}
            markdownValue={voice.draft}
            emptyHint="Nothing yet. Marcel writes one from your sent mail the first time it can, or you can write your own."
            isSaving={voice.isSaving}
            isDirty={voice.isDirty}
            {...(voice.notice === undefined ? {} : { notice: voice.notice })}
            onChangeMarkdown={voice.setDraft}
            onSave={voice.save}
            onCancel={voice.cancel}
          />
        </VoicePanel>
      )}
    </SheetLayout>
  );
};

MemoryPage.displayName = 'MemoryPage';
