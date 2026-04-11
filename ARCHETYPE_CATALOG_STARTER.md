# Archetype Catalog Starter

Use this file as the working draft for the curated archetype catalog.

How to use it:
- Leave `id` stable once chosen.
- Treat `display_sprites` as the UI-facing deck representation.
- Put only truly archetype-defining cards in `strong_evidence`.
- Put support lines, pre-evolutions, and softer clues in `medium_evidence`.
- Use `exclude_if_present` when a common conflicting line should reduce confidence or block a match.
- Add `aliases` for matchup labels people actually say/write.
- Use `notes` to explain edge cases or confidence rules.

Suggested editing rule:
- `strong_evidence` should answer: "If this appears, how strongly does it point at this exact archetype?"
- `medium_evidence` should answer: "What helps support this archetype, but should not identify it on its own?"

Starter shape:

```yaml
status: todo
id: example-id
label: Example Label
display_sprites:
  - example-mon
strong_evidence:
  - example-mon
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

## Current Live Archetypes

```yaml
status: todo
id: absol-mega
label: Mega Absol Box
display_sprites:
  - absol-mega
  - kangaskhan-mega
strong_evidence:
  - absol-mega
  - kangaskhan-mega
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: alakazam
label: Alakazam Powerful Hand
display_sprites:
  - alakazam
strong_evidence:
  - alakazam
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: archaludon
label: Archaludon ex
display_sprites:
  - archaludon
strong_evidence:
  - archaludon
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: brute-bonnet
label: Poison Box
display_sprites:
  - brute-bonnet
  - budew
strong_evidence:
  - brute-bonnet
  - budew
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: ceruledge
label: Ceruledge ex
display_sprites:
  - ceruledge
strong_evidence:
  - ceruledge
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: charizard
label: Charizard ex
display_sprites:
  - charizard
strong_evidence:
  - charizard
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: conkeldurr
label: Conkeldurr Gutsy Swing
display_sprites:
  - conkeldurr
strong_evidence:
  - conkeldurr
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: crustle
label: Crustle Mysterious Rock Inn
display_sprites:
  - crustle
strong_evidence:
  - crustle
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: dipplin
label: Festival Lead
display_sprites:
  - dipplin
  - thwackey
strong_evidence:
  - dipplin
  - thwackey
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: dragapult
label: Dragapult ex
display_sprites:
  - dragapult
strong_evidence:
  - dragapult
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: espathra
label: Espathra ex
display_sprites:
  - espathra
strong_evidence:
  - espathra
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: farigiraf
label: Farigiraf ex
display_sprites:
  - farigiraf
strong_evidence:
  - farigiraf
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: flareon
label: Flareon ex
display_sprites:
  - flareon
strong_evidence:
  - flareon
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: froslass
label: Froslass Munkidori
display_sprites:
  - froslass
  - munkidori
strong_evidence:
  - froslass
  - munkidori
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: froslass-mega
label: Mega Froslass ex
display_sprites:
  - froslass-mega
strong_evidence:
  - froslass-mega
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: garchomp
label: Cynthia's Garchomp ex
display_sprites:
  - garchomp
  - roserade
strong_evidence:
  - garchomp
  - roserade
medium_evidence:
  - gabite
  - gible
  - roselia
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: gardevoir
label: Gardevoir ex
display_sprites:
  - gardevoir
strong_evidence:
  - gardevoir
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: gholdengo
label: Gholdengo ex
display_sprites:
  - gholdengo
strong_evidence:
  - gholdengo
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: great-tusk
label: Great Tusk Mill
display_sprites:
  - great-tusk
strong_evidence:
  - great-tusk
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: greninja
label: Greninja ex
display_sprites:
  - greninja
strong_evidence:
  - greninja
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: grimmsnarl
label: Marnie's Grimmsnarl ex
display_sprites:
  - grimmsnarl
strong_evidence:
  - grimmsnarl
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: ho-oh
label: Ho-Oh Armarouge
display_sprites:
  - ho-oh
  - armarouge
strong_evidence:
  - ho-oh
  - armarouge
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: honchkrow
label: Rocket's Honchkrow
display_sprites:
  - honchkrow
  - porygon2
strong_evidence:
  - honchkrow
  - porygon2
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: iron-crown
label: Future
display_sprites:
  - iron-crown
  - miraidon
strong_evidence:
  - iron-crown
  - miraidon
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: joltik
label: Joltik Box
display_sprites:
  - joltik
  - pikachu
strong_evidence:
  - joltik
  - pikachu
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: kangaskhan-mega
label: Mega Kangaskhan ex
display_sprites:
  - kangaskhan-mega
strong_evidence:
  - kangaskhan-mega
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: lopunny-mega
label: Mega Lopunny ex
display_sprites:
  - lopunny-mega
strong_evidence:
  - lopunny-mega
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: lucario-mega
label: Mega Lucario ex
display_sprites:
  - lucario-mega
strong_evidence:
  - lucario-mega
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: magcargo
label: Ethan's Magcargo
display_sprites:
  - magcargo
  - ho-oh
strong_evidence:
  - magcargo
  - ho-oh
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: mewtwo
label: Rocket's Mewtwo ex
display_sprites:
  - mewtwo
  - spidops
strong_evidence:
  - mewtwo
  - spidops
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: miraidon
label: Miraidon ex
display_sprites:
  - miraidon
strong_evidence:
  - miraidon
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: noctowl
label: Tera Box
display_sprites:
  - noctowl
  - ogerpon-wellspring
strong_evidence:
  - noctowl
  - ogerpon-wellspring
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: ogerpon
label: Ogerpon Meganium
display_sprites:
  - ogerpon
  - meganium
strong_evidence:
  - ogerpon
  - meganium
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: okidogi
label: Okidogi Adrena-Power
display_sprites:
  - okidogi
strong_evidence:
  - okidogi
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: pidgeot
label: Pidgeot Control
display_sprites:
  - pidgeot
strong_evidence:
  - pidgeot
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: raging-bolt
label: Raging Bolt ex
display_sprites:
  - raging-bolt
strong_evidence:
  - raging-bolt
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: roaring-moon
label: Roaring Moon ex
display_sprites:
  - roaring-moon
strong_evidence:
  - roaring-moon
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: sharpedo-mega
label: Mega Sharpedo ex
display_sprites:
  - sharpedo-mega
strong_evidence:
  - sharpedo-mega
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: slowking
label: Slowking Seek Inspiration
display_sprites:
  - slowking
strong_evidence:
  - slowking
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: spidops
label: Rocket's Spidops
display_sprites:
  - spidops
strong_evidence:
  - spidops
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: toxtricity
label: Toxtricity Sinister Surge
display_sprites:
  - toxtricity
strong_evidence:
  - toxtricity
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: typhlosion
label: Ethan's Typhlosion
display_sprites:
  - typhlosion
strong_evidence:
  - typhlosion
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: ursaluna-bloodmoon
label: Bloodmoon Ursaluna Mad Bite
display_sprites:
  - ursaluna-bloodmoon
strong_evidence:
  - ursaluna-bloodmoon
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: venusaur-mega
label: Mega Venusaur ex
display_sprites:
  - venusaur-mega
strong_evidence:
  - venusaur-mega
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```

```yaml
status: todo
id: zoroark
label: N's Zoroark ex
display_sprites:
  - zoroark
strong_evidence:
  - zoroark
medium_evidence: []
exclude_if_present: []
aliases: []
notes: ""
```
