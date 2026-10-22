#!/usr/bin/env node
// The key that signs part packs, made on your own computer.
//
//   node scripts/pack-key.mjs
//
// Prints the public key, for PACK_PUBLIC_KEY in jek/tools/jekray/src/core/packsig.js,
// and the command that gives the API the private key as the PACK_SIGNING_KEY
// secret. The private key is printed once, for that command, and written
// nowhere: paste it when wrangler asks, then clear the terminal. Keep a copy
// somewhere safe (a password manager) only if you want to sign with the same
// key after a disaster; a new key means packs signed before no longer check.

const { subtle } = globalThis.crypto;
const k = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const priv = Buffer.from(await subtle.exportKey('pkcs8', k.privateKey)).toString('base64');
const pub = Buffer.from(await subtle.exportKey('raw', k.publicKey)).toString('base64url');

console.log(`Public key (paste into jek/tools/jekray/src/core/packsig.js as PACK_PUBLIC_KEY):

  ${pub}

Private key: give it to the API, from jek-api/, with

  npx wrangler secret put PACK_SIGNING_KEY

and paste this when it asks (it reads it from the terminal, so it lands in no file):

  ${priv}

Then check the API has it:  curl https://api.jeksys.net/v1/packs/key   (its "key" is the public key above)`);
