# Battle Replay artwork provenance

The coin PNGs, condition markers, and Energy symbols preserve the artwork from the user-reviewed Battle Replay prototype at commit `1f1f6c8` in `PokeNotesV2-battle-replay-prototype`. The PNGs add embedded origin metadata; their pixels are unchanged. This integration creates no replacement artwork.

- `coin-pikachu.png` and `coin-pokemon-back.png`: existing prototype coin artwork; preserved as supplied by that prototype.
- `conditions/`: official rulebook markers; source and custom Sleep treatment are documented in the directory README.
- `energy/`: official rulebook vector marks; source and presentation treatment are documented in the directory README.

Card artwork is resolved by the existing Deck List artwork URL helper at runtime and can represent a different printing from the saved Battle Log. Missing known artwork is labelled explicitly in the replay.
