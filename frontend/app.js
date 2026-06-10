const erc20Abi = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];
const erc20Interface = new ethers.Interface(erc20Abi);

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
const transferDetailEl = document.getElementById("transferDetail");
const transferRecordsEl = document.getElementById("transferRecords");
const copyRecordsBtn = document.getElementById("copyRecordsBtn");

let provider;
let signer;
let account = "";
let currentUser = null;
let currentChainOk = false;
let selectedItemId = "";

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

function transferStorageKey() {
  return `bizzy-transfer-completed:${chain.id || chain.hexId}:${(account || "").toLowerCase()}`;
}

function readCompletedTransfers() {
  try {
    return JSON.parse(window.localStorage.getItem(transferStorageKey()) || "{}");
  } catch {
    return {};
  }
}

function writeCompletedTransfer(item, receipt, transferEvent) {
  const completed = readCompletedTransfers();
  completed[item.id] = {
    id: item.id,
    kind: item.kind,
    marketId: item.marketId || "",
    direction: item.direction || "",
    tokenAddress: item.address,
    amount: item.amount,
    symbol: item.symbol,
    rawAmount: transferEvent.value.toString(),
    from: transferEvent.from,
    to: transferEvent.to,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    logIndex: transferEvent.logIndex,
    completedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(transferStorageKey(), JSON.stringify(completed));
}

function isCompleted(item) {
  return Boolean(readCompletedTransfers()[item.id]);
}

function hasPositiveAmount(item) {
  return Boolean(item.amount && Number(item.amount) > 0);
}

function transferRecords() {
  return Object.values(readCompletedTransfers()).sort((a, b) => {
    return String(b.completedAt || "").localeCompare(String(a.completedAt || ""));
  });
}

function validateTransferEvent(receipt, token, rawAmount, recipient) {
  for (const log of receipt.logs || []) {
    if (!sameAddress(log.address, token.address)) continue;

    let parsed;
    try {
      parsed = erc20Interface.parseLog(log);
    } catch {
      continue;
    }

    if (parsed?.name !== "Transfer") continue;

    const from = parsed.args.from;
    const to = parsed.args.to;
    const value = parsed.args.value;

    if (sameAddress(from, account) && sameAddress(to, recipient) && value === rawAmount) {
      return {
        from,
        to,
        value,
        logIndex: log.index ?? log.logIndex ?? null,
      };
    }
  }

  throw new Error("Transaction confirmed, but matching Transfer event was not found.");
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

function pendingTransferItems() {
  if (!currentUser) return [];
  return buildTransferItems().filter((item) => hasPositiveAmount(item) && !isCompleted(item));
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

function renderAssets() {
  if (!account) {
    assetListEl.innerHTML = `<div class="empty">Connect wallet to view pending assets.</div>`;
    renderTransferDetail(null);
    renderTransferRecords();
    return;
  }

  if (!currentUser) {
    assetListEl.innerHTML = `<div class="empty">This wallet is not eligible for asset transfer.</div>`;
    renderTransferDetail(null);
    renderTransferRecords();
    return;
  }

  const visibleTokens = pendingTransferItems();

  if (!visibleTokens.length) {
    assetListEl.innerHTML = `<div class="empty">No pending assets for this wallet.</div>`;
    renderTransferDetail(null);
    renderTransferRecords();
    return;
  }

  if (!visibleTokens.some((item) => item.id === selectedItemId)) {
    selectedItemId = visibleTokens[0].enabled && isAddress(visibleTokens[0].address) ? visibleTokens[0].id : "";
  }

  assetListEl.innerHTML = visibleTokens
    .map((token) => {
      const disabledReason = !token.enabled
        ? token.note || "Token is disabled in config."
        : !isAddress(token.address)
          ? "Token address is missing."
          : !isAddress(token.recipient)
            ? "Recipient address is not configured."
            : "";
      const isDisabled = Boolean(disabledReason);
      const selectedClass = token.id === selectedItemId ? " selected" : "";
      const disabledClass = isDisabled ? " disabled" : "";

      return `
        <button class="pending-row${selectedClass}${disabledClass}" data-token-id="${token.id}" ${isDisabled ? "disabled" : ""}>
          <div class="pending-main">
            <div>
              <strong>${token.symbol}</strong>
              <span>${token.name || token.symbol}</span>
            </div>
            <small>${token.amount} ${token.symbol.split(" ")[0]}</small>
          </div>
          <span class="balance" id="balance-${token.id}">${isDisabled ? "Not ready" : "-"}</span>
          ${disabledReason ? `<em>${disabledReason}</em>` : ""}
        </button>
      `;
    })
    .join("");

  visibleTokens.forEach((token) => {
    const row = assetListEl.querySelector(`[data-token-id="${token.id}"]`);
    if (row) {
      row.addEventListener("click", () => {
        selectedItemId = token.id;
        renderAssets();
        renderTransferDetail(token);
        refreshBalances();
      });
    }
  });

  renderTransferDetail(tokenById(selectedItemId));
  renderTransferRecords();
}

async function refreshBalances() {
  if (!account || !provider || !currentChainOk) return;

  await Promise.all(
    enabledTokens().map(async (token) => {
      const balanceEl = document.getElementById(`balance-${token.id}`);
      if (!balanceEl) return;

      try {
        const contract = new ethers.Contract(token.address, erc20Abi, provider);
        const [rawBalance, decimals] = await Promise.all([
          contract.balanceOf(account),
          token.decimals ?? contract.decimals(),
        ]);
        balanceEl.textContent = `${ethers.formatUnits(rawBalance, decimals)} ${token.symbol}`;
      } catch (err) {
        balanceEl.textContent = "Read failed";
      }
    }),
  );

  syncButtons();
}

function syncButtons() {
  const canSend = Boolean(account && currentUser && currentChainOk);
  const sendBtn = document.getElementById("sendSelectedBtn");
  if (sendBtn) sendBtn.disabled = !canSend || !selectedItemId;
  refreshBtn.disabled = !account;
}

function renderTransferDetail(item) {
  if (!item || !item.enabled || !isAddress(item.address) || !isAddress(item.recipient)) {
    transferDetailEl.innerHTML = `
      <div class="detail-empty">
        <h3>Select an asset</h3>
        <p>Choose a ready pending asset from the list after connecting an eligible wallet.</p>
      </div>
    `;
    syncButtons();
    return;
  }

  transferDetailEl.innerHTML = `
    <div class="detail-head">
      <div>
        <h3>${item.symbol}</h3>
        <p>${item.name || item.symbol}</p>
      </div>
      <span class="detail-kind">${item.kind === "position" ? "Outcome" : "ERC20"}</span>
    </div>

    <label>
      Token contract
      <input class="mono" value="${item.address}" disabled />
    </label>

    <div class="form-grid">
      <label>
        Fixed recipient
        <input id="selectedRecipient" class="mono" placeholder="0x..." value="${item.recipient || ""}" disabled />
      </label>
      <label>
        Fixed amount
        <input id="selectedAmount" inputmode="decimal" placeholder="0.0" value="${item.amount || ""}" disabled />
      </label>
    </div>

    <button id="sendSelectedBtn" class="send">Transfer ${item.symbol}</button>
    <div class="hint" id="selectedHint">Ready.</div>
  `;

  document.getElementById("sendSelectedBtn").addEventListener("click", () => sendTransfer(item.id));
  syncButtons();
}

function renderTransferRecords() {
  const records = transferRecords();
  copyRecordsBtn.disabled = records.length === 0;

  if (!account) {
    transferRecordsEl.innerHTML = `<div class="empty compact-empty">Connect wallet to view local records.</div>`;
    return;
  }

  if (!records.length) {
    transferRecordsEl.innerHTML = `<div class="empty compact-empty">No confirmed transfers recorded in this browser.</div>`;
    return;
  }

  transferRecordsEl.innerHTML = records
    .map((record) => {
      const explorer = chain.blockExplorerUrls?.[0] || "";
      const txUrl = explorer ? `${explorer}/tx/${record.txHash}` : "";
      return `
        <article class="record-row">
          <div>
            <strong>${record.symbol}</strong>
            <span>${record.amount} -> ${shortAddress(record.to)}</span>
          </div>
          <div>
            <small>Block ${record.blockNumber}</small>
            ${
              txUrl
                ? `<a href="${txUrl}" target="_blank" rel="noreferrer">${shortAddress(record.txHash)}</a>`
                : `<span>${shortAddress(record.txHash)}</span>`
            }
          </div>
        </article>
      `;
    })
    .join("");
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
  const hintEl = document.getElementById("selectedHint");
  const button = document.getElementById("sendSelectedBtn");

  try {
    if (!account || !signer) throw new Error("Please connect wallet first.");
    if (!currentUser) throw new Error("Connected wallet is not in the reserved user list.");
    if (!(await ensureTargetChain())) throw new Error(`Please switch network to ${chain.name}.`);
    if (!token?.enabled || !isAddress(token.address)) throw new Error("Token is not configured.");

    const recipient = (token.recipient || "").trim();
    const amount = (token.amount || "").trim();
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
    const transferEvent = validateTransferEvent(receipt, token, rawAmount, recipient);

    hintEl.innerHTML = `Confirmed in block ${receipt.blockNumber}.`;
    writeCompletedTransfer(token, receipt, transferEvent);
    selectedItemId = "";
    setStatus(`${token.symbol} transfer confirmed.`, "success");
    renderAssets();
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

copyRecordsBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(transferRecords(), null, 2));
    setStatus("Transfer records copied as JSON.", "success");
  } catch (err) {
    setStatus(err?.message || "Failed to copy records.", "error");
  }
});

(function init() {
  if (!chain.hexId) {
    setStatus("Missing chain config.", "error");
  }

  renderAssets();
  renderTransferRecords();
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
