import { describe, expect, test } from 'bun:test';
import { isQuickContextStale, needsQuickContextRefresh, parseQuickContext, parseStoredQuickContext, quickContextBlock } from './quick-context.ts';

const envelope = (data: unknown): string => JSON.stringify({ ok: true, data });

describe('reading who the user is from the cli', () => {
  test('a full answer gives the name they are called by', () => {
    const context = parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Vincent DELACOURT', mail: 'v@x.com', jobTitle: 'CIO' }, tenantTimeZone: 'China Standard Time' }));

    expect(context?.firstName).toBe('Vincent');
    expect(context?.jobTitle).toBe('CIO');
    expect(context?.tenantTimeZone).toBe('China Standard Time');
  });

  test('a display name written surname-first still yields a usable first name', () => {
    expect(parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Ada Lovelace' } }))?.firstName).toBe('Ada');
  });

  test('only the id came back, so there is a context but nothing to greet the user by', () => {
    const context = parseQuickContext(envelope({ user: { id: 'u1' } }));

    expect(context).not.toBeUndefined();
    expect(context?.firstName).toBe('');
  });

  test('an answer the cli could not produce is no context at all, rather than a context of unknowns', () => {
    expect(parseQuickContext(JSON.stringify({ ok: false, error: 'not_authenticated' }))).toBeUndefined();
  });

  test('output that is not json at all is no context', () => {
    expect(parseQuickContext('bash: ask-marcel-office: command not found')).toBeUndefined();
  });

  test('an envelope with no user is no context, because every command needs that id', () => {
    expect(parseQuickContext(envelope({ tenantTimeZone: 'UTC' }))).toBeUndefined();
  });

  test('ids the agent would otherwise refetch are kept', () => {
    const context = parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Ada' }, primaryDriveId: 'd1', inboxId: 'i1' }));

    expect(context?.ids).toEqual({ primaryDriveId: 'd1', inboxId: 'i1' });
  });
});

describe('telling the agent who it is working for', () => {
  test('the block names the user, their job and the timezone their tenant thinks in', () => {
    const context = parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Vincent DELACOURT', mail: 'v@x.com', jobTitle: 'CIO' }, tenantTimeZone: 'China Standard Time' }));

    const block = quickContextBlock(context);

    expect(block).toContain('Vincent DELACOURT');
    expect(block).toContain('CIO');
    expect(block).toContain('China Standard Time');
  });

  test('no context means no block, so nothing invents a name', () => {
    expect(quickContextBlock(undefined)).toBe('');
  });

  test('the block carries the ids so the agent does not spend a call rediscovering them', () => {
    const context = parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Ada' }, inboxId: 'inbox-1' }));

    expect(quickContextBlock(context)).toContain('inbox-1');
  });
});

describe('deciding when to ask the cli again', () => {
  test('a context fetched a week and a half ago is stale', () => {
    expect(isQuickContextStale('2026-07-10T00:00:00.000Z', new Date('2026-07-21T00:00:00.000Z'))).toBe(true);
  });

  test('yesterday’s context is still good', () => {
    expect(isQuickContextStale('2026-07-20T00:00:00.000Z', new Date('2026-07-21T00:00:00.000Z'))).toBe(false);
  });

  test('a context that was never fetched is stale', () => {
    expect(isQuickContextStale(undefined, new Date('2026-07-21T00:00:00.000Z'))).toBe(true);
  });

  test('a fetch time that is not a date is stale, rather than trusted forever', () => {
    expect(isQuickContextStale('whenever', new Date('2026-07-21T00:00:00.000Z'))).toBe(true);
  });
});

describe('reading back what the app stored', () => {
  test('what was written last time comes back the same', () => {
    const context = parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Vincent DELACOURT', mail: 'v@x.com' }, inboxId: 'i1' }));
    const stored = { fetchedAt: '2026-07-20T00:00:00.000Z', context };

    expect(parseStoredQuickContext(JSON.parse(JSON.stringify(stored)))).toEqual(stored as never);
  });

  test('a file that is not a stored context reads as nothing stored', () => {
    expect(parseStoredQuickContext({ fetchedAt: '2026-07-20T00:00:00.000Z' })).toBeUndefined();
    expect(parseStoredQuickContext('nonsense')).toBeUndefined();
  });

  test('a stored context missing its first name still knows what to call the user', () => {
    const parsed = parseStoredQuickContext({ fetchedAt: '2026-07-20T00:00:00.000Z', context: { displayName: 'Ada Lovelace' } });

    expect(parsed?.context.firstName).toBe('Ada');
    expect(parsed?.context.ids).toEqual({});
  });
});

describe('the exact block the agent is handed', () => {
  test('every line of the block is there, in the order the agent reads them', () => {
    const context = parseQuickContext(
      envelope({
        user: { id: 'u1', displayName: 'Vincent DELACOURT', mail: 'v@x.com', jobTitle: 'CIO' },
        tenantTimeZone: 'China Standard Time',
        inboxId: 'i1',
      })
    );

    expect(quickContextBlock(context)).toBe(
      [
        '## Who you are working for',
        '',
        '- Name: Vincent DELACOURT',
        '- Email: v@x.com',
        '- Job title: CIO',
        '- Their timezone (convert every UTC timestamp to this): China Standard Time',
        '- inboxId: i1',
        '',
        'This is their quick context, already fetched. Do NOT run `my-quick-context` again unless something above is missing and you need it.',
      ].join('\n')
    );
  });

  test('a user with no email, job or timezone gets a block with no empty lines pretending otherwise', () => {
    const context = parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Ada' } }));

    expect(quickContextBlock(context)).toBe(
      [
        '## Who you are working for',
        '',
        '- Name: Ada',
        '',
        'This is their quick context, already fetched. Do NOT run `my-quick-context` again unless something above is missing and you need it.',
      ].join('\n')
    );
  });

  test('every id the cli returned is passed on, each on its own line', () => {
    const context = parseQuickContext(
      envelope({
        user: { id: 'u1', displayName: 'Ada' },
        primaryDriveId: 'd1',
        inboxId: 'i1',
        primaryCalendarId: 'c1',
        primaryPlannerPlanId: 'p1',
        defaultNotebookId: 'n1',
      })
    );

    expect(quickContextBlock(context)).toContain('- primaryDriveId: d1\n- inboxId: i1\n- primaryCalendarId: c1\n- primaryPlannerPlanId: p1\n- defaultNotebookId: n1');
  });
});

describe('the edges of reading the cli’s answer', () => {
  test('an empty display name is not a name', () => {
    const context = parseQuickContext(envelope({ user: { id: 'u1', displayName: '', mail: 'v@x.com' } }));

    expect(context?.displayName).toBe('');
    expect(context?.firstName).toBe('');
  });

  test('a user with no mail falls back to the principal name, which is what mail clients show', () => {
    expect(parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Ada', userPrincipalName: 'ada@x.com' } }))?.email).toBe('ada@x.com');
  });

  test('a user with neither has no email rather than the word undefined', () => {
    expect(parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Ada' } }))?.email).toBe('');
  });

  test('an id that came back as a number is not passed off as an id', () => {
    expect(parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Ada' }, inboxId: 42 }))?.ids).toEqual({});
  });

  test('an empty id string is no id at all', () => {
    expect(parseQuickContext(envelope({ user: { id: 'u1', displayName: 'Ada' }, primaryDriveId: '' }))?.ids).toEqual({});
  });

  test('a name with several spaces in it still yields one first name', () => {
    expect(parseQuickContext(envelope({ user: { id: 'u1', displayName: '  Jean   Pierre  MARTIN ' } }))?.firstName).toBe('Jean');
  });

  test('an id that is not a string is refused, so no command is built around it', () => {
    expect(parseQuickContext(envelope({ user: { id: 7, displayName: 'Ada' } }))).toBeUndefined();
  });
});

describe('the exact moment a context goes stale', () => {
  test('a context exactly seven days old is stale', () => {
    expect(isQuickContextStale('2026-07-14T00:00:00.000Z', new Date('2026-07-21T00:00:00.000Z'))).toBe(true);
  });

  test('a second before seven days it is still good', () => {
    expect(isQuickContextStale('2026-07-14T00:00:01.000Z', new Date('2026-07-21T00:00:00.000Z'))).toBe(false);
  });

  test('a context fetched in the future is not stale', () => {
    expect(isQuickContextStale('2026-08-01T00:00:00.000Z', new Date('2026-07-21T00:00:00.000Z'))).toBe(false);
  });
});

describe('the edges of reading back what was stored', () => {
  test('a stored context keeps the job title and timezone it was written with', () => {
    const parsed = parseStoredQuickContext({
      fetchedAt: '2026-07-20T00:00:00.000Z',
      context: {
        userId: 'u1',
        displayName: 'Vincent DELACOURT',
        firstName: 'Vincent',
        email: 'v@x.com',
        jobTitle: 'CIO',
        tenantTimeZone: 'China Standard Time',
        ids: { inboxId: 'i1' },
      },
    });

    expect(parsed?.context).toEqual({
      userId: 'u1',
      displayName: 'Vincent DELACOURT',
      firstName: 'Vincent',
      email: 'v@x.com',
      jobTitle: 'CIO',
      tenantTimeZone: 'China Standard Time',
      ids: { inboxId: 'i1' },
    });
  });

  test('a stored context without a job title has no job title key, rather than an empty one', () => {
    const parsed = parseStoredQuickContext({ fetchedAt: '2026-07-20T00:00:00.000Z', context: { userId: 'u1', displayName: 'Ada', firstName: 'Ada', email: 'a@x.com', ids: {} } });

    expect(parsed?.context).toEqual({ userId: 'u1', displayName: 'Ada', firstName: 'Ada', email: 'a@x.com', ids: {} });
  });

  test('a stored context with no display name and no email says so with empty strings', () => {
    const parsed = parseStoredQuickContext({ fetchedAt: '2026-07-20T00:00:00.000Z', context: { ids: {} } });

    expect(parsed?.context.displayName).toBe('');
    expect(parsed?.context.email).toBe('');
    expect(parsed?.context.firstName).toBe('');
  });

  test('nothing at all where a stored context should be reads as nothing stored', () => {
    expect(parseStoredQuickContext(null)).toBeUndefined();
    expect(parseStoredQuickContext(undefined)).toBeUndefined();
  });

  test('a stored context whose context field is not an object reads as nothing stored', () => {
    expect(parseStoredQuickContext({ fetchedAt: '2026-07-20T00:00:00.000Z', context: 'Vincent' })).toBeUndefined();
  });
});

describe('an answer that only looks successful', () => {
  test('a failed envelope is refused even when it carries a full-looking user', () => {
    expect(parseQuickContext(JSON.stringify({ ok: false, data: { user: { id: 'u1', displayName: 'Ada' } } }))).toBeUndefined();
  });

  test('a successful envelope with no data at all is refused rather than read past', () => {
    expect(parseQuickContext(JSON.stringify({ ok: true }))).toBeUndefined();
  });

  test('an envelope that is a bare array is refused', () => {
    expect(parseQuickContext(JSON.stringify([1, 2, 3]))).toBeUndefined();
  });

  test('an envelope whose user is a string is refused', () => {
    expect(parseQuickContext(JSON.stringify({ ok: true, data: { user: 'Ada' } }))).toBeUndefined();
  });
});

describe('knowing which account this context belongs to', () => {
  test('the directory id is kept, because it is what names the account’s folder', () => {
    expect(parseQuickContext(envelope({ user: { id: 'u-9a1f', displayName: 'Ada' } }))?.userId).toBe('u-9a1f');
  });

  test('a stored context written before ids were kept reads as having none', () => {
    expect(parseStoredQuickContext({ fetchedAt: '2026-07-20T00:00:00.000Z', context: { displayName: 'Ada' } })?.context.userId).toBe('');
  });
});

describe('deciding whether to ask the cli again', () => {
  test('a context stored before the app knew it needed the account id is fetched again', () => {
    const stored = { fetchedAt: '2026-07-23T00:00:00.000Z', context: { userId: '', displayName: 'Ada', firstName: 'Ada', email: 'a@x.com', ids: {} } };

    expect(needsQuickContextRefresh(stored, new Date('2026-07-24T00:00:00.000Z'))).toBe(true);
  });

  test('a fresh context that knows the account is left alone', () => {
    const stored = { fetchedAt: '2026-07-23T00:00:00.000Z', context: { userId: 'u1', displayName: 'Ada', firstName: 'Ada', email: 'a@x.com', ids: {} } };

    expect(needsQuickContextRefresh(stored, new Date('2026-07-24T00:00:00.000Z'))).toBe(false);
  });

  test('nothing stored means ask', () => {
    expect(needsQuickContextRefresh(undefined, new Date('2026-07-24T00:00:00.000Z'))).toBe(true);
  });

  test('an old context is fetched again even when it knows the account', () => {
    const stored = { fetchedAt: '2026-06-01T00:00:00.000Z', context: { userId: 'u1', displayName: 'Ada', firstName: 'Ada', email: 'a@x.com', ids: {} } };

    expect(needsQuickContextRefresh(stored, new Date('2026-07-24T00:00:00.000Z'))).toBe(true);
  });
});
