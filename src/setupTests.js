// jest-dom adds custom jest matchers for asserting on DOM nodes
// (e.g. expect(element).toHaveTextContent(/react/i)).
//
// It is loaded here ONLY if available. The previous line
//   import '@testing-library/jest-dom/extend-expect';
// used a subpath removed in jest-dom v6+, and the package is not installed,
// which made *every* test fail to run. The pure local-demo engine tests do not
// need DOM matchers, so we load jest-dom opportunistically and ignore its absence.
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  require('@testing-library/jest-dom');
} catch (e) {
  // jest-dom is optional; ignore if it is not installed.
}

jest.mock('wagmi', () => {
  const React = require('react');
  return {
    WagmiProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    createConfig: () => ({}),
    http: () => ({}),
    useAccount: () => ({ address: undefined, chainId: undefined, isConnected: false }),
    useConnect: () => ({
      connectors: [],
      connectAsync: () => Promise.resolve({ accounts: [] }),
      isPending: false,
    }),
    useDisconnect: () => ({ disconnect: () => {} }),
    useSignMessage: () => ({ signMessageAsync: () => Promise.resolve('0x') }),
    useSwitchChain: () => ({ switchChainAsync: () => Promise.resolve() }),
    useWriteContract: () => ({ writeContractAsync: () => Promise.resolve('0x') }),
  };
});

jest.mock(
  '@wagmi/connectors/injected',
  () => ({
    injected: () => ({}),
  }),
  { virtual: true }
);

jest.mock('viem', () => ({
  createPublicClient: () => ({
    readContract: () => Promise.resolve(0),
    waitForTransactionReceipt: () => Promise.resolve({ logs: [] }),
  }),
  http: () => ({}),
  isAddress: (value) => Boolean(value),
  parseEventLogs: () => [],
}));
