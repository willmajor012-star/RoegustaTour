// Anonymous test data only. Production attendance and rooms stay in the private
// database configuration; this public fixture contains no real tourist names.
export async function installConfirmedFixture(db, config) {
 const tid=config.tourId;
 await db.query("update tours set rules_version='confirmed-2026' where id=$1",[tid]);
 for(const id of config.rosterIds)await db.query('insert into tour_players(tour_id,player_id,attending) values($1,$2,true)',[tid,id]);
 const sessions=config.state.competitions.flatMap((c)=>c.sessions).sort((a,b)=>(a.date+a.firstStart).localeCompare(b.date+b.firstStart));
 for(const [i,s]of sessions.entries())await db.query('insert into rounds(id,tour_id,round_number,name,round_date,tee_time,format,format_label,holes,hole_count_confirmed,course_id,course_name,competition_role,status,published) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true)',[s.roundId,tid,i+1,s.title,s.date,s.firstStart,s.format==='individual'?'singles':s.format,s.format,s.holes??18,s.holes!==null,s.courseId??null,s.courseName,['saturday','sunday'].includes(s.key)?'matchplay':s.key==='par3'?'fun':'contributing','planned']);
 for(const m of config.markets){const keys=Object.keys(m);await db.query('insert into bet_markets('+keys.join(',')+') values('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map((k)=>m[k]));}
 await db.query('insert into tour_operations(tour_id,state,version) values($1,$2,1)',[tid,JSON.stringify(config.state)]);
 const comp=config.state.competitions.find((c)=>c.key==='sunday'),market=config.markets.find((m)=>m.pool_key==='sunday');
 for(const [i,e]of comp.entries.entries())await db.query('insert into bet_options(market_id,label,linked_player_id,linked_entry_id,sort_order,active) values($1,$2,$3,$4,$5,true)',[market.id,'Golfer '+String(i+1).padStart(2,'0'),e.playerIds[0],e.id,i+1]);
}
