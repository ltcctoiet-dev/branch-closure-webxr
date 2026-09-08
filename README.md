# Branch Closure Confidence Navigator

A WebXR proof of value: a virtual banking hub that helps customers whose local
branch is closing understand what happens next, and measures whether it
actually made them feel better about it.

---

## Contents

- [The problem](#the-problem)
- [What this is](#what-this-is)
- [For business readers](#for-business-readers)
- [For technical readers](#for-technical-readers)
- [The conversation layer](#the-conversation-layer)
- [Screens and panels](#screens-and-panels)
- [Running it](#running-it)
- [Deploying](#deploying)
- [Asset pipeline](#asset-pipeline)
- [Third-party services](#third-party-services)
- [Constraints and limitations](#constraints-and-limitations)
- [Known issues](#known-issues)
- [Open questions](#open-questions)

---

## The problem

When a bank closes a branch, the customers most affected are the ones least
equipped to absorb the change: older customers, those in rural areas, people
who rely on cash, and anyone with low digital confidence.

A letter explaining that services are "still available" does not answer the
questions those customers actually have. Where do I go? Will I have to travel
further? Can I still pay in a cheque? Will there be a person to talk to?

Telling someone their options is not the same as showing them.

---

## What this is

A virtual banking hub the customer walks into, wearing a headset or on a
laptop. A relationship manager greets them by name, shows them around, and
answers whatever they ask — in their own words, out loud, with no script to
follow and no menu to navigate.

She can bring things up on screen as she talks: a board listing every service,
a map showing where the nearest hub is, and a fifteen-step walkthrough of
depositing a cheque on a phone that the customer taps through at their own
pace.

The same questions are asked before they go in and again at the end. The
difference between those two sets of answers is the evidence.

### The journey

| Step | What happens |
|---|---|
| Street | Photo of the shopfront. Baseline survey, four questions. A skip control is available for repeat demos. |
| Welcome | She greets the customer and explains what a Banking Hub is, in four short turns. |
| Service board | A frosted-glass panel listing what is available, revealing one item at a time. |
| The counters | She describes both counters and gestures toward them. |
| The private room | Where a community banker would be met. |
| Map | An animated route to the nearest hub, with the postcode and bus route. |
| Q&A | Open conversation. She answers from a curated knowledge base. |
| Cheque walkthrough | Fifteen app screens, tapped through by the customer. |
| Counter and private room | Reachable by marker or by asking to be taken there. |
| Close | Back to the street, the questions again, then a before-and-after panel. |

---

## For business readers

### What it demonstrates

**That reassurance can be shown rather than stated.** The customer stands in
the space, sees the counter, and is walked through the alternative — instead of
reading about it.

**That the conversation can be genuinely open.** She is not a decision tree.
The customer asks whatever is actually worrying them, in their own words, and
gets an answer grounded in material the bank supplied. They can also simply ask
to be taken somewhere and the hub responds.

**That the effect is measurable.** Pre and post answers on the same questions
give a number, not an anecdote. The closing panel shows the shift.

### What it does not do

It holds no customer data, connects to no banking systems, and performs no
transactions. The customer in the demonstration is fictional and the details
are fixed in one configuration block.

It is a proof of value: evidence that the approach works, not a product.

### What it costs to run

Roughly £60–100 a month in third-party services during development — an AI
panorama generator, the conversational AI, and a character licence. Two of
those were one-off purchases. Nothing requires new infrastructure.

### The measurement

Five questions. Four are asked on the street before entering and again at the
end; the fifth only makes sense afterwards.

1. How concerned do you feel about your local branch closing? *(0–10)*
2. How confident are you that you know where to go after it closes? *(0–10)*
3. How confident are you using mobile banking for simple tasks? *(0–10)*
4. Do you understand which services are available at a Banking Hub, Post
   Office, or through mobile banking? *(Yes / Partly / No / I need more help)*
5. Would you still like help from a colleague? *(end only)*

The wording is identical both times — change a word and the comparison means
nothing. The three scale questions are what the closing panel reports.

Answers are tapped rather than spoken. A six-point scale is used rather than
eleven: bigger targets for a controller ray, and less false precision.

---

## For technical readers

### Stack

| Layer | Choice | Why |
|---|---|---|
| Renderer | Babylon.js | Mature WebXR support, good glTF handling |
| Language | TypeScript | |
| Build | Vite | |
| Environment | 360 equirectangular panoramas on a PhotoDome | Photoreal without modelling a room |
| Avatar | ActorCore GLB, ARKit blendshapes | 121 morph targets including the ARKit 52 |
| Conversation | Convai Web SDK | Speech in, LLM, speech out, and a blendshape stream |
| Hosting | Netlify, password-protected | HTTPS is mandatory for WebXR and the microphone |
| Target | Meta Quest 3 browser, plus desktop | |

### Architecture

![Solution architecture](docs/architecture.png)

### How the world is built

The hub is not modelled geometry. Each viewpoint is a single panorama mapped
onto a sphere, with the viewer at the centre.

```
rig      follows the head every frame
 └ world carries the recentre rotation
    ├ dome        the panorama sphere
    ├ markers     teleport targets and their labels
    ├ avatar      the relationship manager
    ├ panels      flat photo screens
    ├ board       the service list
    ├ map         the location video
    ├ cheque      the phone walkthrough
    └ survey      question cards
```

Everything hangs off `world`, so a recentre rotates the panorama and everything
in it together, and they cannot drift apart.

Moving between viewpoints swaps the dome's texture behind a short fade. Nothing
is stitched. During the fade the dome also slides a couple of metres past the
viewer, which reads as a step forward rather than a cut.

The dome is deliberately small — 20m diameter rather than 1000m. At a huge
radius stereo disparity approaches zero and the brain reads the room as
enormous. Shrinking it gives a plausible convergence distance.

### Labels do not billboard

Marker and panel labels are fixed to face outward from their own position
rather than turning to follow the head. Billboarded text swings and skews as
you look around, which is far more distracting in a headset than a label seen
slightly off-axis.

### Project layout

```
src/
├── main.ts    scene, nodes, avatar, panels, Convai, cue routing
├── survey.ts  pre/post survey and the results panel
├── board.ts   service board — frosted glass, revealing tile grid
├── map.ts     location map, played as video
└── cheque.ts  fifteen-step tap-through walkthrough

public/
├── panoramas/      4096×2048 JPEG, one per viewpoint
├── images/         flat photos for the panels
├── images/cheque/  1.png … 15.png, the app screens
├── avatars/        the character GLB
├── video/          the map animation
└── audio/survey/   pre-recorded questions (see Known issues)
```

### Configuration

Almost everything is in named blocks at the top of each file.

**`main.ts`**

- `NODES` — panoramas and the hotspots in each, by yaw and pitch
- `PANELS` — flat photo screens, with a per-panel `brightness`
- `AVATAR` — position, scale, facing
- `CLIPS` — which animation in the GLB is idle, talking and pointing
- `GESTURE_CUES` — phrases that trigger a pointing motion
- `DOME_SIZE`, `FADE_MS`, `DOLLY_METRES` — feel
- `MOVE_INTENT`, `GO_BACK`, `GO_PRIVATE`, `GO_COUNTER` — spoken navigation
- `FAREWELL_CUES`, `SAID_YES`, `SAID_NO` — ending the session

**`survey.ts`** — `SURVEY` holds the questions; `PANEL` the placement.

**`board.ts`** — `BOARD` for layout and pacing, `SERVICES` for the tiles.

**`map.ts`** — `MAP` for the video, caption, size and hold time.

**`cheque.ts`** — `STEPS` for the captions, `PHONE` for the screen, `CAPTION`
for the typing, and `NARRATION` to choose who reads the steps.

---

## The conversation layer

### How cues work

Convai delivers her reply as text before she has spoken any of it. Everything
on screen is therefore driven by watching that text for a phrase, then waiting
for the right moment in her speech rather than acting immediately.

Two moments are used:

**When she stops speaking** — for cues that sit at the end of a turn, like the
service board. Falling silent is the same instant as finishing the cue line.

**When she starts speaking** — for cues at the start of a turn, like the map.
If the cue text arrives while she is already mid-sentence, it fires straight
away, because waiting for a rising edge would miss it entirely.

Each cue is guarded so it can only fire once, and gestures are additionally
guarded per message — without that, a long reply retriggers the same gesture
every half second and she stutters through half a motion repeatedly.

### Cue phrases

| She says | What happens |
|---|---|
| "let me show you the full list of services" | Service board appears |
| "look to your left" | She points to her right, toward the counters |
| "look to your right" | She points to her left, toward the private room |
| "SS4" (the postcode) | Map appears |
| "how to deposit a cheque" | Phone walkthrough starts |
| "a few short questions" | Closing survey is offered |
| "have a lovely day", "take care", "goodbye" | Session ends |

The map is keyed off the postcode rather than a spoken cue line, because the
phrase "show you where it is" leaked into the previous turn and fired far too
early.

### Spoken navigation

The customer's own speech is watched too. Asking to be taken somewhere moves
them, so they never have to hunt for a marker.

A request needs a verb — "take me to", "go to", "show me the" — not just a
mention. Without that, "show me how to pay in a cheque at the counter" walked
the customer to the counter when all they wanted was the demonstration.

"Back", "exit" and "leave the room" need no verb, since someone who wants out
should not have to phrase it carefully. Nothing moves while the walkthrough is
open, or they would lose their place.

### Ending the session

When the customer says they are finished, she asks whether they would answer a
few questions.

**Yes** → back to the street panel, then the questions, then the results.
**No** → back to the street panel, nothing else.

The return is not a page reload. Reloading would wipe the baseline answers, and
comparing them is the entire point. The reload happens only when **Done** is
pressed on the results panel, which is the right moment for a clean reset
before the next person.

Her farewell is watched for as a safety net, because she understands every way
a customer might decline and a phrase list never will.

---

## Screens and panels

### Service board

A single pane of frosted glass, drawn entirely on canvas: header, a rule, a
three-by-two grid of services separated by hairlines, and a footer strip. Items
light up one at a time so the customer reads along while she talks.

The translucency lives in the canvas rather than the material. Fading the
material would fade the navy type along with the glass, and pale text on pale
glass is unreadable.

### Map

An animated route, played as video on a plane. Muted, since she talks over it.
Clears itself when the animation ends, with a timer as a backstop.

### Cheque walkthrough

Fifteen app screens on a phone-shaped plane. The whole screen is the button — a
small "next" target is fiddly with a controller ray, and tapping the phone is
what you would do in real life.

Each screenshot is drawn through a rounded clipping path so the corners curve
like a handset rather than sitting as a square card. The canvas is sized to the
screenshot's own dimensions, so nothing is cropped or stretched and the plane
reshapes to match.

Captions type out beneath the phone, white with a dark outline and no panel
behind them. `NARRATION` chooses who reads them: her via Convai, the browser
voice, or nobody.

### Survey

Question cards and answer buttons on the same frosted glass. Selecting an
answer turns it navy and locks the other buttons for a beat, so the tap is
visibly confirmed before the question changes.

---

## Running it

```bash
npm install
npm run dev
```

Create `.env` in the project root:

```
VITE_CONVAI_API_KEY=...
VITE_CONVAI_CHARACTER_ID=...
```

Vite reads `.env` only at startup, so restart after changing it.

### On a Quest, over USB

```bash
adb devices
adb reverse tcp:5173 tcp:5173
npm run dev
```

Then `http://localhost:5173` in the Quest browser.

**Grant the microphone on the street panel, before entering VR.** Permission
prompts cannot be shown inside an immersive session.

`adb reverse` drops whenever the cable is unplugged or the headset sleeps.
Re-run it — that is the usual reason the Enter VR button goes missing.

### Wireless adb does not work here

The ChromeOS Linux container sits on its own private network with no route to
the LAN, so `adb connect` cannot reach the headset. Use the cable, or deploy and
load over wifi.

### Casting to a screen

Headset menu → Camera → Cast → Computer, then `oculus.com/casting` on the
laptop. This goes via Meta's service rather than the local network, so it is
unaffected by the container problem above.

### Keyboard shortcuts

Trigger shortcuts were removed for the shipped build. What remains is tuning:

| Key | Does |
|---|---|
| `[` `]` | Rotate the world |
| `-` `=` | Field of view |
| `,` `.` | Dome size |
| `p` | Print the yaw you are facing — used to place markers |
| Backspace | Go back |

### Controller

| Button | Does |
|---|---|
| Trigger | Jump to the marker you are pointing at |
| B / Y | Go back |
| A / X | Recentre |
| Thumbstick L/R | Rotate the world |

---

## Deploying

```bash
npm run build
du -sh dist/
```

Drag `dist` onto `app.netlify.com/drop`, or use the Deploys tab to update an
existing site.

**Then set a password** under Site settings → Access control. The Convai key is
compiled into the bundle — `VITE_` variables are inlined at build time — so
anyone who opens DevTools can read it. The password does not hide the key from
someone already inside, but it keeps the site from being found at all. This is
client material regardless.

`netlify.toml` sets the permissions policy WebXR and the microphone need, and
caches assets for a year so the Quest is not re-downloading the character and
the videos on every visit.

Load the site once before anyone puts the headset on. The first load pulls the
panoramas, the character and the videos, and watching a stakeholder wait
through that is avoidable.

---

## Asset pipeline

### Panoramas

Generated with Skybox AI at 8K, downscaled to 4096×2048 JPEG. The Quest handles
that comfortably; 8K risks memory problems.

The dome uses `useDirectMapping: true` and textures load with `invertY` off.
Routing through a cube conversion leaves a visible vertical seam, and the wrong
`invertY` puts the ceiling on the floor.

### The character

ActorCore FBX, converted with headless Blender:

```bash
blender --background --python merge.py -- \
  character.fbx idle.fbx talk.fbx point.fbx out.glb
```

Three settings matter and are easy to lose:

- `export_morph=True` — without it the blendshapes are silently dropped
- `export_apply=False` — applying modifiers destroys shape keys
- `export_animation_mode='NLA_TRACKS'` — without it only one motion survives

Do not run `gltf-transform optimize` on the character. It merges meshes and
materials and destroys the morph targets. Use `resize` if it needs shrinking.

### Motions and mirroring

ActorCore's download dialog has a **Mirror** option, which flips a gesture from
one hand to the other without touching the mesh. Use it rather than scaling the
armature in Blender.

Mirrored motions keep the same action name, so the only thing separating them
is Blender's armature prefix — assigned in merge order. `CLIPS` matches on
that, which makes the merge order load-bearing. Re-merge in a different order
and the values need swapping.

### Lipsync mapping

Convai streams `Float32Array(61)` frames at roughly 60fps. The queue is drained
each frame with `getFrames()` and the oldest applied.

The character names its ARKit shapes `A25_Jaw_Open`; Convai sends `jawOpen`.
Both normalise to `jawopen` by stripping the index prefix, removing underscores
and lowercasing — so no hand-written mapping table is needed.

```ts
const normalise = (name: string) =>
  name.replace(/^[AT]\d+_/, "").replace(/_/g, "").toLowerCase();
```

---

## Third-party services

| Service | Used for | Data leaving the browser |
|---|---|---|
| Convai | Speech recognition, conversation, speech synthesis, lipsync | Customer audio and transcripts |
| Skybox AI | Generating the panoramas | Text prompts only, at build time |
| ActorCore | The character model and motions | None at runtime |
| Netlify | Hosting | Nothing beyond ordinary web traffic |

**The Convai row needs sign-off.** Live customer audio is processed on their
servers. That is a conversation to have before this is shown to anyone outside
the project team, not after.

Convai counts interactions, and a free tier runs out faster than expected
during development. Watch the balance before a demo, particularly if the cheque
walkthrough is set to `NARRATION: "convai"` — that is one interaction per step,
fifteen per run.

---

## Constraints and limitations

**No live data.** No authentication, no transactions, no account information.
The demonstration customer is fictional.

**Brand-neutral signage.** No approved logos are used.

**You teleport, you do not walk.** A panorama is a painted sphere; there is no
parallax within a viewpoint. Movement is between fixed positions. This is true
of every 360 tour and is fine for the purpose, but say it before someone
discovers it in the headset.

**The panoramas are generated, not photographed.** They depict a plausible
banking hub, not a specific branch.

**The character is good, not photoreal.** ActorCore models ship with a single
merged material, so the eyes and teeth cannot have their own shading. At
conversational distance it holds up; under close inspection it does not.

**Iframes cannot render in VR.** Once an immersive session starts the browser
draws only the WebGL scene. That rules out YouTube, Figma prototypes, and
hosted avatar widgets — which is why every screen here is a texture on a plane.

**Answers are logged to the console.** Nothing is persisted. Adding storage is
straightforward but has not been done, deliberately — nothing to secure while
this is a proof of value.

---

## Known issues

**The survey has no voice in the Quest browser.** Speech synthesis is
unreliable inside an immersive session there. The fix is five pre-recorded
MP3s in `public/audio/survey/`, with the code falling back to the browser voice
on desktop. Worth doing before a demo, since the survey is what the whole
exercise measures.

**Lipsync is parked.** The blendshape stream reaches the character and the
mapping is proven, but the mouth is currently driven by a simple oscillator
while she speaks, with eyes and brows taken from the real stream. Full lipsync
is a known quantity rather than an unknown.

**Cue timing is approximate.** Her text arrives before she speaks it, so
screens are tied to when she starts or stops talking rather than to particular
words. It lands well, but it is not frame-accurate and never can be with this
SDK.

**She sometimes compresses long turns.** The knowledge base splits the welcome
into four short turns for this reason. A turn with four paragraphs gets
abbreviated; a turn with two does not.

---

## Open questions

- Sign-off on customer audio being processed by a third party
- Whether the app screenshots and the cheque instructions are licensed for this
  use
- Whether the survey results should persist, and if so, where
- Whether two more viewpoints — waiting area and forms wall — are worth
  generating
- Whether the Convai key should move behind a proxy before this goes anywhere
  less controlled than a password-protected site
