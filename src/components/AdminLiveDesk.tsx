import { useEffect, useMemo, useState } from 'react';
import {
  saveRoundPrizeResult,
  submitResult,
  updateMatchPublished,
  updateRoundPublished,
  type AdminDataResponse,
} from '../lib/adminApi';
import type { Match, RoundPrizeResult, Tour } from '../lib/types';

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
}: {
  data: AdminDataResponse;
  tour: Tour;
  onRefresh: () => Promise<void> | void;
}) {
  const preferredRound = data.rounds.find((round) => round.status === 'active')
    ?? data.rounds.find((round) => round.status === 'planned')
    ?? data.rounds[0];
  const [selectedRoundId, setSelectedRoundId] = useState(preferredRound?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, ResultDraft>>({});
  const [resultState, setResultState] = useState<SaveState>({ saving: false });
  const [prizeState, setPrizeState] = useState<SaveState>({ saving: false });
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
    if (preferredRound && !data.rounds.some((round) => round.id === selectedRoundId)) {
      setSelectedRoundId(preferredRound.id);
    }
  }, [data.rounds, preferredRound, selectedRoundId]);

  useEffect(() => {
    setDrafts(Object.fromEntries(roundMatches.map((match) => [match.id, resultDraftFor(match)])));
    setResultState({ saving: false });
  }, [selectedRound?.id, data.matches, roundMatches]);

  useEffect(() => {
    setPrizeWinnerId(prizeResult?.winnerPlayerId ?? prizeResult?.winnerTeamId ?? '');
    setPrizeScore(prizeResult?.scoreValue === undefined ? '' : String(prizeResult.scoreValue));
    setPrizeState({ saving: false });
  }, [prizeResult?.id, prizeResult?.winnerPlayerId, prizeResult?.winnerTeamId, prizeResult?.scoreValue, selectedRound?.id]);

  const setDraft = (matchId: string, patch: Partial<ResultDraft>) => {
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
    if (!Number.isFinite(scoreValue) || scoreValue < 0) {
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

  return <section className="admin-live-desk">
    <div className="card live-desk-header">
      <div>
        <p className="eyebrow">On-tour control room</p>
        <h3>Live results desk</h3>
        <p>Choose the round once, enter every result, then publish one complete update.</p>
      </div>
      <label>Round
        <select value={selectedRound.id} onChange={(event) => setSelectedRoundId(event.target.value)}>
          {data.rounds.map((round) => <option key={round.id} value={round.id}>{roundLabel(round)}</option>)}
        </select>
      </label>
      <div className="live-desk-status">
        <span className={selectedRound.published ? 'published' : 'draft'}>{selectedRound.published ? 'Published' : 'Private draft'}</span>
        <strong>{selectedRound.courseName ?? 'Course TBC'}</strong>
        <small>{selectedRound.formatLabel ?? selectedRound.format ?? 'Format TBC'} · {roundMatches.length} matches</small>
      </div>
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
          <header><span>Match {match.matchNumber}{match.teeTime ? ` · ${match.teeTime}` : ''}</span><small>{match.status === 'complete' ? match.published ? 'Result live' : 'Saved privately' : 'Not saved'}</small></header>
          <div className="live-match-sides"><div><strong>{sideA}</strong><small>{sideAPlayers || 'Players TBC'}</small></div><span>v</span><div><strong>{sideB}</strong><small>{sideBPlayers || 'Players TBC'}</small></div></div>
          <fieldset className="winner-toggle">
            <legend>Winner</legend>
            <button type="button" className={draft.winningSide === 'A' ? 'selected' : ''} onClick={() => setDraft(match.id, { winningSide: 'A' })}>{sideA}</button>
            <button type="button" className={draft.winningSide === 'halved' ? 'selected' : ''} onClick={() => setDraft(match.id, { winningSide: 'halved' })}>A/S</button>
            <button type="button" className={draft.winningSide === 'B' ? 'selected' : ''} onClick={() => setDraft(match.id, { winningSide: 'B' })}>{sideB}</button>
          </fieldset>
          <label className="live-result-text">Result
            <input value={draft.resultText} onChange={(event) => setDraft(match.id, { resultText: event.target.value })} placeholder="e.g. 3&2, 1 up or halved" />
          </label>
        </article>;
      })}
    </div>

    <div className="card live-desk-actions">
      <div><strong>Round update</strong><small>Draft stays private. Publish makes the complete round visible.</small></div>
      <button type="button" disabled={resultState.saving || roundMatches.length === 0} onClick={() => void saveResults(false)}>Save draft</button>
      <button type="button" disabled={resultState.saving || roundMatches.length === 0} onClick={() => void saveResults(true)}>Publish round</button>
      {resultState.message ? <p className="form-success">{resultState.message}</p> : null}
      {resultState.error ? <p className="form-error">{resultState.error}</p> : null}
    </div>

    <div className="card live-prize-card">
      <div className="section-heading">
        <div><p className="eyebrow">Round winner</p><h3>{prizeType === 'team_gross' ? 'Lowest scramble score' : 'Highest Stableford score'}</h3></div>
        <span className={linkedMarket ? 'market-linked' : 'market-missing'}>{linkedMarket ? 'Bet market linked' : 'No market linked'}</span>
      </div>
      <div className="live-prize-form">
        <label>Winner
          <select value={prizeWinnerId} onChange={(event) => { setPrizeWinnerId(event.target.value); setPrizeState({ saving: false, message: 'Unsaved changes' }); }}>
            <option value="">Choose winner</option>
            {prizeOptions.map((option) => <option value={option.id} key={option.id}>{'displayName' in option ? option.displayName : option.name}</option>)}
          </select>
        </label>
        <label>Winning score
          <input inputMode="numeric" value={prizeScore} onChange={(event) => { setPrizeScore(event.target.value); setPrizeState({ saving: false, message: 'Unsaved changes' }); }} placeholder={prizeType === 'team_gross' ? 'Gross strokes' : 'Stableford points'} />
        </label>
        <button type="button" disabled={prizeState.saving} onClick={() => void savePrize(false)}>Save draft</button>
        <button type="button" disabled={prizeState.saving} onClick={() => void savePrize(true)}>Publish & settle bets</button>
      </div>
      {prizeState.message ? <p className="form-success">{prizeState.message}</p> : null}
      {prizeState.error ? <p className="form-error">{prizeState.error}</p> : null}
    </div>
  </section>;
}
