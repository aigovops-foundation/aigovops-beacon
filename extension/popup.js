// Popup UI for AiGovOps Beacon. Apache-2.0.

function fmtTs(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString();
  } catch { return iso; }
}

async function refresh() {
  const status = await new Promise((res) =>
    chrome.runtime.sendMessage({ type: "getStatus" }, res)
  );
  if (!status) return;
  const { policy, counter, recent } = status;
  if (policy) {
    document.getElementById("beaconUrl").textContent = policy.beaconUrl;
    document.getElementById("tenantId").textContent = policy.tenantId;
    document.getElementById("allowlistN").textContent = policy.allowlist.length;
  }
  document.getElementById("counter").textContent = counter;

  const ul = document.getElementById("recent");
  if (!recent || !recent.length) {
    ul.innerHTML = '<li><span class="muted">none yet — open chatgpt.com / claude.ai</span></li>';
    return;
  }
  ul.innerHTML = recent
    .map(
      (r) =>
        `<li><span class="host">${r.host}</span><span class="ts">${fmtTs(r.ts)}</span></li>`
    )
    .join("");
}

document.getElementById("flush").addEventListener("click", async () => {
  await new Promise((res) => chrome.runtime.sendMessage({ type: "flush" }, res));
  refresh();
});

refresh();
setInterval(refresh, 2000);
