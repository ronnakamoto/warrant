import { renderSVG } from "uqr";
import { FUND_HBAR, type PursePublic } from "./purse.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Local fund card. Public ids only — never the private key. */
export function fundPageHtml(view: PursePublic): string {
  const evm = escapeHtml(view.evmAddress);
  const qr = renderSVG(view.evmAddress, { pixelSize: 6, border: 2 });
  const funded = Boolean(view.accountId);
  const account = funded
    ? `<p id="status">Received. Hedera account ${escapeHtml(view.accountId ?? "")}. The bot can pay.</p>`
    : `<p id="status">Waiting for HBAR. Open HashPack, Send, paste this address. About ${FUND_HBAR} HBAR on testnet.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Fund the agent</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }
    code { word-break: break-all; }
    svg { display: block; width: 12rem; height: 12rem; }
  </style>
</head>
<body>
  <h1>Fund the agent</h1>
  <p>Send about ${FUND_HBAR} HBAR to this address. This page notices when it arrives.</p>
  ${account}
  <p><code>${evm}</code></p>
  ${qr}
  <p>Scan the code in HashPack Send, or paste the address. Do not send a key.</p>
  <script>
    (function () {
      var status = document.getElementById("status");
      if (!status) return;
      function tick() {
        fetch("/ready").then(function (res) { return res.json(); }).then(function (body) {
          if (!body || typeof body.accountId !== "string") return;
          status.textContent = "Received. Hedera account " + body.accountId + ". The bot can pay.";
        }).catch(function () {});
      }
      setInterval(tick, 2000);
      tick();
    })();
  </script>
</body>
</html>
`;
}
