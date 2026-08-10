const ETHEREUM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const ETHEREUM_WEB3_SUBJECT = /^web3:ethereum:(0x[a-fA-F0-9]{40})$/;

export function walletFromWeb3AuthUser(user) {
  if (user?.app_metadata?.provider !== 'web3') {
    throw new Error('Wallet authentication provider is invalid');
  }

  const subject = String(user?.user_metadata?.sub || '');
  const subjectWallet = ETHEREUM_WEB3_SUBJECT.exec(subject)?.[1]?.toLowerCase() || '';
  if (!subjectWallet) {
    throw new Error('Authenticated wallet identity is missing');
  }

  const claimedAddress = user?.user_metadata?.custom_claims?.address;
  if (claimedAddress !== undefined && claimedAddress !== null && claimedAddress !== '') {
    const claim = String(claimedAddress);
    if (!ETHEREUM_ADDRESS.test(claim) || claim.toLowerCase() !== subjectWallet) {
      throw new Error('Authenticated wallet identity is inconsistent');
    }
  }

  return subjectWallet;
}
