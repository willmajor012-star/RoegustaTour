import { useEffect, useMemo, useRef, useState } from 'react';
import {
  saveRoundPrizeResult,
  submitResult,
  updateMatchPublished,
  updateRoundPublished,
  type AdminDataResponse,
} from '../lib/adminApi';
import type { Match, RoundPrizeResult, Tour } from '../lib/types';
import { AdminContextHelpButton } from './AdminContextHelpButton';
import { isValidMatchplayResultForHoles, matchplayResultOptionsForHoles, normalizeMatchplayResult } from '../lib/matchplay';

type ResultDraft = {
  winningSide: Exclude<Match['winningSide'], 'void'> | '';
  resultText: string;
};

type SaveState = {
  saving: boolean;
  message?: string;
  error?: string;
};

function roundLabel(round: AdminDataResponse['rounds'][number]) {
  return `Round ${round.roundNumber} · ${round.name}`;
}

function resultDraftFor(match: Match): ResultDraft {
  return {
    winningSide: match.winningSide === 'void' ? '' : match.winningSide ?? '',
    resultText: match.resultText ?? '',
  };
}

function pointsForResult(match: Match, winningSide: ResultDraft['winningSide']) {
  if (winningSide === 'halved') return [match.pointsAvailable / 2, match.pointsAvailable / 2] as const;
  if (winningSide === 'A') return [match.pointsAvailable, 0] as const;
  return [0, match.pointsAvailable] as const;
}

function winnerLabel(
  match: Match,
  teamsById: Map<string, AdminDataResponse['tourTeams'][number]>,
  side: 'A' | 'B',
) {
  const teamId = side === 'A' ? match.sideATeamId : match.sideBTeamId;
  const sideLabel = side === 'A' ? match.sideALabel : match.sideBLabel;
  return sideLabel || teamsById.get(teamId)?.name || `Side ${side}`;
}

export function AdminLiveDesk({
  data,
  tour,
  onRefresh,
  onHelp,
  onOpenBetting,
}: {
  data: AdminDataResponse;
  tour: Tour;
  onRefresh: () => Promise<void> | void;
  onHelp: (guideId: 'guide-results' | 'guide-secondary-prizes') => void;
  onOpenBetting?: () => void;
}) {
  const preferredRound = data.rounds.find((round) => round.status === 'active')
    ?? data.rounds.find((round) => round.status === 'planned')
    ?? data.rounds[0];
  const [selectedRoundId, setSelectedRoundId] = useState(() => {
    try {
      const remembered = window.sessionStorage.getItem(`roegusta:admin:round:${tour.id}`);
      if (data.rounds.some((round) => round.id === remembered)) return remembered!;
    } catch { /* The desk also works when browser storage is unavailable. */ }
    return preferredRound?.id ?? '';
  });
  const [drafts, setDrafts] = useState<Record<string, ResultDraft>>({});
  const dirtyMatchIds = useRef(new Set<string>());
  const [resultState, setResultState] = useState<SaveState>({ saving: false });
  const [prizeState, setPrizeState] = useState<SaveState>({ saving: false });
  const busy = resultState.saving || prizeState.saving;
  const resultFields = useRef(new Map<string, HTMLSelectElement>());
  const actionsRef = useRef<HTMLDivElement>(null);
  const prizeRef = useRef<HTMLDivElement>(null);
  const selectedRound = data.rounds.find((round) => round.id === selectedRoundId) ?? preferredRound;
  const roundMatches = useMemo(
    () => data.matches
      .filter((match) => match.roundId === selectedRound?.id && match.status !== 'void')
      .sort((a, b) => a.matchNumber - b.matchNumber),
    [data.matches, selectedRound?.id],
  );
  const teamsById = useMemo(() => new Map(data.tourTeams.map((team) => [team.id, team])), [data.tourTeams]);
  const playersById = useMemo(() => new Map(data.players.map((player) => [player.id, player])), [data.players]);
  const participantsByMatch = useMemo(() => {
    const grouped = new Map<string, AdminDataResponse['matchParticipants']>();
    for (const participant of data.matchParticipants) {
      grouped.set(participant.matchId, [...(grouped.get(participant.matchId) ?? []), participant]);
    }
    return grouped;
  }, [data.matchParticipants]);

  const prizeResult = data.roundPrizeResults.find((result) => result.roundId === selectedRound?.id);
  const prizeType: RoundPrizeResult['prizeType'] = selectedRound?.format === 'scramble' ? 'team_gross' : 'individual_stableford';
  const [prizeWinnerId, setPrizeWinnerId] = useState('');
  const [prizeScore, setPrizeScore] = useState('');
  const linkedMarket = data.betMarkets.find((market) => market.id === prizeResult?.linkedBetMarketId)
    ?? data.betMarkets.find((market) => market.roundId === selectedRound?.id && market.marketType === (prizeType === 'team_gross' ? 'team_result' : 'player_performance'));

  useEffect(() => {
    if (!selectedRound) return;
    try { window.sessionStorage.setItem(`roegusta:admin:round:${tour.id}`, selectedRound.id); }
    catch { /* Keep the in-memory selection if storage is unavailable. */ }
  }, [selectedRound?.id, tour.id]);

  useEffect(() => {
    if (preferredRound && !data.rounds.some((round) => round.id === selectedRoundId)) {
      setSelectedRoundId(preferredRound.id);
    }
  }, [data.rounds, preferredRound, selectedRoundId]);

  useEffect(() => {
    const currentIds = new Set(data.matches.map((match) => match.id));
    for (const id of dirtyMatchIds.current) {
      if (!currentIds.has(id)) dirtyMatchIds.current.delete(id);
    }
    setDrafts((current) => Object.fromEntries(data.matches.map((match) => [
      match.id,
      dirtyMatchIds.current.has(match.id) && current[match.id]
        ? current[match.id]
        : resultDraftFor(match),
    ])));
  }, [data.matches]);

  useEffect(() => {
    setResultState({
      saving: false,
      message: roundMatches.some((match) => dirtyMatchIds.current.has(match.id)) ? 'Unsaved changes' : undefined,
    });
  }, [selectedRound?.id]);

  useEffect(() => {
    setPrizeWinnerId(prizeResult?.winnerPlayerId ?? prizeResult?.winnerTeamId ?? '');
    setPrizeScore(prizeResult?.scoreValue === undefined ? '' : String(prizeResult.scoreValue));
    setPrizeState({ saving: false });
  }, [prizeResult?.id, prizeResult?.winnerPlayerId, prizeResult?.winnerTeamId, prizeResult?.scoreValue, selectedRound?.id]);

  const setDraft = (matchId: string, patch: Partial<ResultDraft>) => {
    dirtyMatchIds.current.add(matchId);
    setDrafts((current) => ({
      ...current,
      [matchId]: { ...(current[matchId] ?? { winningSide: '', resultText: '' }), ...patch },
    }));
    setResultState({ saving: false, message: 'Unsaved changes' });
  };

  const saveResults = async (publish: boolean) => {
    if (!selectedRound) return;
    const incomplete = roundMatches.filter((match) => {
      const draft = drafts[match.id] ?? resultDraftFor(match);
      return !draft.winningSide || !draft.resultText.trim();
    });
    if (publish && incomplete.length > 0) {
      setResultState({
        saving: false,
        error: `${incomplete.length} match${incomplete.length === 1 ? '' : 'es'} still need a winner and result (for example 3&2 or 1 up).`,
      });
      return;
    }
    const readyMatches = roundMatches.filter((match) => {
      const draft = drafts[match.id] ?? resultDraftFor(match);
      return Boolean(draft.winningSide && draft.resultText.trim());
    });
    const invalidMatch = readyMatches.find((match) => {
      const draft = drafts[match.id] ?? resultDraftFor(match);
      return !isValidMatchplayResultForHoles(draft.resultText, selectedRound.holes)
        || (normalizeMatchplayResult(draft.resultText) === 'AS') !== (draft.winningSide === 'halved');
    });
    if (invalidMatch) {
      setResultState({ saving: false, error: `Match ${invalidMatch.matchNumber}: choose a valid margin for this round. AS must have a halved result.` });
      return;
    }
    if (!publish && readyMatches.length === 0) {
      setResultState({ saving: false, error: 'Enter at least one result before saving a draft.' });
      return;
    }

    setResultState({ saving: true, message: publish ? 'Publishing the round…' : 'Saving result drafts…' });
    try {
      for (const match of roundMatches) {
        const draft = drafts[match.id] ?? resultDraftFor(match);
        if (!publish && (!draft.winningSide || !draft.resultText.trim())) continue;
        const [pointsSideA, pointsSideB] = pointsForResult(match, draft.winningSide);
        const resultChanged = match.winningSide !== draft.winningSide || match.resultText !== draft.resultText;
        if (resultChanged || match.status !== 'complete') {
          await submitResult({
            tourId: tour.id,
            matchId: match.id,
            pointsSideA,
            pointsSideB,
            resultText: draft.resultText.trim(),
            published: publish,
            correctionReason: match.status === 'complete' ? 'Updated from the live results desk.' : null,
          });
        } else if (publish && !match.published) {
          await updateMatchPublished({ tourId: tour.id, matchId: match.id, published: true });
        }
        dirtyMatchIds.current.delete(match.id);
      }
      if (publish) await updateRoundPublished({ tourId: tour.id, roundId: selectedRound.id, published: true });
      await onRefresh();
      setResultState({
        saving: false,
        message: publish ? 'Round published. Scores, results and stats are now live.' : 'Draft results saved privately.',
      });
    } catch (error) {
      setResultState({ saving: false, error: error instanceof Error ? error.message : 'Results could not be saved.' });
    }
  };

  const savePrize = async (publish: boolean) => {
    if (!selectedRound || !prizeWinnerId) {
      setPrizeState({ saving: false, error: 'Choose the winning player or team first.' });
      return;
    }
    const scoreValue = Number(prizeScore);
    if (!prizeScore.trim() || !Number.isInteger(scoreValue) || scoreValue < 0) {
      setPrizeState({ saving: false, error: 'Enter a valid winning score.' });
      return;
    }
    const winnerOption = linkedMarket
      ? data.betOptions.find((option) => option.marketId === linkedMarket.id && (
        prizeType === 'team_gross' ? option.linkedTeamId === prizeWinnerId : option.linkedPlayerId === prizeWinnerId
      ))
      : undefined;
    if (publish && linkedMarket && !winnerOption) {
      setPrizeState({ saving: false, error: 'The linked Bet Punto market has no option for this winner. Fix the market before publishing.' });
      return;
    }

    setPrizeState({ saving: true, message: publish ? 'Publishing winner and settling bets…' : 'Saving winner draft…' });
    try {
      const unit = prizeType === 'team_gross' ? 'strokes' : 'points';
      await saveRoundPrizeResult({
        id: prizeResult?.id,
        tourId: tour.id,
        roundId: selectedRound.id,
        prizeType,
        title: prizeType === 'team_gross' ? 'Lowest scramble gross' : 'Highest Stableford score',
        winnerPlayerId: prizeType === 'individual_stableford' ? prizeWinnerId : null,
        winnerTeamId: prizeType === 'team_gross' ? prizeWinnerId : null,
        winningScoreText: `${scoreValue} ${unit}`,
        scoreValue,
        scoreUnit: unit,
        linkedBetMarketId: linkedMarket?.id ?? null,
        published: publish,
      });
      await onRefresh();
      setPrizeState({
        saving: false,
        message: publish
          ? linkedMarket ? 'Winner published and Bet Punto settled.' : 'Winner published. There was no linked Bet Punto market to settle.'
          : 'Winner saved privately.',
      });
    } catch (error) {
      setPrizeState({ saving: false, error: error instanceof Error ? error.message : 'Winner could not be saved.' });
    }
  };

  if (!selectedRound) {
    return <section className="card admin-live-desk"><p className="eyebrow">Live desk</p><h3>Add a round in Setup before entering results.</h3></section>;
  }

  const prizeOptions = prizeType === 'team_gross'
    ? data.tourTeams
    : data.players.filter((player) => data.tourPlayers.some((tourPlayer) => tourPlayer.playerId === player.id && tourPlayer.attending));

  const incompleteMatches = roundMatches.filter((match) => {
    const draft = drafts[match.id] ?? resultDraftFor(match);
    return !draft.winningSide || !isValidMatchplayResultForHoles(draft.resultText, selectedRound.holes)
      || (normalizeMatchplayResult(draft.resultText) === 'AS') !== (draft.winningSide === 'halved');
  });
  const enteredCount = roundMatches.length - incompleteMatches.length;
  const liveCount = roundMatches.filter((match) => match.status === 'complete' && match.published).length;
  const unsavedCount = roundMatches.filter((match) => dirtyMatchIds.current.has(match.id)).length;
  const prizeChanged = prizeWinnerId !== (prizeResult?.winnerPlayerId ?? prizeResult?.winnerTeamId ?? '')
    || prizeScore !== (prizeResult?.scoreValue === undefined ? '' : String(prizeResult.scoreValue));
  const resultsNeedPublishing = roundMatches.length > 0 && (unsavedCount > 0 || liveCount < roundMatches.length || !selectedRound.published);
  const winnerNeedsPublishing = !prizeResult?.published || prizeChanged;
  const nextStep = incompleteMatches.length > 0 ? 'Enter next result'
    : resultsNeedPublishing ? 'Review and publish results'
    : winnerNeedsPublishing ? 'Review playing winner'
    : onOpenBetting ? 'Open betting tally' : null;
  const goToNextStep = () => {
    if (incompleteMatches[0]) {
      const field = resultFields.current.get(incompleteMatches[0].id);
      field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      field?.focus();
    } else if (resultsNeedPublishing) {
      actionsRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      actionsRef.current?.focus();
    } else if (winnerNeedsPublishing) {
      prizeRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      prizeRef.current?.focus();
    } else onOpenBetting?.();
  };

  return <section className="admin-live-desk">
    <div className="card live-desk-header">
      <div>
        <p className="eyebrow">On-tour control room</p>
        <h3>Live results desk</h3>
        <p>Choose the round once, then a winner and margin for each match. A/S means the match was halved.</p>
      </div>
      <AdminContextHelpButton label="Live match results" onClick={() => onHelp('guide-results')} />
      <label>Round
        <select value={selectedRound.id} disabled={resultState.saving || prizeState.saving} onChange={(event) => setSelectedRoundId(event.target.value)}>
          {data.rounds.map((round) => <option key={round.id} value={round.id}>{roundLabel(round)}</option>)}
        </select>
      </label>
      <div className="live-desk-status">
        <span className={selectedRound.published ? 'published' : 'draft'}>{selectedRound.published ? 'Published' : 'Private draft'}</span>
        <strong>{selectedRound.courseName ?? 'Course TBC'}</strong>
        <small>{selectedRound.formatLabel ?? selectedRound.format ?? 'Format TBC'} · {roundMatches.length} matches</small>
      </div>
    </div>

    <div className="card live-round-progress" role="region" aria-label="Round progress">
      <div><p className="eyebrow">{roundLabel(selectedRound)}</p><h4>What’s left to do</h4></div>
      <ul>
        <li><strong>{enteredCount} of {roundMatches.length} results entered</strong><span>{liveCount} published{unsavedCount > 0 ? ` · ${unsavedCount} with unsaved changes` : ''}</span></li>
        <li><strong>Playing winner</strong><span>{prizeChanged ? 'Unsaved changes' : prizeResult?.published ? 'Published' : prizeResult ? 'Saved as draft' : 'Not entered'}</span></li>
        <li><strong>Betting</strong><span>{!linkedMarket ? 'No market linked' : linkedMarket.status === 'settled' ? 'Settled' : linkedMarket.status === 'void' ? 'Cancelled' : linkedMarket.status === 'draft' ? 'Market needs preparing' : linkedMarket.status === 'open' ? 'Open for picks' : 'Awaiting playing winner'}</span></li>
      </ul>
      {roundMatches.length === 0 ? <p>Add matches in Pairings before entering results.</p> : nextStep ? <button type="button" disabled={busy} onClick={goToNextStep}>{nextStep}</button> : <p>Results and playing winner published.</p>}
    </div>

    <div ref={actionsRef} tabIndex={-1} className="card live-desk-actions" aria-label="Save round results" aria-busy={busy}>
      <div><strong>Round {selectedRound.roundNumber} results</strong><small>Save draft keeps entries private. Publish updates everyone’s scores.</small></div>
      <button type="button" disabled={busy || roundMatches.length === 0} onClick={() => void saveResults(false)}>Save draft</button>
      <button type="button" disabled={busy || roundMatches.length === 0} onClick={() => void saveResults(true)}>Publish round</button>
      {resultState.message ? <p role="status" className={resultState.message === 'Unsaved changes' ? 'form-notice' : 'form-success'}>{resultState.message}</p> : null}
      {resultState.error ? <p role="alert" className="form-error">{resultState.error} Your remaining entries are kept. Retry when ready.</p> : null}
    </div>

    <div className="live-result-list">
      {roundMatches.length === 0 ? <p className="card">No matches are set up for this round.</p> : roundMatches.map((match) => {
        const draft = drafts[match.id] ?? resultDraftFor(match);
        const participants = participantsByMatch.get(match.id) ?? [];
        const sideAPlayers = participants.filter((participant) => participant.side === 'A').map((participant) => playersById.get(participant.playerId)?.displayName).filter(Boolean).join(' & ');
        const sideBPlayers = participants.filter((participant) => participant.side === 'B').map((participant) => playersById.get(participant.playerId)?.displayName).filter(Boolean).join(' & ');
        const sideA = winnerLabel(match, teamsById, 'A');
        const sideB = winnerLabel(match, teamsById, 'B');
        return <article className="card live-result-row" key={match.id}>
          <header><span>Match {match.matchNumber}{match.teeTime ? ` · ${match.teeTime}` : ''}</span><small>{dirtyMatchIds.current.has(match.id) ? 'Unsaved changes' : match.status === 'complete' ? match.published ? 'Result live' : 'Saved privately' : 'Not saved'}</small></header>
          <div className="live-match-sides"><div><strong>{sideA}</strong><small>{sideAPlayers || 'Players TBC'}</small></div><span>v</span><div><strong>{sideB}</strong><small>{sideBPlayers || 'Players TBC'}</small></div></div>
          <fieldset className="winner-toggle">
            <legend>Winner</legend>
            <button type="button" disabled={busy} aria-pressed={draft.winningSide === 'A'} className={draft.winningSide === 'A' ? 'selected' : ''} onClick={() => setDraft(match.id, { winningSide: 'A', resultText: normalizeMatchplayResult(draft.resultText) === 'AS' ? '' : draft.resultText })}>{sideA}</button>
            <button type="button" disabled={busy} aria-pressed={draft.winningSide === 'halved'} className={draft.winningSide === 'halved' ? 'selected' : ''} onClick={() => setDraft(match.id, { winningSide: 'halved', resultText: 'AS' })}>A/S</button>
            <button type="button" disabled={busy} aria-pressed={draft.winningSide === 'B'} className={draft.winningSide === 'B' ? 'selected' : ''} onClick={() => setDraft(match.id, { winningSide: 'B', resultText: normalizeMatchplayResult(draft.resultText) === 'AS' ? '' : draft.resultText })}>{sideB}</button>
          </fieldset>
          <label className="live-result-text">Result
            <select ref={(field) => { if (field) resultFields.current.set(match.id, field); else resultFields.current.delete(match.id); }} value={normalizeMatchplayResult(draft.resultText) ?? ''} disabled={busy} onChange={(event) => setDraft(match.id, {
              resultText: event.target.value,
              winningSide: event.target.value === 'AS' ? 'halved' : draft.winningSide === 'halved' ? '' : draft.winningSide,
            })}>
              <option value="">Choose result</option>
              {matchplayResultOptionsForHoles(selectedRound.holes).map((result) => <option key={result} value={result}>{result}</option>)}
            </select>
          </label>
        </article>;
      })}
    </div>

    <div ref={prizeRef} tabIndex={-1} className="card live-prize-card">
      <div className="section-heading">
        <div><p className="eyebrow">Round winner</p><h3>{prizeType === 'team_gross' ? 'Lowest scramble score' : 'Highest Stableford score'}</h3></div>
        <div className="chip-list"><AdminContextHelpButton label="Secondary prize winner and Bet Punto settlement" onClick={() => onHelp('guide-secondary-prizes')} /><span className={linkedMarket ? 'market-linked' : 'market-missing'}>{linkedMarket ? 'Bet market linked' : 'No market linked'}</span></div>
      </div>
      <div className="live-prize-form">
        <label>Winner
          <select disabled={busy} value={prizeWinnerId} onChange={(event) => { setPrizeWinnerId(event.target.value); setPrizeState({ saving: false, message: 'Unsaved changes' }); }}>
            <option value="">Choose winner</option>
            {prizeOptions.map((option) => <option value={option.id} key={option.id}>{'displayName' in option ? option.displayName : option.name}</option>)}
          </select>
        </label>
        <label>Winning score
          <input disabled={busy} inputMode="numeric" value={prizeScore} onChange={(event) => { setPrizeScore(event.target.value); setPrizeState({ saving: false, message: 'Unsaved changes' }); }} placeholder={prizeType === 'team_gross' ? 'Gross strokes' : 'Stableford points'} />
        </label>
        <button type="button" disabled={busy} onClick={() => void savePrize(false)}>Save draft</button>
        <button type="button" disabled={busy} onClick={() => void savePrize(true)}>Publish & settle bets</button>
      </div>
      {prizeState.message ? <p role="status" className="form-success">{prizeState.message}</p> : null}
      {prizeState.error ? <p role="alert" className="form-error">{prizeState.error}</p> : null}
    </div>
  </section>;
}
