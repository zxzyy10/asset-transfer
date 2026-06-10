window.TRANSFER_APP_CONFIG = {
  chain: {
    id: 8453,
    hexId: "0x2105",
    name: "Base",
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },

  tokens: [
    {
      id: "usdb",
      symbol: "USDB",
      name: "USD Buzzing",
      address: "0x89401d7C5F5Cf4936F10418B9C536f97b0bCf71B",
      decimals: 6,
      enabled: true,
    },
    {
      id: "yes",
      symbol: "YES",
      name: "YES Token",
      address: "",
      decimals: 6,
      enabled: false,
      note: "Fill the Base mainnet YES token address when ready.",
    },
    {
      id: "no",
      symbol: "NO",
      name: "NO Token",
      address: "",
      decimals: 6,
      enabled: false,
      note: "Fill the Base mainnet NO token address when ready.",
    },
  ],

  users: [
    // Replace this placeholder with the fixed list you will send later.
    // The connected wallet must match `wallet` to enable transfers.
    // Example:
    // {
    //   label: "Alice",
    //   wallet: "0x0000000000000000000000000000000000000000",
    //   defaultRecipient: "0x0000000000000000000000000000000000000000",
    //   assets: {
    //     usdb: { amount: "100" },
    //     yes: { amount: "10" },
    //     no: { amount: "10" },
    //   },
    // },
  ],
};
