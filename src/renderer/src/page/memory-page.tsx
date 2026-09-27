/*
 * Everything Marcel knows about the person it works for, in one place.
 *
 * Two kinds of thing live here, which is why the menu has two groups: what it noticed and
 * has not been told about yet, and what it has been told and reads before every message
 * (the words and the people, who the user is, their signature, how they write). Settings is
 * for configuring the app; this is the app's picture of the user, and it is theirs to edit.
 *
 * Owns the state (rule 21 keeps it out of the design system) and hands plain props down. The
 * two lists own theirs in memory-list-section, since only one is ever on screen.
 */
import { useState } from 'react';
import type { FC } from 'react';
import { MemoryReviewPanel } from '../components/organisms/memory-review-panel/index.tsx';
import type { MemoryReviewItem } from '../components/organisms/memory-review-panel/index.tsx';
import { AboutYouPanel } from '../components/organisms/about-you-panel/index.tsx';
import { SignaturePanel } from '../components/organisms/signature-panel/index.tsx';
import { VoicePanel } from '../components/organisms/voice-panel/index.tsx';
import { SheetLayout } from '../components/organisms/sheet-layout/index.tsx';
import { Button } from '../components/atoms/button/index.tsx';
import { SheetNav } from '../components/organisms/sheet-nav/index.tsx';
import type { SheetNavGroup } from '../components/organisms/sheet-nav/index.tsx';
import { MarkdownEditor } from '../render/markdown-editor.tsx';
import { MemoryListSection } from './memory-list-section.tsx';
import { answerOf, answersFor, choicesFor, draftFor, emptyDrafts, forgetDraft, kindFor, termTextFor, withChoice, withKind, withOwnWords, withTerm } from '../lib/memory-review.ts';
import type { MemoryDrafts } from '../lib/memory-review.ts';
import { useAgentFile } from '../hooks/use-agent-file.ts';
import { useAutosavedFile } from '../hooks/use-autosaved-file.ts';
import type { AutosavedFile } from '../hooks/use-autosaved-file.ts';
import { AutosavedDocument } from '../components/organisms/autosaved-document/index.tsx';
import type { AutosavedDocumentProps } from '../components/organisms/autosaved-document/index.tsx';
import type { MemoryController } from '../hooks/use-memory.ts';
import type { MemoryCandidate } from '../../../shared/memory-queue-doc.ts';
import { memoryFileName } from '../../../shared/memory-file-name.ts';

// What Remember all leaves behind, said after its question: the cards without a meaning.
const stayingNote = (count: number): string => {
  if (count === 0) return '';
  return count === 1 ? ' One without a meaning stays here.' : ` ${String(count)} without a meaning stay here.`;
};

// Where the saving of a document typed into is, in words.
const statusOf = (file: AutosavedFile): Pick<AutosavedDocumentProps, 'status' | 'tone'> => {
  if (file.status.kind === 'error') return { status: file.status.message, tone: 'error' };
  if (file.status.kind === 'saving') return { status: 'Saving…', tone: 'quiet' };
  return { status: file.status.kind === 'saved' ? 'Saved' : 'Changes save as you type.', tone: 'quiet' };
};

export type MemoryPageProps = {
  // Owned by the shell, so the count in the sidebar and this list are the same list.
  memory: MemoryController;
  // To name the conversation a suggestion was heard in, and to open it.
  conversations: readonly { readonly id: string; readonly title: string }[];
  onOpenConversation: (conversationId: string) => void;
  // Asks the shell to clear everything on this page, after its own question.
  onClearAll: () => void;
};

export const MemoryPage: FC<MemoryPageProps> = ({ memory, conversations, onOpenConversation, onClearAll }) => {
  const [section, setSection] = useState('waiting');
  const [drafts, setDrafts] = useState<MemoryDrafts>(emptyDrafts);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const about = useAutosavedFile('global-context');
  const signature = useAgentFile('signature');
  const voice = useAutosavedFile('voice-profile');
  const [isEditingSignature, setIsEditingSignature] = useState(false);

  // Three groups: what waits for an answer, what Marcel knows about the world around the user,
  // and what it knows about the user themselves.
  const navGroups: readonly SheetNavGroup[] = [
    { heading: 'Waiting for you', items: [{ id: 'waiting', label: 'To review', icon: 'memory', badge: memory.pending.length }] },
    {
      heading: 'What Marcel knows',
      items: [
        { id: 'words', label: 'Words we use', icon: 'memory' },
        { id: 'people', label: 'People I work with', icon: 'agents' },
      ],
    },
    {
      heading: 'About you',
      items: [
        { id: 'about', label: 'Who you are', icon: 'memory' },
        { id: 'voice', label: 'Writing voice', icon: 'voice' },
        { id: 'signature', label: 'Email signature', icon: 'signature' },
      ],
    },
  ];

  const candidateFor = (id: string): MemoryCandidate | undefined => memory.pending.find((waiting) => waiting.id === id);

  const items: readonly MemoryReviewItem[] = memory.pending.map((candidate) => {
    const draft = draftFor(drafts, candidate);
    // The meaning box shows the wording picked, Marcel's suggestion to begin with, or what the
    // user wrote over it; the other wordings Marcel offered wait underneath.
    const meaning = draft.selected ?? draft.own;
    const source = conversations.find((conversation) => conversation.id === candidate.conversationId)?.title;
    return {
      id: candidate.id,
      term: termTextFor(drafts, candidate),
      kind: kindFor(drafts, candidate),
      quote: candidate.quote,
      ...(candidate.enrichment === undefined ? {} : { enrichment: candidate.enrichment }),
      ...(source === undefined ? {} : { source }),
      meaning,
      alternatives: choicesFor(candidate).filter((choice) => choice !== meaning),
      canRemember: answerOf(drafts, candidate) !== undefined,
      isSaving: memory.savingId === candidate.id || memory.isAnsweringAll,
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

  const changeMeaning = (id: string, text: string): void => {
    const candidate = candidateFor(id);
    if (candidate === undefined) return;
    setDrafts((current) => withOwnWords(current, candidate, text));
  };

  const changeKind = (id: string, value: string): void => {
    const candidate = candidateFor(id);
    const kind = memoryFileName(value);
    if (candidate === undefined || !kind.ok) return;
    setDrafts((current) => withKind(current, candidate, kind.value));
  };

  const remember = (id: string): void => {
    const candidate = candidateFor(id);
    if (candidate === undefined) return;
    const answer = answerOf(drafts, candidate);
    // The button is already disabled without a meaning and a word; this is the same rule
    // stated where it is enforced, so a keyboard or a stale render cannot store a blank
    // definition or file one under no word at all.
    if (answer === undefined) return;
    setDrafts((current) => forgetDraft(current, id));
    memory.remember(id, answer.detail, answer.term, answer.kind);
  };

  // Every card that can be taken as it stands; a card without a meaning stays waiting.
  const answers = answersFor(drafts, memory.pending);
  const leftWaiting = memory.pending.length - answers.length;
  const staying = stayingNote(leftWaiting);
  const confirmAll = {
    message: `Remember all ${String(answers.length)} as they are written? Each goes into the list it is filed under.${staying}`,
    confirmLabel: `Remember ${String(answers.length)}`,
    cancelLabel: 'Cancel',
    onConfirm: (): void => {
      setIsConfirmingAll(false);
      memory.rememberAll(answers);
    },
    onCancel: (): void => setIsConfirmingAll(false),
  };

  const openSource = (id: string): void => {
    const candidate = candidateFor(id);
    if (candidate !== undefined) onOpenConversation(candidate.conversationId);
  };

  const skip = (id: string): void => {
    setDrafts((current) => forgetDraft(current, id));
    memory.skip(id);
  };

  const skipped = memory.lastSkipped;

  return (
    <SheetLayout
      nav={<SheetNav groups={navGroups} activeId={section} onSelect={setSection} />}
      footer={
        <Button variant="danger" onClick={onClearAll}>
          Clear all memories
        </Button>
      }
    >
      {section === 'waiting' && (
        <MemoryReviewPanel
          items={items}
          {...(memory.error === undefined ? {} : { error: memory.error })}
          {...(skipped === undefined
            ? {}
            : { notice: { message: `Skipped ${skipped.term}. Marcel will not ask about it again.`, action: { label: 'Undo', onAction: () => memory.restore(skipped) } } })}
          onChoose={choose}
          onChangeMeaning={changeMeaning}
          onChangeTerm={changeTerm}
          {...(isConfirmingAll ? { confirm: confirmAll } : {})}
          {...(answers.length < 2 || isConfirmingAll || memory.isAnsweringAll ? {} : { bulk: { label: 'Remember all', onStart: () => setIsConfirmingAll(true) } })}
          onChangeKind={changeKind}
          onOpenSource={openSource}
          onRemember={remember}
          onSkip={skip}
        />
      )}

      {section === 'words' && <MemoryListSection list="words" />}

      {section === 'people' && <MemoryListSection list="people" />}

      {section === 'about' && (
        <AboutYouPanel>
          <AutosavedDocument
            editor={
              <MarkdownEditor
                key={`about-${String(about.revision)}`}
                defaultValue={about.draft}
                onChange={about.setDraft}
                onLeave={(text) => about.saveOnLeave(text, about.revision)}
              />
            }
            {...(about.draft.trim().length === 0
              ? { emptyHint: 'Nothing yet. Tell Marcel who you are, what you are responsible for, and anything it should always keep in mind.' }
              : {})}
            {...statusOf(about)}
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
          <AutosavedDocument
            editor={
              <MarkdownEditor
                key={`voice-${String(voice.revision)}`}
                defaultValue={voice.draft}
                onChange={voice.setDraft}
                onLeave={(text) => voice.saveOnLeave(text, voice.revision)}
              />
            }
            {...(voice.draft.trim().length === 0 ? { emptyHint: 'Nothing yet. Rebuild it from your sent mail, or write your own.' } : {})}
            {...statusOf(voice)}
          />
        </VoicePanel>
      )}
    </SheetLayout>
  );
};

MemoryPage.displayName = 'MemoryPage';
