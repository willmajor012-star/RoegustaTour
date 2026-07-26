import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  deleteItineraryItem,
  deleteTeamDayKit,
  saveItineraryItem,
  saveTeamDayKit,
  type AdminDataResponse,
} from '../lib/adminApi';
import { formatRoundContextLabel, formatTeeTimeDisplay } from '../lib/display';
import { formatDate } from '../lib/formatting';
import {
  activeManualItineraryItems,
  manualItineraryKind,
  manualItineraryKindLabels,
  manualItineraryKinds,
  type ManualItineraryKind,
} from '../lib/tourItinerary';
import type { Tour } from '../lib/types';
import type { TourItineraryItem, TourTeamDayKit } from '../lib/publicApi';
import { AdminContextHelpButton } from './AdminContextHelpButton';

type Props = {
  data: AdminDataResponse;
  tour: Tour;
  onRefresh: () => Promise<void> | void;
  onHelp: () => void;
};

type ItineraryForm = {
  id?: string;
  kind: ManualItineraryKind;
  itemDate: string;
  timeLabel: string;
  activity: string;
  location: string;
  notes: string;
  isPlaceholder: boolean;
  sortOrder: string;
};

type KitForm = {
  id?: string;
  kitDate: string;
  teamId: string;
  colourLabel: string;
  sortOrder: string;
};

const emptyItineraryForm = (tour?: Tour): ItineraryForm => ({
  kind: 'travel',
  itemDate: tour?.startDate ?? '',
  timeLabel: '',
  activity: manualItineraryKindLabels.travel,
  location: '',
  notes: '',
  isPlaceholder: false,
  sortOrder: '10',
});

const emptyKitForm = (tour?: Tour): KitForm => ({
  kitDate: tour?.startDate ?? '',
  teamId: '',
  colourLabel: '',
  sortOrder: '10',
});

type FormStatus = { saving: boolean; error?: string; success?: string };

export function AdminTourItinerary({ data, tour, onRefresh, onHelp }: Props) {
  const [itineraryForm, setItineraryForm] = useState<ItineraryForm>(() => emptyItineraryForm(tour));
  const [kitForm, setKitForm] = useState<KitForm>(() => emptyKitForm(tour));
  const [status, setStatus] = useState<FormStatus>({ saving: false });
  const manualItems = useMemo(() => activeManualItineraryItems(data.itineraryItems, tour.id), [data.itineraryItems, tour.id]);
  const inactiveLegacyCount = data.itineraryItems.filter((item) => item.tourId === tour.id).length - manualItems.length;
  const sortedKit = [...data.teamDayKit].sort((a, b) => a.kitDate.localeCompare(b.kitDate) || a.sortOrder - b.sortOrder);

  useEffect(() => {
    setItineraryForm(emptyItineraryForm(tour));
    setKitForm(emptyKitForm(tour));
    setStatus({ saving: false });
  }, [tour.id]);

  const runSave = async (action: () => Promise<unknown>, success: string) => {
    setStatus({ saving: true });
    try {
      await action();
      await onRefresh();
      setStatus({ saving: false, success });
    } catch (error) {
      setStatus({ saving: false, error: error instanceof Error ? error.message : 'Save failed.' });
    }
  };

  const submitItinerary = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sortOrder = Number(itineraryForm.sortOrder);
    if (!itineraryForm.itemDate || !itineraryForm.activity.trim()) {
      setStatus({ saving: false, error: 'Add a date and a clear schedule label.' });
      return;
    }
    if (!Number.isFinite(sortOrder)) {
      setStatus({ saving: false, error: 'Sort order must be numeric.' });
      return;
    }
    void runSave(async () => {
      await saveItineraryItem({
        id: itineraryForm.id,
        tourId: tour.id,
        itemDate: itineraryForm.itemDate,
        dayLabel: null,
        timeLabel: itineraryForm.timeLabel || null,
        activity: itineraryForm.activity.trim(),
        location: itineraryForm.location || null,
        notes: itineraryForm.notes || null,
        isPlaceholder: itineraryForm.isPlaceholder,
        sortOrder,
        sourceType: itineraryForm.kind,
        sourceId: null,
      });
      setItineraryForm(emptyItineraryForm(tour));
    }, itineraryForm.id ? 'Schedule item updated.' : 'Schedule item added.');
  };

  const editItinerary = (item: TourItineraryItem) => {
    const kind = manualItineraryKind(item);
    if (!kind) return;
    setItineraryForm({
      id: item.id,
      kind,
      itemDate: item.itemDate ?? '',
      timeLabel: item.timeLabel ?? '',
      activity: item.activity,
      location: item.location ?? '',
      notes: item.notes ?? '',
      isPlaceholder: item.isPlaceholder,
      sortOrder: String(item.sortOrder),
    });
  };

  const removeItinerary = (item: TourItineraryItem) => {
    if (!window.confirm(`Delete "${item.activity}" from this tour itinerary?`)) return;
    void runSave(() => deleteItineraryItem({ id: item.id, tourId: tour.id }), 'Schedule item deleted.');
  };

  const submitKit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sortOrder = Number(kitForm.sortOrder);
    if (!kitForm.kitDate || !kitForm.teamId || !kitForm.colourLabel.trim()) {
      setStatus({ saving: false, error: 'Choose the date and team, then add the shirt colour.' });
      return;
    }
    if (!Number.isFinite(sortOrder)) {
      setStatus({ saving: false, error: 'Sort order must be numeric.' });
      return;
    }
    void runSave(async () => {
      await saveTeamDayKit({
        id: kitForm.id,
        tourId: tour.id,
        teamId: kitForm.teamId,
        kitDate: kitForm.kitDate,
        colourLabel: kitForm.colourLabel.trim(),
        sortOrder,
      });
      setKitForm(emptyKitForm(tour));
    }, kitForm.id ? 'Shirt colour updated.' : 'Shirt colour added.');
  };

  const editKit = (kit: TourTeamDayKit) => setKitForm({
    id: kit.id,
    kitDate: kit.kitDate,
    teamId: kit.teamId,
    colourLabel: kit.colourLabel,
    sortOrder: String(kit.sortOrder),
  });

  const removeKit = (kit: TourTeamDayKit) => {
    if (!window.confirm('Delete this team shirt colour?')) return;
    void runSave(() => deleteTeamDayKit({ id: kit.id, tourId: tour.id }), 'Shirt colour deleted.');
  };

  return <section className="card admin-panel">
    <div className="section-heading">
      <div><p className="eyebrow">Tour itinerary</p><h3>Where to be, when, and what to wear</h3></div>
      <AdminContextHelpButton label="Tour itinerary" onClick={onHelp} />
    </div>
    <p>Enter travel, accommodation and dinners here. Golf is pulled directly from Rounds &amp; tee times, so it is never entered twice.</p>
    {status.error ? <p className="form-error">{status.error}</p> : null}
    {status.success ? <p className="form-success">{status.success}</p> : null}

    <div className="premium-inset">
      <div className="section-heading"><div><p className="eyebrow">Golf from rounds</p><h4>Automatic schedule entries</h4></div><AdminContextHelpButton label="Automatic golf itinerary entries" onClick={onHelp} /></div>
      {data.rounds.length === 0 ? <p>No rounds have been added for this tour.</p> : <div className="admin-card-list">{data.rounds.map((round, index) => <article className="admin-mini-card" key={round.id}><div><strong>{formatRoundContextLabel(round, index)}</strong><span>{formatDate(round.roundDate)} · First tee {formatTeeTimeDisplay(round.teeTime)}</span><p>{round.courseName ?? 'Course TBC'}</p></div></article>)}</div>}
    </div>

    <div className="premium-inset">
      <div className="section-heading"><p className="eyebrow">Travel, stay and dinner</p><AdminContextHelpButton label="Travel and accommodation itinerary" onClick={onHelp} /></div>
      <form className="admin-form-grid" onSubmit={submitItinerary}>
        <label>Type<select value={itineraryForm.kind} onChange={(event) => {
          const kind = event.target.value as ManualItineraryKind;
          const oldDefault = manualItineraryKindLabels[itineraryForm.kind];
          setItineraryForm({ ...itineraryForm, kind, activity: itineraryForm.activity === oldDefault ? manualItineraryKindLabels[kind] : itineraryForm.activity });
        }}>{manualItineraryKinds.map((kind) => <option value={kind} key={kind}>{manualItineraryKindLabels[kind]}</option>)}</select></label>
        <label>Date<input type="date" required value={itineraryForm.itemDate} onChange={(event) => setItineraryForm({ ...itineraryForm, itemDate: event.target.value })} /></label>
        <label>Time<input value={itineraryForm.timeLabel} onChange={(event) => setItineraryForm({ ...itineraryForm, timeLabel: event.target.value })} placeholder="e.g. 17:40 or TBC" /></label>
        <label>Sort order<input value={itineraryForm.sortOrder} onChange={(event) => setItineraryForm({ ...itineraryForm, sortOrder: event.target.value })} inputMode="numeric" /></label>
        <label className="admin-full-span">Label<input value={itineraryForm.activity} onChange={(event) => setItineraryForm({ ...itineraryForm, activity: event.target.value })} /></label>
        <label className="admin-full-span">Location<input value={itineraryForm.location} onChange={(event) => setItineraryForm({ ...itineraryForm, location: event.target.value })} placeholder="Airport, hotel or restaurant" /></label>
        <label className="admin-full-span">Basic details<textarea value={itineraryForm.notes} onChange={(event) => setItineraryForm({ ...itineraryForm, notes: event.target.value })} placeholder="Flight number, address, booking name or other essential detail" /></label>
        <label className="publish-toggle"><input type="checkbox" checked={itineraryForm.isPlaceholder} onChange={(event) => setItineraryForm({ ...itineraryForm, isPlaceholder: event.target.checked })} /> Mark as TBC</label>
        <button type="submit" disabled={status.saving}>{itineraryForm.id ? 'Save schedule item' : 'Add schedule item'}</button>
        {itineraryForm.id ? <button type="button" onClick={() => setItineraryForm(emptyItineraryForm(tour))}>Cancel edit</button> : null}
      </form>
      <div className="admin-card-list">{manualItems.length === 0 ? <p>No travel, accommodation or dinner information has been added for this tour.</p> : manualItems.map((item) => <article className="admin-mini-card" key={item.id}><div><strong>{item.activity}{item.isPlaceholder ? ' · TBC' : ''}</strong><span>{formatDate(item.itemDate)} · {item.timeLabel ?? 'No fixed time'} · {manualItineraryKindLabels[manualItineraryKind(item) as ManualItineraryKind]}</span>{item.location ? <p>{item.location}</p> : null}{item.notes ? <p>{item.notes}</p> : null}</div><div className="admin-mini-actions"><button type="button" onClick={() => editItinerary(item)}>Edit</button><button type="button" onClick={() => removeItinerary(item)}>Delete</button></div></article>)}</div>
      {inactiveLegacyCount > 0 ? <p className="muted">{inactiveLegacyCount} old handbook or duplicated schedule row{inactiveLegacyCount === 1 ? ' is' : 's are'} preserved in storage but hidden from the live itinerary.</p> : null}
    </div>

    <div className="premium-inset">
      <div className="section-heading"><div><p className="eyebrow">Team shirts</p><h4>Colours by day</h4></div><AdminContextHelpButton label="Daily team shirt colours" onClick={onHelp} /></div>
      <form className="admin-form-grid" onSubmit={submitKit}>
        <label>Date<input type="date" required value={kitForm.kitDate} onChange={(event) => setKitForm({ ...kitForm, kitDate: event.target.value })} /></label>
        <label>Team<select required value={kitForm.teamId} onChange={(event) => setKitForm({ ...kitForm, teamId: event.target.value })}><option value="">Choose team</option>{data.tourTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
        <label>Shirt colour<input value={kitForm.colourLabel} onChange={(event) => setKitForm({ ...kitForm, colourLabel: event.target.value })} placeholder="e.g. Navy" /></label>
        <label>Sort order<input value={kitForm.sortOrder} onChange={(event) => setKitForm({ ...kitForm, sortOrder: event.target.value })} inputMode="numeric" /></label>
        <button type="submit" disabled={status.saving}>{kitForm.id ? 'Save shirt colour' : 'Add shirt colour'}</button>
        {kitForm.id ? <button type="button" onClick={() => setKitForm(emptyKitForm(tour))}>Cancel edit</button> : null}
      </form>
      <div className="admin-card-list">{sortedKit.length === 0 ? <p>No daily shirt colours have been added.</p> : sortedKit.map((kit) => <article className="admin-mini-card" key={kit.id}><div><strong>{data.tourTeams.find((team) => team.id === kit.teamId)?.name ?? 'Team'} · {kit.colourLabel}</strong><span>{formatDate(kit.kitDate)}</span></div><div className="admin-mini-actions"><button type="button" onClick={() => editKit(kit)}>Edit</button><button type="button" onClick={() => removeKit(kit)}>Delete</button></div></article>)}</div>
    </div>
  </section>;
}
