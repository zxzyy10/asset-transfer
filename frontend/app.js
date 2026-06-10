const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const config = window.TRANSFER_APP_CONFIG || {};
const chain = config.chain || {};
const tokens = Array.isArray(config.tokens) ? config.tokens : [];
const users = Array.isArray(config.users) ? config.users : [];

const connectBtn = document.getElementById("connectBtn");
const refreshBtn = document.getElementById("refreshBtn");
const statusEl = document.getElementById("status");
const accountEl = document.getElementById("account");
const allowedUserEl = document.getElementById("allowedUser");
const networkEl = document.getElementById("network");
const assetListEl = document.getElementById("assetList");
const reservedUsersEl = document.getElementById("reservedUsers");
const userCountEl = document.getElementById("userCount");

let provider;
let signer;
let account = "";
let currentUser = null;
let currentChainOk = false;

function setStatus(text, tone = "info") {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function shortAddress(value) {
  if (!value || value.length < 12) return value || "-";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test((value || "").trim());
}

function sameAddress(a, b) {
  return (a || "").toLowerCase() === (b || "").toLowerCase();
}

function enabledTokens() {
  return buildTransferItems().filter((item) => item.enabled && isAddress(item.address));
}

function tokenById(id) {
  return buildTransferItems().find((item) => item.id === id);
}

function findUser(wallet) {
  return users.find((user) => sameAddress(user.wallet, wallet)) || null;
}

function buildTransferItems() {
  const baseItems = tokens.map((token) => ({
    ...token,
    kind: "erc20",
    amount: currentUser?.assets?.[token.id]?.amount || "",
    recipient: currentUser?.defaultRecipient || "",
  }));

  const positionItems = (currentUser?.positions || []).map((position, index) => ({
    id: `position-${position.marketId}-${position.direction.toLowerCase()}-${index}`,
    kind: "position",
    symbol: `${position.direction} #${position.marketId}`,
    name: position.market,
    address: position.tokenAddress || "",
    decimals: position.decimals ?? 6,
    enabled: Boolean(position.enabled && position.tokenAddress),
    note:
      position.note ||
      "Outcome token address is not configured yet. Fill tokenAddress and set enabled: true in frontend/config.js.",
    amount: position.amount || "",
    recipient: currentUser?.defaultRecipient || "",
    marketId: position.marketId,
    direction: position.direction,
  }));

  return currentUser ? [...baseItems, ...positionItems] : baseItems;
}

async function currentChainIdHex() {
  return window.ethereum.request({ method: "eth_chainId" });
}

async function ensureTargetChain() {
  const chainId = (await currentChainIdHex()).toLowerCase();
  if (chainId === chain.hexId.toLowerCase()) return true;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.hexId }],
    });
  } catch (switchError) {
    if (switchError?.code !== 4902) throw switchError;

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chain.hexId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls,
          blockExplorerUrls: chain.blockExplorerUrls,
        },
      ],
    });

    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.hexId }],
    });
  }

  const nextChainId = (await currentChainIdHex()).toLowerCase();
  return nextChainId === chain.hexId.toLowerCase();
}

async function updateChainState(showPrompt = false) {
  if (!window.ethereum) {
    currentChainOk = false;
    networkEl.textContent = "No wallet";
    return;
  }

  const chainIdHex = (await currentChainIdHex()).toLowerCase();
  currentChainOk = chainIdHex === chain.hexId.toLowerCase();
  networkEl.textContent = currentChainOk ? chain.name : `Wrong chain (${chainIdHex})`;

  if (!currentChainOk && showPrompt) {
    setStatus(`Please switch network to ${chain.name}.`, "warn");
  }
}

function renderReservedUsers() {
  userCountEl.textContent = `${users.length} users`;

  if (!users.length) {
    reservedUsersEl.innerHTML = `<div class="empty">User list is reserved in frontend/config.js.</div>`;
    return;
  }

  reservedUsersEl.innerHTML = users
    .map((user) => {
      const assetText = Object.entries(user.assets || {})
        .map(([assetId, item]) => {
          const token = tokens.find((candidate) => candidate.id === assetId);
          return `${token?.symbol || assetId}: ${item.amount || "-"}`;
        })
        .join(" / ");
      const summary = user.summary
        ? `YES ${user.summary.yes} / NO ${user.summary.no} / USDB ${user.summary.usdb} / ${user.summary.marketCount} markets`
        : assetText;

      return `
        <div class="user-row">
          <div>
            <strong>${user.label || "User"}</strong>
            <span>${shortAddress(user.wallet)}</span>
          </div>
          <small>${summary || "No preset assets"}</small>
        </div>
      `;
    })
    .join("");
}

function renderAssets() {
  const visibleTokens = buildTransferItems().filter((token) => token.enabled || token.note || token.kind === "erc20");

  if (!visibleTokens.length) {
    assetListEl.innerHTML = `<div class="empty">No assets configured.</div>`;
    return;
  }

  assetListEl.innerHTML = visibleTokens
    .map((token) => {
      const disabledReason = !token.enabled
        ? token.note || "Token is disabled in config."
        : !isAddress(token.address)
          ? "Token address is missing."
          : "";
      const isDisabled = Boolean(disabledReason);

      return `
        <article class="asset-card" data-token-id="${token.id}">
          <div class="asset-head">
            <div>
              <h3>${token.symbol}</h3>
              <p>${token.name || token.symbol}</p>
            </div>
            <span class="balance" id="balance-${token.id}">-</span>
          </div>

          <label>
            Token contract
            <input class="mono" value="${token.address || "TBD"}" disabled />
          </label>

          <div class="form-grid">
            <label>
              Recipient
              <input id="recipient-${token.id}" class="mono" placeholder="0x..." value="${token.recipient || ""}" ${isDisabled ? "disabled" : ""} />
            </label>
            <label>
              Amount
              <input id="amount-${token.id}" inputmode="decimal" placeholder="0.0" value="${token.amount || ""}" ${isDisabled ? "disabled" : ""} />
            </label>
          </div>

          <button id="send-${token.id}" class="send" ${isDisabled ? "disabled" : ""}>Transfer ${token.symbol}</button>
          <div class="hint" id="hint-${token.id}">${disabledReason || "Ready after wallet connect and whitelist match."}</div>
        </article>
      `;
    })
    .join("");

  visibleTokens.forEach((token) => {
    const button = document.getElementById(`send-${token.id}`);
    if (button) button.addEventListener("click", () => sendTransfer(token.id));
  });
}

async function refreshBalances() {
  if (!account || !provider || !currentChainOk) return;

  await Promise.all(
    enabledTokens().map(async (token) => {
      const balanceEl = document.getElementById(`balance-${token.id}`);
      const hintEl = document.getElementById(`hint-${token.id}`);

      try {
        const contract = new ethers.Contract(token.address, erc20Abi, provider);
        const [rawBalance, decimals] = await Promise.all([
          contract.balanceOf(account),
          token.decimals ?? contract.decimals(),
        ]);
        balanceEl.textContent = `${ethers.formatUnits(rawBalance, decimals)} ${token.symbol}`;
        hintEl.textContent = currentUser ? "Ready." : "Connected wallet is not in the reserved user list.";
      } catch (err) {
        balanceEl.textContent = "Read failed";
        hintEl.textContent = err?.shortMessage || err?.message || "Failed to read balance.";
      }
    }),
  );

  syncButtons();
}

function syncButtons() {
  const canSend = Boolean(account && currentUser && currentChainOk);
  enabledTokens().forEach((token) => {
    const button = document.getElementById(`send-${token.id}`);
    if (button) button.disabled = !canSend;
  });
  refreshBtn.disabled = !account;
}

async function refreshState() {
  await updateChainState(true);
  currentUser = findUser(account);
  accountEl.textContent = account ? shortAddress(account) : "-";
  allowedUserEl.textContent = currentUser ? currentUser.label || shortAddress(currentUser.wallet) : "No";

  renderAssets();
  syncButtons();

  if (!currentUser && account) {
    setStatus("Wallet connected, but this address is not in the reserved user list.", "warn");
  }

  await refreshBalances();
}

async function sendTransfer(tokenId) {
  const token = tokenById(tokenId);
  const recipientInput = document.getElementById(`recipient-${tokenId}`);
  const amountInput = document.getElementById(`amount-${tokenId}`);
  const hintEl = document.getElementById(`hint-${tokenId}`);
  const button = document.getElementById(`send-${tokenId}`);

  try {
    if (!account || !signer) throw new Error("Please connect wallet first.");
    if (!currentUser) throw new Error("Connected wallet is not in the reserved user list.");
    if (!(await ensureTargetChain())) throw new Error(`Please switch network to ${chain.name}.`);
    if (!token?.enabled || !isAddress(token.address)) throw new Error("Token is not configured.");

    const recipient = recipientInput.value.trim();
    const amount = amountInput.value.trim();
    if (!isAddress(recipient)) throw new Error("Please enter a valid recipient address.");
    if (!amount || Number(amount) <= 0) throw new Error("Please enter a positive amount.");

    button.disabled = true;
    hintEl.textContent = "Waiting for wallet confirmation...";
    setStatus(`Sending ${token.symbol} transfer...`, "info");

    const decimals = token.decimals ?? 18;
    const rawAmount = ethers.parseUnits(amount, decimals);
    const contract = new ethers.Contract(token.address, erc20Abi, signer);
    const tx = await contract.transfer(recipient, rawAmount);

    hintEl.innerHTML = `Submitted: <a href="${chain.blockExplorerUrls[0]}/tx/${tx.hash}" target="_blank" rel="noreferrer">${shortAddress(tx.hash)}</a>`;
    const receipt = await tx.wait();

    hintEl.innerHTML = `Confirmed in block ${receipt.blockNumber}.`;
    setStatus(`${token.symbol} transfer confirmed.`, "success");
    await refreshBalances();
  } catch (err) {
    const message = err?.shortMessage || err?.message || "Transfer failed.";
    hintEl.textContent = message;
    setStatus(message, "error");
    syncButtons();
  }
}

connectBtn.addEventListener("click", async () => {
  try {
    if (!window.ethereum) throw new Error("No wallet detected. Please install MetaMask.");

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    const switched = await ensureTargetChain();
    if (!switched) throw new Error(`Please switch network to ${chain.name}.`);

    signer = await provider.getSigner();
    account = await signer.getAddress();

    connectBtn.textContent = "Connected";
    setStatus(`Wallet connected on ${chain.name}.`, "success");
    await refreshState();
  } catch (err) {
    setStatus(err?.shortMessage || err?.message || "Connection failed.", "error");
  }
});

refreshBtn.addEventListener("click", async () => {
  try {
    await refreshState();
    setStatus("State refreshed.", "success");
  } catch (err) {
    setStatus(err?.shortMessage || err?.message || "Refresh failed.", "error");
  }
});

(function init() {
  if (!chain.hexId) {
    setStatus("Missing chain config.", "error");
  }

  renderReservedUsers();
  renderAssets();
  syncButtons();

  if (window.ethereum) {
    window.ethereum.on("chainChanged", async () => {
      if (!account) return;
      await refreshState();
    });

    window.ethereum.on("accountsChanged", async (accounts) => {
      account = accounts?.[0] || "";
      if (!account) {
        signer = null;
        currentUser = null;
        connectBtn.textContent = "Connect Wallet";
        setStatus("Wallet disconnected.", "warn");
        await refreshState();
        return;
      }

      signer = await provider.getSigner();
      await refreshState();
    });
  }
})();
