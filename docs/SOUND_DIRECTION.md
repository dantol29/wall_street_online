# Trading Floor Sound Direction

## Intent

The exchange sounds functional, enormous, and indifferent. There is no music and no invisible horror director. Every audible event has a believable source: ventilation, electrical infrastructure, people, terminals, the launch console, or the building itself.

The mix should repeatedly return to near-silence. The desired emotional result comes from scale, distance, sparse human activity, and financial machinery—not horror vocabulary.

## Non-negotiable rules

- No exploration music.
- No horror drones, whispers, stingers, supernatural sounds, or scripted scares.
- No audible street traffic. The windows acoustically isolate a high floor.
- Dead terminals are silent.
- Price updates are silent unless they represent a major event.
- No terminal owns a permanently active audio source.
- Every one-shot has a visible or physically credible source.
- Voice, launch events, and player actions always win over ambience.

## Audio buses and priority

1. `voice` — nearby voice chat
2. `exchange_event` — launch bell
3. `local_action` — launch button, local footsteps, direct interactions
4. `remote_foley` — nearby player footsteps
5. `terminal_event` — transaction tick, relay, power-on, ticker transition
6. `infrastructure` — HVAC, electrical room tone
7. `building_detail` — elevator motor, pipe/metal tick, distant door

When the browser reaches its voice limit, lower-priority and farther one-shots are discarded first. Persistent ambience is ducked slightly under launch events and voice; it is never stopped abruptly.

## Dynamic range

All values below are **starting values**, to be measured in the game rather than treated as standards.

| Bus | Starting level relative to master | Validation |
| --- | ---: | --- |
| Voice | 0 dB | A nearby speaker remains effortless to understand. |
| Exchange event | -3 dB | The bell is recognizable across the floor without clipping. |
| Local action | -8 dB | A button clunk is substantial but not startling. |
| Remote foley | -16 dB | Nearby footsteps are identifiable; distant ones nearly vanish. |
| Terminal event | -20 dB | One nearby tick is audible in silence but ignorable. |
| Infrastructure | -30 dB | HVAC is noticed after stopping, not while actively playing. |
| Building detail | -26 dB | A rare event reads as architecture, not a cue. |

Pass condition: standing still for ten seconds feels quiet. A launch bell creates obvious contrast without requiring the master volume to be lowered afterward.

## Persistent infrastructure

### HVAC

Use one non-positional, seamless, low-passed ventilation bed. It represents the whole floor, not a vent beside the player. Avoid tonal content that resembles music or a horror drone.

Add a second extremely quiet air layer with a slow, non-rhythmic level change. Do not pan it around the room.

### Electrical infrastructure

Use a quiet fundamental plus a much quieter harmonic. Pitch drift must be almost imperceptible. Avoid aggressive buzz, distortion, or intermittent faults.

### Building resonance

Use pooled one-shots with long random gaps:

- distant elevator machinery;
- ventilation state change;
- electrical relay;
- remote door close;
- isolated structural/pipe tick.

Starting interval: 35–110 seconds between events. Pass when a five-minute session contains life but no recognizable loop. Increase the minimum interval if players begin anticipating an event.

## Room acoustics

Use one modest large-office reverb send rather than a reverb instance per source.

- Short early reflections communicate hard floors, glass, and open volume.
- Tail remains below the dry signal.
- Voice receives minimal reverb.
- Exchange bell receives the strongest send.
- Local and remote footsteps receive a small send.
- HVAC stays mostly dry.

Starting tail: 0.9–1.25 seconds. Pass when a clap-like test suggests a large modern office, not a cathedral. Shorten the tail if speech becomes cloudy.

## Footsteps

Footsteps require recorded assets; do not substitute synthetic noise bursts in production.

Asset set:

- 4 wood shoe impacts;
- 4 stone shoe impacts for the launch platform;
- 3 metal shoe impacts for explicitly metal surfaces only.

Each step chooses a different sample than the immediately previous step. Starting variation: pitch ±2.5%, gain ±1.5 dB. Pass when twenty consecutive steps do not reveal a repeating pattern. Reduce pitch variation if footwear identity changes audibly.

Local footsteps are driven by actual horizontal travel distance, not animation time alone. No step plays while blocked against geometry. Walking and running use different cadence but the same physical sample family.

Remote footsteps are server-informed and played positionally from the remote character. Starting audible range: clear within 5m, soft by 12m, effectively silent by 22m. Pass when a player can locate nearby movement but cannot hear every player in the room.

## Voice chat

Keep voices natural. Distance attenuation and stereo direction provide the atmosphere.

- Nearby: clear and dry.
- Medium distance: quieter and directionally legible.
- Far: very faint, then silent.
- Behind multiple terminal rows: apply a small gain reduction and gentle high-frequency roll-off only if a cheap obstruction test is available.

Never add whispering, pitch shift, distortion, or horror reverb. Large usernames must not reveal a speaker whom audio and sight have not yet located.

## Terminal audio manager

Terminals register metadata with one shared manager; they do not each create an AudioSource.

The manager maintains a distance-sorted candidate list and an audio pool.

- 0–8m: active terminals may emit restrained routine ticks.
- 8–20m: only launches, manual token sounds, and major market events play.
- Beyond 20m: no individual routine terminal audio.
- Starting concurrency cap: 6 terminal one-shots across the client.

Pass condition: a dense active area suggests activity while voice and footsteps remain fully intelligible. Lower concurrency before lowering individual event volume.

### Activity rules

- Dead/empty: silent.
- Active: sparse confirmation tick or electronic click.
- Very active: higher event probability, never dramatically louder.

Starting active interval: 18–45 seconds per audible area, not per terminal. Very active interval: 7–18 seconds. Pass when most ten-second windows contain no terminal sound. Increase intervals if the room resembles a casino.

Only the nearest eligible terminal should own a routine event at a given moment. Distant market ticks may occasionally be selected, but must be very quiet and have a real active-token source.

## Physical token-sound button

The existing token-sound interaction is a high-priority manual terminal event.

- Server validates player proximity and rate limits the request.
- The event is broadcast to the room.
- Clients play it from the stand with distance attenuation.
- The logo receives its thin white playback border for the actual audio duration.
- Starting audible radius: 25m.
- Starting server cooldown: 1 second.

Pass when nearby players share the joke without users across the entire exchange hearing it. Reduce radius before reducing local volume if it becomes disruptive.

Creator audio must be short, safe, and bounded before production launch. Add upload transcoding, duration validation, normalized loudness, file-size limits, moderation, and a per-token cooldown before accepting arbitrary public creator audio.

## Central launch identity

Idle behavior is almost silent. A very quiet console/electrical layer may become audible only at close interaction distance.

### Launch sequence

1. Red button: one dry industrial `CLUNK`, layered from switch click, mechanism travel, and a restrained low impact.
2. Pause: 0.5–1.0 seconds of no added sound.
3. `LISTING APPROVED`: one short professional confirmation tone.
4. Countdown: optional quiet display/mechanical ticks; do not beep on every number by default.
5. `LIVE`: one physical exchange-bell strike with the strongest room-reverb send.
6. New stand, if listener is nearby: relay click, subtle screen start, brief initialization tone.
7. Return immediately to the base room tone.

The launch button clunk is local and nearby-spatial. The exchange bell is a server-broadcast global event anchored at the central platform. The new-terminal relay is positional and distance-limited.

Pass when players can identify a launch from the bell alone and the sequence does not resemble a trailer sting, casino win, or sci-fi power-up.

## Ticker

Normal price movement is silent. Major state changes may use one quiet departure-board-like mechanical tick or short confirmation tone. A single event should update multiple ticker displays without multiplying its sound.

## Required production assets

| Family | Variants | Notes |
| --- | ---: | --- |
| Wood footsteps | 4 | Warm, hollow office-floor shoe impacts. |
| Stone footsteps | 4 | Harder launch-platform impacts. |
| Metal footsteps | 3 | Sparse, only on true metal surfaces. |
| Launch clunk | 2 layers or one designed asset | Industrial control switch, no cinematic bass hit. |
| Exchange bell | 1–2 | Physical, institutional, long natural decay. |
| Terminal UI | 4 | Tiny click, tick, confirmation, error/disabled. |
| Terminal power-on | 2–3 layers | Relay, restrained electrical start, short tone. |
| Ticker transition | 2 | Departure-board/mechanical electronic character. |
| Building one-shots | 5–8 | Elevator, vent state, door, relay, structural tick. |
| HVAC loops | 2 | Seamless, quiet, non-musical. |
| Electrical loops | 2 | Subtle, stable, no aggressive buzz. |

Normalize authored assets as a coherent library before import. Keep dry masters; apply room reverb in-game so distance and environment remain controllable.

## Browser implementation

- Unlock one shared Web Audio context after user input.
- Decode and cache reusable assets; do not construct a new context per sound.
- Pool positional one-shot voices.
- Use distance attenuation before allocating a voice.
- Enforce concurrency per bus and globally.
- Stop or virtualize inaudible sources.
- Suspend the context when the page is hidden.
- Use one shared convolution reverb send.
- Keep ambience non-positional; keep terminals, footsteps, button, relay, and player sounds positional.
- Never attach a continuously playing source to every terminal.

## V1 delivery order

1. Shared audio manager, buses, pooling, distance attenuation, and page lifecycle.
2. HVAC and electrical room tone at the correct low level.
3. Local material footsteps, then remote positional footsteps.
4. Launch clunk, silence, confirmation, bell, and terminal relay.
5. Spatial token-sound playback and synchronized logo feedback.
6. Sparse terminal activity selected by LOD manager.
7. Rare building one-shots.
8. Optional cheap voice occlusion after the core mix is stable.

Do not add more content until silence, priorities, and launch contrast pass playtesting.

## Playtest gates

- **Silence:** stop moving for ten seconds; ambience is present but does not demand attention.
- **New player:** without UI, a listener identifies the launch bell as a major exchange event.
- **Readability:** voice remains clear during footsteps and terminal activity.
- **Distance:** a remote walker becomes audible before visible nearby, then disappears naturally with distance.
- **Dead ring:** only HVAC and footsteps remain.
- **Active ring:** occasional tiny events imply activity without casino density.
- **Stress:** many active terminals never exceed the terminal concurrency cap.
- **Abuse:** repeated token-sound presses are server-limited and cannot dominate the room.
- **Authenticity:** every noticeable sound can be attributed to a visible or credible physical source.

