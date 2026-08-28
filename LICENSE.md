# Licence — needs a decision before this repo goes anywhere

**Placeholder. Do not publish this repository until this file is replaced.**

This was built by Robert Donegan in a Jacobs context and touches Flood
Intelligence domain knowledge, so the licence is not mine to pick. It needs a
call from whoever owns IP and open-source policy.

The two realistic options:

1. **Internal / all rights reserved.** Appropriate if the catchment scenes,
   parameter tables or the lesson framing are considered commercially useful.
   The repo stays private and this file becomes a standard proprietary notice.

2. **Permissive open source (MIT or Apache-2.0).** Appropriate if the aim is
   public understanding of flood risk. Apache-2.0 is the safer of the two for a
   corporate contributor because it grants patent rights explicitly.

Points worth raising in that conversation:

- No proprietary data ships in this repo. There is no DEM, no gauged record, no
  FEH output, no client data. Every number is either procedural or a
  placeholder — see `NOTICE.md`.
- Third-party dependencies are React, three.js and Vite, all MIT.
- The hazard rating formula is from published Defra and Environment Agency
  research and is freely citable.
- If this is ever made public, `NOTICE.md` must stay prominent. The reputational
  risk is not the code, it is somebody screenshotting an invented rainfall depth
  next to a Jacobs name.
