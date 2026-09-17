# cbrew PTCGL client-data thread: evidence and safe test boundary

Snapshot: 12 September 2026. This note examines the public thread by `@cbrew_tcg`, first-party Pokémon documentation, and what can responsibly be concluded about automated battle-log and hidden opponent-deck extraction. It deliberately omits implementation and exploitation instructions. It is a security assessment, not legal advice.

## Bottom line

The thread supports a credible claim that an ordinary Pokémon TCG Live client receives an opponent's complete deck data at match creation and that the author observed it without making extra server requests or changing the match. It does **not** reveal whether the observation came from a client log, network payload, process memory, runtime instrumentation, or another local representation.

That distinction matters. A read-only technique can still be reverse engineering or exploitation. Pokémon's current UK Terms of Use explicitly cover PTCGL and prohibit unauthorized third-party software that modifies or automates the service, reverse engineering, circumventing security, infiltrating systems, and taking action to exploit known or latent defects. Pokémon's vulnerability-disclosure programme prohibits accessing accounts or private information belonging to other users and asks researchers to keep suspected vulnerabilities confidential while Pokémon works on them.

Therefore this finding should **not be tested against live players**. The responsible route is to report the apparent exposure through Pokémon's vulnerability-disclosure programme and obtain written authorization and scope before attempting to verify or decode it. Normal, user-initiated Battle Log export remains a separate documented feature.

## What the author actually says

| Public statement | Verified meaning | What it does not establish |
| --- | --- | --- |
| The author wanted a tool that would "auto extract battle logs" before Worlds. | Automation of Battle Log collection was the original goal. [Source](https://x.com/cbrew_tcg/status/2098755925641232433) | Whether that extractor was completed, how it worked, or whether the screenshot uses battle-log text at all. |
| "PTCGL ships" the opponent's deck nickname, exact 60-card list, win rate, and more. | This is a first-hand claim that those fields reach the normal client. The screenshot visibly shows a match row, both complete deck lists, record percentages, and edit counts. [Source and screenshot](https://x.com/cbrew_tcg/status/2098755925641232433/photo/1) | Independent verification, the payload/schema, where the fields reside locally, or whether every listed statistic originates in the same match-creation message. |
| The exact list is available before the coin flip. | The claimed timing would make the data competitively actionable during a game. The author explicitly describes that use as cheating. [Source](https://x.com/cbrew_tcg/status/2098756622625513937) | Whether the author's dashboard displayed it live, or whether any named player used it while playing. |
| The reads are "passive": "No traffic, no injected calls to the Pokémon servers, no altered game state." | The author claims the observation did not create additional requests or modify server/game state; it used data handled by a normal client during normal games. [Source](https://x.com/cbrew_tcg/status/2098757522089705716) | That the technique is permitted, undetectable, safe, limited to public data, or free from local instrumentation. "Passive" describes effects claimed by the author, not the access method. |
| "It's telemetry from my normal client playing normal games." | `Telemetry` is the author's label for client-side data already present during ordinary play. | A standard technical meaning here. The thread does not say packet capture, application logs, memory reading, runtime hooks, or a public API. |
| The likely fix is "Don't send deck list for the opposing player at match creation." | The author's own diagnosis is over-disclosure in a match-creation response or equivalent client data. [Source](https://x.com/cbrew_tcg/status/2098758651582304492) | A Pokémon-confirmed root cause or architecture. |
| There is no opt-out; the author suspects an old optional deck-sharing feature lost its control. | This is explicitly presented as the author's interpretation, drawing a comparison with PTCGO. [Source](https://x.com/cbrew_tcg/status/2098757869726245162) | Evidence that the exposure actually descends from PTCGO's sharing feature. |

The author also says the exposure leaks private testing choices outside a match and posts examples of private deck nicknames. Those examples strengthen the privacy/competitive concern but should not be copied into local research data. [Testing-risk discussion](https://x.com/cbrew_tcg/status/2098757305365840321) and [nickname follow-up](https://x.com/cbrew_tcg/status/2098760930750247125).

## Technical interpretation

The strongest supported model is:

```text
normal match creation
        -> PTCGL client receives more structured data than the UI reveals
        -> author's local tool observes some client-side representation
        -> tool stores/renders match and deck information
```

This makes invisible, data-driven collection technically plausible and removes the need for mouse automation or OCR. It does **not** prove a particular extraction route. The same observations could theoretically arise from several different local layers, and the thread gives no detail that distinguishes them.

The plausible client-side surfaces, ordered from least to most intrusive to investigate, are:

1. a normal user-visible/exported Battle Log;
2. an ordinary local diagnostic, cache, or application-support file;
3. an already-received server response observed locally;
4. a decoded in-memory/runtime object inside the client; or
5. a modified or hooked client.

The author's claim rules out an extra server request and altered server/game state, but does not distinguish surfaces 2–5. "Passive" is compatible with observing network or process data and therefore is not evidence that the method is non-invasive.

`Client telemetry` should not be confused with Pokémon's formal privacy terminology. Pokémon's current Privacy Notice calls device information and "gameplay and game error-related data" usage data, and says app gameplay/error data may be collected by third-party analytics providers. That official statement confirms that PTCGL-like apps generate gameplay-related data, but it does not say that Battle Logs or opponent deck lists are exposed through an analytics feed. [Pokémon Privacy Notice](https://www.pokemon.com/uk/legal/privacy-notice/).

No public first-party PTCGL API or developer documentation for match extraction was found in this review. That absence is not proof that no internal interface exists.

## Official constraints on testing

### Terms of Use

Pokémon's UK Terms of Use, last updated 15 June 2023, expressly include PTCGL. The relevant restrictions prohibit:

- unauthorized third-party software that modifies or automates operation within the service;
- decomposing, disassembling, or reverse engineering any part of a service;
- avoiding or disabling security or digital-rights mechanisms;
- infiltrating systems used to operate the service; and
- taking action to cause or exploit known or latent bugs or defects.

The same terms say discovered errors or problems should be reported confidentially to Pokémon Customer Service, and reserve broad suspension/termination rights. [Pokémon UK Terms of Use](https://www.pokemon.com/uk/legal/terms-of-use/).

### Vulnerability Disclosure Programme

Pokémon's official programme welcomes security reports and lists TPCi-developed mobile applications in scope, but requires confidentiality while Pokémon validates and addresses a possible vulnerability. It specifically says researchers must not attempt to access accounts that are not theirs, access any user's private information, modify or destroy data, perform denial of service, transmit malware, or break applicable laws. [Pokémon Vulnerability Disclosure Program](https://www.pokemon.com/uk/security/vulnerability-disclosure-program/).

The reported exposure involves opponent deck nicknames and unrevealed 60-card lists. Treat those as private unless Pokémon says otherwise; a screen name being visible in a match does not make the player's other client data public. Pokémon's Privacy Notice says public disclosure applies where a user has selected options to display a name/screen name and other information. [Pokémon Privacy Notice](https://www.pokemon.com/uk/legal/privacy-notice/).

### Documented Battle Log feature

Pokémon officially introduced Battle Log review during a match and export from the match-results screen in February 2024. The announcement does not document automatic/background extraction, a persistent match-history API, or opponent deck disclosure. [Official Battle Log announcement](https://community.pokemon.com/en-us/discussion/9496/letter-to-the-community-feb-20-2024).

On the current macOS client observed on 12 September 2026, Test Deck/AI mode does not present the post-match Battle Log export control. It therefore cannot be assumed to exercise the same Battle Log or match-creation path as a human match.

## Safe bounded experiment

### Existing local-file result

During a normal human match on this Mac on 12 September 2026, only file metadata and connection endpoints were monitored across PTCGL's ordinary logs, application-support directory, and cache directory. At match creation, the client opened new encrypted HTTPS connections and `Player.log` changed. At the results screen, no new match-result file appeared; the only application-support change was a two-byte `unsaved-deckinfo.json` cache. Cache activity consisted of asset lock/info files for avatars, cards, and visual resources rather than a persistent match record.

A value-suppressed structural scan of the changed portion of `Player.log` found no `battle`, `opponent`, `nickname`, `rating`, or `telemetry` fields. It contained generic Unity/game/match/card diagnostics. No opponent values or network payloads were inspected or retained.

This is evidence against an ordinary persistent file being cbrew's source on the current macOS client. It does not establish that the data is absent from an existing encrypted server response or runtime representation.

### Phase A: metadata-only normal-use baseline

- Test Deck/AI is not a valid reproduction because it has no post-match Battle Log export control on the current client.
- A human match is therefore required to reproduce the path described in the thread, but no hidden opponent data should be opened, decoded, copied, or retained.
- During one otherwise normal match, compare only filenames, sizes, and modification times in the user's ordinary PTCGL application-support/log directories. Do not inspect file contents or network payloads, and do not decompile or instrument the client.
- Record only whether a candidate file is created or changed at match creation and match completion. This can identify a possible ordinary file surface, but it cannot establish what that file contains.

This baseline is deliberately limited. It may show that a normal file changes, but it cannot safely demonstrate extraction of the claimed hidden fields. A negative result must not be treated as evidence that the data is absent or as permission to escalate.

### Phase B: authorization gate

Prepare a confidential report containing the public thread and any metadata-only Phase A result. Ask Pokémon's vulnerability-disclosure programme whether controlled verification is authorized. Request a written scope that specifies the client/platform, permitted accounts or test environment, observation techniques, permitted fields, retention/deletion rules, and disclosure timeline.

### Phase C: authorized surface discrimination

Only if Pokémon provides written authorization, use an AI or Pokémon-provided test environment and stop as soon as one source is identified:

1. determine whether a permitted local file contains the structured match/deck record;
2. if not, determine whether an authorized observation of the client's normal match-creation response contains it;
3. if not, determine whether the data exists only in an authorized runtime representation.

Use synthetic or researcher-controlled data, collect the minimum necessary fields, and do not retain opponent identifiers or deck content. This sequence distinguishes file, transport, and runtime surfaces without testing multiple invasive routes after a source has been found.

### Do not do without written authorization

- Inspect, intercept, decode, or hook PTCGL's hidden client communications or runtime state.
- Decompile or instrument the client to locate the match-creation data.
- Test on Ranked, Casual, or friend matches against another person.
- Collect, store, display, or transmit another player's unrevealed deck, private nickname, or account-linked statistics.
- Publish or operationalize the suspected disclosure, even if it is technically read-only or only shown after the match.

If unrelated private information appears at any point, stop immediately, do not retain or redistribute it, and notify Pokémon through the approved channel.
