<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/wordmark-dark.svg">
  <img alt="nowhere" src=".github/wordmark-light.svg" width="440">
</picture>

Nowhere encodes an entire website into a URL fragment. The site lives in the link itself and is never stored on a server. Eight tools (event, fundraiser, store, petition, message, drop, art, forum) publish without accounts or platform permission. Orders and messages route through Nostr relays using ephemeral keys.

**[hostednowhere.com](https://hostednowhere.com)**

**Status:** Nowhere is early software and still evolving. There may be bugs in any tool. Store carries the most risk because it handles real money and depends on Nostr relays that may not retain orders, so test the full flow including order retrieval and consider only using for testing and with small amounts.

## How it works

A URL fragment is the part after `#`. The HTTP specification prohibits browsers from sending fragments to servers. The server that delivers the page never receives the content, never knows which site you are viewing, and has no way to find out. No content is collected, stored, or logged. The privacy is structural.

A site that was never put on a server can never be taken off one. There is no account to suspend, no host to pressure, no platform that can decide your content should not exist. Each copy of the link is a complete copy of the site data.

Site creators can encrypt the URL itself with a password. Even possessing the link reveals nothing about what is inside.

## The eight tools

| Tool | What it is |
|---|---|
| **Event** | An event poster, printable as a QR code |
| **Fundraiser** | A donation page with a goal and payment details |
| **Store** | A full catalogue with checkout over Nostr |
| **Petition** | A demand with signatures that no platform can remove |
| **Message** | A letter delivered entirely in the link |
| **Drop** | A text file, from notes to code |
| **Art** | An SVG canvas that renders from the link |
| **Forum** | A private board with topics and live chat |

Every tool can be cryptographically signed by its creator and password-encrypted at the URL. Where a tool uses Nostr for live communication (store, forum, petition), the relay traffic is always NIP-44 encrypted.

## Encoding

Data is serialized into a compact text format, then compressed through dictionary substitution (common words and phrases replaced with short codes) and raw DEFLATE (pako). The result is base64url-encoded into the fragment. A single-item store fits in about 120 characters.

Decoding is the reverse, entirely in the browser.

## Offline

No server means no signal required. Print a nowhere link as a QR code and it carries a complete event, fundraiser, message, drop, or artwork, readable with the [nowhr.xyz](https://nowhr.xyz/install) app on a device with no internet connection at all.

## Nostr

Five of the eight site types are purely static. The store, forum, and petition need live communication (orders, posts, signatures) and use Nostr relays for that. All relay traffic is NIP-44 encrypted. The relay stores events it cannot read, from throwaway keys it cannot trace, for sites it cannot identify.

## Project structure

```
nowhere/packages/codec/    Encoding and decoding. Pure TypeScript, no UI.
nowhere/packages/web/      Svelte 5 components for building and rendering sites.
nowhr/                     App shell with routing, PWA, QR scanner.
```

The repo is a pnpm workspace. Codec is standalone: any application that wants to read or create nowhere data only needs this package. Web is the component library with builders, renderers, Nostr integration, and payment handling. nowhr wires web into a deployable static site at [nowhr.xyz](https://nowhr.xyz/app).

## Running locally

```
pnpm install
cd nowhr
pnpm dev          # localhost:5174
pnpm build        # outputs to nowhr/build/
```


Requires Node.js 20+ and pnpm 10+.

## LICENSE

Copyright (c) 2026 5t34k - npub1x5t34kxd79m657qcuwp4zrypy9t8t4e6yks5zapjvau29t0xvgaqakh2p2

Licensed under GNU Affero General Public License as stated in the [LICENSE](LICENSE):

```text
Copyright (c) 2026 5t34k - npub1x5t34kxd79m657qcuwp4zrypy9t8t4e6yks5zapjvau29t0xvgaqakh2p2

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
details.

You should have received a copy of the GNU Affero General Public License along
with this program. If not, see https://www.gnu.org/licenses/
```
